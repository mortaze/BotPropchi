import { prisma } from '../../prisma/client';
import { redisClient } from '../../utils/redis';
import { cache } from '../../utils/cache';
import { logger } from '../../utils/logger';
import { channelRepository } from '../../repositories/channel.repository';
import { userService } from '../user.service';
import { systemLogService } from '../system-log.service';
import { membershipQueue } from '../../queue/membership.queue';
import { SystemEventType, SystemLogLevel } from '@prisma/client';

const CACHE_TTL = 45;
const VALID_MEMBER_STATUSES = ['member', 'administrator', 'creator'];

export type MembershipState = 'UNKNOWN' | 'CHECKING' | 'JOINED' | 'LEFT' | 'BLOCKED' | 'REJOINED';

export interface MembershipResult {
  isMember: boolean;
  notJoined: Array<{
    title: string;
    inviteLink: string | null;
    channelId: string;
    buttonText?: string | null;
  }>;
}

export interface MembershipStateResult extends MembershipResult {
  state: MembershipState;
}

function getCacheKey(telegramId: number | bigint | string): string {
  return `membership:${String(telegramId)}`;
}

function getWarnKey(telegramId: number): string {
  return `membership:warned:${telegramId}`;
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

    await membershipQueue.add(
      { type: 'CHECK_MEMBERSHIP', telegramId, force: false },
      `CHECK:${telegramId}`
    );

    return { isMember: false, notJoined: [] };
  }

  async forceCheck(telegramId: number): Promise<MembershipResult> {
    const cacheKey = getCacheKey(telegramId);
    await this.delCache(cacheKey);

    await membershipQueue.add(
      { type: 'VERIFY_MEMBERSHIP', telegramId, channelIds: [] },
      `FORCE_CHECK:${telegramId}:${Date.now()}`
    );

    const channels = await channelRepository.findActive();
    const notJoined = channels.map((ch) => ({
      title: ch.displayTitle || ch.title,
      inviteLink: ch.inviteLink || (ch.username ? `https://t.me/${ch.username}` : null),
      channelId: ch.chatId || ch.channelId,
      buttonText: ch.buttonText,
    }));

    return { isMember: false, notJoined };
  }

  async handleChatMemberUpdate(
    telegramId: number,
    chatId: string,
    newStatus: string,
    oldStatus: string
  ): Promise<void> {
    await membershipQueue.add(
      {
        type: 'CHAT_MEMBER_UPDATE',
        telegramId,
        chatId,
        newStatus,
        oldStatus,
      },
      `CHAT_MEMBER:${telegramId}:${chatId}`
    );
  }

  async setMember(telegramId: number, isMember: boolean, notJoined: MembershipResult['notJoined'] = []): Promise<void> {
    const cacheKey = getCacheKey(telegramId);
    const result: MembershipResult = { isMember, notJoined };
    await this.setCache(cacheKey, result);

    if (isMember) {
      await userService.markMembershipVerified(BigInt(telegramId)).catch(() => {});
      await userService.processPendingReferral(BigInt(telegramId)).catch(() => {});
    }
  }

  async invalidate(telegramId: number | bigint | string): Promise<void> {
    const key = getCacheKey(telegramId);
    await this.delCache(key);
  }

  async invalidateAll(): Promise<void> {
    await redisClient.invalidateByPrefix('membership:');
    cache.delByPrefix('membership:');
  }

  async clearWarnCooldown(telegramId: number): Promise<void> {
    const key = getWarnKey(telegramId);
    await Promise.all([
      redisClient.del(key),
      Promise.resolve(cache.del(key)),
    ]);
  }

  private async getCached<T>(key: string): Promise<T | undefined> {
    const redisVal = await redisClient.get<T>(key);
    if (redisVal !== undefined) return redisVal;
    const memVal = cache.get<T>(key);
    if (memVal !== undefined) return memVal;
    return undefined;
  }

  private async setCache(key: string, result: MembershipResult): Promise<void> {
    await Promise.all([
      redisClient.set(key, result, CACHE_TTL),
      Promise.resolve(cache.set(key, result, CACHE_TTL)),
    ]);
  }

  private async delCache(key: string): Promise<void> {
    await Promise.all([
      redisClient.del(key),
      Promise.resolve(cache.del(key)),
    ]);
  }
}

export const membershipService = new MembershipService();
