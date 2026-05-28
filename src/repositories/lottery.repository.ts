// src/repositories/lottery.repository.ts
// کوئری‌های قرعه‌کشی

import { prisma } from '../prisma/client';

export const lotteryRepository = {
  // قرعه‌کشی فعال جاری
  async getActive() {
    return prisma.lottery.findFirst({
      where: {
        isActive: true,
        isCompleted: false,
        startAt: { lte: new Date() },
        endAt: { gt: new Date() },
      },
      include: {
        _count: { select: { entries: true } },
      },
    });
  },

  // تمام قرعه‌کشی‌های پایان‌یافته
  async getCompleted(limit = 5) {
    return prisma.lottery.findMany({
      where: { isCompleted: true },
      orderBy: { endAt: 'desc' },
      take: limit,
      include: {
        entries: { where: { isWinner: true }, include: { user: true } },
      },
    });
  },

  // ثبت‌نام در قرعه‌کشی
  async enter(userId: number, lotteryId: number) {
    return prisma.lotteryEntry.create({
      data: { userId, lotteryId },
    });
  },

  // بررسی ثبت‌نام قبلی
  async hasEntered(userId: number, lotteryId: number) {
    const entry = await prisma.lotteryEntry.findUnique({
      where: { userId_lotteryId: { userId, lotteryId } },
    });
    return !!entry;
  },

  // انتخاب تصادفی برندگان و تکمیل قرعه‌کشی
  async drawWinners(lotteryId: number, winnersCount: number) {
    const entries = await prisma.lotteryEntry.findMany({
      where: { lotteryId },
      include: { user: true },
    });

    if (entries.length === 0) return [];

    // زدن ترتیب تصادفی (Fisher-Yates shuffle)
    const shuffled = [...entries].sort(() => Math.random() - 0.5);
    const winners = shuffled.slice(0, Math.min(winnersCount, shuffled.length));

    // ذخیره برندگان و بستن قرعه‌کشی
    await prisma.$transaction([
      ...winners.map((w) =>
        prisma.lotteryEntry.update({
          where: { id: w.id },
          data: { isWinner: true },
        })
      ),
      prisma.lottery.update({
        where: { id: lotteryId },
        data: { isCompleted: true },
      }),
    ]);

    return winners.map((w) => w.user);
  },

  async findById(id: number) {
    return prisma.lottery.findUnique({
      where: { id },
      include: { _count: { select: { entries: true } } },
    });
  },

  async create(data: {
    title: string;
    description?: string;
    prize: string;
    startAt: Date;
    endAt: Date;
    winnersCount: number;
    minPoints: number;
  }) {
    return prisma.lottery.create({ data });
  },
};
