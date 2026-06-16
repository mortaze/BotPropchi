import { Context, Telegraf } from 'telegraf';
import { logger } from '../utils/logger';
import { membershipService } from '../services/membership/membership.service';
import { userService } from '../services/user.service';
import { systemLogService } from '../services/system-log.service';
import { forcedMembershipSettingsService } from '../services/membership/forcedMembership.service';
import { SystemEventType } from '@prisma/client';
import { joinChannelsKeyboard } from '../bot/keyboards';

export function membershipGuard(bot: Telegraf) {
  return async (ctx: Context, next: () => Promise<void>) => {
    if (!ctx.from) return next();
    if (ctx.chat && ctx.chat.type !== 'private') return next();

    const callbackData = (ctx.callbackQuery as any)?.data as string | undefined;
    if (callbackData === 'check:membership') return next();

    const telegramId = ctx.from.id;

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
        metadata: { notJoinedCount: result.notJoined.length },
      });

      const settings = await forcedMembershipSettingsService.getSettings();
      await ctx.reply(settings.warningMessage, joinChannelsKeyboard(result.notJoined));
    } catch (err) {
      logger.error(`[MembershipGuard] Error for user ${telegramId}:`, err);
      return next();
    }
  };
}
