import { Worker, WorkerOptions } from 'bullmq';
import { Telegraf, Context } from 'telegraf';
import { config } from '../config';
import { logger } from '../utils/logger';
import { redisClient } from '../utils/redis';
import { cache } from '../utils/cache';
import { channelRepository } from '../repositories/channel.repository';
import { prisma } from '../prisma/client';
import { systemLogService } from '../services/system-log.service';
import { userService } from '../services/user.service';
import { SystemEventType, SystemLogLevel } from '@prisma/client';
import type { MembershipJobData } from '../queue/membership.queue';

const MEMBERSHIP_CACHE_TTL = 45;
const VALID_MEMBER_STATUSES = ['member', 'administrator', 'creator'];
const LEFT_STATUSES = ['left', 'kicked'];

let botInstance: Telegraf | null = null;

export function setBotInstance(bot: Telegraf): void {
  botInstance = bot;
  logger.info('[MembershipWorker] Bot instance registered');
}

function getBot(): Telegraf {
  if (!botInstance) throw new Error('[MembershipWorker] Bot instance not set. Call setBotInstance() before processing.');
  return botInstance;
}

function telegramErrorDetails(error: any) {
  const description = error?.response?.description || error?.description || error?.message || String(error);
  const errorCode = error?.response?.error_code || error?.code;
  const isChatNotFound = /chat not found/i.test(description);
  const isForbidden = /forbidden|not enough rights|administrator|bot was kicked/i.test(description);
  return { description, errorCode, isChatNotFound, isForbidden };
}

function getMembershipCacheKey(telegramId: number | bigint | string): string {
  return `membership:v3:${String(telegramId)}`;
}

export interface MembershipResult {
  isMember: boolean;
  notJoined: Array<{
    title: string;
    inviteLink: string | null;
    channelId: string;
    buttonText?: string | null;
  }>;
}

async function getActiveChannels() {
  return channelRepository.findActive();
}

async function checkTelegramMembership(
  bot: Telegraf,
  telegramId: number,
  channels: Awaited<ReturnType<typeof getActiveChannels>>
): Promise<MembershipResult> {
  const notJoined: MembershipResult['notJoined'] = [];
  const checkedAt = new Date();

  for (const channel of channels) {
    const chatIdentifier = await resolveChatIdentifier(channel);
    if (!chatIdentifier || chatIdentifier.startsWith('@')) {
      notJoined.push({
        title: channel.displayTitle || channel.title,
        inviteLink: channel.inviteLink || (channel.username ? `https://t.me/${channel.username}` : null),
        channelId: chatIdentifier || channel.channelId,
        buttonText: channel.buttonText,
      });
      continue;
    }

    try {
      const member = await bot.telegram.getChatMember(chatIdentifier as any, telegramId);
      const status = member.status.toUpperCase();

      await persistMembershipRecord(telegramId, channel.id, status, checkedAt, null);

      if (!VALID_MEMBER_STATUSES.includes(member.status)) {
        notJoined.push({
          title: channel.displayTitle || channel.title,
          inviteLink: channel.inviteLink || (channel.username ? `https://t.me/${channel.username}` : null),
          channelId: chatIdentifier,
          buttonText: channel.buttonText,
        });

        if (LEFT_STATUSES.includes(member.status)) {
          await systemLogService.log({
            eventType: SystemEventType.FORCE_JOIN,
            level: SystemLogLevel.WARN,
            telegramId,
            message: 'User left required channel',
            metadata: { channelId: channel.id, chatId: chatIdentifier, status: member.status },
          });
        }
      }
    } catch (err) {
      const details = telegramErrorDetails(err);
      logger.warn(`[MembershipWorker] getChatMember failed chatId=${chatIdentifier} user=${telegramId}: ${details.description}`);

      await persistMembershipRecord(telegramId, channel.id, 'ERROR', checkedAt, details.description);

      notJoined.push({
        title: channel.displayTitle || channel.title,
        inviteLink: channel.inviteLink || (channel.username ? `https://t.me/${channel.username}` : null),
        channelId: chatIdentifier,
        buttonText: channel.buttonText,
      });
    }
  }

  return { isMember: notJoined.length === 0, notJoined };
}

async function resolveChatIdentifier(channel: any): Promise<string> {
  const raw = String(channel.chatId || channel.channelId || '').trim();
  if (!raw) return channel.username ? `@${channel.username}` : '';
  if (raw.startsWith('@')) return channel.username ? `@${channel.username}` : raw;
  return raw;
}

async function persistMembershipRecord(
  telegramId: number,
  requiredChannelId: number,
  status: string,
  checkedAt: Date,
  error: string | null
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) } });
  if (!user) return;

  await prisma.userRequiredChannelMembership.upsert({
    where: { userId_requiredChannelId: { userId: user.id, requiredChannelId } },
    update: {
      status,
      lastCheckedAt: checkedAt,
      verifiedAt: VALID_MEMBER_STATUSES.includes(status.toLowerCase()) ? checkedAt : undefined,
      error,
    },
    create: {
      userId: user.id,
      requiredChannelId,
      status,
      lastCheckedAt: checkedAt,
      verifiedAt: VALID_MEMBER_STATUSES.includes(status.toLowerCase()) ? checkedAt : null,
      error,
    },
  });
}

