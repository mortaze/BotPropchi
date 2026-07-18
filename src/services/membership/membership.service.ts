import { Telegraf } from 'telegraf';
import { redisClient } from '../../utils/redis';
import { cache } from '../../utils/cache';
import { logger } from '../../utils/logger';
import { config } from '../../config';
import { requiredChannelsService, type RequiredChannelInfo } from '../requiredChannels.service';

const VALID_MEMBER_STATUSES = new Set(['member', 'administrator', 'creator']);
const CHANNEL_TITLE_CACHE_TTL = 3600;

function getPerChannelCacheKey(telegramId: number, channelId: string): string {
  return `member:${telegramId}:${channelId}`;
}

function getChannelTitleCacheKey(channelId: string): string {
  return `channel:title:${channelId}`;
}

interface ChannelCheckResult {
  channelId: string;
  title: string;
  displayTitle: string | null;
  inviteLink: string | null;
  isMember: boolean;
}

class MembershipService {
  private bot: Telegraf | null = null;

  setBot(bot: Telegraf): void {
    this.bot = bot;
  }

  async checkMembershipConcurrent(
    telegramId: number,
    channels?: RequiredChannelInfo[]
  ): Promise<{ isMember: boolean; notJoined: ChannelCheckResult[] }> {
    const chs = channels ?? requiredChannelsService.getChannels();
    if (chs.length === 0) return { isMember: true, notJoined: [] };

    const results = await Promise.allSettled(
      chs.map((ch) => this.checkSingleChannel(telegramId, ch))
    );

    const notJoined: ChannelCheckResult[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') {
        if (!r.value.isMember) notJoined.push(r.value);
      }
    }

    return { isMember: notJoined.length === 0, notJoined };
  }

  async getChannelTitle(channelId: string): Promise<string> {
    const cacheKey = getChannelTitleCacheKey(channelId);
    const cached = await this.getCached<string>(cacheKey);
    if (cached) return cached;

    if (!this.bot) return `کانال ${channelId}`;

    try {
      const chat = await this.bot.telegram.getChat(channelId as any);
      const title = (chat as any).title || String(channelId);
      await this.setCache(cacheKey, title, CHANNEL_TITLE_CACHE_TTL);
      return title;
    } catch {
      return `کانال ${channelId}`;
    }
  }

  async invalidateChannelTitle(channelId: string): Promise<void> {
    const key = getChannelTitleCacheKey(channelId);
    await Promise.all([
      redisClient.del(key),
      Promise.resolve(cache.del(key)),
    ]);
  }

  async invalidateAllChannelTitles(): Promise<void> {
    await Promise.all([
      redisClient.invalidateByPrefix('channel:title:'),
      Promise.resolve(cache.delByPrefix('channel:title:')),
    ]);
  }

  private async checkSingleChannel(
    telegramId: number,
    channel: RequiredChannelInfo
  ): Promise<ChannelCheckResult> {
    const cacheKey = getPerChannelCacheKey(telegramId, channel.chatId);

    const cached = await this.getCached<boolean>(cacheKey);
    if (cached !== undefined) {
      return { channelId: channel.chatId, title: channel.title, displayTitle: channel.displayTitle, inviteLink: channel.inviteLink, isMember: cached };
    }

    if (!this.bot) {
      return { channelId: channel.chatId, title: channel.title, displayTitle: channel.displayTitle, inviteLink: channel.inviteLink, isMember: false };
    }

    try {
      const member = await this.bot.telegram.getChatMember(channel.chatId as any, telegramId);
      const isMember = VALID_MEMBER_STATUSES.has(member.status);
      await this.setCache(cacheKey, isMember);
      return { channelId: channel.chatId, title: channel.title, displayTitle: channel.displayTitle, inviteLink: channel.inviteLink, isMember };
    } catch (err) {
      const desc = (err as any)?.response?.description || (err as Error).message || 'Unknown error';
      logger.warn(`[Membership] getChatMember failed user=${telegramId} channel=${channel.chatId}: ${desc}`);
      return { channelId: channel.chatId, title: channel.title, displayTitle: channel.displayTitle, inviteLink: channel.inviteLink, isMember: true };
    }
  }

  async invalidateChannel(telegramId: number, channelId: string): Promise<void> {
    const key = getPerChannelCacheKey(telegramId, channelId);
    await Promise.all([
      redisClient.del(key),
      Promise.resolve(cache.del(key)),
    ]);
  }

  async setChannelCached(telegramId: number, channelId: string, isMember: boolean): Promise<void> {
    const key = getPerChannelCacheKey(telegramId, channelId);
    await this.setCache(key, isMember);
  }

  async invalidateAll(telegramId?: number): Promise<void> {
    if (telegramId) {
      const chs = requiredChannelsService.getChannels();
      await Promise.all(
        chs.map((ch) => this.invalidateChannel(telegramId, ch.chatId))
      );
    } else {
      await Promise.all([
        redisClient.invalidateByPrefix('member:'),
        Promise.resolve(cache.delByPrefix('member:')),
      ]);
    }
  }

  private async getCached<T>(key: string): Promise<T | undefined> {
    const redisVal = await redisClient.get<T>(key);
    if (redisVal !== undefined) return redisVal;
    const memVal = cache.get<T>(key);
    if (memVal !== undefined) return memVal;
    return undefined;
  }

  private async setCache<T>(key: string, value: T, ttl?: number): Promise<void> {
    const t = ttl ?? config.membership.cacheTtl;
    await Promise.all([
      redisClient.set(key, value, t),
      Promise.resolve(cache.set(key, value, t)),
    ]);
  }
}

export const membershipService = new MembershipService();
