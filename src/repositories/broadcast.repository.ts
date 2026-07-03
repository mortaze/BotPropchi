import { BroadcastLogStatus, BroadcastStatus, Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';

export const broadcastRepository = {
  create(data: Prisma.BroadcastCreateInput) {
    return prisma.broadcast.create({ data });
  },

  findById(id: number) {
    return prisma.broadcast.findUnique({
      where: { id },
      include: {
        logs: { orderBy: { updatedAt: 'desc' }, take: 100, include: { user: { select: { id: true, telegramId: true, username: true, firstName: true, lastName: true } } } },
      },
    });
  },

  async list(params: { page?: number; limit?: number; status?: BroadcastStatus }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const where: Prisma.BroadcastWhereInput = params.status ? { status: params.status } : {};
    const [items, total] = await Promise.all([
      prisma.broadcast.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      prisma.broadcast.count({ where }),
    ]);
    return { items, total, pages: Math.ceil(total / limit) };
  },

  update(id: number, data: Prisma.BroadcastUpdateInput) {
    return prisma.broadcast.update({ where: { id }, data });
  },

  async createPendingLogs(broadcastId: number) {
    // Include all non-blocked users with a valid telegramId
    const users = await prisma.user.findMany({
      where: {
        isBlocked: false,
        telegramId: { not: BigInt(0) },
      },
      select: { id: true, telegramId: true },
    });
    if (users.length) {
      await prisma.broadcastLog.createMany({
        data: users.map((user) => ({ broadcastId, userId: user.id, telegramId: user.telegramId, status: BroadcastLogStatus.PENDING })),
        skipDuplicates: true,
      });
    }
    await broadcastRepository.refreshCounters(broadcastId);
    await prisma.broadcast.update({ where: { id: broadcastId }, data: { totalRecipients: users.length } });
    return users.length;
  },

  getPendingLogs(broadcastId: number, take: number) {
    return prisma.broadcastLog.findMany({
      where: { broadcastId, status: BroadcastLogStatus.PENDING },
      orderBy: { id: 'asc' },
      take,
    });
  },

  markLogSuccess(id: number) {
    return prisma.broadcastLog.update({ where: { id }, data: { status: BroadcastLogStatus.SUCCESS, attempts: { increment: 1 }, error: null, sentAt: new Date() } });
  },

  markLogFailed(id: number, error: string) {
    return prisma.broadcastLog.update({ where: { id }, data: { status: BroadcastLogStatus.FAILED, attempts: { increment: 1 }, error } });
  },

  retryFailed(broadcastId: number) {
    return prisma.broadcastLog.updateMany({ where: { broadcastId, status: BroadcastLogStatus.FAILED }, data: { status: BroadcastLogStatus.PENDING, error: null } });
  },

  failedErrorSamples(broadcastId: number) {
    return prisma.broadcastLog.findMany({
      where: { broadcastId, status: BroadcastLogStatus.FAILED },
      select: { error: true },
      take: 10000,
    });
  },

  async refreshCounters(broadcastId: number) {
    const [success, failed, pending] = await Promise.all([
      prisma.broadcastLog.count({ where: { broadcastId, status: BroadcastLogStatus.SUCCESS } }),
      prisma.broadcastLog.count({ where: { broadcastId, status: BroadcastLogStatus.FAILED } }),
      prisma.broadcastLog.count({ where: { broadcastId, status: BroadcastLogStatus.PENDING } }),
    ]);
    return prisma.broadcast.update({ where: { id: broadcastId }, data: { successCount: success, failedCount: failed, ...(pending === 0 ? { completedAt: new Date(), status: BroadcastStatus.COMPLETED } : {}) } });
  },
};
