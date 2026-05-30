//BotPropchi/src/services /lottery.service.ts

import { lotteryRepository } from "../repositories/lottery.repository";
import { userRepository } from "../repositories/user.repository";
import { logger } from "../utils/logger";
import { notificationService } from "./notification.service";

export const lotteryService = {
  async getActiveLottery() {
    return lotteryRepository.getActive();
  },

  async getHistory() {
    return lotteryRepository.getCompleted(20);
  },

  async getById(id: number) {
    return lotteryRepository.findById(id);
  },

  /**
   * ثبت نام در قرعه کشی
   */
  async enterLottery(
    telegramId: bigint,
    lotteryId: number
  ) {
    const user =
      await userRepository.findByTelegramId(
        telegramId
      );

    if (!user) {
      return {
        success: false,
        message: "کاربر یافت نشد",
      };
    }

    const lottery =
      await lotteryRepository.findById(
        lotteryId
      );

    if (!lottery) {
      return {
        success: false,
        message: "قرعه کشی یافت نشد",
      };
    }

    if (
      !lottery.isActive ||
      lottery.isCompleted
    ) {
      return {
        success: false,
        message:
          "این قرعه کشی فعال نیست",
      };
    }

    const now = new Date();

    if (now < lottery.startAt) {
      return {
        success: false,
        message:
          "قرعه کشی هنوز شروع نشده است",
      };
    }

    if (now > lottery.endAt) {
      return {
        success: false,
        message:
          "زمان ثبت نام به پایان رسیده است",
      };
    }

    const alreadyEntered =
      await lotteryRepository.hasEntered(
        user.id,
        lotteryId
      );

    if (alreadyEntered) {
      return {
        success: false,
        message:
          "شما قبلاً ثبت نام کرده اید",
      };
    }

    const entryCost =
      lottery.entryCost || 0;

    if (user.points < entryCost) {
      return {
        success: false,
        message:
          "امتیاز شما برای شرکت کافی نیست",
      };
    }

    if (entryCost > 0) {
      await userRepository.deductPoints(
        user.id,
        entryCost,
        `شرکت در قرعه کشی ${lottery.title}`
      );
    }

    await lotteryRepository.enter(
      user.id,
      lotteryId
    );

    return {
      success: true,
      message:
        entryCost > 0
          ? `✅ ثبت نام انجام شد و ${entryCost} امتیاز کسر شد`
          : "✅ ثبت نام انجام شد",
    };
  },

  /**
   * برگزاری قرعه کشی
   * force=true => دکمه ادمین
   * force=false => زمانبندی اتوماتیک
   */
  async draw(
    lotteryId: number,
    force = false
  ) {
    logger.info(
      `🎯 DRAW START lottery=${lotteryId}`
    );

    const lottery =
      await lotteryRepository.findById(
        lotteryId
      );

    if (!lottery) {
      throw new Error(
        "قرعه کشی یافت نشد"
      );
    }

    if (lottery.isCompleted) {
      throw new Error(
        "قرعه کشی قبلاً برگزار شده"
      );
    }

    if (
      !force &&
      new Date() < lottery.endAt
    ) {
      throw new Error(
        "هنوز زمان برگزاری نرسیده است"
      );
    }

    const winners =
      await lotteryRepository.drawWinners(
        lottery.id
      );

    if (!winners.length) {
      logger.warn(
        `Lottery ${lottery.id} has no participants`
      );

      return [];
    }

    for (const winner of winners) {
      try {
        await notificationService.sendLotteryWinnerMessage(
          winner.winnerTelegramId,
          lottery.title,
          lottery.prize
        );

        await lotteryRepository.markWinnerNotified(
          winner.id
        );

        await notificationService.sendAdminMessage(
          `
🏆 برنده جدید قرعه کشی

🎰 Lottery:
${lottery.title}

🎁 Prize:
${lottery.prize}

👤 Name:
${winner.winnerFirstName}

📛 Username:
@${winner.winnerUsername || "-"}

🆔 Telegram:
${winner.winnerTelegramId}
`
        );
      } catch (err) {
        logger.error(
          "winner notification failed",
          err
        );
      }
    }

    logger.info(
      `🏆 Lottery ${lottery.id} completed with ${winners.length} winners`
    );

    return winners;
  },

  async deleteLottery(id: number) {
    return lotteryRepository.delete(id);
  },

  async updateLottery(
    id: number,
    data: any
  ) {
    return lotteryRepository.update(
      id,
      data
    );
  },

  async getWinners(lotteryId: number) {
    return lotteryRepository.getWinners(
      lotteryId
    );
  },
};
