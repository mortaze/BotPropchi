import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { logger } from '../utils/logger';

export const MINI_APP_FAILURE_EVENTS = [
  'MINI_APP_NO_INIT_DATA',
  'MINI_APP_INVALID_HASH',
  'MINI_APP_EXPIRED_AUTH',
  'MINI_APP_INVALID_USER',
  'MINI_APP_INVALID_PROFILE',
  'MINI_APP_SERVER_ERROR',
] as const;

export type MiniAppFailureEvent = (typeof MINI_APP_FAILURE_EVENTS)[number];

export const miniAppLogService = {
  async log(data: {
    telegramId?: bigint | number | string | null;
    userId?: number | null;
    eventType: string;
    message: string;
    payload?: Prisma.InputJsonValue;
    userAgent?: string | null;
  }) {
    try {
      return await prisma.miniAppDebugLog.create({
        data: {
          telegramId: data.telegramId !== undefined && data.telegramId !== null && String(data.telegramId).trim() ? BigInt(data.telegramId) : undefined,
          userId: data.userId ?? undefined,
          eventType: data.eventType,
          message: data.message,
          payload: data.payload ?? undefined,
          userAgent: data.userAgent ?? undefined,
        },
      });
    } catch (error) {
      logger.warn('خطا در ثبت MiniAppDebugLog:', error);
      return null;
    }
  },

  async list(params: { page?: number; limit?: number; eventType?: string; telegramId?: string; from?: Date; to?: Date } = {}) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 50));
    const where: Prisma.MiniAppDebugLogWhereInput = {
      ...(params.eventType ? { eventType: params.eventType } : {}),
      ...(params.telegramId ? { telegramId: BigInt(params.telegramId) } : {}),
      ...(params.from || params.to ? { createdAt: { ...(params.from ? { gte: params.from } : {}), ...(params.to ? { lte: params.to } : {}) } } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.miniAppDebugLog.findMany({
        where,
        include: { user: { select: { id: true, telegramId: true, username: true, firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.miniAppDebugLog.count({ where }),
    ]);
    return { items, total, pages: Math.ceil(total / limit) };
  },

  async report() {
    const failureWhere = { eventType: { in: [...MINI_APP_FAILURE_EVENTS] } };
    const [latestErrors, latestSuccesses, latestValidationFailures, successfulUsers, failedUsers] = await Promise.all([
      prisma.miniAppDebugLog.findMany({ where: { eventType: { in: [...MINI_APP_FAILURE_EVENTS, 'MINI_APP_CLIENT_NO_INIT_DATA'] } }, orderBy: { createdAt: 'desc' }, take: 20 }),
      prisma.miniAppDebugLog.findMany({ where: { eventType: { in: ['MINI_APP_AUTH_SUCCESS', 'MINI_APP_PROFILE_LOADED', 'MINI_APP_PROFILE_UPDATED'] } }, orderBy: { createdAt: 'desc' }, take: 20 }),
      prisma.miniAppDebugLog.findMany({ where: failureWhere, orderBy: { createdAt: 'desc' }, take: 20 }),
      prisma.miniAppDebugLog.findMany({ where: { eventType: 'MINI_APP_AUTH_SUCCESS', telegramId: { not: null } }, distinct: ['telegramId'], select: { telegramId: true } }),
      prisma.miniAppDebugLog.findMany({ where: { ...failureWhere, telegramId: { not: null } }, distinct: ['telegramId'], select: { telegramId: true } }),
    ]);

    return {
      latestErrors,
      latestSuccesses,
      latestValidationFailures,
      successfulUsersCount: successfulUsers.length,
      failedUsersCount: failedUsers.length,
    };
  },
};
