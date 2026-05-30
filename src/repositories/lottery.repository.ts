// src/repositories/lottery.repository.ts
// کوئری‌های قرعه‌کشی مطابق schema جدید

import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';

const lotteryInclude = {
  _count: { select: { entries: true, winners: true } },
} satisfies Prisma.LotteryInclude;

export const lotteryRepository = {
  async getAll(page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      prisma.lottery.findMany({
        orderBy: { createdAt: 'desc' },
        include: lotteryInclude,
        skip,
        take: limit,
      }),
      prisma.lottery.count(),
    ]);

    return { items, total, pages: Math.ceil(total / limit) };
  },

  async getActive() {
    const now = new Date();

    return prisma.lottery.findFirst({
      where: {
        isActive: true,
        isCompleted: false,
        startAt: { lte: now },
      },
      orderBy: { endAt: 'asc' },
      include: lotteryInclude,
    });
  },

  async getCompleted(limit = 20) {
    return prisma.lottery.findMany({
      where: { isCompleted: true },
      orderBy: { endAt: 'desc' },
      take: limit,
      include: {
        ...lotteryInclude,
        winners: {
          include: { user: true },
          orderBy: { wonAt: 'desc' },
        },
      },
    });
  },

  async findById(id: number) {
    return prisma.lottery.findUnique({
      where: { id },
      include: {
        ...lotteryInclude,
        entries: {
          include: { user: true },
          orderBy: { createdAt: 'desc' },
        },
        winners: {
          include: { user: true },
          orderBy: { wonAt: 'desc' },
        },
      },
    });
  },

  async create(data: Prisma.LotteryCreateInput | any) {
    return prisma.lottery.create({
      data: {
        title: data.title,
        description: data.description ?? null,
        prize: data.prize,
        startAt: new Date(data.startAt),
        endAt: new Date(data.endAt),
        winnersCount: Number(data.winnersCount ?? 1),
        minPoints: Number(data.minPoints ?? 0),
        entryCost: Number(data.entryCost ?? 10),
        isActive: data.isActive ?? true,
        isCompleted: data.isCompleted ?? false,
        announcementMsg: data.announcementMsg ?? null,
      },
      include: lotteryInclude,
    });
  },

  async update(id: number, data: Prisma.LotteryUpdateInput | any) {
    const normalized = { ...data };

    if (normalized.startAt) normalized.startAt = new Date(normalized.startAt);
    if (normalized.endAt) normalized.endAt = new Date(normalized.endAt);
    if (normalized.winnersCount !== undefined) normalized.winnersCount = Number(normalized.winnersCount);
    if (normalized.minPoints !== undefined) normalized.minPoints = Number(normalized.minPoints);
    if (normalized.entryCost !== undefined) normalized.entryCost = Number(normalized.entryCost);

    return prisma.lottery.update({
      where: { id },
      data: normalized,
      include: lotteryInclude,
    });
  },

  async delete(id: number) {
    return prisma.lottery.delete({ where: { id } });
  },

  async enter(userId: number, lotteryId: number) {
    return prisma.lotteryEntry.create({
      data: { userId, lotteryId },
      include: { lottery: true, user: true },
    });
  },

  async hasEntered(userId: number, lotteryId: number) {
    const count = await prisma.lotteryEntry.count({ where: { userId, lotteryId } });
    return count > 0;
  },

  async drawWinners(lotteryId: number, winnersCount?: number) {
    return prisma.$transaction(async (tx) => {
      const lottery = await tx.lottery.findUnique({ where: { id: lotteryId } });
      if (!lottery) throw new Error('قرعه‌کشی یافت نشد');
      if (lottery.isCompleted) return tx.lotteryWinner.findMany({ where: { lotteryId }, include: { user: true } });

      const entries = await tx.lotteryEntry.findMany({
        where: { lotteryId },
        include: { user: true },
      });

      const selected = [...entries]
        .sort(() => Math.random() - 0.5)
        .slice(0, Math.min(winnersCount ?? lottery.winnersCount, entries.length));

      const winners = [];

      for (const entry of selected) {
        winners.push(
          await tx.lotteryWinner.create({
            data: {
              lotteryId,
              userId: entry.userId,
              prize: lottery.prize,
              winnerTelegramId: entry.user.telegramId,
              winnerUsername: entry.user.username,
              winnerFirstName: entry.user.firstName,
              winnerLastName: entry.user.lastName,
            },
            include: { user: true, lottery: true },
          })
        );
      }

      await tx.lottery.update({
        where: { id: lotteryId },
        data: { isCompleted: true, isActive: false },
      });

      return winners;
    });
  },

  async getEntriesCount(lotteryId: number) {
    return prisma.lotteryEntry.count({ where: { lotteryId } });
  },

  async getWinners(lotteryId: number) {
    return prisma.lotteryWinner.findMany({
      where: { lotteryId },
      include: { user: true, lottery: true },
      orderBy: { wonAt: 'desc' },
    });
  },

  async markWinnerNotified(id: number) {
    return prisma.lotteryWinner.update({ where: { id }, data: { notified: true } });
  },

  async markPrizeDelivered(id: number) {
    return prisma.lotteryWinner.update({ where: { id }, data: { prizeDelivered: true } });
  },
};
