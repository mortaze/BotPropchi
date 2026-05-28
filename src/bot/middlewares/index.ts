// src/bot/middlewares/index.ts
// میانجی‌های ربات

import { Context, Telegraf } from 'telegraf';
import { userService } from '../../services/user.service';
import { channelService } from '../../services/channel.service';
import { joinChannelsKeyboard } from '../keyboards';
import { logger } from '../../utils/logger';
import { cache } from '../../utils/cache';

// ─── ثبت / به‌روزرسانی کاربر ──────────────────────────────
export function userMiddleware() {
  return async (ctx: Context, next: () => Promise<void>) => {
    if (!ctx.from) return next();

    try {
      const startPayload = (ctx as any).startPayload as string | undefined;
      const referralCode = startPayload?.startsWith('ref_')
        ? startPayload.replace('ref_', '')
        : undefined;

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

    // دستور /start و callback بررسی عضویت رو رد کن
    const text = (ctx.message as any)?.text as string | undefined;
    const callbackData = (ctx.callbackQuery as any)?.data as string | undefined;
    if (text?.startsWith('/start') || callbackData === 'check:membership') {
      return next();
    }

    const cacheKey = `membership:${ctx.from.id}`;
    const isMemberCached = cache.get<boolean>(cacheKey);
    if (isMemberCached) return next();

    const { isMember, notJoined } = await channelService.checkMembership(
      bot,
      BigInt(ctx.from.id)
    );

    if (isMember) {
      cache.set(cacheKey, true, 300); // 5 دقیقه کش
      return next();
    }

    await ctx.reply(
      '⚠️ برای استفاده از ربات، ابتدا در کانال‌های زیر عضو شوید:',
      joinChannelsKeyboard(notJoined)
    );
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
