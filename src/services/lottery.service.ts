// src/services/lottery.service.ts

import { lotteryRepository } from "../repositories/lottery.repository";
import { userRepository } from "../repositories/user.repository";
import { PointLogType } from "@prisma/client";
import { logger } from "../utils/logger";
import { notificationService } from "./notification.service";
export const lotteryService = {
  async getActiveLottery() {
    return lotteryRepository.getActive();
  },

  async getHistory() {
    return lotteryRepository.getCompleted(10);
  },

  // شرکت در قرعه‌کشی
  async enterLottery(telegramId: bigint, lotteryId: number) {
    const user = await userRepository.findByTelegramId(telegramId);

    if (!user) {
      return {
        success: false,
        message: "کاربر یافت نشد",
      };
    }

    const lottery = await lotteryRepository.findById(lotteryId);

    if (!lottery) {
      return {
        success: false,
        message: "قرعه‌کشی یافت نشد",
      };
    }

    // بررسی فعال بودن
    if (!lottery.isActive || lottery.isCompleted) {
      return {
        success: false,
        message: "این قرعه‌کشی فعال نیست",
      };
    }

    // بررسی زمان
    const now = new Date();

    if (now < lottery.startAt) {
      return {
        success: false,
        message: "قرعه‌کشی هنوز شروع نشده",
      };
    }

    if (now > lottery.endAt) {
      return {
        success: false,
        message: "زمان قرعه‌کشی تمام شده",
      };
    }

    // بررسی امتیاز
    if (user.points < lottery.minPoints) {
      return {
        success: false,
        message: `حداقل امتیاز لازم ${lottery.minPoints} است`,
      };
    }

    // بررسی ثبت قبلی
    const alreadyEntered = await lotteryRepository.hasEntered(
      user.id,
      lotteryId
    );

    if (alreadyEntered) {
      return {
        success: false,
        message: "شما قبلاً شرکت کرده‌اید",
      };
    }

    // کم کردن امتیاز
    await userRepository.addPoints(
      user.id,
      -lottery.minPoints,
      PointLogType.LOTTERY_ENTRY,
      `شرکت در قرعه‌کشی ${lottery.title}`
    );

    // ثبت شرکت
    await lotteryRepository.enter(user.id, lotteryId);
//بعد ازین که برنده ثبت شد
    await notificationService.sendLotteryWinnerMessage(
  winner.user.telegramId,
  lottery.title,
  lottery.prize
);
    //برای ادمین
    await notificationService.sendAdminMessage(
  `
🏆 برنده جدید قرعه کشی

Lottery:
${lottery.title}

Prize:
${lottery.prize}

User:
${winner.user.firstName}

Username:
@${winner.user.username || "-"}

Telegram:
${winner.user.telegramId}
`
);
    return {
      success: true,
      message: `✅ با موفقیت در قرعه‌کشی شرکت کردید (${lottery.minPoints} امتیاز کسر شد)`,
    };
  },

  // برگزاری قرعه‌کشی
  async draw(lotteryId: number) {
    logger.info(`🎯 شروع قرعه‌کشی | lotteryId=${lotteryId}`);

    const lottery = await lotteryRepository.findById(lotteryId);

    if (!lottery) {
      throw new Error("قرعه‌کشی یافت نشد");
    }

    if (lottery.isCompleted) {
      throw new Error("این قرعه‌کشی قبلاً برگزار شده");
    }

    // جلوگیری از draw زودتر از موعد
    const now = new Date();

    if (now < lottery.endAt) {
      throw new Error("هنوز زمان قرعه‌کشی نرسیده");
    }

    const winners = await lotteryRepository.drawWinners(
      lotteryId,
      lottery.winnersCount
    );

    logger.info(
      `🏆 برندگان قرعه‌کشی ${lotteryId}: ${winners
        .map(
          (w) =>
            w.user.username ||
            w.user.firstName ||
            `User-${w.user.id}`
        )
        .join(", ")}`
    );

    return winners;
  },
};
