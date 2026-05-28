
// src/index.ts
// نقطه شروع پروژه

import express from 'express';
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

  // تست اتصال به دیتابیس
  await prisma.$connect();
  logger.info('✅ اتصال به دیتابیس برقرار شد');

  // ───── تست سلامت سرور ─────
  const app = express();

  app.get('/', (req, res) => {
    res.json({
      status: 'ok',
      message: 'BotPropchi API Running 🚀',
    });
  });

  app.listen(process.env.PORT || 3000, () => {
    logger.info('✅ Health server started');
  });

  // ساخت ربات
  const bot = new Telegraf(config.bot.token);

  // میانجی‌ها
  bot.use(loggingMiddleware());
  bot.use(rateLimitMiddleware(20, 60_000));
  bot.use(userMiddleware());
  bot.use(membershipMiddleware(bot));

  // هندلرها
  registerHandlers(bot);

  // مدیریت خطا
  bot.catch((err, ctx) => {
    logger.error(`خطا برای کاربر ${ctx.from?.id}:`, err);

    ctx.reply('❌ خطایی رخ داد. لطفاً دوباره تلاش کنید.')
      .catch(() => {});
  });

  // API ادمین
  startAdminApi();

  // Scheduler
  startScheduler(bot);

  // اجرای ربات
  await bot.launch();

  logger.info(
    `✅ ربات @${(await bot.telegram.getMe()).username} راه‌اندازی شد`
  );

  // خاموش شدن صحیح
  process.once('SIGINT', () => {
    bot.stop('SIGINT');
    prisma.$disconnect();
  });

  process.once('SIGTERM', () => {
    bot.stop('SIGTERM');
    prisma.$disconnect();
  });
}

bootstrap().catch((err) => {
  logger.error('خطای بحرانی هنگام راه‌اندازی:', err);
  process.exit(1);
});

