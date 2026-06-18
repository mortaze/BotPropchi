import { Broadcast, BroadcastParseMode, BroadcastStatus, BroadcastType, Prisma, SystemEventType, SystemLogLevel } from '@prisma/client';
import { Telegraf } from 'telegraf';
import { config } from '../config';
import { broadcastRepository } from '../repositories/broadcast.repository';
import { logger } from '../utils/logger';
import { systemLogService } from './system-log.service';
import { sendFormattedMessageToChat } from '../shared/message-format';

const TELEGRAM_DELAY_MS = Number(process.env.BROADCAST_DELAY_MS || 70);
const BATCH_SIZE = Number(process.env.BROADCAST_BATCH_SIZE || 25);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type CreateBroadcastInput = {
  title: string;
  messageType: BroadcastType;
  content?: string | null;
  mediaFileId?: string | null;
  mediaItems?: Prisma.InputJsonValue;
  parseMode?: BroadcastParseMode | null;
  inlineKeyboard?: Prisma.InputJsonValue;
  scheduledAt?: Date | null;
  createdBy?: string | null;
};

type TelegramMessageBroadcastInput = {
  title: string;
  sourceChatId: number | string;
  messageIds: number[];
  messageType: BroadcastType;
  deliveryMethod: 'copy' | 'forward';
  createdBy?: string | null;
};

class BroadcastService {
  private bot?: Telegraf;
  private running = new Set<number>();

  setBot(bot: Telegraf) {
    this.bot = bot;
  }

  list(params: { page?: number; limit?: number; status?: BroadcastStatus }) {
    return broadcastRepository.list(params);
  }

  get(id: number) {
    return broadcastRepository.findById(id);
  }

  create(input: CreateBroadcastInput) {
    const status = input.scheduledAt && input.scheduledAt > new Date() ? BroadcastStatus.SCHEDULED : BroadcastStatus.DRAFT;
    return broadcastRepository.create({
      title: input.title,
      messageType: input.messageType,
      content: input.content,
      mediaFileId: input.mediaFileId,
      mediaItems: input.mediaItems ?? undefined,
      parseMode: input.parseMode,
      inlineKeyboard: input.inlineKeyboard ?? undefined,
      scheduledAt: input.scheduledAt,
      status,
      createdBy: input.createdBy,
    });
  }

  async enqueue(id: number) {
    const broadcast = await broadcastRepository.findById(id);
    if (!broadcast) throw new Error('پیام همگانی یافت نشد');
    if (broadcast.totalRecipients === 0) await broadcastRepository.createPendingLogs(id);
    await broadcastRepository.update(id, { status: BroadcastStatus.QUEUED });
    void this.process(id);
    return this.get(id);
  }

  async pause(id: number) {
    this.running.delete(id);
    await broadcastRepository.update(id, { status: BroadcastStatus.PAUSED });
    return this.get(id);
  }

  async cancel(id: number) {
    this.running.delete(id);
    await broadcastRepository.update(id, { status: BroadcastStatus.CANCELLED, completedAt: new Date() });
    return this.get(id);
  }

  async resume(id: number) {
    await broadcastRepository.update(id, { status: BroadcastStatus.QUEUED });
    void this.process(id);
    return this.get(id);
  }

  async retry(id: number) {
    await broadcastRepository.retryFailed(id);
    await broadcastRepository.update(id, { status: BroadcastStatus.QUEUED, completedAt: null });
    void this.process(id);
    return this.get(id);
  }

  async sendTest(id: number, telegramId = config.bot.adminTelegramId) {
    const broadcast = await broadcastRepository.findById(id);
    if (!broadcast) throw new Error('پیام همگانی یافت نشد');
    await this.sendToTelegram(broadcast, telegramId);
    return { success: true };
  }

  async processDueScheduled() {
    const due = await broadcastRepository.list({ page: 1, limit: 50, status: BroadcastStatus.SCHEDULED });
    await Promise.all(due.items.filter((item) => item.scheduledAt && item.scheduledAt <= new Date()).map((item) => this.enqueue(item.id)));
  }

