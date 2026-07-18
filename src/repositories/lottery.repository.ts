// src/repositories/lottery.repository.ts
// کوئری‌های قرعه‌کشی مطابق schema جدید

import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';

const lotteryInclude = {
  _count: { select: { entries: true, winners: true } },
} satisfies Prisma.LotteryInclude;

async function attachTicketStats<T extends { id: number; _count?: { entries?: number } } | null>(lottery: T): Promise<any> {
  if (!lottery) return lottery;
  const [sum, topBuyers] = await Promise.all([
    prisma.lotteryEntry.aggregate({ where: { lotteryId: lottery.id }, _sum: { ticketCount: true, pointsSpent: true, chanceWeight: true } }),
    prisma.lotteryEntry.findMany({
      where: { lotteryId: lottery.id },
      include: { user: true },
      orderBy: [{ ticketCount: 'desc' }, { pointsSpent: 'desc' }],
      take: 5,
    }),
  ]);
  return {
    ...lottery,
    ticketStats: {
      participants: lottery._count?.entries ?? 0,
      totalTickets: sum._sum.ticketCount ?? 0,
      pointsSpent: sum._sum.pointsSpent ?? 0,
      totalChance: sum._sum.chanceWeight ?? 0,
      topBuyers,
    },
  };
}

async function attachListStats<T extends Array<{ id: number; _count?: { entries?: number } }>>(items: T): Promise<any[]> {
  return Promise.all(items.map((item) => attachTicketStats(item)));
}

