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

  // تست اتصال به دیتابیس
  await prisma.$connect();
  logger.info('✅ اتصال به دیتابیس برقرار شد');

  // ساخت ربات
  const bot = new Telegraf(config.bot.token);

  // میانجی‌ها (ترتیب مهم است)
  bot.use(loggingMiddleware());
  bot.use(rateLimitMiddleware(20, 60_000));
  bot.use(userMiddleware());
  bot.use(membershipMiddleware(bot));

  // هندلرها
  registerHandlers(bot);

  // مدیریت خطاهای کلی
  bot.catch((err, ctx) => {
    logger.error(`خطا برای کاربر ${ctx.from?.id}:`, err);
    ctx.reply('❌ خطایی رخ داد. لطفاً دوباره تلاش کنید.').catch(() => {});
  });

  // راه‌اندازی API ادمین
  startAdminApi();

  // زمان‌بند خودکار (برگزاری قرعه‌کشی)
  startScheduler(bot);

  // شروع ربات
  await bot.launch();
  logger.info(`✅ ربات @${(await bot.telegram.getMe()).username} راه‌اندازی شد`);

  // خاموش کردن صحیح
  process.once('SIGINT', () => { bot.stop('SIGINT'); prisma.$disconnect(); });
  process.once('SIGTERM', () => { bot.stop('SIGTERM'); prisma.$disconnect(); });
}

bootstrap().catch((err) => {
  logger.error('خطای بحرانی هنگام راه‌اندازی:', err);
  process.exit(1);
});
