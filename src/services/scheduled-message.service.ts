import { Telegraf } from 'telegraf';
import { PostStatus, PostMessageType } from '@prisma/client';
import { prisma } from '../prisma/client';
import { scheduledMessageRepository } from '../repositories/scheduled-message.repository';
import { logger } from '../utils/logger';
import { sanitizeTelegramText, sanitizeTelegramExtra, validateDbInput } from '../utils/unicode';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── Core Scheduling Logic ────────────────────────────────

/**
 * Compute the first send time from startTime on today's date.
 * If today's slot passed, advance by interval until we land in the future.
 */
function firstOccurrence(intervalMinutes: number, startTime: string): Date {
  const [h, m] = startTime.split(':').map(Number);
  const now = new Date();
  const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m, 0, 0));
  while (t.getTime() <= now.getTime()) {
    t.setTime(t.getTime() + intervalMinutes * 60_000);
  }
  return t;
}

/**
 * Compute the next due time for a scheduled message.
 * This is the SINGLE source of truth — used by scheduler, display, and test send.
 *
 * Rules:
 *   - lastSentAt is null  → firstOccurrence(startTime)
 *   - lastSentAt exists   → lastSentAt + intervalMinutes
 */
export function computeNextDue(intervalMinutes: number, startTime: string, lastSentAt: Date | null): Date {
  if (!lastSentAt) {
    return firstOccurrence(intervalMinutes, startTime);
  }
  return new Date(lastSentAt.getTime() + intervalMinutes * 60_000);
}

/**
 * Decide whether a message should be sent NOW.
 * Single implementation — used by scheduler AND display.
 */
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

class ScheduledMessageService {
  private bot?: Telegraf;

  setBot(bot: Telegraf) { this.bot = bot; }

  // ─── CRUD ────────────────────────────────────────────────

  async create(data: { title: string; createdBy?: bigint }) {
    const title = validateDbInput(data.title, 'title');
    return scheduledMessageRepository.create({ title, createdBy: data.createdBy });
  }

  async update(id: number, data: { title?: string }) {
    const updateData: any = {};
    if (data.title !== undefined) updateData.title = validateDbInput(data.title, 'title');
    return scheduledMessageRepository.update(id, updateData);
  }

  async delete(id: number) {
    return scheduledMessageRepository.delete(id);
  }

  async publish(id: number) {
    const msg = await scheduledMessageRepository.findById(id);
    if (!msg) throw new Error('Post not found');
    if (!msg.targetChatId) throw new Error('targetChatId is missing');
    if (!msg.intervalMinutes) throw new Error('intervalMinutes is missing');
    if (!msg.startTime) throw new Error('startTime is missing');
    if ((msg.messages?.length || 0) === 0) throw new Error('No messages to send');

    // Compute first occurrence for display — scheduler will recompute from lastSentAt
    const nextSendAt = firstOccurrence(msg.intervalMinutes, msg.startTime);

    logger.info(
      `[SchedMsg] PUBLISH msg=${id} | interval=${msg.intervalMinutes}min | start=${msg.startTime} | ` +
      `chatId=${msg.targetChatId} | topicId=${msg.targetTopicId ?? 'null'} | nextSendAt=${nextSendAt.toISOString()}`
    );

    await scheduledMessageRepository.update(id, {
      status: PostStatus.PUBLISHED,
      isPublished: true,
      nextSendAt, // display-only cache
    });

    const verify = await scheduledMessageRepository.findById(id);
    logger.info(`[SchedMsg] PERSIST VERIFY: isPublished=${verify?.isPublished} status=${verify?.status} nextSendAt=${verify?.nextSendAt?.toISOString() ?? 'NULL'}`);
  }

  async unpublish(id: number) {
    return scheduledMessageRepository.update(id, {
      status: PostStatus.DRAFT, isPublished: false, nextSendAt: null,
    });
  }

  // ─── Message Management ──────────────────────────────────

