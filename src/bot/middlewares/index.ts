// src/bot/middlewares/index.ts
// میانجی‌های ربات

import { Context, Telegraf } from 'telegraf';
import { BotAdminStatus } from '@prisma/client';
import { userService } from '../../services/user.service';
import { attributionService } from '../../services/attribution.service';
import { userEventService } from '../../services/user-event.service';
import { logger } from '../../utils/logger';
import { groupService } from '../../services/group.service';
import { settingsService } from '../../services/settings.service';
import { BOT_TEXT_FEATURES, featureForCallback } from '../service-toggle';
import { prisma } from '../../prisma/client';

// ─── ثبت / به‌روزرسانی کاربر ──────────────────────────────
export function userMiddleware() {
  return async (ctx: Context, next: () => Promise<void>) => {
    if (!ctx.from) return next();

    // Pre-start blocking — only allow /start to create new users
    const text = (ctx.message as any)?.text as string | undefined;
    const isStart = text === '/start' || text?.startsWith('/start ');
    const updateType = (ctx as any).updateType || 'unknown';

    // Check if user already exists
    const existingUser = await import('../../repositories/user.repository')
      .then(m => m.userRepository.findByTelegramId(BigInt(ctx.from.id)))
      .catch(() => null);

    // If user doesn't exist and this is NOT a /start command, block creation
    if (!existingUser && !isStart) {
      logger.info(`[PreStart] IGNORED_PRE_START_USER telegramId=${ctx.from.id} username=${ctx.from.username} updateType=${updateType}`);
      return next();
    }

    try {
      const startPayload = (ctx as any).startPayload as string | undefined;
      const referralCode =
        startPayload?.trim() ||
        (text?.startsWith('/start') ? text.split(/\s+/).slice(1).join(' ').trim() : '') ||
        undefined;

      const user = await userService.registerOrUpdate({
        telegramId: BigInt(ctx.from.id),
        username: ctx.from.username,
        firstName: ctx.from.first_name,
        lastName: ctx.from.last_name,
        languageCode: (ctx.from as any).language_code,
        referralCode,
        startPayload: startPayload?.trim() || undefined,
        isStart,
      });

      // Track activity
      if (user?.id) {
        const activityType = (ctx as any).updateType === 'callback_query' ? 'callback' : 'message';
        attributionService.recordActivity(user.id, activityType).catch((err: unknown) => {
          logger.error('[Attribution] recordActivity failed:', err);
        });

        // PHASE: Track all events
        trackEvent(ctx, user.id, BigInt(ctx.from.id)).catch((err: unknown) => {
          logger.error('[EventTracking] trackEvent failed:', err);
        });

        // PHASE: Track messages
        trackMessage(ctx, user.id, BigInt(ctx.from.id)).catch((err: unknown) => {
          logger.error('[EventTracking] trackMessage failed:', err);
        });
      }
    } catch (err) {
      logger.error('خطا در userMiddleware:', err);
    }

    return next();
  };
}

// ─── Event Tracking ────────────────────────────────────────
async function trackEvent(ctx: Context, userId: number, telegramId: bigint) {
  const updateType = (ctx as any).updateType || 'unknown';

  if (updateType === 'callback_query') {
    const data = (ctx.callbackQuery as any)?.data || '';
    await userEventService.recordEvent({
      userId,
      telegramId,
      eventType: 'BUTTON_CLICK',
      eventData: { callbackData: data, messageId: (ctx.callbackQuery as any)?.message?.message_id },
    });
  } else if (updateType === 'message') {
    const msg = ctx.message as any;
    if (msg?.text) {
      const text = msg.text;
      if (text === '/start' || text.startsWith('/start ')) {
        await userEventService.recordEvent({
          userId,
          telegramId,
          eventType: 'BOT_START',
          eventData: { text, payload: text.split(' ').slice(1).join(' ') || null },
        });
      } else {
        await userEventService.recordEvent({
          userId,
          telegramId,
          eventType: 'MESSAGE_SENT',
          eventData: { text: text.slice(0, 200) },
        });
      }
    }
  }
}

// ─── Message Tracking ──────────────────────────────────────
async function trackMessage(ctx: Context, userId: number, telegramId: bigint) {
  const msg = ctx.message as any;
  if (!msg) return;

  let messageType = 'text';
  let text: string | undefined;

  if (msg.text) {
    messageType = 'text';
    text = msg.text;
  } else if (msg.photo) {
    messageType = 'photo';
    text = msg.caption;
  } else if (msg.video) {
    messageType = 'video';
    text = msg.caption;
  } else if (msg.voice || msg.audio) {
    messageType = 'voice';
  } else if (msg.document) {
    messageType = 'document';
  } else if (msg.contact) {
    messageType = 'contact';
    text = `${msg.contact.first_name} ${msg.contact.phone_number}`;
  } else if (msg.location) {
    messageType = 'location';
    text = `${msg.location.latitude},${msg.location.longitude}`;
  }

  await userEventService.recordMessage({
    userId,
    telegramId,
    messageId: msg.message_id,
    messageType,
    text,
    rawUpdate: { date: msg.date, chat_id: msg.chat?.id },
  });
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
const adminIds = new Set<number>();

async function refreshAdminIds() {
  try {
    const admins = await prisma.botAdmin.findMany({
      where: { status: BotAdminStatus.ACTIVE },
      select: { telegramId: true },
    });
    adminIds.clear();
    for (const a of admins) adminIds.add(Number(a.telegramId));
  } catch {}
}

refreshAdminIds();
setInterval(refreshAdminIds, 5 * 60 * 1000);

export function rateLimitMiddleware(maxRequests = 20, windowMs = 60_000) {
  return async (ctx: Context, next: () => Promise<void>) => {
    if (!ctx.from) return next();
    const userId = ctx.from.id;

    if (adminIds.has(userId)) return next();

    const now = Date.now();
    const record = userRequestCounts.get(userId);

    if (!record || now > record.resetAt) {
      userRequestCounts.set(userId, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (record.count >= maxRequests) {
      if (ctx.callbackQuery) {
        await ctx.answerCbQuery('⏳ درخواست‌های زیادی ارسال کردید. لطفاً کمی صبر کنید.', { show_alert: true }).catch(() => {});
      } else {
        await ctx.reply('⏳ درخواست‌های زیادی ارسال کردید. لطفاً کمی صبر کنید.');
      }
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
