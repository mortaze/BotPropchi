
// src/scheduler.ts

import cron from "node-cron";
import { prisma } from "./config";
import { lotteryService } from "./services/lottery.service";
import { logger } from "./utils/logger";

export const startScheduler = () => {
  logger.info("⏰ Lottery Scheduler Started");

  // هر 1 دقیقه بررسی قرعه‌کشی‌ها
  cron.schedule("* * * * *", async () => {
    try {
      logger.info("🔍 Checking lotteries...");

      const lotteries = await prisma.lottery.findMany({
        where: {
          isActive: true,
          isCompleted: false,
          endAt: {
            lte: new Date(),
          },
        },
      });

      if (!lotteries.length) {
        logger.info("📭 No lotteries ready for draw");
        return;
      }

      for (const lottery of lotteries) {
        try {
          logger.info(
            `🎯 Drawing lottery: ${lottery.id} | ${lottery.title}`
          );

          const winners = await lotteryService.draw(lottery.id);

       const winnerNames = winners
  .map((w) => {
    return (
      w.user?.username ||
      w.user?.firstName ||
      `User-${w.user?.id}`
    );
  })
  .join(" , ");
          logger.info(
            `🏆 Lottery "${lottery.title}" completed`
          );

          logger.info(`🏅 Winners: ${winnerNames}`);

          await prisma.lottery.update({
            where: { id: lottery.id },
            data: {
              isCompleted: true,
              isActive: false,
            },
          });

          logger.info(
            `✅ Lottery ${lottery.id} marked as completed`
          );
        } catch (err: any) {
          logger.error(
            `❌ Draw failed for lottery ${lottery.id}`
          );

          logger.error(err.message);
        }
      }
    } catch (err: any) {
      logger.error("❌ Scheduler Error");
      logger.error(err.message);
    }
  });
};

