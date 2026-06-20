// src/scheduler.ts
// زمان‌بند اجرای خودکار قرعه‌کشی‌ها

import cron from 'node-cron';
import { prisma } from './prisma/client';
import { lotteryService } from './services/lottery.service';
import { broadcastService } from './services/broadcast.service';
import { postService } from './services/post.service';
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
      const lotteries = await prisma.lottery.findMany({
        where: {
          isActive: true,
          isCompleted: false,
          endAt: { lte: now },
        },
        orderBy: { endAt: 'asc' },
        select: { id: true, title: true, endAt: true },
      });

      if (!lotteries.length) return;

      logger.info(`🎯 ${lotteries.length} lottery draw(s) are ready`);

      for (const lottery of lotteries) {
        try {
          logger.info(`🎯 Auto draw started: ${lottery.id} - ${lottery.title}`);

          const winners = await lotteryService.draw(lottery.id);

          logger.info(`✅ Auto draw completed: ${lottery.id}, winners=${winners.length}`);
        } catch (err: any) {
          logger.error(`❌ Auto draw failed: ${lottery.id} - ${lottery.title}`, err);
        }
      }
    } catch (err) {
      logger.error('❌ Scheduler error', err);
    } finally {
      running = false;
    }
  });
}
