// src/scheduler.ts

import cron from "node-cron";
import { prisma } from "./config";
import { lotteryService } from "./services/lottery.service";
import { logger } from "./utils/logger";

export function startScheduler() {
  cron.schedule("* * * * *", async () => {
    try {
      logger.info("🔍 Checking lotteries...");

      const now = new Date();

      const lotteries = await prisma.lottery.findMany({
        where: {
          isActive: true,
          isCompleted: false,
          endAt: {
            lte: now,
          },
        },
      });

      if (!lotteries.length) {
        logger.info("📭 No lotteries ready for draw");
        return;
      }

      for (const lottery of lotteries) {
        try {
          logger.info(`🎯 Auto draw lottery ${lottery.id}`);

          await lotteryService.draw(lottery.id);

          logger.info(
            `✅ Lottery ${lottery.id} completed`
          );
        } catch (err: any) {
          logger.error(
            `❌ Lottery ${lottery.id} failed`,
            err
          );
        }
      }
    } catch (err) {
      logger.error("❌ Scheduler error", err);
    }
  });
}