  async createTelegramCopyBroadcast(input: { title: string; sourceChatId: number | string; messageIds: number[]; createdBy?: string | null }) {
    return this.createTelegramMessageBroadcast({ ...input, messageType: BroadcastType.COPY_MESSAGE, deliveryMethod: 'copy' });
  }

  async createTelegramMessageBroadcast(input: TelegramMessageBroadcastInput) {
    const startedAt = new Date();
    const broadcast = await broadcastRepository.create({
      title: input.title,
      messageType: input.messageType,
      mediaItems: {
        sourceChatId: String(input.sourceChatId),
        messageIds: input.messageIds,
        deliveryMethod: input.deliveryMethod,
      },
      status: BroadcastStatus.QUEUED,
      startedAt,
      createdBy: input.createdBy,
    });
    await systemLogService.log({
      eventType: SystemEventType.BROADCAST,
      message: 'ADMIN_BROADCAST_STARTED',
      metadata: { broadcastId: broadcast.id, source: 'bot_panel', messageType: input.messageType, deliveryMethod: input.deliveryMethod },
    });
    await broadcastRepository.createPendingLogs(broadcast.id);
    await this.process(broadcast.id);
    const completed = await this.get(broadcast.id);
    await systemLogService.log({
      eventType: SystemEventType.BROADCAST,
      message: 'ADMIN_BROADCAST_COMPLETED',
      metadata: { broadcastId: broadcast.id, source: 'bot_panel', successCount: completed?.successCount ?? 0, failedCount: completed?.failedCount ?? 0, totalRecipients: completed?.totalRecipients ?? 0 },
    });
    return completed;
  }

  async summarizeDelivery(id: number) {
    const broadcast = await broadcastRepository.findById(id);
    const failedLogs = await broadcastRepository.failedErrorSamples(id);
    const blocked = failedLogs.filter((log) => /blocked|bot was blocked|forbidden/i.test(log.error || '')).length;
    const deleted = failedLogs.filter((log) => /chat not found|user is deactivated|deactivated/i.test(log.error || '')).length;
    return { broadcast, blocked, deleted };
  }

  private async process(id: number) {
    if (this.running.has(id)) return;
    this.running.add(id);
    await broadcastRepository.update(id, { status: BroadcastStatus.RUNNING, startedAt: new Date() });

    try {
      while (this.running.has(id)) {
        const broadcast = await broadcastRepository.findById(id);
        if (!broadcast || (broadcast.status !== BroadcastStatus.RUNNING && broadcast.status !== BroadcastStatus.QUEUED)) break;

        const logs = await broadcastRepository.getPendingLogs(id, BATCH_SIZE);
        if (!logs.length) break;

        for (const log of logs) {
          if (!this.running.has(id)) break;
          try {
            await this.sendToTelegram(broadcast, log.telegramId);
            await broadcastRepository.markLogSuccess(log.id);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.warn(`Broadcast ${id} failed for ${log.telegramId.toString()}: ${message}`);
            await broadcastRepository.markLogFailed(log.id, message.slice(0, 900));
            await systemLogService.log({ eventType: SystemEventType.BROADCAST, level: SystemLogLevel.WARN, telegramId: log.telegramId, message: 'Broadcast delivery failed', metadata: { broadcastId: id, error: message.slice(0, 900) } });
          }
          await sleep(TELEGRAM_DELAY_MS);
        }
        await broadcastRepository.refreshCounters(id);
      }
    } catch (error) {
      logger.error(`Broadcast processor failed id=${id}`, error);
      await broadcastRepository.update(id, { status: BroadcastStatus.FAILED });
    } finally {
      this.running.delete(id);
      const current = await broadcastRepository.findById(id);
      if (current?.status === BroadcastStatus.RUNNING || current?.status === BroadcastStatus.QUEUED) {
        await broadcastRepository.refreshCounters(id);
      }
    }
  }

