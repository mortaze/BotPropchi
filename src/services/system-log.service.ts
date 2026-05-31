import { Prisma, SystemEventType, SystemLogLevel } from '@prisma/client';
import { prisma } from '../prisma/client';
import { logger } from '../utils/logger';

export const systemLogService = {
  async log(data: {
    eventType: SystemEventType;
    message: string;
    level?: SystemLogLevel;
    userId?: number | null;
    telegramId?: bigint | number | string | null;
    metadata?: Prisma.InputJsonValue;
  }) {
    try {
      return await prisma.systemLog.create({
        data: {
          eventType: data.eventType,
          level: data.level ?? SystemLogLevel.INFO,
          message: data.message,
          userId: data.userId ?? undefined,
          telegramId: data.telegramId !== undefined && data.telegramId !== null ? BigInt(data.telegramId) : undefined,
          metadata: data.metadata ?? undefined,
        },
      });
    } catch (error) {
      logger.warn('خطا در ثبت SystemLog:', error);
      return null;
    }
  },

  async list(params: { page?: number; limit?: number; eventType?: SystemEventType; userId?: number; telegramId?: string; from?: Date; to?: Date }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const where: Prisma.SystemLogWhereInput = {
      ...(params.eventType ? { eventType: params.eventType } : {}),
      ...(params.userId ? { userId: params.userId } : {}),
      ...(params.telegramId ? { telegramId: BigInt(params.telegramId) } : {}),
      ...(params.from || params.to ? { createdAt: { ...(params.from ? { gte: params.from } : {}), ...(params.to ? { lte: params.to } : {}) } } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.systemLog.findMany({ where, include: { user: { select: { id: true, telegramId: true, username: true, firstName: true, lastName: true } } }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      prisma.systemLog.count({ where }),
    ]);
    return { items, total, pages: Math.ceil(total / limit) };
  },
};
