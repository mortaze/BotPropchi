import { prisma } from '../../prisma/client';
import { redisClient } from '../../utils/redis';
import { cache } from '../../utils/cache';
import { logger } from '../../utils/logger';
import { channelRepository } from '../../repositories/channel.repository';
import { userService } from '../user.service';
import { systemLogService } from '../system-log.service';
import { membershipQueue } from '../../queue/membership.queue';
import { SystemEventType, SystemLogLevel } from '@prisma/client';
import { forcedMembershipSettingsService } from './forcedMembership.service';

const MEMBERSHIP_CACHE_TTL = 45;
const VALID_MEMBER_STATUSES = ['member', 'administrator', 'creator'];

export interface MembershipResult {
  isMember: boolean;
  notJoined: Array<{
    title: string;
    inviteLink: string | null;
    channelId: string;
    buttonText?: string | null;
  }>;
}

function getCacheKey(telegramId: number | bigint | string): string {
  return `membership:v3:${String(telegramId)}`;
}

class MembershipService {
  async checkMembership(telegramId: number): Promise<MembershipResult> {
    const cacheKey = getCacheKey(telegramId);

    const cached = await this.getCached<MembershipResult>(cacheKey);
    if (cached) return cached;

    const channels = await channelRepository.findActive();
    if (channels.length === 0) {
      const result: MembershipResult = { isMember: true, notJoined: [] };
      await this.setCache(cacheKey, result);
      return result;
    }

    const settings = await forcedMembershipSettingsService.getSettings();
    if (!settings.enabled) {
      const result: MembershipResult = { isMember: true, notJoined: [] };
      await this.setCache(cacheKey, result);
      return result;
    }

    await membershipQueue.add({ type: 'CHECK_MEMBERSHIP', telegramId, force: false }, `CHECK:${telegramId}`);

    const stale: MembershipResult = { isMember: true, notJoined: [] };
    return stale;
  }

  private async getCached<T>(key: string): Promise<T | undefined> {
    const redisVal = await redisClient.get<T>(key);
    if (redisVal) return redisVal;

    const memVal = cache.get<T>(key);
    if (memVal) return memVal;

    return undefined;
  }

  private async setCache(key: string, result: MembershipResult): Promise<void> {
    await Promise.all([
      redisClient.set(key, result, MEMBERSHIP_CACHE_TTL),
      Promise.resolve(cache.set(key, result, MEMBERSHIP_CACHE_TTL)),
    ]);
  }

  async invalidateCache(telegramId: number | bigint | string): Promise<void> {
    const key = getCacheKey(telegramId);
    await Promise.all([
      redisClient.del(key),
      Promise.resolve(cache.del(key)),
    ]);
  }

  async invalidateAllCache(): Promise<void> {
    await redisClient.invalidateByPrefix('membership:v3:');
    cache.delByPrefix('membership:v3:');
  }

  async forceVerify(telegramId: number): Promise<MembershipResult> {
    await membershipQueue.add(
      { type: 'VERIFY_MEMBERSHIP', telegramId, channelIds: [] },
      `VERIFY:${telegramId}`
    );
    return { isMember: true, notJoined: [] };
  }

  async processChatMemberUpdate(
    telegramId: number,
    chatId: string,
    newStatus: string,
    oldStatus: string
  ): Promise<void> {
    const left = ['left', 'kicked'].includes(newStatus);
    const joined = VALID_MEMBER_STATUSES.includes(newStatus);

    if (left || joined) {
      await membershipQueue.add(
        { type: 'CHAT_MEMBER_UPDATE', telegramId, chatId, newStatus, oldStatus },
        `CHAT_MEMBER:${telegramId}:${chatId}`
      );

      if (left) {
        await systemLogService.log({
          eventType: SystemEventType.FORCE_JOIN,
          level: SystemLogLevel.WARN,
          telegramId,
          message: `Chat member left: ${chatId}`,
          metadata: { chatId, newStatus, oldStatus },
        });
      }
    }
  }

  async handleManualRecheck(telegramId: number): Promise<MembershipResult> {
    await membershipQueue.add(
      { type: 'VERIFY_MEMBERSHIP', telegramId, channelIds: [] },
      `MANUAL_CHECK:${telegramId}`
    );

    const cacheKey = getCacheKey(telegramId);
    await redisClient.del(cacheKey);
    cache.del(cacheKey);

    const user = await prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) } });
    if (!user) return { isMember: false, notJoined: [] };

    const channels = await channelRepository.findActive();
    const notJoined = channels.map((ch) => ({
      title: ch.displayTitle || ch.title,
      inviteLink: ch.inviteLink || (ch.username ? `https://t.me/${ch.username}` : null),
      channelId: ch.chatId || ch.channelId,
      buttonText: ch.buttonText,
    }));

    return { isMember: false, notJoined };
  }
}

export const membershipService = new MembershipService();
