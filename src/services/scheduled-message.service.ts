import { Telegraf } from 'telegraf';
import { PostStatus, PostMessageType } from '@prisma/client';
import { prisma } from '../prisma/client';
import { scheduledMessageRepository } from '../repositories/scheduled-message.repository';
import { logger } from '../utils/logger';
import { sanitizeTelegramText, sanitizeTelegramExtra, validateDbInput } from '../utils/unicode';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Calculate the first occurrence of a recurring schedule.
 *
 * Algorithm:
 *   1. Take today's date at the given HH:MM (in UTC)
 *   2. If that moment is still in the future → that's the answer
 *   3. Otherwise keep adding `intervalMinutes` until we land in the future
 *
 * This is the ONLY function that computes a first-send time.
 * After the first send, nextSendAt is always: previousNextSendAt + interval.
 */
export function calculateFirstOccurrence(intervalMinutes: number, startTime: string): Date {
  const [h, m] = startTime.split(':').map(Number);
  const now = new Date();
  const first = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
    h, m, 0, 0,
  ));

  while (first.getTime() <= now.getTime()) {
    first.setTime(first.getTime() + intervalMinutes * 60_000);
  }

  return first;
}

/**
 * Advance to the next send slot.
 * Called ONLY after a successful send — never from publish, edit, or open-editor.
 */
function advanceNextSendAt(previousNextSendAt: Date, intervalMinutes: number): Date {
  return new Date(previousNextSendAt.getTime() + intervalMinutes * 60_000);
}

class ScheduledMessageService {
  private bot?: Telegraf;

  setBot(bot: Telegraf) {
    this.bot = bot;
  }

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

  /**
   * Publish — the ONLY place that computes nextSendAt for the first time.
   */
  async publish(id: number) {
    const msg = await scheduledMessageRepository.findById(id);
    if (!msg) throw new Error('Post not found');
    if (!msg.targetChatId) throw new Error('targetChatId is missing');
    if (!msg.intervalMinutes) throw new Error('intervalMinutes is missing');
    if (!msg.startTime) throw new Error('startTime is missing');
    if ((msg.messages?.length || 0) === 0) throw new Error('No messages to send');

    const nextSendAt = calculateFirstOccurrence(msg.intervalMinutes, msg.startTime);

    logger.info(
      `[SchedMsg] PUBLISH msg=${id} | interval=${msg.intervalMinutes}min | start=${msg.startTime} | ` +
      `chatId=${msg.targetChatId} | topicId=${msg.targetTopicId ?? 'null'} | ` +
      `nextSendAt=${nextSendAt.toISOString()} | now=${new Date().toISOString()}`
    );

    await scheduledMessageRepository.update(id, {
      status: PostStatus.PUBLISHED,
      isPublished: true,
      nextSendAt,
    });

    const verify = await scheduledMessageRepository.findById(id);
    logger.info(`[SchedMsg] PERSIST VERIFY: nextSendAt=${verify?.nextSendAt?.toISOString() ?? 'NULL'}`);
  }

