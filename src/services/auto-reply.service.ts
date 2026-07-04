import { Telegraf } from 'telegraf';
import { PostStatus, PostMessageType } from '@prisma/client';
import { prisma } from '../prisma/client';
import { autoReplyRepository } from '../repositories/auto-reply.repository';
import { logger } from '../utils/logger';
import { sanitizeTelegramText, sanitizeTelegramExtra, validateDbInput } from '../utils/unicode';
import { buildTelegramKeyboard } from './renderer';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── Core Scheduling Logic ────────────────────────────────

function firstOccurrence(intervalMinutes: number, startTime: string): Date {
  const [h, m] = startTime.split(':').map(Number);
  const now = new Date();
  const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m, 0, 0));
  while (t.getTime() <= now.getTime()) {
    t.setTime(t.getTime() + intervalMinutes * 60_000);
  }
  return t;
}

export function computeNextDue(intervalMinutes: number, startTime: string, lastSentAt: Date | null): Date {
  if (!lastSentAt) {
    return firstOccurrence(intervalMinutes, startTime);
  }
  return new Date(lastSentAt.getTime() + intervalMinutes * 60_000);
}

function isDue(msg: {
  isPublished: boolean;
  status: string;
  intervalMinutes: number | null;
  startTime: string | null;
  targetChatId: any;
  lastSentAt: Date | null;
}, now: Date): { due: boolean; reason: string } {
  if (!msg.isPublished) return { due: false, reason: 'isPublished=false' };
  if (msg.status !== PostStatus.PUBLISHED) return { due: false, reason: `status=${msg.status}` };
  if (msg.intervalMinutes == null || msg.intervalMinutes <= 0) return { due: false, reason: 'INVALID_INTERVAL' };
  if (!msg.startTime) return { due: false, reason: 'MISSING_START_TIME' };
  if (msg.targetChatId == null) return { due: false, reason: 'MISSING_CHAT' };

  const nextDue = computeNextDue(msg.intervalMinutes, msg.startTime, msg.lastSentAt);
  if (nextDue.getTime() > now.getTime()) {
    return { due: false, reason: `WAITING_UNTIL ${nextDue.toISOString()}` };
  }

  return { due: true, reason: 'OK' };
}

