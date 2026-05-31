// src/bot/middlewares/index.ts
// میانجی‌های ربات

import { Context, Telegraf } from 'telegraf';
import { userService } from '../../services/user.service';
import { channelService } from '../../services/channel.service';
import { joinChannelsKeyboard } from '../keyboards';
import { logger } from '../../utils/logger';
import { groupService } from '../../services/group.service';
import { botAdminService } from '../../services/bot-admin.service';
import { systemLogService } from '../../services/system-log.service';
import { SystemEventType } from '@prisma/client';

// ─── ثبت / به‌روزرسانی کاربر ──────────────────────────────
export function userMiddleware() {
  return async (ctx: Context, next: () => Promise<void>) => {
    if (!ctx.from) return next();

    try {
      const text = (ctx.message as any)?.text as string | undefined;
      const startPayload = (ctx as any).startPayload as string | undefined;
      const referralCode =
        startPayload?.trim() ||
        (text?.startsWith('/start') ? text.split(/\s+/).slice(1).join(' ').trim() : '') ||
        undefined;

      await userService.registerOrUpdate({
        telegramId: BigInt(ctx.from.id),
        username: ctx.from.username,
        firstName: ctx.from.first_name,
        lastName: ctx.from.last_name,
        referralCode,
      });
    } catch (err) {
      logger.error('خطا در userMiddleware:', err);
    }

    return next();
  };
}

// ─── بررسی عضویت اجباری ───────────────────────────────────
export function membershipMiddleware(bot: Telegraf) {
  return async (ctx: Context, next: () => Promise<void>) => {
    if (!ctx.from) return next();
    if (ctx.chat && ctx.chat.type !== 'private') return next();

    const activeAdmin = await botAdminService.getActive(ctx.from.id).catch(() => null);
    if (activeAdmin) return next();

    const callbackData = (ctx.callbackQuery as any)?.data as string | undefined;
    if (callbackData === 'check:membership') {
      return next();
    }

    const { isMember, notJoined } = await channelService.checkMembership(bot, BigInt(ctx.from.id));

    if (isMember) {
      await userService.markMembershipVerified(BigInt(ctx.from.id)).catch((err) => logger.error('خطا در ذخیره تأیید عضویت:', err));
      await userService.processPendingReferral(BigInt(ctx.from.id)).catch((err) => logger.error('خطا در ثبت رفرال پس از تأیید عضویت:', err));
      return next();
    }

    await userService.markMembershipUnverified(BigInt(ctx.from.id), 'required_channel_missing').catch((err) => logger.error('خطا در ثبت خروج از کانال:', err));
    await systemLogService.log({ eventType: SystemEventType.FORCE_JOIN, telegramId: ctx.from.id, message: 'Force join blocked user', metadata: { notJoined } as any });
    await ctx.reply(
      'شما از کانال اجباری خارج شده‌اید.\nبرای ادامه استفاده از ربات مجدداً عضو شوید.',
      joinChannelsKeyboard(notJoined)
    );
  };
}


// ─── محدودیت فعالیت گروهی ─────────────────────────────────
export function groupAccessMiddleware(bot: Telegraf) {
  return async (ctx: Context, next: () => Promise<void>) => {
    if (!ctx.chat || ctx.chat.type === 'private') return next();
    if ((ctx as any).updateType === 'my_chat_member' || (ctx.message as any)?.new_chat_members) return next();
    if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') return next();

    const result = await groupService.canOperateInGroup(bot, {
      id: ctx.chat.id,
      title: (ctx.chat as any).title,
      username: (ctx.chat as any).username,
    });

    if (!result.allowed) return;
    (ctx.state as any).telegramGroup = result.group;
    return next();
  };
}

// ─── Rate Limiting ────────────────────────────────────────
const userRequestCounts = new Map<number, { count: number; resetAt: number }>();

export function rateLimitMiddleware(maxRequests = 20, windowMs = 60_000) {
  return async (ctx: Context, next: () => Promise<void>) => {
    if (!ctx.from) return next();
    const userId = ctx.from.id;
    const now = Date.now();
    const record = userRequestCounts.get(userId);

    if (!record || now > record.resetAt) {
      userRequestCounts.set(userId, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (record.count >= maxRequests) {
      await ctx.reply('⏳ درخواست‌های زیادی ارسال کردید. لطفاً کمی صبر کنید.');
      return;
    }

    record.count++;
    return next();
  };
}

// ─── لاگ تمام پیام‌ها ─────────────────────────────────────
export function loggingMiddleware() {
  return async (ctx: Context, next: () => Promise<void>) => {
    const start = Date.now();
    const userId = ctx.from?.id;
    const text = (ctx.message as any)?.text || (ctx.callbackQuery as any)?.data || '';
    await next();
    logger.debug(`[${userId}] "${text}" — ${Date.now() - start}ms`);
  };
}
