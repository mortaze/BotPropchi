// src/services/user.service.ts
// منطق تجاری مربوط به کاربران و سیستم رفرال

import { userRepository } from '../repositories/user.repository';
import { PointLogType } from '@prisma/client';
import { logger } from '../utils/logger';

export const userService = {
  // ثبت کاربر هنگام /start
  async registerOrUpdate(params: {
    telegramId: bigint;
    username?: string;
    firstName: string;
    lastName?: string;
    referralCode?: string; // آیدی عددی دعوت‌کننده به صورت string
  }) {
    let referredById: number | undefined;

    // پردازش کد رفرال
    if (params.referralCode) {
      try {
        const referrerId = parseInt(params.referralCode);
        const referrer = await userRepository.findById(referrerId);

        // جلوگیری از خود-رفرال و رفرال تکراری
        if (referrer && referrer.telegramId !== params.telegramId) {
          referredById = referrer.id;
        }
      } catch {
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

    // اگر کاربر جدید است و رفرال داشت، امتیاز به دعوت‌کننده بده
    if (referredById && user.createdAt.getTime() === user.updatedAt.getTime()) {
      await Promise.all([
        userRepository.addPoints(referredById, 50, PointLogType.REFERRAL, `دعوت ${user.firstName}`),
        userRepository.incrementReferrals(referredById),
      ]);
      logger.info(`امتیاز رفرال داده شد به userId=${referredById}`);
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
    return `https://t.me/${botUsername}?start=ref_${userId}`;
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
