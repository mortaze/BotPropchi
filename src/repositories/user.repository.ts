// src/repositories/user.repository.ts
// تمام کوئری‌های مربوط به کاربران

import { PointLogType } from '@prisma/client';
import { prisma } from '../prisma/client';

export const userRepository = {
  // پیدا کردن یا ساختن کاربر جدید (هنگام /start)
  async upsert(data: {
    telegramId: bigint;
    username?: string;
    firstName: string;
    lastName?: string;
    referredById?: number;
  }) {
    return prisma.user.upsert({
      where: { telegramId: data.telegramId },
      update: {
        username: data.username,
        firstName: data.firstName,
        lastName: data.lastName,
        lastActiveAt: new Date(),
      },
      create: {
        telegramId: data.telegramId,
        username: data.username,
        firstName: data.firstName,
        lastName: data.lastName,
        referredById: data.referredById,
      },
    });
  },

  async findByTelegramId(telegramId: bigint) {
    return prisma.user.findUnique({ where: { telegramId } });
  },

  async findById(id: number) {
    return prisma.user.findUnique({ where: { id } });
  },

  async list(page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          telegramId: true,
          firstName: true,
          lastName: true,
          username: true,
          points: true,
          totalReferrals: true,
          isBlocked: true,
          lastActiveAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.user.count(),
    ]);

    return { users, total, pages: Math.ceil(total / limit) };
  },

  // اضافه کردن امتیاز به کاربر
  async addPoints(userId: number, amount: number, type: PointLogType, description?: string) {
    return prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { points: { increment: amount } },
      }),
      prisma.pointLog.create({
        data: { userId, amount, type, description },
      }),
    ]);
  },

  // کسر امتیاز، مخصوص قرعه‌کشی و جریمه‌ها
  async deductPoints(userId: number, amount: number, description?: string) {
    return prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { points: { decrement: amount } },
      }),
      prisma.pointLog.create({
        data: {
          userId,
          amount: -Math.abs(amount),
          type: PointLogType.LOTTERY_ENTRY,
          description,
        },
      }),
    ]);
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

  // ثبت رفرال جدید
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
