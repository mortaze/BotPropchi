// src/services/notification.service.ts
// سیستم ارسال اعلان تلگرام

import { Telegraf } from 'telegraf';
import { config } from '../config';
import { logger } from '../utils/logger';

const bot = new Telegraf(config.bot.token);

type Recipient = number | bigint | string;

function toChatId(recipient: Recipient) {
  return typeof recipient === 'bigint' ? Number(recipient) : recipient;
}

export const notificationService = {
  async sendLotteryWinnerMessage(telegramId: bigint, lotteryTitle: string, prize: string) {
    try {
      await bot.telegram.sendMessage(
        Number(telegramId),
        `🏆 تبریک

شما برنده قرعه‌کشی «${lotteryTitle}» شدید.

🎁 جایزه:
${prize}

برای دریافت جایزه به:
${config.notifications.winnerContact}

پیام دهید.`
      );

      return true;
    } catch (error) {
      logger.error(`Failed to send winner message to ${telegramId}`, error);
      return false;
    }
  },

  async sendAdminMessage(message: string) {
    try {
      await bot.telegram.sendMessage(Number(config.bot.adminTelegramId), message);
      return true;
    } catch (error) {
      logger.error('Failed to send admin notification', error);
      return false;
    }
  },

  async sendBroadcast(message: string, recipients: Recipient[]) {
    return this.sendToUsers(recipients, message);
  },

  async sendToUsers(recipients: Recipient[], message: string) {
    const result = { sent: 0, failed: 0 };

    for (const recipient of recipients) {
      try {
        await bot.telegram.sendMessage(toChatId(recipient), message);
        result.sent += 1;
      } catch (error) {
        result.failed += 1;
        logger.error(`Failed to send message to ${recipient}`, error);
      }
    }

    return result;
  },
};