// ─── Service ──────────────────────────────────────────────

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
    if (!msg.intervalMinutes) throw new Error('intervalMinutes is missing');
    if (!msg.startTime) throw new Error('startTime is missing');
    if ((msg.messages?.length || 0) === 0) throw new Error('No messages to send');

    const nextSendAt = firstOccurrence(msg.intervalMinutes, msg.startTime);

    logger.info(
      `[AutoReply] PUBLISH msg=${id} | interval=${msg.intervalMinutes}min | start=${msg.startTime} | ` +
      `chatId=${msg.targetChatId} | topicId=${msg.targetTopicId ?? 'null'} | nextSendAt=${nextSendAt.toISOString()}`
    );

    await autoReplyRepository.update(id, {
      status: PostStatus.PUBLISHED,
      isPublished: true,
      nextSendAt,
    });

    const verify = await autoReplyRepository.findById(id);
    logger.info(`[AutoReply] PERSIST VERIFY: isPublished=${verify?.isPublished} status=${verify?.status} nextSendAt=${verify?.nextSendAt?.toISOString() ?? 'NULL'}`);
  }

  async unpublish(id: number) {
    return autoReplyRepository.update(id, {
      status: PostStatus.DRAFT, isPublished: false, nextSendAt: null,
    });
  }

  // ─── Message Management ──────────────────────────────────

  async addMessage(autoReplyId: number) {
    const lastMsg = await prisma.autoReplyMessage.findFirst({
      where: { autoReplyId }, orderBy: { order: 'desc' },
    });
    const order = (lastMsg?.order ?? -1) + 1;
    return prisma.autoReplyMessage.create({
      data: { autoReplyId, text: '', type: PostMessageType.text, order },
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

  async updateButton(buttonId: number, data: { text?: string; type?: string; value?: string; row?: number; col?: number }) {
    return prisma.autoReplyButton.update({ where: { id: buttonId }, data });
  }

  async deleteButton(buttonId: number) {
    return prisma.autoReplyButton.delete({ where: { id: buttonId } });
  }

  async listButtons(autoReplyId: number) {
    return prisma.autoReplyButton.findMany({ where: { autoReplyId }, orderBy: [{ row: 'asc' }, { col: 'asc' }] });
  }

  // ─── Scheduler ───────────────────────────────────────────

  async processDueScheduled() {
    const now = new Date();
    logger.info(`[AutoReply] ═══ TICK ${now.toISOString()} ═══`);

    const allPublished = await prisma.autoReply.findMany({
      where: { isPublished: true, status: PostStatus.PUBLISHED },
      select: {
        id: true, title: true, intervalMinutes: true, startTime: true,
        lastSentAt: true, sendCount: true, nextSendAt: true,
        targetChatId: true, targetTopicId: true, isPublished: true, status: true,
      },
    });

    logger.info(`[AutoReply] Published count: ${allPublished.length}`);

    const dueIds: number[] = [];

    for (const m of allPublished) {
      const { due, reason } = isDue(m, now);
      const nextDue = (m.intervalMinutes && m.startTime)
        ? computeNextDue(m.intervalMinutes, m.startTime, m.lastSentAt)
        : null;

      logger.info(
        `[AutoReply] #${m.id} "${m.title}" | NOW=${now.toISOString()} | ` +
        `START=${m.startTime} | INTERVAL=${m.intervalMinutes}min | ` +
        `LAST_SENT=${m.lastSentAt?.toISOString() ?? 'never'} | ` +
        `NEXT_DUE=${nextDue?.toISOString() ?? 'NULL'} | ` +
        `NEXT_SEND_DB=${m.nextSendAt?.toISOString() ?? 'NULL'} | ` +
        `CHAT=${m.targetChatId ?? 'NULL'} | TOPIC=${m.targetTopicId ?? 'NULL'} | ` +
        `COUNT=${m.sendCount} | ` +
        `IS_DUE=${due ? 'YES' : 'NO'} | WHY=${reason}`
      );

      if (due) dueIds.push(m.id);
    }

    logger.info(`[AutoReply] Due count: ${dueIds.length}`);

    for (const id of dueIds) {
      const full = await autoReplyRepository.findById(id);
      if (full) {
        logger.info(`[AutoReply] ▶ SEND_START #${id} "${full.title}"`);
        await this.sendToGroup(full);
      }
    }
  }

  async sendToGroup(msg: any) {
    if (!this.bot || !msg.targetChatId) {
      logger.warn(`[AutoReply] SKIP msg=${msg.id}: bot=${!!this.bot} chatId=${msg.targetChatId}`);
      return;
    }

    const chatId = Number(msg.targetChatId);
    const threadId = msg.targetTopicId ? Number(msg.targetTopicId) : undefined;

    logger.info(`[AutoReply] SEND_START msg=${msg.id} chatId=${chatId} threadId=${threadId ?? 'none'} msgs=${msg.messages?.length || 0}`);

    try {
      const messages = msg.messages || [];
      for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        logger.info(`[AutoReply] SEND msg=${msg.id} [${i + 1}/${messages.length}] type=${message.type} textLen=${(message.text || '').length} entities=${(message.entities as any[])?.length || 0}`);

        const buttonsFromDb = await prisma.autoReplyButton.findMany({
          where: { messageId: message.id },
          orderBy: [{ row: 'asc' }, { col: 'asc' }],
        });

        const keyboard = buttonsFromDb.length > 0
          ? this.buildInlineKeyboard(buttonsFromDb)
          : [];
        const inlineKeyboard = keyboard.length > 0
          ? { inline_keyboard: keyboard }
          : undefined;

        if (buttonsFromDb.length > 0) {
          const btnTypes = buttonsFromDb.map(b => (b.type || 'URL').toUpperCase());
          const popupCount = btnTypes.filter(t => t === 'POPUP').length;
          const cmdCount = btnTypes.filter(t => t === 'COMMAND').length;
          const urlCount = btnTypes.filter(t => t === 'URL').length;
          const rows = keyboard.length;
          const cols = Math.max(...keyboard.map(r => r.length), 0);
          logger.info(`[AutoReply] KEYBOARD msg=${msg.id} [${i + 1}] count=${buttonsFromDb.length} rows=${rows} cols=${cols} types=${btnTypes.join(',')} popup=${popupCount} cmd=${cmdCount} url=${urlCount}`);
          for (let b = 0; b < buttonsFromDb.length; b++) {
            const btn = buttonsFromDb[b];
            const cb = keyboard.flat().find((k: any) => k?.text?.includes(btn.text))?.callback_data || keyboard.flat().find((k: any) => k?.text?.includes(btn.text))?.url || '(none)';
            logger.info(`[AutoReply] BUTTON #${b + 1} msg=${msg.id} [${i + 1}] type=${(btn.type || 'URL').toUpperCase()} text="${btn.text}" value="${(btn.value || '').substring(0, 80)}" callback="${cb}"`);
          }
        }

        const extra: any = {};
        if (threadId) extra.message_thread_id = threadId;
        if (inlineKeyboard) extra.reply_markup = inlineKeyboard;

        if (message.entities && Array.isArray(message.entities) && message.entities.length > 0) {
          extra.entities = message.entities;
        }

        logger.info(`[AutoReply] PRE_SEND msg=${msg.id} [${i + 1}] method=${message.mediaFileId ? message.type : 'sendMessage'} hasReplyMarkup=${!!inlineKeyboard} reply_markup=${JSON.stringify(inlineKeyboard || {}).substring(0, 200)}`);

        try {
          if (message.type === 'forward' && message.forwardSource) {
            const fs = message.forwardSource as any;
            const srcChatId = Number(fs.originChatId || fs.chatId);
            const srcMsgId = Number(fs.originMessageId || fs.messageId);
            if (srcChatId && srcMsgId && !isNaN(srcChatId) && !isNaN(srcMsgId)) {
              try {
                await this.bot.telegram.forwardMessage(chatId, srcChatId, srcMsgId);
                logger.info(`[AutoReply] SEND_OK msg=${msg.id} [${i + 1}] method=forwardMessage srcChat=${srcChatId} srcMsg=${srcMsgId}`);
              } catch (fwdErr: any) {
                try {
                  await this.bot.telegram.copyMessage(chatId, srcChatId, srcMsgId);
                  logger.info(`[AutoReply] SEND_OK msg=${msg.id} [${i + 1}] method=copyMessage srcChat=${srcChatId} srcMsg=${srcMsgId}`);
                } catch (copyErr: any) {
                  logger.error(`[AutoReply] FORWARD_FAILED msg=${msg.id} [${i + 1}] forward and copy both failed: ${copyErr?.message}`);
                  throw copyErr;
                }
              }
            } else {
              logger.warn(`[AutoReply] FORWARD_SKIP msg=${msg.id} [${i + 1}] invalid forward metadata`);
            }
          } else if (message.mediaFileId) {
            const captionExtra: any = { ...extra };
            if (message.captionEntities && Array.isArray(message.captionEntities) && message.captionEntities.length > 0) {
              captionExtra.caption_entities = message.captionEntities;
            }
            captionExtra.caption = message.text || '';

            switch (message.type) {
              case 'photo': await this.bot.telegram.sendPhoto(chatId, message.mediaFileId, captionExtra); break;
              case 'video': await this.bot.telegram.sendVideo(chatId, message.mediaFileId, captionExtra); break;
              case 'document': await this.bot.telegram.sendDocument(chatId, message.mediaFileId, captionExtra); break;
              case 'voice': await this.bot.telegram.sendVoice(chatId, message.mediaFileId, captionExtra); break;
              case 'audio': await this.bot.telegram.sendAudio(chatId, message.mediaFileId, captionExtra); break;
              case 'animation': await this.bot.telegram.sendAnimation(chatId, message.mediaFileId, captionExtra); break;
              case 'sticker': await this.bot.telegram.sendSticker(chatId, message.mediaFileId, extra); break;
              case 'video_note': await this.bot.telegram.sendVideoNote(chatId, message.mediaFileId, extra); break;
              default: await this.bot.telegram.sendMessage(chatId, message.text || '(empty)', extra);
            }
          } else {
            await this.bot.telegram.sendMessage(chatId, message.text || '(empty)', extra);
          }
          logger.info(`[AutoReply] SEND_OK msg=${msg.id} [${i + 1}] Telegram API SUCCESS`);
        } catch (sendErr: any) {
          logger.error(`[AutoReply] SEND_ERROR msg=${msg.id} [${i + 1}] Telegram API ERROR: ${sendErr?.message || sendErr}`, { error: sendErr?.response || sendErr });
          throw sendErr;
        }

        if (messages.length > 1) await sleep(100);
      }

      const nextSendAt = (msg.intervalMinutes && msg.startTime)
        ? computeNextDue(msg.intervalMinutes, msg.startTime, new Date())
        : null;

      await prisma.autoReply.update({
        where: { id: msg.id },
        data: { lastSentAt: new Date(), nextSendAt, sendCount: { increment: 1 } },
      });

      logger.info(`[AutoReply] SEND_OK msg=${msg.id} | lastSentAt=NOW | sendCount=${(msg.sendCount || 0) + 1} | nextSendAt=${nextSendAt?.toISOString() ?? 'NULL'}`);

      await autoReplyRepository.logDelivery({
        autoReplyId: msg.id, targetChatId: msg.targetChatId, targetTopicId: msg.targetTopicId, status: 'SUCCESS',
      });
    } catch (error: any) {
      const errMsg = error?.message || String(error);
      logger.error(`[AutoReply] SEND_FAIL msg=${msg.id} error="${errMsg}"`);

      if (error?.response?.parameters?.retry_after) {
        const waitSec = error.response.parameters.retry_after;
        logger.warn(`[AutoReply] FLOOD_WAIT msg=${msg.id} retryAfter=${waitSec}s`);
        await prisma.autoReply.update({
          where: { id: msg.id },
          data: { nextSendAt: new Date(Date.now() + waitSec * 1000) },
        });
      }

      await autoReplyRepository.logDelivery({
        autoReplyId: msg.id, targetChatId: msg.targetChatId, targetTopicId: msg.targetTopicId, status: 'FAILED', errorMessage: errMsg.slice(0, 900),
      });
    }
  }

  private buildInlineKeyboard(buttons: any[]): any[][] {
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
    return buildTelegramKeyboard(cleaned, 0, 'ar');
  }

  // ─── Test Send ──────────────────────────────────────────

  async testSend(id: number) {
    const msg = await autoReplyRepository.findById(id);
    if (!msg) throw new Error('Post not found');
    if (!msg.targetChatId) throw new Error('targetChatId is missing');
    if ((msg.messages?.length || 0) === 0) throw new Error('No messages');

    logger.info(`[AutoReply] TEST_SEND msg=${id}`);
    await this.sendToGroup(msg);
  }

  // ─── Debug / Status ─────────────────────────────────────

  async getSchedulerStatus(id: number) {
    const msg = await autoReplyRepository.findById(id);
    if (!msg) return null;

    const now = new Date();
    const nextDue = (msg.intervalMinutes && msg.startTime)
      ? computeNextDue(msg.intervalMinutes, msg.startTime, msg.lastSentAt)
      : null;
    const { due, reason } = isDue(msg, now);
    const diffMs = nextDue ? nextDue.getTime() - now.getTime() : null;
    const diffMin = diffMs != null ? Math.round(diffMs / 60000) : null;

    return {
      id: msg.id,
      title: msg.title,
      startTime: msg.startTime,
      intervalMinutes: msg.intervalMinutes,
      lastSentAt: msg.lastSentAt?.toISOString() ?? 'never',
      nextSendAtDB: msg.nextSendAt?.toISOString() ?? 'NULL',
      nextDueCalculated: nextDue?.toISOString() ?? 'NULL',
      diffMinutes: diffMin,
      isDue: due,
      reason,
      sendCount: msg.sendCount,
      targetChatId: msg.targetChatId?.toString() ?? 'NULL',
      targetTopicId: msg.targetTopicId?.toString() ?? 'NULL',
    };
  }

  // ─── Emergency Stop ──────────────────────────────────────

  async emergencyStop() {
    return autoReplyRepository.disableAll();
  }

  async getStats() {
    return autoReplyRepository.getStats();
  }

  async getLogs(messageId: number, limit?: number) {
    return autoReplyRepository.getLogs(messageId, limit);
  }
}

export const autoReplyService = new AutoReplyService();
