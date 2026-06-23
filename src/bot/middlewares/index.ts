// src/bot/middlewares/index.ts
// میانجی‌های ربات

import { Context, Telegraf } from 'telegraf';
import { userService } from '../../services/user.service';
import { logger } from '../../utils/logger';
import { groupService } from '../../services/group.service';
import { settingsService } from '../../services/settings.service';
import { BOT_TEXT_FEATURES, featureForCallback } from '../service-toggle';

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
        startPayload: startPayload?.trim() || undefined,
      });
    } catch (err) {
      logger.error('خطا در userMiddleware:', err);
    }

    return next();
  };
}



// ─── بررسی فعال بودن سرویس قبل از اجرای هندلرها ─────────────
export function featureToggleMiddleware() {
  return async (ctx: Context, next: () => Promise<void>) => {
    const text = (ctx.message as any)?.text as string | undefined;
    const callbackData = (ctx.callbackQuery as any)?.data as string | undefined;
    const featureKey = callbackData ? featureForCallback(callbackData) : text ? BOT_TEXT_FEATURES[text] : null;

    if (featureKey && !(await settingsService.isFeatureEnabled(featureKey))) {
      const message = '⛔ این سرویس در حال حاضر غیرفعال است.';
      if (callbackData) await ctx.answerCbQuery(message, { show_alert: true }).catch(() => undefined);
      else await ctx.reply(message);
      return;
    }

    return next();
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