  async unpublish(id: number) {
    return scheduledMessageRepository.update(id, {
      status: PostStatus.DRAFT,
      isPublished: false,
      nextSendAt: null,
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

  async updateMessage(messageId: number, data: { text?: string; type?: PostMessageType; mediaFileId?: string; entities?: any; replyMarkup?: any }) {
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
    return prisma.scheduledMessageMessage.findMany({
      where: { scheduledMessageId }, orderBy: { order: 'asc' },
    });
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
    return prisma.scheduledMessageButton.findMany({
      where: { scheduledMessageId }, orderBy: [{ row: 'asc' }, { col: 'asc' }],
    });
  }

  // ─── Scheduler ───────────────────────────────────────────

  async processDueScheduled() {
    const now = new Date();
    logger.info(`[SchedMsg] ═══ TICK ${now.toISOString()} ═══`);

    const allPublished = await prisma.scheduledMessage.findMany({
      where: { isPublished: true, status: PostStatus.PUBLISHED },
      select: {
        id: true, title: true, intervalMinutes: true, startTime: true,
        nextSendAt: true, lastSentAt: true, sendCount: true,
        targetChatId: true, targetTopicId: true, isPublished: true, status: true,
      },
    });

    logger.info(`[SchedMsg] Published count: ${allPublished.length}`);

    for (const m of allPublished) {
      const isDue = m.nextSendAt != null && m.nextSendAt.getTime() <= now.getTime();
      const reasons: string[] = [];
      if (m.nextSendAt == null) reasons.push('nextSendAt=null');
      if (m.nextSendAt && m.nextSendAt.getTime() > now.getTime()) reasons.push(`nextSendAt=${m.nextSendAt.toISOString()} > NOW`);
      if (m.intervalMinutes == null) reasons.push('intervalMinutes=null');
      if (m.targetChatId == null) reasons.push('targetChatId=null');
      if (!m.isPublished) reasons.push('isPublished=false');
      if (m.status !== PostStatus.PUBLISHED) reasons.push(`status=${m.status}`);

      logger.info(
        `[SchedMsg] #${m.id} "${m.title}" | NOW=${now.toISOString()} | ` +
        `START=${m.startTime} | INTERVAL=${m.intervalMinutes}min | ` +
        `LAST_SENT=${m.lastSentAt?.toISOString() ?? 'never'} | ` +
        `NEXT_SEND=${m.nextSendAt?.toISOString() ?? 'NULL'} | ` +
        `CHAT=${m.targetChatId ?? 'NULL'} | TOPIC=${m.targetTopicId ?? 'NULL'} | ` +
        `COUNT=${m.sendCount} | ` +
        `IS_DUE=${isDue ? 'YES' : 'NO'} ${reasons.length ? '(' + reasons.join(', ') + ')' : ''}`
      );
    }

    const due = await scheduledMessageRepository.findDueForSending();
    logger.info(`[SchedMsg] Due count: ${due.length}`);

    for (const msg of due) {
      await this.sendToGroup(msg);
    }
  }

  /**
   * Send a post to its target group.
   * After success: nextSendAt = previousNextSendAt + interval.
   * NEVER recalculates from current time.
   */
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
        const text = sanitizeTelegramText(message.text || '', 4096);
        const extra: any = {};
        if (threadId) extra.message_thread_id = threadId;
        if (message.replyMarkup) extra.reply_markup = message.replyMarkup;

        logger.info(`[SchedMsg] SEND msg=${msg.id} [${i + 1}/${messages.length}] type=${message.type} threadId=${threadId ?? 'none'}`);

        if (message.mediaFileId) {
          switch (message.type) {
            case 'PHOTO': await this.bot.telegram.sendPhoto(chatId, message.mediaFileId, { ...extra, caption: text }); break;
            case 'VIDEO': await this.bot.telegram.sendVideo(chatId, message.mediaFileId, { ...extra, caption: text }); break;
            case 'DOCUMENT': await this.bot.telegram.sendDocument(chatId, message.mediaFileId, { ...extra, caption: text }); break;
            case 'VOICE': await this.bot.telegram.sendVoice(chatId, message.mediaFileId, { ...extra, caption: text }); break;
            case 'AUDIO': await this.bot.telegram.sendAudio(chatId, message.mediaFileId, { ...extra, caption: text }); break;
            case 'ANIMATION': await this.bot.telegram.sendAnimation(chatId, message.mediaFileId, { ...extra, caption: text }); break;
            case 'STICKER': await this.bot.telegram.sendSticker(chatId, message.mediaFileId, extra); break;
            default: await this.bot.telegram.sendMessage(chatId, text || '(empty)', extra);
          }
        } else {
          await this.bot.telegram.sendMessage(chatId, text || '(empty)', extra);
        }

        if (messages.length > 1) await sleep(100);
      }

      // ─── After successful send: advance nextSendAt ───────
      const nextSendAt = msg.intervalMinutes && msg.nextSendAt
        ? advanceNextSendAt(msg.nextSendAt, msg.intervalMinutes)
        : null;

      await prisma.scheduledMessage.update({
        where: { id: msg.id },
        data: { lastSentAt: new Date(), nextSendAt, sendCount: { increment: 1 } },
      });

      logger.info(
        `[SchedMsg] SEND_OK msg=${msg.id} | ` +
        `lastSentAt=NOW | sendCount=${(msg.sendCount || 0) + 1} | ` +
        `nextSendAt=${nextSendAt?.toISOString() ?? 'NULL'}`
      );

      await scheduledMessageRepository.logDelivery({
        scheduledMessageId: msg.id,
        targetChatId: msg.targetChatId,
        targetTopicId: msg.targetTopicId,
        status: 'SUCCESS',
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
        scheduledMessageId: msg.id,
        targetChatId: msg.targetChatId,
        targetTopicId: msg.targetTopicId,
        status: 'FAILED',
        errorMessage: errMsg.slice(0, 900),
      });
    }
  }

  // ─── Test Send (same pipeline as scheduler) ─────────────

  async testSend(id: number) {
    const msg = await scheduledMessageRepository.findById(id);
    if (!msg) throw new Error('Post not found');
    if (!msg.targetChatId) throw new Error('targetChatId is missing');
    if ((msg.messages?.length || 0) === 0) throw new Error('No messages');

    logger.info(`[SchedMsg] TEST_SEND msg=${id} — running same pipeline as scheduler`);

    // Same validation + send as processDueScheduled
    await this.sendToGroup(msg);
  }

  // ─── Emergency Stop ──────────────────────────────────────

  async emergencyStop() {
    return scheduledMessageRepository.disableAll();
  }

  // ─── Stats ───────────────────────────────────────────────

  async getStats() {
    return scheduledMessageRepository.getStats();
  }

  async getLogs(messageId: number, limit?: number) {
    return scheduledMessageRepository.getLogs(messageId, limit);
  }
}

export const scheduledMessageService = new ScheduledMessageService();
