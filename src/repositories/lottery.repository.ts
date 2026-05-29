// src/repositories/lottery.repository.ts

import { prisma } from "../config";

export const lotteryRepository = {
  /**
   * دریافت همه قرعه‌کشی‌ها
   */
  async getAll() {
    return prisma.lottery.findMany({
      orderBy: {
        createdAt: "desc",
      },

      include: {
        _count: {
          select: {
            entries: true,
          },
        },
      },
    });
  },

  /**
   * دریافت قرعه‌کشی فعال
   */
  async getActive() {
    return prisma.lottery.findFirst({
      where: {
        isActive: true,
        isCompleted: false,
      },

      orderBy: {
        createdAt: "desc",
      },

      include: {
        _count: {
          select: {
            entries: true,
          },
        },
      },
    });
  },

  /**
   * تاریخچه قرعه‌کشی‌ها
   */
  async getCompleted(limit = 5) {
    return prisma.lottery.findMany({
      where: {
        isCompleted: true,
      },

      orderBy: {
        endAt: "desc",
      },

      take: limit,

      include: {
        _count: {
          select: {
            entries: true,
          },
        },
      },
    });
  },

  /**
   * پیدا کردن با id
   */
  async findById(id: number) {
    return prisma.lottery.findUnique({
      where: { id },

      include: {
        entries: {
          include: {
            user: true,
          },
        },

        _count: {
          select: {
            entries: true,
          },
        },
      },
    });
  },

  /**
   * ایجاد قرعه‌کشی
   */
  async create(data: any) {
    return prisma.lottery.create({
      data: {
        title: data.title,
        description: data.description || "",
        prize: data.prize,

        startAt: new Date(data.startAt),
        endAt: new Date(data.endAt),

        winnersCount: Number(
          data.winnersCount || 1
        ),

        minPoints: Number(data.minPoints || 0),

        isActive: true,
        isCompleted: false,
      },
    });
  },

  /**
   * آیا کاربر قبلاً شرکت کرده؟
   */
  async hasEntered(
    userId: number,
    lotteryId: number
  ) {
    const entry =
      await prisma.lotteryEntry.findFirst({
        where: {
          userId,
          lotteryId,
        },
      });

    return !!entry;
  },

  /**
   * ثبت شرکت در قرعه‌کشی
   */
  async enter(
    userId: number,
    lotteryId: number
  ) {
    return prisma.lotteryEntry.create({
      data: {
        userId,
        lotteryId,
      },
    });
  },

  /**
   * انتخاب برندگان
   */
  async drawWinners(
    lotteryId: number,
    winnersCount: number
  ) {
    const entries =
      await prisma.lotteryEntry.findMany({
        where: {
          lotteryId,
        },

        include: {
          user: true,
        },
      });

    if (!entries.length) {
      return [];
    }

    // Shuffle random
    const shuffled = [...entries].sort(
      () => Math.random() - 0.5
    );

    const winners = shuffled.slice(
      0,
      winnersCount
    );

    // ثبت winner
    for (const winner of winners) {
      await prisma.lotteryEntry.update({
        where: {
          id: winner.id,
        },

        data: {
          isWinner: true,
        },
      });
    }

    // پایان قرعه‌کشی
    await prisma.lottery.update({
      where: {
        id: lotteryId,
      },

      data: {
        isCompleted: true,
        isActive: false,
      },
    });

    return winners;
  },
};
