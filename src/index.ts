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

  // تنظیم نمونه ربات برای سرویس‌ها
  membershipService.setBot(bot);

  // آغاز Membership Worker (برای پردازش‌های سنگین)
  startMembershipWorker(bot);

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

  // مدیریت خطا
  bot.catch((err, ctx) => {
    logger.error(`خطا برای کاربر ${ctx.from?.id}:`, err);

    ctx.reply(
      '❌ خطایی رخ داد. لطفاً دوباره تلاش کنید.'
    ).catch(() => {});
  });

  // اجرای API
  startAdminApi(bot);

  // اجرای Scheduler
  startScheduler();

  // اجرای ربات با دریافت تمام آپدیت‌های مورد نیاز
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
