// src/services/lottery.service.ts
// منطق تجاری قرعه‌کشی

import { Prisma } from '@prisma/client';
import { lotteryRepository } from '../repositories/lottery.repository';
import { userRepository } from '../repositories/user.repository';
import { logger } from '../utils/logger';
import { notificationService } from './notification.service';

export const lotteryService = {
  async getAll(page = 1, limit = 20) {
    return lotteryRepository.getAll(page, limit);
  },

  async getActiveLottery() {
    return lotteryRepository.getActive();
  },

  async getHistory(limit = 20) {
    return lotteryRepository.getCompleted(limit);
  },

  async getById(id: number) {
    return lotteryRepository.findById(id);
  },

  async createLottery(data: Prisma.LotteryCreateInput | any) {
    return lotteryRepository.create(data);
  },

  async updateLottery(id: number, data: Prisma.LotteryUpdateInput | any) {
    return lotteryRepository.update(id, data);
  },

  async deleteLottery(id: number) {
    return lotteryRepository.delete(id);
  },

  async hasEntered(telegramId: bigint, lotteryId: number) {
    const user = await userRepository.findByTelegramId(telegramId);
    if (!user) return false;
    return lotteryRepository.hasEntered(user.id, lotteryId);
  },

  async getEntriesCount(lotteryId: number) {
    return lotteryRepository.getEntriesCount(lotteryId);
  },


  async getUserEntry(telegramId: bigint, lotteryId: number) {
    const user = await userRepository.findByTelegramId(telegramId);
    if (!user) return null;
    return lotteryRepository.getUserEntry(user.id, lotteryId);
  },

  async getTicketsCount(lotteryId: number) {
    return lotteryRepository.getTicketsCount(lotteryId);
  },

  async getTicketOptions(telegramId: bigint, lotteryId: number) {
    const user = await userRepository.findByTelegramId(telegramId);
    if (!user) return { success: false, message: 'کاربر یافت نشد', options: [] as number[] };
    const lottery = await lotteryRepository.findById(lotteryId);
    if (!lottery || !lottery.isActive || lottery.isCompleted) return { success: false, message: 'این قرعه کشی فعال نیست', options: [] as number[] };
    const now = new Date();
    if (now < lottery.startAt) return { success: false, message: 'قرعه کشی هنوز شروع نشده است', options: [] as number[] };
    if (now > lottery.endAt) return { success: false, message: 'زمان ثبت نام به پایان رسیده است', options: [] as number[] };
    if (user.points < lottery.minPoints) return { success: false, message: `برای شرکت حداقل ${lottery.minPoints} امتیاز لازم است`, options: [] as number[] };
    const entryCost = lottery.entryCost || 0;
    const maxTickets = entryCost > 0 ? Math.floor(user.points / entryCost) : 10;
    if (maxTickets < 1) return { success: false, message: 'امتیاز شما برای خرید بلیت کافی نیست', options: [] as number[] };
    const options = Array.from({ length: Math.min(maxTickets, 10) }, (_, index) => index + 1);
    return { success: true, options, message: `🎟 تعداد بلیت را انتخاب کنید.
⭐️ امتیاز شما: ${user.points}
🎟 هزینه هر بلیت: ${entryCost}
✅ حداکثر قابل خرید در این مرحله: ${maxTickets}` };
  },
  /** ثبت نام در قرعه کشی */
  async enterLottery(telegramId: bigint, lotteryId: number, ticketCount = 1) {
    const user = await userRepository.findByTelegramId(telegramId);

    if (!user) {
      return { success: false, message: 'کاربر یافت نشد' };
    }

    if (user.isBlocked) {
      return { success: false, message: 'حساب شما مسدود شده است' };
    }

    const lottery = await lotteryRepository.findById(lotteryId);

    if (!lottery) {
      return { success: false, message: 'قرعه کشی یافت نشد' };
    }

    if (!lottery.isActive || lottery.isCompleted) {
      return { success: false, message: 'این قرعه کشی فعال نیست' };
    }

    const now = new Date();

    if (now < lottery.startAt) {
      return { success: false, message: 'قرعه کشی هنوز شروع نشده است' };
    }

    if (now > lottery.endAt) {
      return { success: false, message: 'زمان ثبت نام به پایان رسیده است' };
    }



    if (user.points < lottery.minPoints) {
      return { success: false, message: `برای شرکت حداقل ${lottery.minPoints} امتیاز لازم است` };
    }

    const normalizedTicketCount = Math.max(1, Math.floor(Number(ticketCount) || 1));
    const entryCost = lottery.entryCost || 0;
    const totalCost = entryCost * normalizedTicketCount;

    if (user.points < totalCost) {
      return { success: false, message: 'امتیاز شما برای خرید این تعداد بلیت کافی نیست' };
    }

    if (totalCost > 0) {
      await userRepository.deductPoints(user.id, totalCost, `خرید ${normalizedTicketCount} بلیت قرعه کشی ${lottery.title}`);
    }

    const entry = await lotteryRepository.enter(user.id, lotteryId, normalizedTicketCount, totalCost);

    return {
      success: true,
      message: totalCost > 0
        ? `✅ ${normalizedTicketCount} بلیت ثبت شد و ${totalCost} امتیاز کسر شد.
🎟 بلیت‌های شما: ${entry.ticketCount}
📊 شانس کل شما: ${entry.chanceWeight}`
        : `✅ ${normalizedTicketCount} بلیت رایگان ثبت شد.
🎟 بلیت‌های شما: ${entry.ticketCount}`,
    };
  },

  /**
   * برگزاری قرعه کشی
   * force=true => دکمه ادمین و بی‌توجه به زمان پایان
   * force=false => زمانبندی اتوماتیک
   */
  async draw(lotteryId: number, force = false) {
    logger.info(`🎯 DRAW START lottery=${lotteryId} force=${force}`);

    const lottery = await lotteryRepository.findById(lotteryId);

    if (!lottery) {
      throw new Error('قرعه کشی یافت نشد');
    }

    if (lottery.isCompleted) {
      throw new Error('قرعه کشی قبلاً برگزار شده');
    }

    if (!force && new Date() < lottery.endAt) {
      throw new Error('هنوز زمان برگزاری نرسیده است');
    }

    const winners = await lotteryRepository.drawWinners(lottery.id, lottery.winnersCount);

    if (!winners.length) {
      logger.warn(`Lottery ${lottery.id} has no participants`);
      return [];
    }

    for (const winner of winners) {
      try {
        const notified = await notificationService.sendLotteryWinnerMessage(
          winner.winnerTelegramId,
          lottery.title,
          winner.prize
        );

        if (notified) {
          await lotteryRepository.markWinnerNotified(winner.id);
        }

        await notificationService.sendAdminMessage(
          `🏆 برنده جدید\n\nنام:\n${winner.winnerFirstName} ${winner.winnerLastName || ''}\n\nتلگرام:\n${
            winner.winnerUsername ? `@${winner.winnerUsername}` : '-'
          }\n\nآیدی تلگرام:\n${winner.winnerTelegramId}\n\nقرعه‌کشی:\n${lottery.title}\n\nجایزه:\n${winner.prize}`
        );
      } catch (err) {
        logger.error('winner notification failed', err);
      }
    }

    logger.info(`🏆 Lottery ${lottery.id} completed with ${winners.length} winners`);

    return winners;
  },

  async getWinners(lotteryId: number) {
    return lotteryRepository.getWinners(lotteryId);
  },

  async markPrizeDelivered(winnerId: number) {
    return lotteryRepository.markPrizeDelivered(winnerId);
  },
};
