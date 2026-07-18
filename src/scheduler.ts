// src/scheduler.ts
// زمان‌بند اجرای خودکار قرعه‌کشی‌ها

import cron from 'node-cron';
import { prisma } from './prisma/client';
import { lotteryService } from './services/lottery.service';
import { broadcastService } from './services/broadcast.service';
import { postService } from './services/post.service';
import { scheduledMessageService } from './services/scheduled-message.service';
import { logger } from './utils/logger';

let running = false;

export function startScheduler() {
  cron.schedule('* * * * *', async () => {
    if (running) {
      logger.warn('[Scheduler] Previous run still in progress — skipping');
      return;
    }
    running = true;
    const now = new Date();

    try {
      await broadcastService.processDueScheduled();
    } catch (err) {
      logger.error('❌ Broadcast scheduler error', err);
    }

    try {
      const processed = await postService.processScheduled();
      if (processed > 0) {
        logger.info(`[Scheduler] Processed ${processed} scheduled post(s)`);
      }
    } catch (err) {
      logger.error('❌ Post scheduler error', err);
    }

    try {
      logger.info(`[Scheduler] Scheduled message tick at ${now.toISOString()}`);
      await scheduledMessageService.processDueScheduled();
    } catch (err) {
      logger.error('❌ Scheduled message scheduler error', err);
    }

    running = false;
  });
}
