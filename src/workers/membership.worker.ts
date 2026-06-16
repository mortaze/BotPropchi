import { Worker, WorkerOptions } from 'bullmq';
import { Telegraf } from 'telegraf';
import { config } from '../config';
import { logger } from '../utils/logger';
import { redisClient } from '../utils/redis';
import { cache } from '../utils/cache';
import { requiredChannelsService, type RequiredChannelInfo } from '../services/requiredChannels.service';
import { membershipService } from '../services/membership/membership.service';
import type { MembershipJobData } from '../queue/membership.queue';

const VALID_MEMBER_STATUSES = new Set(['member', 'administrator', 'creator']);

let botInstance: Telegraf | null = null;

export function setBotInstance(bot: Telegraf): void {
  botInstance = bot;
}

function getBot(): Telegraf {
  if (!botInstance) throw new Error('[MembershipWorker] Bot instance not set');
  return botInstance;
}

async function checkSingleChannel(
  bot: Telegraf,
  telegramId: number,
  channel: RequiredChannelInfo
): Promise<boolean> {
  try {
    const member = await bot.telegram.getChatMember(channel.chatId as any, telegramId);
    const isMember = VALID_MEMBER_STATUSES.has(member.status);
    await membershipService.setChannelCached(telegramId, channel.chatId, isMember);
    return isMember;
  } catch (err) {
    const desc = (err as any)?.response?.description || (err as Error).message || 'Unknown error';
    logger.warn(`[MembershipWorker] getChatMember failed user=${telegramId} channel=${channel.chatId}: ${desc}`);
    return false;
  }
}

async function processCheckMembership(data: { type: 'CHECK_MEMBERSHIP'; telegramId: number }): Promise<void> {
  const { telegramId } = data;
  const bot = getBot();
  const channels = requiredChannelsService.getChannels();
  if (channels.length === 0) return;

  const results = await Promise.allSettled(
    channels.map((ch) => checkSingleChannel(bot, telegramId, ch))
  );

  const notJoined: RequiredChannelInfo[] = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && !r.value) {
      notJoined.push(channels[i]);
    }
  });

  if (notJoined.length > 0) {
    const lines: string[] = ['لطفاً برای استفاده از ربات در کانال‌های زیر عضو شوید:'];
    for (const ch of notJoined) {
      const link = ch.inviteLink || `https://t.me/${ch.chatId.replace(/^-100/, '')}`;
      lines.push(`\n🔹 ${ch.title}\n${link}`);
    }
    lines.push('\nپس از عضویت، دوباره پیام خود را ارسال کنید.');

    try {
      await bot.telegram.sendMessage(telegramId, lines.join(''));
    } catch {
      // user blocked or never started bot — silent
    }
  }
}

async function processChatMemberUpdate(data: {
  type: 'CHAT_MEMBER_UPDATE';
  telegramId: number;
  chatId: string;
  newStatus: string;
  oldStatus: string;
}): Promise<void> {
  const { telegramId, chatId, newStatus } = data;
  const left = newStatus === 'left' || newStatus === 'kicked' || newStatus === 'banned';
  const joined = VALID_MEMBER_STATUSES.has(newStatus);

  if (left) {
    await membershipService.invalidateChannel(telegramId, chatId);
  } else if (joined) {
    await membershipService.setChannelCached(telegramId, chatId, true);
  }
}

async function processVerifyMembership(data: { type: 'VERIFY_MEMBERSHIP'; telegramId: number }): Promise<void> {
  const { telegramId } = data;
  const bot = getBot();
  const channels = requiredChannelsService.getChannels();
  if (channels.length === 0) return;

  await Promise.allSettled(
    channels.map((ch) => checkSingleChannel(bot, telegramId, ch))
  );
}

export async function handleJobInline(data: MembershipJobData): Promise<void> {
  try {
    switch (data.type) {
      case 'CHECK_MEMBERSHIP':
        await processCheckMembership(data as any);
        break;
      case 'CHAT_MEMBER_UPDATE':
        await processChatMemberUpdate(data as any);
        break;
      case 'VERIFY_MEMBERSHIP':
        await processVerifyMembership(data as any);
        break;
    }
  } catch (err) {
    logger.error(`[MembershipWorker] Inline job failed for ${data.type} user=${data.telegramId}:`, err);
  }
}

function startBullMQWorker(): Worker | null {
  if (!config.redis.url) {
    logger.info('[MembershipWorker] No Redis — using inline processing');
    return null;
  }

  const workerOptions: WorkerOptions = {
    connection: { url: config.redis.url, maxRetriesPerRequest: null },
    concurrency: 5,
    lockDuration: 30_000,
    limiter: { max: 10, duration: 1000 },
  } as any;

  const worker = new Worker<MembershipJobData>(
    'membership',
    async (job) => {
      const data = job.data;
      switch (data.type) {
        case 'CHECK_MEMBERSHIP':
          await processCheckMembership(data as any);
          break;
        case 'CHAT_MEMBER_UPDATE':
          await processChatMemberUpdate(data as any);
          break;
        case 'VERIFY_MEMBERSHIP':
          await processVerifyMembership(data as any);
          break;
      }
    },
    workerOptions as any
  );

  worker.on('completed', (job) => {
    logger.debug(`[MembershipWorker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`[MembershipWorker] Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    logger.error('[MembershipWorker] Worker error:', err.message);
  });

  logger.info('[MembershipWorker] BullMQ worker started');
  return worker;
}

let workerInstance: Worker | null = null;

export function startMembershipWorker(bot: Telegraf): void {
  setBotInstance(bot);
  workerInstance = startBullMQWorker();
}

export async function stopMembershipWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.close();
    workerInstance = null;
  }
}
