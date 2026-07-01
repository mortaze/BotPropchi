// src/index.ts
// نقطه شروع پروژه

import { Telegraf } from 'telegraf';
import { config } from './config';
import { logger } from './utils/logger';

import {
  userMiddleware,
  featureToggleMiddleware,
  groupAccessMiddleware,
  rateLimitMiddleware,
  loggingMiddleware,
} from './bot/middlewares';

import { registerHandlers } from './bot/handlers';
import { startAdminApi } from './api/server';
import { startScheduler } from './scheduler';
import { botAdminService } from './services/bot-admin.service';
import { settingsService } from './services/settings.service';
import { membershipGuard } from './middleware/membership.guard';
import { membershipService } from './services/membership/membership.service';
import { requiredChannelsService } from './services/requiredChannels.service';
import { registerChatMemberHandlers } from './bot/webhooks/chatMember.handler';
import { startMembershipWorker } from './workers/membership.worker';
import { startLeaderboardWorker } from './workers/leaderboard.worker';
import { postService } from './services/post.service';

async function bootstrap() {
  logger.info('🚀 در حال راه‌اندازی ربات...');

  if (!config.wordpress.apiUrl) {
    logger.warn('⚠️ WORDPRESS_API_URL تنظیم نشده است؛ پاسخ‌های AI از وردپرس دریافت نخواهند شد.');
  }

  await botAdminService.ensureOwner();

  // Migrate old menu_layout_saved key to new menu_layout key
  await settingsService.migrateMenuLayoutKey().catch(err => logger.error('[Startup] Menu layout migration failed:', err));

  // ساخت ربات
  const bot = new Telegraf(config.bot.token);

  // ─── Global callback debug logger (BEFORE all middleware) ────
  // This MUST be the very first handler to confirm callbacks arrive.
  const callbackTraceLog = new Map<number, number>();
  bot.on('callback_query', (ctx, next) => {
    const cq = ctx.callbackQuery;
    const data = 'data' in cq ? cq.data : 'N/A';
    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;
    const messageId = 'message' in cq && cq.message ? (cq.message as any).message_id : 'N/A';
    const username = ctx.from?.username || ctx.from?.first_name || 'unknown';
    const ts = Date.now();
    callbackTraceLog.set(userId || 0, ts);
    logger.info(`[CALLBACK_TRACE] ▶ START user=${userId}(@${username}) chat=${chatId} msg=${messageId} data="${data}" ts=${ts}`);
    return (next as any)().then(() => {
      const elapsed = Date.now() - ts;
      logger.info(`[CALLBACK_TRACE] ▶ END   user=${userId} data="${data}" elapsed=${elapsed}ms`);
    }).catch((err) => {
      const elapsed = Date.now() - ts;
      logger.error(`[CALLBACK_TRACE] ▶ ERROR user=${userId} data="${data}" elapsed=${elapsed}ms error=${err.message}`);
      throw err;
    });
  });

  // تنظیم نمونه ربات برای سرویس‌ها
  membershipService.setBot(bot);

  // فعال‌سازی کش خودکار با رویدادها
  postService.setupCacheListeners();
  settingsService.setupEventListeners();

  // آغاز Membership Worker (برای پردازش‌های سنگین)
  startMembershipWorker(bot);

  // آغاز Leaderboard Worker (برای بازسازی کش لیدربورد)
  startLeaderboardWorker();

  // اطمینان از وجود فصل فعال
  const { leaderboardService } = await import('./services/leaderboard.service');
  await leaderboardService.getOrCreateActiveSeason().catch((err) =>
    logger.error('[Startup] Failed to ensure active season:', err)
  );

  // بارگذاری کانال‌های مورد نیاز
  await requiredChannelsService.initialize(bot);

  // Middleware ها (به ترتیب: لاگ → نرخ → کاربر → عضویت → ویژگی → گروه)
  bot.use(loggingMiddleware());
  bot.use(rateLimitMiddleware(20, 60_000));
  bot.use(userMiddleware());

  // chat_member handler باید قبل از membershipGuard ثبت شود
  registerChatMemberHandlers(bot);

  bot.use(membershipGuard(bot));
  bot.use(featureToggleMiddleware());
  bot.use(groupAccessMiddleware(bot));

  // ثبت هندلرها
  registerHandlers(bot);

  // مدیریت خطا — CRITICAL: must answerCbQuery for callback_query errors
  bot.catch((err, ctx) => {
    const userId = ctx.from?.id;
    const updateType = (ctx as any).updateType;
    const cbData = ctx.callbackQuery && 'data' in ctx.callbackQuery ? (ctx.callbackQuery as any).data : 'N/A';
    console.log(`[BOT_ERROR] user=${userId} updateType=${updateType} callback_data="${cbData}" error="${(err as any).message}"`);
    logger.error(`[BOT_CATCH] Error for user=${userId} updateType=${updateType}:`, err);

    if (ctx.callbackQuery) {
      ctx.answerCbQuery('❌ خطایی رخ داد. لطفاً دوباره تلاش کنید.', { show_alert: true })
        .catch(() => {
          logger.error(`[BOT_CATCH] Failed to answerCbQuery for user=${userId}`);
        });
    } else {
      ctx.reply('❌ خطایی رخ داد. لطفاً دوباره تلاش کنید.').catch(() => {});
    }
  });

  // ─── Catch-all: unmatched callback_data ────────────────────
  // If a callback reaches here, no bot.action() matched its data.
  // Answer it so the user doesn't see a stuck loading indicator.
  bot.on('callback_query', (ctx) => {
    const cq = ctx.callbackQuery;
    const data = 'data' in cq ? cq.data : 'N/A';
    const userId = ctx.from?.id;
    console.log(`[UNMATCHED_CALLBACK] user=${userId} data="${data}" — NO HANDLER MATCHED THIS CALLBACK`);
    logger.warn(`[UNMATCHED_CALLBACK] user=${userId} data="${data}" — no handler matched`);
    ctx.answerCbQuery('⚠️ این دکمه در دسترس نیست.', { show_alert: true }).catch(() => {});
  });

  // اجرای API
  startAdminApi(bot);

  // اجرای Scheduler
  startScheduler();

  // اجرای ربات با دریافت تمام آپدیت‌های مورد نیاز
  try {
    await bot.stop('replacing previous instance');
    logger.info('[Startup] Previous bot instance stopped');
  } catch (_) {}

  await bot.launch({
    allowedUpdates: ['message', 'edited_message', 'callback_query', 'chat_member', 'my_chat_member'],
  });

  const me = await bot.telegram.getMe();

  logger.info(
    `✅ ربات @${me.username} راه‌اندازی شد`
  );

  // خاموش شدن صحیح
  process.once('SIGINT', async () => {
    bot.stop('SIGINT');
  });

  process.once('SIGTERM', async () => {
    bot.stop('SIGTERM');
  });
}

bootstrap().catch((err) => {
  logger.error(
    '❌ خطای بحرانی هنگام راه‌اندازی:',
    err
  );

  process.exit(1);
});
