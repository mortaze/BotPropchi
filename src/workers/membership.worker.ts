import { Worker, WorkerOptions } from 'bullmq';
import { Telegraf } from 'telegraf';
import { config } from '../config';
import { logger } from '../utils/logger';
import { redisClient } from '../utils/redis';
import { cache } from '../utils/cache';
import { buildForceJoinKeyboard } from '../bot/keyboards';
import { channelRepository } from '../repositories/channel.repository';
import { prisma } from '../prisma/client';
import { systemLogService } from '../services/system-log.service';
import { membershipService } from '../services/membership/membership.service';
import { forcedMembershipSettingsService } from '../services/membership/forcedMembership.service';
import { SystemEventType, SystemLogLevel } from '@prisma/client';
import type { MembershipJobData } from '../queue/membership.queue';

const VALID_MEMBER_STATUSES = ['member', 'administrator', 'creator'];
const LEFT_STATUSES = ['left', 'kicked'];

let botInstance: Telegraf | null = null;

export function setBotInstance(bot: Telegraf): void {
  botInstance = bot;
}

function getBot(): Telegraf {
  if (!botInstance) throw new Error('[MembershipWorker] Bot instance not set');
  return botInstance;
}

function telegramErrorDetails(error: any) {
  const description = error?.response?.description || error?.description || error?.message || String(error);
  const isForbidden = /forbidden|bot was kicked|user is deactivated/i.test(description);
  const isChatNotFound = /chat not found/i.test(description);
  return { description, isChatNotFound, isForbidden };
}

async function getActiveChannels() {
  return channelRepository.findActive();
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

async function checkTelegramMembership(
  bot: Telegraf,
  telegramId: number,
  channels: Awaited<ReturnType<typeof getActiveChannels>>
): Promise<{ isMember: boolean; notJoined: any[] }> {
  const notJoined: any[] = [];
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
      const status = member.status;

      await persistMembershipRecord(telegramId, channel.id, status.toUpperCase(), checkedAt, null);

      if (!VALID_MEMBER_STATUSES.includes(status)) {
        notJoined.push({
          title: channel.displayTitle || channel.title,
          inviteLink: channel.inviteLink || (channel.username ? `https://t.me/${channel.username}` : null),
          channelId: chatIdentifier,
          buttonText: channel.buttonText,
        });

        if (LEFT_STATUSES.includes(status)) {
          await systemLogService.log({
            eventType: SystemEventType.FORCE_JOIN,
            level: SystemLogLevel.WARN,
            telegramId,
            message: 'User left required channel',
            metadata: { channelId: channel.id, chatId: chatIdentifier, status },
          });
        }
      }
    } catch (err) {
      const details = telegramErrorDetails(err);
      logger.warn(`[MembershipWorker] getChatMember failed user=${telegramId} chat=${chatIdentifier}: ${details.description}`);

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

async function sendBlockMessage(
  bot: Telegraf,
  telegramId: number,
  notJoined: any[],
  messageText: string
): Promise<void> {
  try {
    const settings = await forcedMembershipSettingsService.getSettings();

    await bot.telegram.sendMessage(telegramId, messageText, {
      reply_markup: buildForceJoinKeyboard(notJoined, settings.joinButtonText, settings.checkButtonText).reply_markup,
    });
  } catch (err) {
    const details = telegramErrorDetails(err);
    if (details.isForbidden) {
      logger.debug(`[MembershipWorker] Cannot message user ${telegramId}: blocked or never started bot`);
    } else {
      logger.error(`[MembershipWorker] sendMessage failed for ${telegramId}:`, details.description);
    }
  }
}

async function processCheckMembership(data: { type: 'CHECK_MEMBERSHIP'; telegramId: number; force?: boolean }): Promise<void> {
  const { telegramId } = data;

  const bot = getBot();
  const channels = await getActiveChannels();
  if (channels.length === 0) return;

  const result = await checkTelegramMembership(bot, telegramId, channels);

  await membershipService.setMember(telegramId, result.isMember, result.notJoined);

  if (!result.isMember) {
    const settings = await forcedMembershipSettingsService.getSettings();
    if (settings.enabled) {
      await sendBlockMessage(bot, telegramId, result.notJoined, settings.notJoinedMessage);
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
  const { telegramId, newStatus } = data;
  const left = LEFT_STATUSES.includes(newStatus);
  const joined = VALID_MEMBER_STATUSES.includes(newStatus);

  if (left) {
    await membershipService.setMember(telegramId, false, []);
    await membershipService.clearWarnCooldown(telegramId);

    const user = await prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) } });
    if (user) {
      const settings = await forcedMembershipSettingsService.getSettings();
      if (settings.enabled) {
        await sendBlockMessage(
          getBot(),
          telegramId,
          [
            {
              title: data.chatId,
              inviteLink: null,
              channelId: data.chatId,
              buttonText: settings.joinButtonText,
            },
          ],
          settings.leaveWarningMessage
        );
      }
    }
  } else if (joined) {
    await membershipService.setMember(telegramId, true);
    await membershipService.clearWarnCooldown(telegramId);

    const settings = await forcedMembershipSettingsService.getSettings();
    if (settings.enabled) {
      try {
        await getBot().telegram.sendMessage(telegramId, settings.welcomeBackMessage);
      } catch (err) {
        const details = telegramErrorDetails(err);
        if (!details.isForbidden) {
          logger.error(`[MembershipWorker] Welcome back message failed for ${telegramId}:`, details.description);
        }
      }
    }
  }
}

async function processVerifyMembership(data: { type: 'VERIFY_MEMBERSHIP'; telegramId: number }): Promise<void> {
  const { telegramId } = data;

  const bot = getBot();
  const channels = await getActiveChannels();
  if (channels.length === 0) return;

  const result = await checkTelegramMembership(bot, telegramId, channels);

  await membershipService.setMember(telegramId, result.isMember, result.notJoined);
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
