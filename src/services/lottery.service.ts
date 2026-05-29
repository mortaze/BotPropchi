
// src/services/lottery.service.ts

import { prisma } from "../prisma/client";
import { lotteryRepository } from "../repositories/lottery.repository";
import { userRepository } from "../repositories/user.repository";
import { PointLogType } from "@prisma/client";
import { logger } from "../utils/logger";

export const lotteryService = {
  // ─────────────────────────────────────────────
  // دریافت قرعه‌کشی فعال
  // ─────────────────────────────────────────────
  async getActiveLottery() {
    return lotteryRepository.getActive();
  },

  // ─────────────────────────────────────────────
  // تاریخچه قرعه‌کشی‌ها
  // ─────────────────────────────────────────────
  async getHistory() {
    return lotteryRepository.getCompleted(10);
  },

  // ─────────────────────────────────────────────
  // شرکت در قرعه‌کشی
  // ─────────────────────────────────────────────
  async enterLottery(telegramId: bigint, lotteryId: number) {
    try {
      logger.info(
        `🎟 درخواست شرکت در قرعه‌کشی | telegramId=${telegramId} | lotteryId=${lotteryId}`
      );

      const user = await userRepository.findByTelegramId(telegramId);

      if (!user) {
        logger.warn(`❌ کاربر یافت نشد | telegramId=${telegramId}`);

        return {
          success: false,
          message: "کاربر یافت نشد",
        };
      }

      const lottery = await lotteryRepository.findById(lotteryId);

      if (!lottery) {
        logger.warn(`❌ قرعه‌کشی یافت نشد | lotteryId=${lotteryId}`);

        return {
          success: false,
          message: "قرعه‌کشی یافت نشد",
        };
      }

      // بررسی فعال بودن
      if (!lottery.isActive) {
        return {
          success: false,
          message: "این قرعه‌کشی غیرفعال است",
        };
      }

      // بررسی پایان
      if (lottery.isCompleted) {
        return {
          success: false,
          message: "این قرعه‌کشی قبلاً برگزار شده",
        };
      }

      // بررسی تاریخ پایان
      const now = new Date();

      if (new Date(lottery.endAt) <= now) {
        return {
          success: false,
          message: "زمان شرکت در قرعه‌کشی به پایان رسیده",
        };
      }

      // بررسی شرکت قبلی
      const alreadyEntered = await lotteryRepository.hasEntered(
        user.id,
        lotteryId
      );

      if (alreadyEntered) {
        return {
          success: false,
          message: "شما قبلاً در این قرعه‌کشی شرکت کرده‌اید",
        };
      }

      // بررسی امتیاز
      if (user.points < lottery.minPoints) {
        return {
          success: false,
          message: `حداقل امتیاز لازم ${lottery.minPoints} است — امتیاز فعلی شما ${user.points}`,
        };
      }

      // ─────────────────────────────────────────
      // ثبت شرکت + کم کردن امتیاز
      // ─────────────────────────────────────────
      await prisma.$transaction(async (tx) => {
        // ثبت شرکت
        await tx.lotteryEntry.create({
          data: {
            userId: user.id,
            lotteryId,
          },
        });

        // کم کردن امتیاز
        await tx.user.update({
          where: {
            id: user.id,
          },
          data: {
            points: {
              decrement: lottery.minPoints,
            },
          },
        });

        // ثبت لاگ امتیاز
        await tx.pointLog.create({
          data: {
            userId: user.id,
            amount: -lottery.minPoints,
            type: PointLogType.LOTTERY_ENTRY,
            description: `شرکت در قرعه‌کشی ${lottery.title}`,
          },
        });
      });

      logger.info(
        `✅ کاربر ${user.id} در قرعه‌کشی ${lottery.id} شرکت کرد`
      );

      return {
        success: true,
        message: `✅ با موفقیت در قرعه‌کشی شرکت کردید (${lottery.minPoints} امتیاز کسر شد)`,
      };
    } catch (error: any) {
      logger.error("❌ خطا در شرکت در قرعه‌کشی", error);

      return {
        success: false,
        message: "خطا در ثبت قرعه‌کشی",
      };
    }
  },

  // ─────────────────────────────────────────────
  // برگزاری قرعه‌کشی
  // ─────────────────────────────────────────────
  async draw(lotteryId: number) {
    try {
      logger.info(`🎯 شروع قرعه‌کشی | lotteryId=${lotteryId}`);

      const lottery = await lotteryRepository.findById(lotteryId);

      if (!lottery) {
        throw new Error("قرعه‌کشی یافت نشد");
      }

      if (lottery.isCompleted) {
        throw new Error("این قرعه‌کشی قبلاً برگزار شده");
      }

      const entries = await prisma.lotteryEntry.findMany({
        where: {
          lotteryId,
        },
        include: {
          user: true,
        },
      });

      logger.info(
        `👥 تعداد شرکت‌کنندگان: ${entries.length}`
      );

      if (entries.length === 0) {
        logger.warn(
          `⚠️ هیچ شرکت‌کننده‌ای برای قرعه‌کشی ${lotteryId} وجود ندارد`
        );

        await prisma.lottery.update({
          where: {
            id: lotteryId,
          },
          data: {
            isCompleted: true,
            isActive: false,
          },
        });

        return [];
      }

      // شافل تصادفی
      const shuffled = [...entries].sort(
        () => Math.random() - 0.5
      );

      // انتخاب برندگان
      const winners = shuffled.slice(
        0,
        Math.min(lottery.winnersCount, shuffled.length)
      );

      // Transaction
      await prisma.$transaction(async (tx) => {
        // ثبت برندگان
        for (const winner of winners) {
          await tx.lotteryEntry.update({
            where: {
              id: winner.id,
            },
            data: {
              isWinner: true,
            },
          });
        }

        // پایان قرعه‌کشی
        await tx.lottery.update({
          where: {
            id: lotteryId,
          },
          data: {
            isCompleted: true,
            isActive: false,
          },
        });
      });

      logger.info(
        `🏆 برندگان قرعه‌کشی ${lotteryId}: ${winners
          .map((w) => w.user.firstName)
          .join(", ")}`
      );

      return winners;
    } catch (error: any) {
      logger.error("❌ خطا در برگزاری قرعه‌کشی", error);

      throw error;
    }
  },
};