  private keyboardMarkup(broadcast: Broadcast) {
    return broadcast.inlineKeyboard ? { reply_markup: broadcast.inlineKeyboard as any } : undefined;
  }

  private parseMode(broadcast: Broadcast): 'Markdown' | 'HTML' | undefined {
    if (broadcast.parseMode === BroadcastParseMode.MARKDOWN) return 'Markdown';
    if (broadcast.parseMode === BroadcastParseMode.HTML) return 'HTML';
    return undefined;
  }

  private async sendToTelegram(broadcast: Broadcast, telegramId: bigint) {
    if (!this.bot) throw new Error('ربات برای ارسال پیام همگانی آماده نیست');
    const chatId = Number(telegramId);
    const payload = (broadcast.mediaItems || {}) as any;

    if (payload.sourceChatId && Array.isArray(payload.messageIds)) {
      for (const messageId of payload.messageIds) {
        if (payload.deliveryMethod === 'forward' || broadcast.messageType === BroadcastType.FORWARD_MESSAGE) {
          await this.bot.telegram.forwardMessage(chatId, payload.sourceChatId, Number(messageId));
        } else {
          await this.bot.telegram.copyMessage(chatId, payload.sourceChatId, Number(messageId));
        }
        await sleep(15);
      }
      return;
    }

    const buttons = broadcast.inlineKeyboard as any[][] | undefined;
    const content = broadcast.content || undefined;
    const parseMode = this.parseMode(broadcast);
    const common = {
      link_preview: true,
      parse_mode: parseMode || undefined,
      buttons,
    };

    if (parseMode) {
      switch (broadcast.messageType) {
        case BroadcastType.TEXT:
          return this.bot.telegram.sendMessage(chatId, content || '', { parse_mode: parseMode, link_preview_options: { is_disabled: true }, ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}) } as any);
        case BroadcastType.PHOTO:
          return this.bot.telegram.sendPhoto(chatId, broadcast.mediaFileId || '', { caption: content, parse_mode: parseMode, link_preview_options: { is_disabled: true }, ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}) } as any);
        case BroadcastType.VIDEO:
          return this.bot.telegram.sendVideo(chatId, broadcast.mediaFileId || '', { caption: content, parse_mode: parseMode, link_preview_options: { is_disabled: true }, ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}) } as any);
        case BroadcastType.DOCUMENT:
          return this.bot.telegram.sendDocument(chatId, broadcast.mediaFileId || '', { caption: content, parse_mode: parseMode, ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}) } as any);
        case BroadcastType.VOICE:
          return this.bot.telegram.sendVoice(chatId, broadcast.mediaFileId || '', { caption: content, parse_mode: parseMode, ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}) } as any);
        case BroadcastType.AUDIO:
          return this.bot.telegram.sendAudio(chatId, broadcast.mediaFileId || '', { caption: content, parse_mode: parseMode, ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}) } as any);
        case BroadcastType.STICKER:
          return this.bot.telegram.sendSticker(chatId, broadcast.mediaFileId || '', buttons ? { reply_markup: { inline_keyboard: buttons } } : undefined);
        case BroadcastType.ANIMATION:
          return this.bot.telegram.sendAnimation(chatId, broadcast.mediaFileId || '', { caption: content, parse_mode: parseMode, ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}) } as any);
        case BroadcastType.MEDIA_GROUP:
          return this.bot.telegram.sendMediaGroup(chatId, (broadcast.mediaItems as any[]) || []);
        default:
          throw new Error('نوع پیام پشتیبانی نمی‌شود');
      }
    }

    await sendFormattedMessageToChat(this.bot, chatId, {
      text: broadcast.content || '',
      ...(broadcast.mediaFileId ? {
        caption: broadcast.content || undefined,
      } : {}),
    }, common);
  }
}

export const broadcastService = new BroadcastService();
