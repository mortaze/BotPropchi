import { Telegraf } from 'telegraf';
import { PostStatus, PostMessageType } from '@prisma/client';
import { prisma } from '../prisma/client';
import { scheduledMessageRepository } from '../repositories/scheduled-message.repository';
import { logger } from '../utils/logger';
import { sanitizeTelegramText, sanitizeTelegramExtra, validateDbInput } from '../utils/unicode';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class ScheduledMessageService {
  private bot?: Telegraf;

  setBot(bot: Telegraf) {
    this.bot = bot;
  }

  // ─── CRUD ────────────────────────────────────────────────

  async create(data: { title: string; createdBy?: bigint }) {
    const title = validateDbInput(data.title, 'title');
    return scheduledMessageRepository.create({
      title,
      createdBy: data.createdBy,
    });
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

    const nextSendAt = this.calculateNextSend(msg.intervalMinutes, msg.startTime);
    logger.info(`[SchedMsg] Publishing msg=${id} interval=${msg.intervalMinutes}min start=${msg.startTime} chatId=${msg.targetChatId} topicId=${msg.targetTopicId ?? 'null'} nextSendAt=${nextSendAt.toISOString()} now=${new Date().toISOString()}`);

    const result = await scheduledMessageRepository.update(id, {
      status: PostStatus.PUBLISHED,
      isPublished: true,
      nextSendAt,
    });

    // Verify the save
    const verify = await scheduledMessageRepository.findById(id);
    logger.info(`[SchedMsg] Publish VERIFY: nextSendAt in DB = ${verify?.nextSendAt?.toISOString() ?? 'NULL'}`);

    return result;
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
      where: { scheduledMessageId },
      orderBy: { order: 'desc' },
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
      where: { scheduledMessageId: msg.scheduledMessageId },
      orderBy: { order: 'asc' },
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
      where: { scheduledMessageId },
      orderBy: { order: 'asc' },
    });
  }

  // ─── Button Management ───────────────────────────────────

  async addButton(scheduledMessageId: number, data: { text: string; type?: string; value?: string; row?: number; col?: number; messageId?: number }) {
    return prisma.scheduledMessageButton.create({
      data: {
        scheduledMessageId,
        messageId: data.messageId,
        text: data.text,
        type: data.type ?? 'URL',
        value: data.value,
        row: data.row ?? 0,
        col: data.col ?? 0,
      },
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
      where: { scheduledMessageId },
      orderBy: [{ row: 'asc' }, { col: 'asc' }],
    });
  }

  // ─── Scheduling ──────────────────────────────────────────

  async setSchedule(id: number, intervalMinutes: number, startTime: string, targetChatId: number, targetTopicId?: number | null) {
    const nextSendAt = this.calculateNextSend(intervalMinutes, startTime);
    return scheduledMessageRepository.update(id, {
      intervalMinutes,
      startTime,
      targetChatId: BigInt(targetChatId),
      targetTopicId: targetTopicId != null ? BigInt(targetTopicId) : undefined,
      nextSendAt,
    });
  }

  calculateNextSend(intervalMinutes: number, startTime: string): Date {
    const [hours, mins] = startTime.split(':').map(Number);
    const now = new Date();
    const next = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
      hours, mins, 0, 0
    ));

    if (next.getTime() <= now.getTime()) {
      next.setTime(next.getTime() + intervalMinutes * 60 * 1000);
    }

    logger.info(`[SchedMsg] calculateNextSend: interval=${intervalMinutes}min start=${startTime} now=${now.toISOString()} nextSendAt=${next.toISOString()}`);
    return next;
  }

  // ─── Delivery ────────────────────────────────────────────

  async processDueScheduled() {
    try {
      const now = new Date();
      logger.info(`[ScheduledMsg] ═══ Scheduler tick at ${now.toISOString()} ═══`);

      const allPublished = await prisma.scheduledMessage.findMany({
        where: { isPublished: true, status: PostStatus.PUBLISHED },
        select: { id: true, title: true, intervalMinutes: true, startTime: true, nextSendAt: true, targetChatId: true, targetTopicId: true, sendCount: true, lastSentAt: true, isPublished: true, status: true },
      });
      logger.info(`[ScheduledMsg] Total published: ${allPublished.length}`);

      for (const m of allPublished) {
        const reasons: string[] = [];
        if (m.nextSendAt == null) reasons.push('nextSendAt is null');
        if (m.nextSendAt && m.nextSendAt.getTime() > now.getTime()) reasons.push(`nextSendAt > now (${m.nextSendAt.toISOString()} > ${now.toISOString()})`);
        if (m.intervalMinutes == null) reasons.push('intervalMinutes is null');
        if (m.targetChatId == null) reasons.push('targetChatId is null');
        if (!m.isPublished) reasons.push('isPublished=false');
        if (m.status !== PostStatus.PUBLISHED) reasons.push(`status=${m.status}`);

        const eligible = reasons.length === 0;
        logger.info(`[ScheduledMsg] msg=${m.id} "${m.title}" status=${m.status} isPub=${m.isPublished} interval=${m.intervalMinutes}min start=${m.startTime} nextSend=${m.nextSendAt?.toISOString() ?? 'NULL'} chatId=${m.targetChatId ?? 'NULL'} topicId=${m.targetTopicId ?? 'NULL'} sendCount=${m.sendCount} lastSent=${m.lastSentAt?.toISOString() ?? 'NULL'} → ${eligible ? '✅ DUE' : '❌ NOT DUE: ' + reasons.join(', ')}`);
      }

      const due = await scheduledMessageRepository.findDueForSending();
      logger.info(`[ScheduledMsg] Due messages: ${due.length}`);
      for (const msg of due) {
        logger.info(`[ScheduledMsg] ▶ Sending msg=${msg.id} "${msg.title}" to chatId=${msg.targetChatId} topicId=${msg.targetTopicId ?? 'none'}`);
        await this.sendToGroup(msg);
      }
    } catch (error) {
      logger.error('[ScheduledMsg] processDueScheduled failed:', error);
    }
  }

  async sendToGroup(msg: any) {
    if (!this.bot || !msg.targetChatId) {
      logger.warn(`[ScheduledMsg] Skipping msg=${msg.id}: bot=${!!this.bot} chatId=${msg.targetChatId}`);
      return;
    }

    const chatId = Number(msg.targetChatId);
    const threadId = msg.targetTopicId ? Number(msg.targetTopicId) : undefined;

    logger.info(`[ScheduledMsg] Sending msg=${msg.id} to chatId=${chatId} threadId=${threadId ?? 'none'} messages=${msg.messages?.length || 0}`);

    try {
      const messages = msg.messages || [];
      for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        const text = sanitizeTelegramText(message.text || '', 4096);
        const extra: any = {};
        if (threadId) extra.message_thread_id = threadId;
        if (message.replyMarkup) extra.reply_markup = message.replyMarkup;

        logger.info(`[ScheduledMsg] msg=${msg.id} sending message ${i + 1}/${messages.length} type=${message.type} text="${text.substring(0, 50)}..." threadId=${threadId ?? 'none'}`);

        if (message.mediaFileId) {
          switch (message.type) {
            case 'PHOTO':
              await this.bot.telegram.sendPhoto(chatId, message.mediaFileId, { ...extra, caption: text });
              break;
            case 'VIDEO':
              await this.bot.telegram.sendVideo(chatId, message.mediaFileId, { ...extra, caption: text });
              break;
            case 'DOCUMENT':
              await this.bot.telegram.sendDocument(chatId, message.mediaFileId, { ...extra, caption: text });
              break;
            case 'VOICE':
              await this.bot.telegram.sendVoice(chatId, message.mediaFileId, { ...extra, caption: text });
              break;
            case 'AUDIO':
              await this.bot.telegram.sendAudio(chatId, message.mediaFileId, { ...extra, caption: text });
              break;
            case 'ANIMATION':
              await this.bot.telegram.sendAnimation(chatId, message.mediaFileId, { ...extra, caption: text });
              break;
            case 'STICKER':
              await this.bot.telegram.sendSticker(chatId, message.mediaFileId, extra);
              break;
            default:
              await this.bot.telegram.sendMessage(chatId, text || '(empty)', extra);
          }
        } else {
          await this.bot.telegram.sendMessage(chatId, text || '(empty)', extra);
        }

        if (messages.length > 1) await sleep(100);
      }

      const nextSendAt = msg.intervalMinutes ? this.calculateNextSend(msg.intervalMinutes, msg.startTime || '00:00') : null;
      await prisma.scheduledMessage.update({
        where: { id: msg.id },
        data: { lastSentAt: new Date(), nextSendAt, sendCount: { increment: 1 } },
      });

      logger.info(`[ScheduledMsg] SUCCESS msg=${msg.id} nextSend=${nextSendAt?.toISOString()}`);

      await scheduledMessageRepository.logDelivery({
        scheduledMessageId: msg.id,
        targetChatId: msg.targetChatId,
        targetTopicId: msg.targetTopicId,
        status: 'SUCCESS',
      });
    } catch (error: any) {
      const errMsg = error?.message || String(error);
      logger.error(`[ScheduledMsg] FAILED msg=${msg.id} error="${errMsg}"`, error);

      if (error?.response?.parameters?.retry_after) {
        const waitSeconds = error.response.parameters.retry_after;
        logger.warn(`[ScheduledMsg] FloodWait for msg=${msg.id}, waiting ${waitSeconds}s`);
        await prisma.scheduledMessage.update({
          where: { id: msg.id },
          data: { nextSendAt: new Date(Date.now() + waitSeconds * 1000) },
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
