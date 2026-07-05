import { Telegraf } from 'telegraf';
import { PostStatus, PostMessageType } from '@prisma/client';
import { prisma } from '../prisma/client';
import { autoReplyRepository } from '../repositories/auto-reply.repository';
import { logger } from '../utils/logger';
import { validateDbInput } from '../utils/unicode';
import { buildTelegramKeyboard } from './renderer';
import { sendSingleMessage, normalizeSingleMessage } from './post-message.service';

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
    if (!msg.targetChatId) throw new Error('targetChatId is missing');
    if ((msg.messages?.length || 0) === 0) throw new Error('No messages to send');
    if ((msg.keywords?.length || 0) === 0) throw new Error('At least one keyword is required');

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

  // ─── Keyword Matching ────────────────────────────────────

  async handleGroupMessage(ctx: any, telegramGroupId: number): Promise<boolean> {
    const text = ctx.message?.text || ctx.message?.caption;
    if (!text || !ctx.from || !ctx.message?.message_id) return false;

    const published = await autoReplyRepository.getPublishedWithKeywords();
    const lowerText = text.toLocaleLowerCase('fa-IR');

    for (const ar of published) {
      if (!ar.keywords?.length) continue;
      const matched = ar.keywords.find(kw =>
        lowerText.includes(kw.keyword.toLocaleLowerCase('fa-IR'))
      );
      if (!matched) continue;

      logger.info(`[AutoReply] KEYWORD_MATCH autoReply=${ar.id} keyword="${matched.keyword}" user=${ctx.from.id} chat=${ctx.chat?.id}`);

      try {
        await this.sendReplyToGroup(ctx, ar);
        await autoReplyRepository.logDelivery({
          autoReplyId: ar.id,
          targetChatId: BigInt(ctx.chat!.id),
          status: 'SUCCESS',
        });
        await prisma.autoReply.update({
          where: { id: ar.id },
          data: { sendCount: { increment: 1 } },
        });
      } catch (err: any) {
        logger.error(`[AutoReply] SEND_FAIL autoReply=${ar.id} error=${err.message}`);
        await autoReplyRepository.logDelivery({
          autoReplyId: ar.id,
          targetChatId: BigInt(ctx.chat!.id),
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
    const messages = ar.messages || [];
    const allButtons = ar.buttons || [];

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const buttonsForMsg = allButtons.filter((b: any) => b.messageId === message.id);
      const inlineKeyboard = buttonsForMsg.length > 0 ? this.buildInlineKeyboard(buttonsForMsg, ar.id) : undefined;

      const row = {
        ...message,
        postId: ar.id,
        order: message.order ?? i,
        messageType: message.type ?? PostMessageType.text,
        text: message.text ?? '',
        entities: message.entities ?? [],
        captionEntities: message.captionEntities ?? [],
        replyMarkup: inlineKeyboard ? { inline_keyboard: inlineKeyboard } : (message.replyMarkup ?? null),
        forwardSource: message.forwardSource ?? null,
        delayMs: 0,
      };

      const normalized = normalizeSingleMessage(row);

      const extra: any = {};
      if (threadId) extra.message_thread_id = threadId;
      if (i === 0) extra.reply_parameters = { message_id: ctx.message.message_id };

      try {
        await sendSingleMessage(this.bot.telegram, chatId, normalized);
      } catch (sendErr: any) {
        logger.error(`[AutoReply] SEND_ERROR msg=${ar.id} [${i + 1}] type=${normalized.messageType} error=${sendErr?.message}`);
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