async function sendWarningMessage(
  bot: Telegraf,
  telegramId: number,
  notJoined: MembershipResult['notJoined']
): Promise<void> {
  try {
    await bot.telegram.sendMessage(
      telegramId,
      '❌ You left the channel. Please rejoin to continue using the bot.',
      {
        reply_markup: {
          inline_keyboard: [
            ...notJoined.map((ch) => [
              {
                text: ch.buttonText || 'Join Channel',
                url: ch.inviteLink || `https://t.me/${ch.channelId.replace('@', '')}`,
              },
            ]),
            [{ text: '✅ I joined, check again', callback_data: 'check:membership' }],
          ],
        },
      }
    );
  } catch (err) {
    const details = telegramErrorDetails(err);
    if (details.isForbidden) {
      logger.warn(`[MembershipWorker] Cannot send warning to user ${telegramId}: bot blocked or user never started bot`);
    } else {
      logger.error(`[MembershipWorker] Failed to send warning to user ${telegramId}:`, details.description);
    }
  }
}

async function processCheckMembership(data: MembershipJobData & { type: 'CHECK_MEMBERSHIP' }): Promise<void> {
  const { telegramId, force } = data;
  const cacheKey = getMembershipCacheKey(telegramId);

  if (!force) {
    const cached = await redisClient.get<MembershipResult>(cacheKey);
    if (cached) return;
  }

  const bot = getBot();
  const channels = await getActiveChannels();
  if (channels.length === 0) return;

  const result = await checkTelegramMembership(bot, telegramId, channels);

  await redisClient.set(cacheKey, result, MEMBERSHIP_CACHE_TTL);
  cache.set(cacheKey, result, MEMBERSHIP_CACHE_TTL);

  if (!result.isMember) {
    const user = await prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) } });
    if (user) {
      await userService.markMembershipUnverified(BigInt(telegramId), 'worker_check_failed');
      const forcedSettings = await prisma.forcedMembershipSettings.findUnique({ where: { id: 1 } });
      if (forcedSettings?.enabled) {
        await sendWarningMessage(bot, telegramId, result.notJoined);
      }
    }
  } else {
    await userService.markMembershipVerified(BigInt(telegramId));
  }
}

async function processChatMemberUpdate(data: MembershipJobData & { type: 'CHAT_MEMBER_UPDATE' }): Promise<void> {
  const { telegramId, chatId, newStatus } = data;
  const cacheKey = getMembershipCacheKey(telegramId);

  const left = LEFT_STATUSES.includes(newStatus);
  if (left) {
    await redisClient.set(cacheKey, { isMember: false, notJoined: [] }, MEMBERSHIP_CACHE_TTL);
    cache.set(cacheKey, { isMember: false, notJoined: [] }, MEMBERSHIP_CACHE_TTL);

    const user = await prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) } });
    if (user) {
      await userService.markMembershipUnverified(BigInt(telegramId), 'chat_member_left');
      const bot = getBot();
      const forcedSettings = await prisma.forcedMembershipSettings.findUnique({ where: { id: 1 } });
      if (forcedSettings?.enabled) {
        await sendWarningMessage(bot, telegramId, [
          {
            title: chatId,
            inviteLink: null,
            channelId: chatId,
            buttonText: forcedSettings.joinButtonText || 'Join Channel',
          },
        ]);
      }
    }
  } else if (VALID_MEMBER_STATUSES.includes(newStatus)) {
    await redisClient.del(cacheKey);
    cache.del(cacheKey);

    await userService.markMembershipVerified(BigInt(telegramId));
  }
}

async function processVerifyMembership(data: MembershipJobData & { type: 'VERIFY_MEMBERSHIP' }): Promise<void> {
  const { telegramId } = data;
  const cacheKey = getMembershipCacheKey(telegramId);

  const bot = getBot();
  const channels = await getActiveChannels();
  if (channels.length === 0) return;

  const result = await checkTelegramMembership(bot, telegramId, channels);

  await redisClient.set(cacheKey, result, MEMBERSHIP_CACHE_TTL);
  cache.set(cacheKey, result, MEMBERSHIP_CACHE_TTL);

  if (result.isMember) {
    await userService.markMembershipVerified(BigInt(telegramId));
  }
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
    logger.info('[MembershipWorker] No Redis URL — using inline processing');
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
      logger.debug(`[MembershipWorker] Processing job ${job.id} type=${data.type} user=${data.telegramId}`);

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

  logger.info('[MembershipWorker] BullMQ worker started (concurrency=5, rate=10/s)');
  return worker;
}

let workerInstance: Worker | null = null;

export function startMembershipWorker(bot: Telegraf): void {
  setBotInstance(bot);
  workerInstance = startBullMQWorker();
  logger.info('[MembershipWorker] Initialized');
}

export async function stopMembershipWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.close();
    workerInstance = null;
  }
}
