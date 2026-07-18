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
    if (lottery.startAt) {
      const now = new Date();
      if (now < lottery.startAt) return { success: false, message: 'قرعه کشی هنوز شروع نشده است', options: [] as number[] };
    }
    if (lottery.endAt) {
      const now = new Date();
      if (now > lottery.endAt) return { success: false, message: 'زمان ثبت نام به پایان رسیده است', options: [] as number[] };
    }
    if (user.points < lottery.minPoints) return { success: false, message: `برای شرکت حداقل ${lottery.minPoints} امتیاز لازم است`, options: [] as number[] };
    const entryCost = lottery.entryCost || 0;
    const maxChances = entryCost > 0 ? Math.floor(user.points / entryCost) : 10;
    if (maxChances < 1) return { success: false, message: 'امتیاز شما برای شرکت در قرعه‌کشی کافی نیست', options: [] as number[] };
    const options = Array.from({ length: Math.min(maxChances, 10) }, (_, index) => index + 1);
    return { success: true, options, message: `🎯 تعداد شانس‌ها را انتخاب کنید.\n⭐️ امتیاز شما: ${user.points}\n🎯 هزینه هر شانس: ${entryCost} امتیاز\n✅ حداکثر قابل خرید در این مرحله: ${maxChances}` };
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

    if (lottery.startAt) {
      const now = new Date();
      if (now < lottery.startAt) {
        return { success: false, message: 'قرعه کشی هنوز شروع نشده است' };
      }
    }

    if (lottery.endAt) {
      const now = new Date();
      if (now > lottery.endAt) {
        return { success: false, message: 'زمان ثبت نام به پایان رسیده است' };
      }
    }

    if (user.points < lottery.minPoints) {
      return { success: false, message: `برای شرکت حداقل ${lottery.minPoints} امتیاز لازم است` };
    }

    const normalizedChances = Math.max(1, Math.floor(Number(ticketCount) || 1));
    const entryCost = lottery.entryCost || 0;
    const totalCost = entryCost * normalizedChances;

    if (user.points < totalCost) {
      return { success: false, message: 'امتیاز شما برای شرکت با این تعداد شانس کافی نیست' };
    }

    if (totalCost > 0) {
      await userRepository.deductPoints(user.id, totalCost, `شرکت در قرعه کشی ${lottery.title} (${normalizedChances} شانس)`);
    }

    const entry = await lotteryRepository.enter(user.id, lotteryId, normalizedChances, totalCost);

    return {
      success: true,
      message: totalCost > 0
        ? `✅ ${normalizedChances} شانس ثبت شد و ${totalCost} امتیاز کسر شد.\n🎯 شانس‌های شما: ${entry.ticketCount}\n📊 شانس کل شما: ${entry.chanceWeight}`
        : `✅ ${normalizedChances} شانس رایگان ثبت شد.\n🎯 شانس‌های شما: ${entry.ticketCount}`,
    };
  },

  /**
   * برگزاری قرعه کشی (روش سنتی)
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

    if (!force && lottery.endAt && new Date() < lottery.endAt) {
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

  // ─── Wheel Lottery Methods ─────────────────────────────────

  async getWheelParticipants(lotteryId: number) {
    return lotteryRepository.getWheelParticipants(lotteryId);
  },

  async getWheelSegments(lotteryId: number) {
    return lotteryRepository.getActiveWheelParticipants(lotteryId);
  },

  async spinWheel(lotteryId: number) {
    const result = await lotteryRepository.spinWheel(lotteryId);
    if (result.isCompleted) {
      await lotteryRepository.completeLottery(lotteryId);
    }
    return result;
  },

  async recordWinner(lotteryId: number, winnerUserId: number) {
    return lotteryRepository.recordWinner(lotteryId, winnerUserId);
  },

  async addParticipant(lotteryId: number, userId: number, chances = 1) {
    return lotteryRepository.addParticipant(lotteryId, userId, chances);
  },

  async removeParticipant(lotteryId: number, userId: number) {
    return lotteryRepository.removeParticipant(lotteryId, userId);
  },

  async sendWinnerNotifications(lotteryId: number) {
    const winners = await lotteryRepository.getUnnotifiedWinners(lotteryId);
    const winnerMessage = await lotteryRepository.getWinnerMessage(lotteryId);
    let sentCount = 0;

    for (const winner of winners) {
      const alreadySent = await lotteryRepository.isNotificationSent(lotteryId, winner.userId);
      if (alreadySent) continue;

      try {
        const lottery = await lotteryRepository.findById(lotteryId);
        const notified = await notificationService.sendLotteryWinnerMessage(
          winner.winnerTelegramId,
          lottery?.title ?? 'قرعه‌کشی',
          winner.prize
        );

        if (notified) {
          await lotteryRepository.markWinnerNotified(winner.id);
          await lotteryRepository.markNotificationSent(lotteryId, winner.userId);
          sentCount++;
        }
      } catch (err) {
        logger.error(`Failed to send notification to winner ${winner.userId}`, err);
      }
    }

    return { sentCount, totalWinners: winners.length };
  },

  async getWinners(lotteryId: number) {
    return lotteryRepository.getWinners(lotteryId);
  },

  async markPrizeDelivered(winnerId: number) {
    return lotteryRepository.markPrizeDelivered(winnerId);
  },
};