  async addMessage(scheduledMessageId: number) {
    const lastMsg = await prisma.scheduledMessageMessage.findFirst({
      where: { scheduledMessageId }, orderBy: { order: 'desc' },
    });
    const order = (lastMsg?.order ?? -1) + 1;
    return prisma.scheduledMessageMessage.create({
      data: { scheduledMessageId, text: '', type: PostMessageType.text, order },
    });
  }

  async updateMessage(messageId: number, data: { text?: string; type?: PostMessageType; mediaFileId?: string; entities?: any; captionEntities?: any; caption?: string; replyMarkup?: any }) {
    return prisma.scheduledMessageMessage.update({ where: { id: messageId }, data });
  }

  async deleteMessage(messageId: number) {
    const msg = await prisma.scheduledMessageMessage.findUnique({ where: { id: messageId } });
    if (!msg) return;
    await prisma.scheduledMessageMessage.delete({ where: { id: messageId } });
    const remaining = await prisma.scheduledMessageMessage.findMany({
      where: { scheduledMessageId: msg.scheduledMessageId }, orderBy: { order: 'asc' },
    });
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].order !== i) {
        await prisma.scheduledMessageMessage.update({ where: { id: remaining[i].id }, data: { order: i } });
      }
    }
  }

  async reorderMessages(scheduledMessageId: number, messageIds: number[]) {
    for (let i = 0; i < messageIds.length; i++) {
      await prisma.scheduledMessageMessage.update({ where: { id: messageIds[i] }, data: { order: i } });
    }
  }

  async listMessages(scheduledMessageId: number) {
    return prisma.scheduledMessageMessage.findMany({ where: { scheduledMessageId }, orderBy: { order: 'asc' } });
  }

  // ─── Button Management ───────────────────────────────────

  async addButton(scheduledMessageId: number, data: { text: string; type?: string; value?: string; row?: number; col?: number; messageId?: number }) {
    return prisma.scheduledMessageButton.create({
      data: { scheduledMessageId, messageId: data.messageId, text: data.text, type: data.type ?? 'URL', value: data.value, row: data.row ?? 0, col: data.col ?? 0 },
    });
  }

  async updateButton(buttonId: number, data: { text?: string; type?: string; value?: string; row?: number; col?: number }) {
    return prisma.scheduledMessageButton.update({ where: { id: buttonId }, data });
  }

  async deleteButton(buttonId: number) {
    return prisma.scheduledMessageButton.delete({ where: { id: buttonId } });
  }

  async listButtons(scheduledMessageId: number) {
    return prisma.scheduledMessageButton.findMany({ where: { scheduledMessageId }, orderBy: [{ row: 'asc' }, { col: 'asc' }] });
  }

  // ─── Scheduler (new architecture) ────────────────────────

  async processDueScheduled() {
    const now = new Date();
    logger.info(`[SchedMsg] ═══ TICK ${now.toISOString()} ═══`);

    const allPublished = await prisma.scheduledMessage.findMany({
      where: { isPublished: true, status: PostStatus.PUBLISHED },
      select: {
        id: true, title: true, intervalMinutes: true, startTime: true,
        lastSentAt: true, sendCount: true, nextSendAt: true,
        targetChatId: true, targetTopicId: true, isPublished: true, status: true,
      },
    });

    logger.info(`[SchedMsg] Published count: ${allPublished.length}`);

    const dueIds: number[] = [];

    for (const m of allPublished) {
      const { due, reason } = isDue(m, now);
      const nextDue = (m.intervalMinutes && m.startTime)
        ? computeNextDue(m.intervalMinutes, m.startTime, m.lastSentAt)
        : null;

      logger.info(
        `[SchedMsg] #${m.id} "${m.title}" | NOW=${now.toISOString()} | ` +
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

    logger.info(`[SchedMsg] Due count: ${dueIds.length}`);

    // Load full records (with messages + buttons) only for due items
    for (const id of dueIds) {
      const full = await scheduledMessageRepository.findById(id);
      if (full) {
        logger.info(`[SchedMsg] ▶ SEND_START #${id} "${full.title}"`);
        await this.sendToGroup(full);
      }
    }
  }

  async sendToGroup(msg: any) {
    if (!this.bot || !msg.targetChatId) {
      logger.warn(`[SchedMsg] SKIP msg=${msg.id}: bot=${!!this.bot} chatId=${msg.targetChatId}`);
      return;
    }

    const chatId = Number(msg.targetChatId);
    const threadId = msg.targetTopicId ? Number(msg.targetTopicId) : undefined;

    logger.info(`[SchedMsg] SEND_START msg=${msg.id} chatId=${chatId} threadId=${threadId ?? 'none'} msgs=${msg.messages?.length || 0}`);

    try {
      const messages = msg.messages || [];
      for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        logger.info(`[SchedMsg] SEND msg=${msg.id} [${i + 1}/${messages.length}] type=${message.type} textLen=${(message.text || '').length} entities=${(message.entities as any[])?.length || 0}`);

        // Load buttons for this specific message from DB
        const buttonsFromDb = await prisma.scheduledMessageButton.findMany({
          where: { messageId: message.id },
          orderBy: [{ row: 'asc' }, { col: 'asc' }],
        });
        const inlineKeyboard = buttonsFromDb.length > 0
          ? { inline_keyboard: this.buildInlineKeyboard(buttonsFromDb) }
          : undefined;

        // Build extra with thread, entities, reply_markup — pass directly to Telegram
        const extra: any = {};
        if (threadId) extra.message_thread_id = threadId;
        if (inlineKeyboard) extra.reply_markup = inlineKeyboard;

        // Pass entities directly — do NOT sanitize (entities are stored as-is)
        if (message.entities && Array.isArray(message.entities) && message.entities.length > 0) {
          extra.entities = message.entities;
        }

        if (message.mediaFileId) {
          // Media message — pass caption_entities
          const captionExtra: any = { ...extra };
          if (message.captionEntities && Array.isArray(message.captionEntities) && message.captionEntities.length > 0) {
            captionExtra.caption_entities = message.captionEntities;
          }
          captionExtra.caption = message.text || '';

          switch (message.type) {
            case 'PHOTO': await this.bot.telegram.sendPhoto(chatId, message.mediaFileId, captionExtra); break;
            case 'VIDEO': await this.bot.telegram.sendVideo(chatId, message.mediaFileId, captionExtra); break;
            case 'DOCUMENT': await this.bot.telegram.sendDocument(chatId, message.mediaFileId, captionExtra); break;
            case 'VOICE': await this.bot.telegram.sendVoice(chatId, message.mediaFileId, captionExtra); break;
            case 'AUDIO': await this.bot.telegram.sendAudio(chatId, message.mediaFileId, captionExtra); break;
            case 'ANIMATION': await this.bot.telegram.sendAnimation(chatId, message.mediaFileId, captionExtra); break;
            case 'STICKER': await this.bot.telegram.sendSticker(chatId, message.mediaFileId, extra); break;
            default: await this.bot.telegram.sendMessage(chatId, message.text || '(empty)', extra);
          }
        } else {
          // Text message — pass entities directly
          await this.bot.telegram.sendMessage(chatId, message.text || '(empty)', extra);
        }

        if (messages.length > 1) await sleep(100);
      }

      // After successful send
      const nextSendAt = (msg.intervalMinutes && msg.startTime)
        ? computeNextDue(msg.intervalMinutes, msg.startTime, new Date())
        : null;

      await prisma.scheduledMessage.update({
        where: { id: msg.id },
        data: { lastSentAt: new Date(), nextSendAt, sendCount: { increment: 1 } },
      });

      logger.info(`[SchedMsg] SEND_OK msg=${msg.id} | lastSentAt=NOW | sendCount=${(msg.sendCount || 0) + 1} | nextSendAt=${nextSendAt?.toISOString() ?? 'NULL'}`);

      await scheduledMessageRepository.logDelivery({
        scheduledMessageId: msg.id, targetChatId: msg.targetChatId, targetTopicId: msg.targetTopicId, status: 'SUCCESS',
      });
    } catch (error: any) {
      const errMsg = error?.message || String(error);
      logger.error(`[SchedMsg] SEND_FAIL msg=${msg.id} error="${errMsg}"`);

      if (error?.response?.parameters?.retry_after) {
        const waitSec = error.response.parameters.retry_after;
        logger.warn(`[SchedMsg] FLOOD_WAIT msg=${msg.id} retryAfter=${waitSec}s`);
        await prisma.scheduledMessage.update({
          where: { id: msg.id },
          data: { nextSendAt: new Date(Date.now() + waitSec * 1000) },
        });
      }

      await scheduledMessageRepository.logDelivery({
        scheduledMessageId: msg.id, targetChatId: msg.targetChatId, targetTopicId: msg.targetTopicId, status: 'FAILED', errorMessage: errMsg.slice(0, 900),
      });
    }
  }

  /**
   * Convert DB buttons to Telegram inline_keyboard format.
   * Mirrors Post system's buildTelegramKeyboard from renderer.
   */
  private buildInlineKeyboard(buttons: any[]): any[][] {
    const grid: any[][] = [];
    for (const btn of buttons) {
      const row = btn.row ?? 0;
      const col = btn.col ?? 0;
      if (!grid[row]) grid[row] = [];
      grid[row][col] = btn;
    }

    return grid.filter(Boolean).map((row) =>
      row.filter(Boolean).map((btn) => {
        const type = (btn.type || 'URL').toUpperCase();
        const text = btn.text || '';
        const value = btn.value || '';
        const style = btn.style;

        // Apply color style
        let styledText = text;
        if (style === 'primary') styledText = `🔵 ${text}`;
        else if (style === 'success') styledText = `🟢 ${text}`;
        else if (style === 'danger') styledText = `🔴 ${text}`;

        switch (type) {
          case 'URL':
            return { text: styledText, url: value || 'https://t.me' };
          case 'CALLBACK':
            return { text: styledText, callback_data: value || 'noop' };
          case 'WEB_APP':
          case 'OPEN_MINI_APP':
            return { text: styledText, web_app: { url: value } };
          case 'LOGIN_URL':
            return { text: styledText, login_url: { url: value } };
          case 'COPY_TEXT':
            return { text: styledText, copy_text: { text: value } };
          case 'SWITCH_INLINE':
            return { text: styledText, switch_inline_query: value };
          case 'SWITCH_INLINE_CURRENT_CHAT':
            return { text: styledText, switch_inline_query_current_chat: value };
          case 'COMMAND':
            return { text: styledText, callback_data: value || 'noop' };
          case 'POPUP':
            return { text: styledText, callback_data: value || 'noop' };
          default:
            return { text: styledText, url: value || 'https://t.me' };
        }
      })
    ).filter(row => row.length > 0);
  }

  // ─── Test Send (same pipeline) ──────────────────────────

  async testSend(id: number) {
    const msg = await scheduledMessageRepository.findById(id);
    if (!msg) throw new Error('Post not found');
    if (!msg.targetChatId) throw new Error('targetChatId is missing');
    if ((msg.messages?.length || 0) === 0) throw new Error('No messages');

    logger.info(`[SchedMsg] TEST_SEND msg=${id}`);
    await this.sendToGroup(msg);
  }

  // ─── Debug / Status ─────────────────────────────────────

  async getSchedulerStatus(id: number) {
    const msg = await scheduledMessageRepository.findById(id);
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
    return scheduledMessageRepository.disableAll();
  }

  async getStats() {
    return scheduledMessageRepository.getStats();
  }

  async getLogs(messageId: number, limit?: number) {
    return scheduledMessageRepository.getLogs(messageId, limit);
  }
}

export const scheduledMessageService = new ScheduledMessageService();
