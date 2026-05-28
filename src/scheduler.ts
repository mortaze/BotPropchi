// src/scheduler.ts
// زمان‌بند خودکار

import cron from 'node-cron';
import { Telegraf } from 'telegraf';
import { prisma } from './prisma/client';
import { lotteryService } from './services/lottery.service';
import { logger } from './utils/logger';
import { config } from './config';

export function startScheduler(bot: Telegraf) {
  // هر ۵ دقیقه بررسی کند که آیا قرعه‌کشی‌ای باید بسته شود
  cron.schedule('*/5 * * * *', async () => {
    try {
      const expiredLotteries = await prisma.lottery.findMany({
        where: { isActive: true, isCompleted: false, endAt: { lte: new Date() } },
      });

      for (const lottery of expiredLotteries) {
        const winners = await lotteryService.draw(lottery.id);
        logger.info(`قرعه‌کشی "${lottery.title}" به صورت خودکار برگزار شد`);

        if (winners.length > 0) {
          const winnerNames = winners.map((w) => `@${w.username || w.firstName}`).join('، ');
          const msg =
            `🎉 *نتیجه قرعه‌کشی ${lottery.title}*\n\n` +
            `🏆 برنده‌ها: ${winnerNames}\n` +
            `🎁 جایزه: ${lottery.prize}`;

          // اطلاع‌رسانی به ادمین
          await bot.telegram.sendMessage(Number(config.bot.adminTelegramId), msg, {
            parse_mode: 'Markdown',
          });
        }
      }
    } catch (err) {
      logger.error('خطا در scheduler قرعه‌کشی:', err);
    }
  });

  logger.info('✅ زمان‌بند خودکار راه‌اندازی شد');
}
