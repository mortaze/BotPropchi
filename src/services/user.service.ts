// src/services/user.service.ts
// منطق تجاری مربوط به کاربران و سیستم رفرال

import { userRepository } from '../repositories/user.repository';
import { PointLogType } from '@prisma/client';
import { logger } from '../utils/logger';
import { parseReferralCode, referralService } from './referral.service';

export const userService = {
  // ثبت کاربر هنگام /start
  async registerOrUpdate(params: {
    telegramId: bigint;
    username?: string;
    firstName: string;
    lastName?: string;
    referralCode?: string;
  }) {
    const existingUser = await userRepository.findByTelegramId(params.telegramId);
    let referredById: number | undefined = existingUser?.referredById ?? undefined;

    // پردازش کد رفرال فقط برای کاربر جدید و کاربری که معرف ندارد
    if (!existingUser && params.referralCode) {
      const referrerId = parseReferralCode(params.referralCode);

      if (referrerId) {
        const referrer = await userRepository.findById(referrerId);

        // جلوگیری از خود-رفرال و رفرال نامعتبر
        if (referrer && referrer.telegramId !== params.telegramId) {
          referredById = referrer.id;
        } else {
          logger.warn('رفرال خودکار یا نامعتبر نادیده گرفته شد:', params.referralCode);
        }
      } else {
        logger.warn('کد رفرال نامعتبر:', params.referralCode);
      }
    }

    const user = await userRepository.upsert({
      telegramId: params.telegramId,
      username: params.username,
      firstName: params.firstName,
      lastName: params.lastName,
      referredById,
    });

    // فقط برای کاربر جدید و فقط یک‌بار پاداش رفرال ثبت می‌شود
    if (!existingUser && referredById) {
      await referralService.registerSuccessfulReferral(referredById, user.id, user.firstName);
    }

    // امتیاز فعالیت روزانه
    await this.checkDailyBonus(user.id, user.lastActiveAt);

    return user;
  },

  // امتیاز روزانه (اگر آخرین فعالیت دیروز یا قبل‌تر بوده)
  async checkDailyBonus(userId: number, lastActiveAt: Date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (lastActiveAt < today) {
      await userRepository.addPoints(userId, 5, PointLogType.DAILY_ACTIVITY, 'فعالیت روزانه');
    }
  },

  // لینک رفرال اختصاصی کاربر
  async getReferralLink(userId: number, botUsername: string): Promise<string> {
    return referralService.getReferralLink(userId, botUsername);
  },

  async getReferralStats(userId: number, botUsername: string) {
    return referralService.getMe(userId, botUsername);
  },

  async getProfile(telegramId: bigint) {
    const user = await userRepository.findByTelegramId(telegramId);
    if (!user) return null;
    const rank = await userRepository.getUserRank(user.id);
    return { ...user, rank };
  },

  async getLeaderboard() {
    return userRepository.getLeaderboard(10);
  },
};
