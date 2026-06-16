import { Context, Telegraf } from 'telegraf';
import { logger } from '../utils/logger';
import { membershipService } from '../services/membership/membership.service';
import { userService } from '../services/user.service';
import { systemLogService } from '../services/system-log.service';
import { forcedMembershipSettingsService } from '../services/membership/forcedMembership.service';
import { redisClient } from '../utils/redis';
import { cache } from '../utils/cache';
import { SystemEventType } from '@prisma/client';
import { joinChannelsKeyboard } from '../bot/keyboards';

const WARN_COOLDOWN_SECONDS = 60;

function getWarnCacheKey(telegramId: number): string {
  return `membership:warned:${telegramId}`;
}

async function hasRecentWarning(telegramId: number): Promise<boolean> {
  const key = getWarnCacheKey(telegramId);
  const redisVal = await redisClient.get(key);
  if (redisVal) return true;
  return cache.get(key) === true;
}

async function markWarningSent(telegramId: number): Promise<void> {
  const key = getWarnCacheKey(telegramId);
  await Promise.all([
    redisClient.set(key, true, WARN_COOLDOWN_SECONDS),
    Promise.resolve(cache.set(key, true, WARN_COOLDOWN_SECONDS)),
  ]);
}

export function membershipGuard(bot: Telegraf) {
  return async (ctx: Context, next: () => Promise<void>) => {
    if (!ctx.from) return next();
    if (ctx.chat && ctx.chat.type !== 'private') return next();

    const callbackData = (ctx.callbackQuery as any)?.data as string | undefined;
    if (callbackData === 'check:membership') return next();

    const telegramId = ctx.from.id;
    const isCallback = !!ctx.callbackQuery;

    try {
      const isEnabled = await forcedMembershipSettingsService.isEnabled();
      if (!isEnabled) return next();

      const result = await membershipService.checkMembership(telegramId);

      if (result.isMember) {
        await userService.markMembershipVerified(BigInt(telegramId)).catch(() => {});
        await userService.processPendingReferral(BigInt(telegramId)).catch(() => {});
        return next();
      }

      await userService.markMembershipUnverified(BigInt(telegramId), 'guard_blocked').catch(() => {});

      await systemLogService.log({
        eventType: SystemEventType.FORCE_JOIN,
        telegramId,
        message: 'Membership guard blocked user',
        metadata: { notJoinedCount: result.notJoined.length, isCallback },
      });

      const settings = await forcedMembershipSettingsService.getSettings();

      if (isCallback) {
        await ctx.answerCbQuery(settings.notJoinedMessage, { show_alert: true }).catch(() => {});
        return;
      }

      const warned = await hasRecentWarning(telegramId);
      if (warned) return;

      await markWarningSent(telegramId);

      await ctx.reply(settings.notJoinedMessage, joinChannelsKeyboard(result.notJoined));
    } catch (err) {
      logger.error(`[MembershipGuard] Error for user ${telegramId}:`, err);
      return next();
    }
  };
}
