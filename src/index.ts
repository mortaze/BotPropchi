// src/index.ts
// نقطه شروع پروژه

import { Telegraf } from 'telegraf';
import { config } from './config';
import { logger } from './utils/logger';
import { prisma } from './prisma/client';

import {
  userMiddleware,
  membershipMiddleware,
  rateLimitMiddleware,
  loggingMiddleware,
} from './bot/middlewares';

import { registerHandlers } from './bot/handlers';
import { startAdminApi } from './api/server';
import { startScheduler } from './scheduler';

async function bootstrap() {
  logger.info('🚀 در حال راه‌اندازی ربات...');

  // اتصال دیتابیس
  await prisma.$connect();

  logger.info('✅ اتصال به دیتابیس برقرار شد');

  // ساخت ربات
  const bot = new Telegraf(config.bot.token);

  // Middleware ها
  bot.use(loggingMiddleware());
  bot.use(rateLimitMiddleware(20, 60_000));
  bot.use(userMiddleware());
  bot.use(membershipMiddleware(bot));

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
  startAdminApi();

  // اجرای Scheduler
  startScheduler();

  // اجرای ربات
  await bot.launch();

  const me = await bot.telegram.getMe();

  logger.info(
    `✅ ربات @${me.username} راه‌اندازی شد`
  );

  // خاموش شدن صحیح
  process.once('SIGINT', async () => {
    bot.stop('SIGINT');
    await prisma.$disconnect();
  });

  process.once('SIGTERM', async () => {
    bot.stop('SIGTERM');
    await prisma.$disconnect();
  });
}

bootstrap().catch((err) => {
  logger.error(
    '❌ خطای بحرانی هنگام راه‌اندازی:',
    err
  );

  process.exit(1);
});

