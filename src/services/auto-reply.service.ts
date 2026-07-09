import { Telegraf } from 'telegraf';
import { PostStatus, PostMessageType } from '@prisma/client';
import { prisma } from '../prisma/client';
import { autoReplyRepository } from '../repositories/auto-reply.repository';
import { logger } from '../utils/logger';
import { validateDbInput } from '../utils/unicode';
import { buildTelegramKeyboard } from './renderer';
import { automationService } from './automation.service';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class AutoReplyService {
  private bot?: Telegraf;

  setBot(bot: Telegraf) { this.bot = bot; }

  // ─── CRUD ────────────────────────────────────────────────

  async create(data: { title: string; createdBy?: bigint }) {
    const title = validateDbInput(data.title, 'title');
    return autoReplyRepository.create({ title, createdBy: data.createdBy });
  }

  async update(id: number, data: { title?: string }) {
    const updateData: any = {};
    if (data.title !== undefined) updateData.title = validateDbInput(data.title, 'title');
    return autoReplyRepository.update(id, updateData);
  }

  async delete(id: number) {
    return autoReplyRepository.delete(id);
  }

  async publish(id: number) {
    const msg = await autoReplyRepository.findById(id);
    if (!msg) throw new Error('Post not found');
    const bindings = await autoReplyRepository.getBindingsByAutoReply(id);
    if (bindings.length === 0) throw new Error('At least one group binding is required');
    if ((msg.messages?.length || 0) === 0) throw new Error('No messages to send');
    if ((msg.keywords?.length || 0) === 0) throw new Error('At least one keyword is required');

    logger.info(`[AutoReply] PUBLISH_SUCCESS autoReply=${id} bindings=${bindings.length}`);
    await autoReplyRepository.update(id, {
      status: PostStatus.PUBLISHED,
      isPublished: true,
    });
  }

  async unpublish(id: number) {
    return autoReplyRepository.update(id, {
      status: PostStatus.DRAFT, isPublished: false,
    });
  }

  // ─── Message Management ──────────────────────────────────

  async addMessage(autoReplyId: number, type?: PostMessageType) {
    const lastMsg = await prisma.autoReplyMessage.findFirst({
      where: { autoReplyId }, orderBy: { order: 'desc' },
    });
    const order = (lastMsg?.order ?? -1) + 1;
    return prisma.autoReplyMessage.create({
      data: { autoReplyId, text: '', type: type ?? PostMessageType.text, order },
    });
  }

  async updateMessage(messageId: number, data: { text?: string; type?: PostMessageType; mediaFileId?: string; mediaGroupId?: string; entities?: any; captionEntities?: any; caption?: string; replyMarkup?: any; parseMode?: any; forwardSource?: any }) {
    return prisma.autoReplyMessage.update({ where: { id: messageId }, data });
  }

  async deleteMessage(messageId: number) {
    const msg = await prisma.autoReplyMessage.findUnique({ where: { id: messageId } });
    if (!msg) return;
    await prisma.autoReplyMessage.delete({ where: { id: messageId } });
    const remaining = await prisma.autoReplyMessage.findMany({
      where: { autoReplyId: msg.autoReplyId }, orderBy: { order: 'asc' },
    });
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].order !== i) {
        await prisma.autoReplyMessage.update({ where: { id: remaining[i].id }, data: { order: i } });
      }
    }
  }

  async reorderMessages(autoReplyId: number, messageIds: number[]) {
    for (let i = 0; i < messageIds.length; i++) {
      await prisma.autoReplyMessage.update({ where: { id: messageIds[i] }, data: { order: i } });
    }
  }

  async listMessages(autoReplyId: number) {
    return prisma.autoReplyMessage.findMany({ where: { autoReplyId }, orderBy: { order: 'asc' } });
  }

  // ─── Button Management ───────────────────────────────────

  async addButton(autoReplyId: number, data: { text: string; type?: string; value?: string; row?: number; col?: number; messageId?: number }) {
    return prisma.autoReplyButton.create({
      data: { autoReplyId, messageId: data.messageId, text: data.text, type: data.type ?? 'URL', value: data.value, row: data.row ?? 0, col: data.col ?? 0 },
    });
  }

  async updateButton(buttonId: number, data: { text?: string; type?: string; value?: string; style?: string; row?: number; col?: number }) {
    return prisma.autoReplyButton.update({ where: { id: buttonId }, data });
  }

  async deleteButton(buttonId: number) {
    return prisma.autoReplyButton.delete({ where: { id: buttonId } });
  }

  async listButtons(autoReplyId: number) {
    return prisma.autoReplyButton.findMany({ where: { autoReplyId }, orderBy: [{ row: 'asc' }, { col: 'asc' }] });
  }

  // ─── Keyword Management ──────────────────────────────────

  async addKeyword(autoReplyId: number, keyword: string) {
    const trimmed = keyword.trim();
    if (!trimmed) throw new Error('Keyword cannot be empty');
    return autoReplyRepository.createKeyword(autoReplyId, trimmed);
  }

  async updateKeyword(keywordId: number, keyword: string) {
    const trimmed = keyword.trim();
    if (!trimmed) throw new Error('Keyword cannot be empty');
    return autoReplyRepository.updateKeyword(keywordId, trimmed);
  }

  async deleteKeyword(keywordId: number) {
    return autoReplyRepository.deleteKeyword(keywordId);
  }

  async listKeywords(autoReplyId: number) {
    return autoReplyRepository.findKeywordsByAutoReply(autoReplyId);
  }

  // ─── Keyword Matching (Runtime) ──────────────────────────

  async handleGroupMessage(ctx: any, telegramGroupId: number): Promise<boolean> {
    const text = ctx.message?.text || ctx.message?.caption;
    if (!text || !ctx.from || !ctx.message?.message_id) return false;

    const chatId = BigInt(ctx.chat!.id);
    const topicId = ctx.message?.message_thread_id ?? null;
    const published = await autoReplyRepository.getPublishedForGroup(chatId, topicId);
    const lowerText = text.toLocaleLowerCase('fa-IR');

    for (const ar of published) {
      if (!ar.keywords?.length) continue;
      const matched = ar.keywords.find(kw =>
        lowerText.includes(kw.keyword.toLocaleLowerCase('fa-IR'))
      );
      if (!matched) continue;

      logger.info(`[AutoReply] KEYWORD_MATCH autoReply=${ar.id} keyword="${matched.keyword}" user=${ctx.from.id} chat=${ctx.chat?.id} topic=${topicId}`);

      automationService.logActivity({
        eventType: 'KEYWORD_MATCH',
        source: 'auto_reply',
        sourceId: ar.id,
        targetChatId: BigInt(ctx.chat!.id),
        targetTopicId: topicId != null ? BigInt(topicId) : null,
        userTelegramId: BigInt(ctx.from.id),
        messageText: text.slice(0, 500),
        keyword: matched.keyword,
        status: 'SUCCESS',
      });

      try {
        const startTime = Date.now();
        await this.sendReplyToGroup(ctx, ar);
        const executionTime = Date.now() - startTime;
        await autoReplyRepository.logDelivery({
          autoReplyId: ar.id,
          targetChatId: BigInt(ctx.chat!.id),
          targetTopicId: topicId != null ? BigInt(topicId) : null,
          status: 'SUCCESS',
        });
        await prisma.autoReply.update({
          where: { id: ar.id },
          data: { sendCount: { increment: 1 } },
        });
        automationService.logActivity({
          eventType: 'AUTO_REPLY_SENT',
          source: 'auto_reply',
          sourceId: ar.id,
          targetChatId: BigInt(ctx.chat!.id),
          targetTopicId: topicId != null ? BigInt(topicId) : null,
          userTelegramId: BigInt(ctx.from.id),
          keyword: matched.keyword,
          status: 'SUCCESS',
          executionTimeMs: executionTime,
        });
      } catch (err: any) {
        logger.error(`[AutoReply] SEND_FAIL autoReply=${ar.id} error=${err.message}`);
        await autoReplyRepository.logDelivery({
          autoReplyId: ar.id,
          targetChatId: BigInt(ctx.chat!.id),
          targetTopicId: topicId != null ? BigInt(topicId) : null,
          status: 'FAILED',
          errorMessage: err.message?.slice(0, 900),
        });
        automationService.logActivity({
          eventType: 'AUTO_REPLY_FAILED',
          source: 'auto_reply',
          sourceId: ar.id,
          targetChatId: BigInt(ctx.chat!.id),
          targetTopicId: topicId != null ? BigInt(topicId) : null,
          userTelegramId: BigInt(ctx.from.id),
          keyword: matched.keyword,
          status: 'FAILED',
          errorMessage: err.message?.slice(0, 900),
        });
      }

      return true;
    }

    return false;
  }

  private async sendReplyToGroup(ctx: any, ar: any) {
    if (!this.bot) return;

    const chatId = ctx.chat.id;
    const threadId = ctx.message?.message_thread_id;
    const originalMessageId = ctx.message?.message_id;
    const messages = ar.messages || [];
    const allButtons = ar.buttons || [];

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const buttonsForMsg = allButtons.filter((b: any) => b.messageId === message.id);
      const inlineKeyboard = buttonsForMsg.length > 0 ? this.buildInlineKeyboard(buttonsForMsg, ar.id) : undefined;

      const extra: any = {};
      if (threadId) extra.message_thread_id = threadId;
      if (i === 0 && originalMessageId) {
        extra.reply_parameters = { message_id: originalMessageId, allow_sending_without_reply: true };
      }
      if (inlineKeyboard) extra.reply_markup = { inline_keyboard: inlineKeyboard };

      const text = message.text || '';

      try {
        if (message.type === 'photo' && message.mediaFileId) {
          await this.bot.telegram.sendPhoto(chatId, message.mediaFileId, { caption: text || undefined, caption_entities: message.captionEntities || undefined, ...extra });
        } else if (message.type === 'video' && message.mediaFileId) {
          await this.bot.telegram.sendVideo(chatId, message.mediaFileId, { caption: text || undefined, caption_entities: message.captionEntities || undefined, ...extra });
        } else if (message.type === 'animation' && message.mediaFileId) {
          await this.bot.telegram.sendAnimation(chatId, message.mediaFileId, { caption: text || undefined, caption_entities: message.captionEntities || undefined, ...extra });
        } else if (message.type === 'document' && message.mediaFileId) {
          await this.bot.telegram.sendDocument(chatId, message.mediaFileId, { caption: text || undefined, caption_entities: message.captionEntities || undefined, ...extra });
        } else if (message.type === 'voice' && message.mediaFileId) {
          await this.bot.telegram.sendVoice(chatId, message.mediaFileId, { caption: text || undefined, ...extra });
        } else if (message.type === 'audio' && message.mediaFileId) {
          await this.bot.telegram.sendAudio(chatId, message.mediaFileId, { caption: text || undefined, ...extra });
        } else if (message.type === 'sticker' && message.mediaFileId) {
          await this.bot.telegram.sendSticker(chatId, message.mediaFileId, extra);
        } else if (message.type === 'forward' && message.forwardSource) {
          const srcChatId = Number(message.forwardSource.chatId || message.forwardSource.originChatId);
          const srcMsgId = Number(message.forwardSource.messageId || message.forwardSource.originMessageId);
          if (srcChatId && srcMsgId) {
            logger.info(`[AutoReply] FORWARD_MSG autoReply=${ar.id} srcChat=${srcChatId} srcMsg=${srcMsgId} targetChat=${chatId} threadId=${threadId ?? 'none'}`);
            try {
              // TRUE FORWARD: use forwardMessage with message_thread_id for topic
              const forwardPayload: any = { chat_id: chatId, from_chat_id: srcChatId, message_id: srcMsgId };
              if (threadId) forwardPayload.message_thread_id = threadId;
              await this.bot.telegram.forwardMessage(chatId, srcChatId, srcMsgId, forwardPayload);
            } catch (forwardErr: any) {
              // If forward with thread fails (e.g. old API), try without thread
              logger.warn(`[AutoReply] FORWARD_WITH_THREAD_FAILED autoReply=${ar.id} error=${forwardErr.message} — retrying without threadId`);
              try {
                await this.bot.telegram.forwardMessage(chatId, srcChatId, srcMsgId);
              } catch (fallbackErr: any) {
                logger.error(`[AutoReply] FORWARD_FAIL autoReply=${ar.id} error=${fallbackErr.message}`);
                throw fallbackErr;
              }
            }
          }
        } else {
          await this.bot.telegram.sendMessage(chatId, text, {
            entities: message.entities || undefined,
            ...extra,
          });
        }
      } catch (sendErr: any) {
        logger.error(`[AutoReply] SEND_ERROR msg=${ar.id} [${i + 1}] type=${message.type} error=${sendErr?.message}`);
        throw sendErr;
      }

      if (messages.length > 1) await sleep(100);
    }
  }

  private buildInlineKeyboard(buttons: any[], entityId?: number): any[][] {
    const grid: any[] = [];
    for (const btn of buttons) {
      const row = btn.row ?? 0;
      const col = btn.col ?? 0;
      if (!grid[row]) grid[row] = [];
      grid[row][col] = {
        text: btn.text || '',
        type: (btn.type || 'URL').toUpperCase(),
        value: btn.value || '',
        style: btn.style || undefined,
      };
    }
    const cleaned = grid.filter(Boolean).map(row => row.filter(Boolean));
    if (cleaned.length === 0) return [];
    return buildTelegramKeyboard(cleaned, entityId ?? 0, 'ar');
  }

  // ─── Stats / Logs ────────────────────────────────────────

  async getStats() {
    return autoReplyRepository.getStats();
  }

  async getLogs(messageId: number, limit?: number) {
    return autoReplyRepository.getLogs(messageId, limit);
  }
}

export const autoReplyService = new AutoReplyService();
