import { Telegraf } from "telegraf";

import { config } from "../config";
import { logger } from "../utils/logger";

const bot = new Telegraf(config.bot.token);

export const notificationService = {
  async sendLotteryWinnerMessage(
    telegramId: bigint,
    lotteryTitle: string,
    prize: string
  ) {
    try {
      await bot.telegram.sendMessage(
        Number(telegramId),

        `🎉 تبریک!

شما برنده قرعه‌کشی "${lotteryTitle}" شدید.

🏆 جایزه:
${prize}

برای دریافت جایزه به آیدی زیر پیام دهید:

${config.notifications.winnerContact}

موفق باشید 🌹`
      );

      return true;
    } catch (error) {
      logger.error(
        `Failed to send winner message to ${telegramId}`,
        error
      );

      return false;
    }
  },

  async sendAdminMessage(message: string) {
    try {
      await bot.telegram.sendMessage(
        Number(config.bot.adminTelegramId),
        message
      );

      return true;
    } catch (error) {
      logger.error(
        "Failed to send admin notification",
        error
      );

      return false;
    }
  },
};
