// src/services/user.service.ts
// منطق تجاری مربوط به کاربران و سیستم رفرال

import { PointLogType, SystemEventType, SystemLogLevel } from '@prisma/client';
import { userRepository } from '../repositories/user.repository';
import { prisma } from '../prisma/client';
import { logger } from '../utils/logger';
import { parseReferralCode, referralService } from './referral.service';
import { systemLogService } from './system-log.service';
import { pointService } from './point.service';
import { scoringService } from './scoring.service';
import { notifyNewUserFromService } from '../bot/notifications';
import { attributionService } from './attribution.service';

export const userService = {
  markMembershipVerified(telegramId: bigint) {
    return prisma.user.update({ where: { telegramId }, data: { membershipVerifiedAt: new Date() } });
  },

  async markMembershipUnverified(telegramId: bigint, reason: string) {
    const user = await prisma.user.update({ where: { telegramId }, data: { membershipVerifiedAt: null } });
    await systemLogService.log({
      eventType: SystemEventType.FORCE_JOIN,
      level: SystemLogLevel.WARN,
      telegramId,
      userId: user.id,
      message: 'User membership access revoked',
      metadata: { reason },
    });
    return user;
  },

  // ثبت کاربر هنگام /start و هر تعامل دیگر
  async registerOrUpdate(params: {
    telegramId: bigint;
    username?: string;
    firstName: string;
    lastName?: string;
    languageCode?: string;
    referralCode?: string;
    startPayload?: string;
    deviceType?: string;
  }) {
    const existingUser = await userRepository.findByTelegramId(params.telegramId);
    let referredById: number | undefined = existingUser?.referredById ?? undefined;
    let shouldRegisterReferral = false;
    let acquisitionSource = existingUser?.acquisitionSource ?? 'direct';
    let referrerUserId: number | undefined = undefined;

    if (params.referralCode && !existingUser?.referredById) {
      const referrerId = parseReferralCode(params.referralCode);

      if (referrerId) {
        const referrer = await userRepository.findById(referrerId);

        if (referrer && referrer.telegramId !== params.telegramId) {
          referredById = referrer.id;
          referrerUserId = referrer.id;
          shouldRegisterReferral = true;
          acquisitionSource = 'referral';
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

    // Detect acquisition source from start payload
    if (!existingUser && params.startPayload) {
      const payload = params.startPayload.trim();
      if (payload.startsWith('utm_')) {
        acquisitionSource = 'utm';
      } else if (payload.startsWith('ad_') || payload.startsWith('campaign_')) {
        acquisitionSource = 'ads';
      } else if (payload.startsWith('site_') || payload.startsWith('web_')) {
        acquisitionSource = 'website';
      } else if (payload.startsWith('tg_') || payload.startsWith('channel_')) {
        acquisitionSource = 'telegram';
      } else if (!referredById) {
        acquisitionSource = 'direct';
      }
    }

    const isNewUser = !existingUser;
    const displayFirstName = existingUser?.profileCompleted ? existingUser.firstName : params.firstName;
    const displayLastName = existingUser?.profileCompleted ? existingUser.lastName ?? undefined : params.lastName;
    const user = await userRepository.upsert({
      telegramId: params.telegramId,
      username: params.username,
      firstName: displayFirstName,
      lastName: displayLastName,
      telegramFirstName: params.firstName,
      telegramLastName: params.lastName,
      profileCompletedName: Boolean(existingUser?.profileCompleted),
      referredById,
      acquisitionSource,
      startPayload: params.startPayload,
      referrerUserId,
    });

    // Record Attribution
    try {
      if (isNewUser) {
        await attributionService.recordFirstStart({
          userId: user.id,
          telegramId: params.telegramId,
          username: params.username,
          firstName: params.firstName,
          lastName: params.lastName,
          languageCode: params.languageCode,
          startPayload: params.startPayload,
          referralCode: params.referralCode,
          inviterUserId: referrerUserId,
          deviceType: params.deviceType,
        });
      } else {
        await attributionService.recordSubsequentStart({
          userId: user.id,
          telegramId: params.telegramId,
          username: params.username,
          firstName: params.firstName,
          lastName: params.lastName,
          languageCode: params.languageCode,
          startPayload: params.startPayload,
          deviceType: params.deviceType,
        });
      }
    } catch (err) {
      logger.error(`[Attribution] Failed to record for userId=${user.id}`, err);
    }

    if (isNewUser) {
      const scoring = await scoringService.getSettings();
      if (scoring.startPoints > 0) {
        await pointService.addPoints(user.id, scoring.startPoints, PointLogType.ADMIN_GRANT, 'امتیاز شروع ربات');
      }
      logger.info(`[NewUser] detected userId=${params.telegramId.toString()}`);
      notifyNewUserFromService(params.telegramId, {
        first_name: params.firstName,
        last_name: params.lastName,
        username: params.username,
      }).catch((err: unknown) => logger.error(`[NewUser] notification error userId=${params.telegramId.toString()}`, err));
    }

    // ثبت Referral تا زمان تأیید عضویت اجباری انجام نمی‌شود؛ referredById نقش pending referral را دارد.
    if (shouldRegisterReferral && referredById) {
      logger.info(`Referral pending membership verification referrerId=${referredById}, referredUserId=${user.id}`);
    }

    await this.checkDailyBonus(user.id);

    return user;
  },

  // امتیاز روزانه از روی لاگ امتیاز سنجیده می‌شود تا نیازی به ذخیره آخرین فعالیت کاربر نباشد.
  async checkDailyBonus(userId: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const alreadyGrantedToday = await prisma.pointLog.findFirst({
      where: { userId, type: PointLogType.DAILY_ACTIVITY, createdAt: { gte: today } },
      select: { id: true },
    });
    if (alreadyGrantedToday) return;
    const scoring = await scoringService.getSettings();
    if (scoring.dailyActivityPoints > 0) {
      await userRepository.addPoints(userId, scoring.dailyActivityPoints, PointLogType.DAILY_ACTIVITY, 'فعالیت روزانه');
    }
  },

  async processPendingReferral(telegramId: bigint) {
    const user = await userRepository.findByTelegramId(telegramId);
    if (!user?.referredById) return null;
    const existing = await prisma.referral.findUnique({ where: { referredUserId: user.id } });
    if (existing) return existing;
    return referralService.registerSuccessfulReferral(user.referredById, user.id, user.firstName, true);
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
