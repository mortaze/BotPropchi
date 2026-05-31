// src/services/user.service.ts
// منطق تجاری مربوط به کاربران و سیستم رفرال

import { PointLogType } from '@prisma/client';
import { userRepository } from '../repositories/user.repository';
import { prisma } from '../prisma/client';
import { logger } from '../utils/logger';
import { parseReferralCode, referralService } from './referral.service';

export const userService = {
  // ثبت کاربر هنگام /start و هر تعامل دیگر
  async registerOrUpdate(params: {
    telegramId: bigint;
    username?: string;
    firstName: string;
    lastName?: string;
    referralCode?: string;
  }) {
    const existingUser = await userRepository.findByTelegramId(params.telegramId);
    const previousLastActiveAt = existingUser?.lastActiveAt;
    let referredById: number | undefined = existingUser?.referredById ?? undefined;
    let shouldRegisterReferral = false;

    if (params.referralCode && !existingUser?.referredById) {
      const referrerId = parseReferralCode(params.referralCode);

      if (referrerId) {
        const referrer = await userRepository.findById(referrerId);

        if (referrer && referrer.telegramId !== params.telegramId) {
          referredById = referrer.id;
          shouldRegisterReferral = true;
          logger.info(
            `Referral code accepted telegramId=${params.telegramId.toString()}, referrerId=${referrer.id}, isNewUser=${!existingUser}`
          );
        } else {
          logger.warn(`Self or invalid referral ignored. code=${params.referralCode}, telegramId=${params.telegramId.toString()}`);
        }
      } else {
        logger.warn(`Invalid referral code ignored. code=${params.referralCode}`);
      }
    }

    const user = await userRepository.upsert({
      telegramId: params.telegramId,
      username: params.username,
      firstName: params.firstName,
      lastName: params.lastName,
      referredById,
    });

    // کاربرانی که قبلاً به دلیل باگ startPayload ساخته شده‌اند ولی Referral ندارند هم فقط یک‌بار قابل اتصال هستند.
    if (shouldRegisterReferral && referredById) {
      await referralService.registerSuccessfulReferral(referredById, user.id, user.firstName);
    }

    // امتیاز فعالیت روزانه باید با lastActiveAt قبلی سنجیده شود، نه مقدار به‌روزشده upsert.
    if (previousLastActiveAt) {
      await this.checkDailyBonus(user.id, previousLastActiveAt);
    }

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
    const [rank, referralAggregate] = await Promise.all([
      userRepository.getUserRank(user.id),
      prisma.referral.aggregate({ where: { referrerId: user.id }, _count: true, _sum: { rewardPoints: true } }),
    ]);
    return {
      ...user,
      totalReferrals: referralAggregate._count,
      referralCount: referralAggregate._count,
      referralRewardPoints: referralAggregate._sum.rewardPoints || 0,
      rank,
    };
  },

  async getLeaderboard() {
    return userRepository.getLeaderboard(10);
  },
};
