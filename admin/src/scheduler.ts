// src/scheduler.ts
// زمان‌بند خودکار

import cron from 'node-cron';
import { Telegraf } from 'telegraf';
import { prisma } from './prisma/client';
import { lotteryService } from './services/lottery.service';
import { logger } from './utils/logger';
import { config } from './config';

export function startScheduler(bot: Telegraf) {
  logger.info('✅ زمان‌بند خودکار راه‌اندازی شد');
}