export const lotteryRepository = {
  async getAll(page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      prisma.lottery.findMany({ orderBy: { createdAt: 'desc' }, include: lotteryInclude, skip, take: limit }),
      prisma.lottery.count(),
    ]);

    return { items: await attachListStats(items), total, pages: Math.ceil(total / limit) };
  },

  async getActive() {
    const lottery = await prisma.lottery.findFirst({
      where: {
        isCompleted: false,
      },
      orderBy: { createdAt: 'desc' },
      include: lotteryInclude,
    });
    return attachTicketStats(lottery);
  },

  async getCompleted(limit = 20) {
    const items = await prisma.lottery.findMany({
      where: { isCompleted: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { ...lotteryInclude, winners: { include: { user: true }, orderBy: { wonAt: 'desc' } } },
    });
    return attachListStats(items);
  },

  async findById(id: number) {
    const lottery = await prisma.lottery.findUnique({
      where: { id },
      include: {
        ...lotteryInclude,
        entries: { include: { user: true }, orderBy: [{ ticketCount: 'desc' }, { createdAt: 'desc' }] },
        winners: { include: { user: true }, orderBy: { wonAt: 'desc' } },
        notifications: { include: { user: true }, orderBy: { sentAt: 'desc' } },
      },
    });
    return attachTicketStats(lottery);
  },

  async create(data: Prisma.LotteryCreateInput | any) {
    return attachTicketStats(await prisma.lottery.create({
      data: {
        title: data.title,
        prize: data.prize,
        winnersCount: Number(data.winnersCount ?? 1),
        entryCost: Number(data.entryCost ?? 10),
        isCompleted: data.isCompleted ?? false,
      },
      include: lotteryInclude,
    }));
  },

  async update(id: number, data: Prisma.LotteryUpdateInput | any) {
    const normalized = { ...data };
    if (normalized.winnersCount !== undefined) normalized.winnersCount = Number(normalized.winnersCount);
    if (normalized.entryCost !== undefined) normalized.entryCost = Number(normalized.entryCost);
    return attachTicketStats(await prisma.lottery.update({ where: { id }, data: normalized, include: lotteryInclude }));
  },

  async delete(id: number) { return prisma.lottery.delete({ where: { id } }); },

  async enter(userId: number, lotteryId: number, ticketCount = 1, pointsSpent = 0) {
    return prisma.lotteryEntry.upsert({
      where: { userId_lotteryId: { userId, lotteryId } },
      create: { userId, lotteryId, ticketCount, pointsSpent, chanceWeight: ticketCount },
      update: { ticketCount: { increment: ticketCount }, pointsSpent: { increment: pointsSpent }, chanceWeight: { increment: ticketCount } },
      include: { lottery: true, user: true },
    });
  },

  async getUserEntry(userId: number, lotteryId: number) {
    return prisma.lotteryEntry.findUnique({ where: { userId_lotteryId: { userId, lotteryId } }, include: { user: true, lottery: true } });
  },

  async hasEntered(userId: number, lotteryId: number) { return (await prisma.lotteryEntry.count({ where: { userId, lotteryId } })) > 0; },

  async drawWinners(lotteryId: number, winnersCount?: number) {
    return prisma.$transaction(async (tx) => {
      const lottery = await tx.lottery.findUnique({ where: { id: lotteryId } });
      if (!lottery) throw new Error('قرعه‌کشی یافت نشد');
      if (lottery.isCompleted) return tx.lotteryWinner.findMany({ where: { lotteryId }, include: { user: true } });

      const entries = await tx.lotteryEntry.findMany({ where: { lotteryId, ticketCount: { gt: 0 } }, include: { user: true } });
      const pool = entries.flatMap((entry) => Array.from({ length: entry.ticketCount }, () => entry));
      const selectedByUser = new Map<number, (typeof entries)[number]>();
      while (pool.length && selectedByUser.size < Math.min(winnersCount ?? lottery.winnersCount, entries.length)) {
        const index = Math.floor(Math.random() * pool.length);
        const [entry] = pool.splice(index, 1);
        selectedByUser.set(entry.userId, entry);
      }

      const winners = [];
      for (const entry of selectedByUser.values()) {
        winners.push(await tx.lotteryWinner.create({
          data: {
            lotteryId, userId: entry.userId, prize: lottery.prize, winnerTelegramId: entry.user.telegramId,
            winnerUsername: entry.user.username, winnerFirstName: entry.user.firstName, winnerLastName: entry.user.lastName,
          },
          include: { user: true, lottery: true },
        }));
      }

        await tx.lottery.update({ where: { id: lotteryId }, data: { isCompleted: true } });
      return winners;
    });
  },

  // ─── Wheel Lottery Methods ─────────────────────────────────

  async getWheelParticipants(lotteryId: number) {
    const entries = await prisma.lotteryEntry.findMany({
      where: { lotteryId, ticketCount: { gt: 0 } },
      include: { user: { select: { id: true, telegramId: true, firstName: true, lastName: true, username: true } } },
      orderBy: { ticketCount: 'desc' },
    });

    return entries.map((entry) => ({
      userId: entry.userId,
      user: entry.user,
      chances: entry.ticketCount,
      isRemoved: entry.ticketCount <= 0,
    }));
  },

  async getActiveWheelParticipants(lotteryId: number) {
    const entries = await prisma.lotteryEntry.findMany({
      where: { lotteryId, ticketCount: { gt: 0 } },
      include: { user: { select: { id: true, telegramId: true, firstName: true, lastName: true, username: true } } },
      orderBy: { ticketCount: 'desc' },
    });

    const wheelSegments: { userId: number; firstName: string; lastName: string | null; username: string | null; chances: number }[] = [];
    for (const entry of entries) {
      for (let i = 0; i < entry.ticketCount; i++) {
        wheelSegments.push({
          userId: entry.userId,
          firstName: entry.user.firstName,
          lastName: entry.user.lastName,
          username: entry.user.username,
          chances: entry.ticketCount,
        });
      }
    }

    return wheelSegments;
  },

  async spinWheel(lotteryId: number) {
    return prisma.$transaction(async (tx) => {
      const lottery = await tx.lottery.findUnique({ where: { id: lotteryId } });
      if (!lottery) throw new Error('قرعه‌کشی یافت نشد');
      if (lottery.isCompleted) throw new Error('قرعه‌کشی قبلاً پایان یافته');

      const entries = await tx.lotteryEntry.findMany({
        where: { lotteryId, ticketCount: { gt: 0 } },
        include: { user: true },
      });

      if (entries.length === 0) {
        return { winner: null, remainingParticipants: 0, isCompleted: true };
      }

      const pool = entries.flatMap((entry) => Array.from({ length: entry.ticketCount }, () => entry));
      const randomIndex = Math.floor(Math.random() * pool.length);
      const selectedEntry = pool[randomIndex];

      const roundNumber = (await tx.lotteryWinner.count({ where: { lotteryId } })) + 1;

      const winner = await tx.lotteryWinner.create({
        data: {
          lotteryId,
          userId: selectedEntry.userId,
          prize: lottery.prize,
          winnerTelegramId: selectedEntry.user.telegramId,
          winnerUsername: selectedEntry.user.username,
          winnerFirstName: selectedEntry.user.firstName,
          winnerLastName: selectedEntry.user.lastName,
          roundNumber,
        },
        include: { user: true, lottery: true },
      });

      await tx.lotteryEntry.update({
        where: { userId_lotteryId: { userId: selectedEntry.userId, lotteryId } },
        data: { ticketCount: 0, chanceWeight: 0 },
      });

      const remaining = await tx.lotteryEntry.count({
        where: { lotteryId, ticketCount: { gt: 0 } },
      });

      return {
        winner,
        remainingParticipants: remaining,
        isCompleted: remaining === 0,
      };
    });
  },

  async recordWinner(lotteryId: number, winnerUserId: number) {
    return prisma.$transaction(async (tx) => {
      const lottery = await tx.lottery.findUnique({ where: { id: lotteryId } });
      if (!lottery) throw new Error('قرعه‌کشی یافت نشد');
      if (lottery.isCompleted) throw new Error('قرعه‌کشی قبلاً پایان یافته');

      const entry = await tx.lotteryEntry.findFirst({
        where: { lotteryId, userId: winnerUserId, ticketCount: { gt: 0 } },
        include: { user: true },
      });
      if (!entry) throw new Error('شرکت‌کننده یافت نشد یا شانسی باقی نمانده');

      const roundNumber = (await tx.lotteryWinner.count({ where: { lotteryId } })) + 1;

      const winner = await tx.lotteryWinner.create({
        data: {
          lotteryId,
          userId: entry.userId,
          prize: lottery.prize,
          winnerTelegramId: entry.user.telegramId,
          winnerUsername: entry.user.username,
          winnerFirstName: entry.user.firstName,
          winnerLastName: entry.user.lastName,
          roundNumber,
        },
        include: { user: true, lottery: true },
      });

      await tx.lotteryEntry.update({
        where: { userId_lotteryId: { userId: entry.userId, lotteryId } },
        data: { ticketCount: 0, chanceWeight: 0 },
      });

      const remaining = await tx.lotteryEntry.count({
        where: { lotteryId, ticketCount: { gt: 0 } },
      });

      const isCompleted = remaining === 0;
      if (isCompleted) {
      await tx.lottery.update({ where: { id: lotteryId }, data: { isCompleted: true } });
      }

      return { winner, remainingParticipants: remaining, isCompleted };
    });
  },

  async completeLottery(lotteryId: number) {
    return prisma.lottery.update({
      where: { id: lotteryId },
      data: { isCompleted: true },
    });
  },

  async addParticipant(lotteryId: number, userId: number, chances = 1) {
    return prisma.lotteryEntry.upsert({
      where: { userId_lotteryId: { userId, lotteryId } },
      create: { userId, lotteryId, ticketCount: chances, chanceWeight: chances },
      update: { ticketCount: { increment: chances }, chanceWeight: { increment: chances } },
      include: { user: true },
    });
  },

  async removeParticipant(lotteryId: number, userId: number) {
    return prisma.lotteryEntry.update({
      where: { userId_lotteryId: { userId, lotteryId } },
      data: { ticketCount: 0, chanceWeight: 0 },
    });
  },

  async markNotificationSent(lotteryId: number, userId: number) {
    return prisma.winnerNotification.upsert({
      where: { lotteryId_userId: { lotteryId, userId } },
      create: { lotteryId, userId, status: 'SENT' },
      update: { status: 'SENT', sentAt: new Date() },
    });
  },

  async isNotificationSent(lotteryId: number, userId: number) {
    const notification = await prisma.winnerNotification.findUnique({
      where: { lotteryId_userId: { lotteryId, userId } },
    });
    return notification?.status === 'SENT';
  },

  async getUnnotifiedWinners(lotteryId: number) {
    return prisma.lotteryWinner.findMany({
      where: {
        lotteryId,
        notified: false,
      },
      include: { user: true },
    });
  },

  async getEntriesCount(lotteryId: number) { return prisma.lotteryEntry.count({ where: { lotteryId } }); },
  async getTicketsCount(lotteryId: number) { const r = await prisma.lotteryEntry.aggregate({ where: { lotteryId }, _sum: { ticketCount: true } }); return r._sum.ticketCount ?? 0; },

  async getWinners(lotteryId: number) { return prisma.lotteryWinner.findMany({ where: { lotteryId }, include: { user: true, lottery: true }, orderBy: { wonAt: 'desc' } }); },
  async markWinnerNotified(id: number) { return prisma.lotteryWinner.update({ where: { id }, data: { notified: true } }); },
  async markPrizeDelivered(id: number) { return prisma.lotteryWinner.update({ where: { id }, data: { prizeDelivered: true } }); },
};
