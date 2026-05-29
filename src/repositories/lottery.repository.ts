import { prisma } from "../config";

export const lotteryRepository = {
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

  async findById(id: number) {
    return prisma.lottery.findUnique({
      where: { id },
      include: {
        entries: {
          include: {
            user: true,
          },
        },
      },
    });
  },

  async create(data: any) {
    return prisma.lottery.create({
      data: {
        title: data.title,
        prize: data.prize,
        description: data.description || "",
        startAt: new Date(data.startAt),
        endAt: new Date(data.endAt),
        winnersCount: Number(data.winnersCount || 1),
        minPoints: Number(data.minPoints || 0),
        isActive: true,
        isCompleted: false,
      },
    });
  },

  async hasEntered(userId: number, lotteryId: number) {
    const entry = await prisma.lotteryEntry.findFirst({
      where: {
        userId,
        lotteryId,
      },
    });

    return !!entry;
  },

  async enter(userId: number, lotteryId: number) {
    return prisma.lotteryEntry.create({
      data: {
        userId,
        lotteryId,
      },
    });
  },

  async drawWinners(lotteryId: number, winnersCount: number) {
    const entries = await prisma.lotteryEntry.findMany({
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

    const shuffled = [...entries].sort(
      () => 0.5 - Math.random()
    );

    const winners = shuffled.slice(0, winnersCount);

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
