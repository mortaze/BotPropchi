// src/services/lottery.service.ts
// منطق قرعه‌کشی

import { lotteryRepository } from '../repositories/lottery.repository';
import { userRepository } from '../repositories/user.repository';
import { PointLogType } from '@prisma/client';
import { logger } from '../utils/logger';

export const lotteryService = {
  async getActiveLottery() {
    return lotteryRepository.getActive();
  },

  async getHistory() {
    return lotteryRepository.getCompleted(5);
  },

  // شرکت کاربر در قرعه‌کشی
  async enterLottery(telegramId: bigint, lotteryId: number) {
    const user = await userRepository.findByTelegramId(telegramId);
    if (!user) return { success: false, message: 'کاربر یافت نشد' };

    const lottery = await lotteryRepository.findById(lotteryId);
    if (!lottery) return { success: false, message: 'قرعه‌کشی یافت نشد' };

    // بررسی حداقل امتیاز
    if (user.points < lottery.minPoints) {
      return {
        success: false,
        message: `حداقل امتیاز لازم: ${lottery.minPoints} — امتیاز شما: ${user.points}`,
      };
    }

    // بررسی ثبت‌نام قبلی
    const alreadyEntered = await lotteryRepository.hasEntered(user.id, lotteryId);
    if (alreadyEntered) {
      return { success: false, message: 'شما قبلاً در این قرعه‌کشی ثبت‌نام کرده‌اید' };
    }

    await lotteryRepository.enter(user.id, lotteryId);
    await userRepository.addPoints(user.id, 10, PointLogType.LOTTERY_ENTRY, 'شرکت در قرعه‌کشی');

    return { success: true, message: '✅ با موفقیت در قرعه‌کشی ثبت‌نام شدید (+۱۰ امتیاز)' };
  },

  // برگزاری قرعه‌کشی توسط ادمین
  async draw(lotteryId: number) {
    const lottery = await lotteryRepository.findById(lotteryId);
    if (!lottery) throw new Error('قرعه‌کشی یافت نشد');
    if (lottery.isCompleted) throw new Error('این قرعه‌کشی قبلاً برگزار شده');

    const winners = await lotteryRepository.drawWinners(lotteryId, lottery.winnersCount);
    logger.info(`قرعه‌کشی ${lotteryId} برگزار شد. برندگان: ${winners.map((w) => w.firstName).join(', ')}`);
    return winners;
  },
};
