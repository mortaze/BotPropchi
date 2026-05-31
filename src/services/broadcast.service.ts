import { Broadcast, BroadcastParseMode, BroadcastStatus, BroadcastType, Prisma } from '@prisma/client';
import { Telegraf } from 'telegraf';
import { config } from '../config';
import { broadcastRepository } from '../repositories/broadcast.repository';
import { logger } from '../utils/logger';

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
    const options = { parse_mode: this.parseMode(broadcast), caption: broadcast.content || undefined, ...this.keyboardMarkup(broadcast) } as any;
    switch (broadcast.messageType) {
      case BroadcastType.TEXT:
        return this.bot.telegram.sendMessage(chatId, broadcast.content || '', { parse_mode: this.parseMode(broadcast), ...this.keyboardMarkup(broadcast) } as any);
      case BroadcastType.PHOTO:
        return this.bot.telegram.sendPhoto(chatId, broadcast.mediaFileId || '', options);
      case BroadcastType.VIDEO:
        return this.bot.telegram.sendVideo(chatId, broadcast.mediaFileId || '', options);
      case BroadcastType.DOCUMENT:
        return this.bot.telegram.sendDocument(chatId, broadcast.mediaFileId || '', options);
      case BroadcastType.VOICE:
        return this.bot.telegram.sendVoice(chatId, broadcast.mediaFileId || '', options);
      case BroadcastType.AUDIO:
        return this.bot.telegram.sendAudio(chatId, broadcast.mediaFileId || '', options);
      case BroadcastType.STICKER:
        return this.bot.telegram.sendSticker(chatId, broadcast.mediaFileId || '', this.keyboardMarkup(broadcast) as any);
      case BroadcastType.ANIMATION:
        return this.bot.telegram.sendAnimation(chatId, broadcast.mediaFileId || '', options);
      case BroadcastType.MEDIA_GROUP:
        return this.bot.telegram.sendMediaGroup(chatId, (broadcast.mediaItems as any[]) || []);
      default:
        throw new Error('نوع پیام پشتیبانی نمی‌شود');
    }
  }
}

export const broadcastService = new BroadcastService();
