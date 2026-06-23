// src/repositories/user.repository.ts
// تمام کوئری‌های مربوط به کاربران

import { PointLogType } from '@prisma/client';
import { prisma } from '../prisma/client';
import { pointService } from '../services/point.service';

export const userRepository = {
  async upsert(data: {
    telegramId: bigint;
    username?: string;
    firstName: string;
    lastName?: string;
    telegramFirstName?: string;
    telegramLastName?: string;
    profileCompletedName?: boolean;
    referredById?: number;
    acquisitionSource?: string;
    startPayload?: string;
    referrerUserId?: number;
    utmSource?: string;
    utmCampaign?: string;
  }) {
    return prisma.user.upsert({
      where: { telegramId: data.telegramId },
      update: {
        username: data.username,
        telegramFirstName: data.telegramFirstName ?? data.firstName,
        telegramLastName: data.telegramLastName ?? data.lastName,
        firstName: data.firstName,
        lastName: data.lastName,
        realFirstName: data.profileCompletedName ? data.firstName : undefined,
        realLastName: data.profileCompletedName ? data.lastName : undefined,
        lastActivityAt: new Date(),
      },
      create: {
        telegramId: data.telegramId,
        username: data.username,
        firstName: data.firstName,
        lastName: data.lastName,
        telegramFirstName: data.telegramFirstName ?? data.firstName,
        telegramLastName: data.telegramLastName ?? data.lastName,
        referredById: data.referredById,
        acquisitionSource: data.acquisitionSource ?? 'direct',
        startPayload: data.startPayload,
        referrerUserId: data.referrerUserId,
        utmSource: data.utmSource,
        utmCampaign: data.utmCampaign,
        lastActivityAt: new Date(),
      },
    });
  },

  async findByTelegramId(telegramId: bigint) {
    return prisma.user.findUnique({ where: { telegramId } });
  },

  async findById(id: number) {
    return prisma.user.findUnique({ where: { id } });
  },

  async list(
    page = 1,
    limit = 20,
    filters: { profileStatus?: 'completed' | 'incomplete'; phoneStatus?: 'with_phone' | 'without_phone' } = {}
  ) {
    const skip = (page - 1) * limit;
    const where = {
      ...(filters.profileStatus === 'completed' ? { profileCompleted: true } : {}),
      ...(filters.profileStatus === 'incomplete' ? { profileCompleted: false } : {}),
      ...(filters.phoneStatus === 'with_phone' ? { phoneNumber: { not: null } } : {}),
      ...(filters.phoneStatus === 'without_phone' ? { phoneNumber: null } : {}),
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          telegramId: true,
          firstName: true,
          lastName: true,
          username: true,
          phoneNumber: true,
          profileCompleted: true,
          points: true,
          totalReferrals: true,
          isBlocked: true,
          createdAt: true,
          updatedAt: true,
          referredById: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    const userIds = users.map((user) => user.id);
    const referralAggregates = userIds.length
      ? await prisma.referral.groupBy({
          by: ['referrerId'],
          where: { referrerId: { in: userIds } },
          _count: { _all: true },
          _sum: { rewardPoints: true },
        })
      : [];
    const referralMap = new Map(
      referralAggregates.map((item) => [
        item.referrerId,
        {
          referralCount: item._count._all,
          referralRewardPoints: item._sum.rewardPoints || 0,
        },
      ])
    );

    return {
      users: users.map((user) => ({
        ...user,
        totalReferrals: referralMap.get(user.id)?.referralCount ?? user.totalReferrals,
        referralCount: referralMap.get(user.id)?.referralCount ?? 0,
        referralRewardPoints: referralMap.get(user.id)?.referralRewardPoints ?? 0,
      })),
      total,
      pages: Math.ceil(total / limit),
    };
  },

  // اضافه کردن امتیاز به کاربر؛ wrapper سازگار با کدهای قدیمی، منطق اصلی در pointService است.
  async addPoints(userId: number, amount: number, type: PointLogType, description?: string) {
    return pointService.addPoints(userId, amount, type, description);
  },

  // کسر امتیاز، مخصوص قرعه‌کشی و جریمه‌ها؛ wrapper سازگار با کدهای قدیمی.
  async deductPoints(userId: number, amount: number, description?: string) {
    return pointService.deductPoints(userId, amount, PointLogType.LOTTERY_ENTRY, description);
  },

  async block(id: number) {
    return prisma.user.update({ where: { id }, data: { isBlocked: true } });
  },

  async unblock(id: number) {
    return prisma.user.update({ where: { id }, data: { isBlocked: false } });
  },

  // لیدربورد - برترین کاربران بر اساس امتیاز
  async getLeaderboard(limit = 10) {
    return prisma.user.findMany({
      where: { isBlocked: false },
      orderBy: { points: 'desc' },
      take: limit,
      select: {
        id: true,
        firstName: true,
        username: true,
        points: true,
        totalReferrals: true,
      },
    });
  },

  // رتبه یک کاربر خاص
  async getUserRank(userId: number): Promise<number> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return 0;

    const rank = await prisma.user.count({
      where: { points: { gt: user.points }, isBlocked: false },
    });

    return rank + 1;
  },

  async getLotteryWinnerInfo(userId: number) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        telegramId: true,
        username: true,
        firstName: true,
        lastName: true,
        points: true,
      },
    });
  },

  // فقط برای سازگاری با کدهای قدیمی؛ ثبت رفرال واقعی باید از referralService انجام شود.
  async incrementReferrals(userId: number) {
    return prisma.user.update({
      where: { id: userId },
      data: { totalReferrals: { increment: 1 } },
    });
  },

  async getTotalUsers() {
    return prisma.user.count();
  },
};
