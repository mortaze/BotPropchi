// src/services/broadcast-diagnostics.service.ts
// سرویس آنالیز و عیب‌یابی ارسال پیام همگانی

import { BroadcastLogStatus, Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { logger } from '../utils/logger';

const BOT_VERSION = process.env.npm_package_version || '1.0.0';
const SERVER_NAME = process.env.SERVER_NAME || process.env.HOSTNAME || 'unknown';

// ─── Error Categories ───────────────────────────────────────
export const ERROR_CATEGORIES = {
  SUCCESS: 'SUCCESS',
  USER_BLOCKED: 'USER_BLOCKED',
  USER_DEACTIVATED: 'USER_DEACTIVATED',
  NO_CHAT_ACCESS: 'NO_CHAT_ACCESS',
  CHAT_NOT_FOUND: 'CHAT_NOT_FOUND',
  INVALID_CHAT_ID: 'INVALID_CHAT_ID',
  RATE_LIMITED: 'RATE_LIMITED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  PROGRAMMING_ERROR: 'PROGRAMMING_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

export type ErrorCategory = keyof typeof ERROR_CATEGORIES;

const CRITICAL_ERROR_CATEGORIES: ErrorCategory[] = [
  'INVALID_CHAT_ID', 'CHAT_NOT_FOUND', 'DATABASE_ERROR', 'PROGRAMMING_ERROR',
];

// ─── Error Categorization ───────────────────────────────────
function categorizeError(errorMessage: string, httpStatusCode?: number): ErrorCategory {
  const msg = errorMessage.toLowerCase();

  // User-level errors (real user behavior)
  if (msg.includes('blocked') || msg.includes('bot was blocked')) return 'USER_BLOCKED';
  if (msg.includes('deactivated') || msg.includes('user is deactivated')) return 'USER_DEACTIVATED';
  if (msg.includes('forbidden') || msg.includes('not a member') || msg.includes('not an admin')) return 'NO_CHAT_ACCESS';

  // System-level errors (potential bugs)
  if (msg.includes('chat not found') || msg.includes('user not found')) return 'CHAT_NOT_FOUND';
  if (msg.includes('invalid chat id') || msg.includes('bad request') && msg.includes('chat')) return 'INVALID_CHAT_ID';
  if (msg.includes('retry after') || msg.includes('too many requests') || httpStatusCode === 429) return 'RATE_LIMITED';
  if (msg.includes('timeout') || msg.includes('network') || msg.includes('econnrefused') || msg.includes('econnreset')) return 'NETWORK_ERROR';
  if (msg.includes('database') || msg.includes('prisma') || msg.includes('unique constraint')) return 'DATABASE_ERROR';
  if (msg.includes('typeerror') || msg.includes('referenceerror') || msg.includes('cannot read') || msg.includes('undefined is not')) return 'PROGRAMMING_ERROR';

  // HTTP status based
  if (httpStatusCode === 403) return 'USER_BLOCKED';
  if (httpStatusCode === 404) return 'CHAT_NOT_FOUND';
  if (httpStatusCode === 400) return 'INVALID_CHAT_ID';
  if (httpStatusCode === 429) return 'RATE_LIMITED';
  if (httpStatusCode && httpStatusCode >= 500) return 'NETWORK_ERROR';

  return 'UNKNOWN_ERROR';
}

function isCriticalCategory(category: ErrorCategory): boolean {
  return CRITICAL_ERROR_CATEGORIES.includes(category);
}

// ─── Main Service ───────────────────────────────────────────
export const broadcastDiagnosticsService = {
  // ثبت Detailed Delivery Log
  async recordDeliveryLog(params: {
    broadcastId: number;
    broadcastLogId: number;
    userId: number;
    telegramUserId: bigint;
    chatId?: string;
    username?: string;
    status: 'SUCCESS' | 'FAILED';
    rawResponse?: any;
    errorMessage?: string;
    httpStatusCode?: number;
    telegramErrorCode?: number;
    telegramDescription?: string;
    responseTimeMs?: number;
    retryCount?: number;
    jobId?: string;
    correlationId?: string;
  }) {
    const errorCategory = params.status === 'SUCCESS'
      ? 'SUCCESS'
      : categorizeError(params.errorMessage || '', params.httpStatusCode);

    return prisma.broadcastDeliveryLog.create({
      data: {
        broadcastId: params.broadcastId,
        broadcastLogId: params.broadcastLogId,
        userId: params.userId,
        telegramUserId: params.telegramUserId,
        chatId: params.chatId,
        username: params.username,
        attemptedAt: new Date(),
        finalStatus: params.status,
        rawTelegramResponse: params.rawResponse,
        errorMessage: params.errorMessage,
        httpStatusCode: params.httpStatusCode,
        telegramErrorCode: params.telegramErrorCode,
        telegramDescription: params.telegramDescription,
        responseTimeMs: params.responseTimeMs,
        retryCount: params.retryCount ?? 0,
        botVersion: BOT_VERSION,
        serverName: SERVER_NAME,
        jobId: params.jobId,
        correlationId: params.correlationId,
        errorCategory,
      },
    });
  },

  // دریافت KPIهای کلی
  async getKPIs(broadcastId?: number) {
    const where: Prisma.BroadcastDeliveryLogWhereInput = broadcastId ? { broadcastId } : {};

    const [
      totalUsers,
      totalLogs,
      successCount,
      failedCount,
      errorByCategory,
      criticalErrors,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.broadcastDeliveryLog.count({ where }),
      prisma.broadcastDeliveryLog.count({ where: { ...where, finalStatus: 'SUCCESS' } }),
      prisma.broadcastDeliveryLog.count({ where: { ...where, finalStatus: 'FAILED' } }),
      prisma.broadcastDeliveryLog.groupBy({
        by: ['errorCategory'],
        where: { ...where, finalStatus: 'FAILED' },
        _count: { id: true },
      }),
      prisma.broadcastDeliveryLog.count({
        where: {
          ...where,
          finalStatus: 'FAILED',
          errorCategory: { in: CRITICAL_ERROR_CATEGORIES },
        },
      }),
    ]);

    const errorBreakdown = errorByCategory.map((row) => ({
      category: row.errorCategory || 'UNKNOWN_ERROR',
      count: row._count.id,
    }));

    const totalFailed = failedCount || 1;
    const criticalErrorRate = Math.round((criticalErrors / totalFailed) * 10000) / 100;
    const successRate = totalLogs > 0 ? Math.round((successCount / totalLogs) * 10000) / 100 : 0;
    const hasCriticalBug = criticalErrorRate > 20;

    return {
      totalUsers,
      totalLogs,
      successCount,
      failedCount,
      successRate,
      errorBreakdown,
      criticalErrors,
      criticalErrorRate,
      hasCriticalBug,
    };
  },

  // دریافت تاریخچه Broadcastها
  async getBroadcastHistory(params: { page?: number; limit?: number }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));

    const [items, total] = await Promise.all([
      prisma.broadcast.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: { select: { logs: true } },
        },
      }),
      prisma.broadcast.count(),
    ]);

    return { items, total, pages: Math.ceil(total / limit) };
  },

  // دریافت جزئیات یک Broadcast
  async getBroadcastDetails(broadcastId: number) {
    const broadcast = await prisma.broadcast.findUnique({ where: { id: broadcastId } });
    if (!broadcast) return null;

    const [deliveryStats, errorSamples, recentLogs] = await Promise.all([
      prisma.broadcastDeliveryLog.groupBy({
        by: ['errorCategory', 'finalStatus'],
        where: { broadcastId },
        _count: { id: true },
      }),
      prisma.broadcastDeliveryLog.findMany({
        where: { broadcastId, finalStatus: 'FAILED' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.broadcastDeliveryLog.findMany({
        where: { broadcastId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { broadcastLog: { include: { user: { select: { id: true, telegramId: true, username: true, firstName: true } } } } },
      }),
    ]);

    return { broadcast, deliveryStats, errorSamples, recentLogs };
  },

  // Data Integrity Audit
  async runIntegrityAudit() {
    const issues: Array<{ type: string; severity: string; message: string; userId?: number; telegramId?: string }> = [];

    // 1. Check for users with empty telegramId
    const emptyTelegramId = await prisma.user.count({ where: { telegramId: BigInt(0) } });
    if (emptyTelegramId > 0) {
      issues.push({ type: 'EMPTY_TELEGRAM_ID', severity: 'CRITICAL', message: `${emptyTelegramId} کاربر با TelegramId خالی یا صفر` });
    }

    // 2. Check for duplicate telegramIds
    const duplicates = await prisma.$queryRawUnsafe<Array<{ telegramId: bigint; count: bigint }>>(
      `SELECT "telegramId", COUNT(*)::bigint AS count FROM "users" GROUP BY "telegramId" HAVING COUNT(*) > 1`
    );
    if (duplicates.length > 0) {
      issues.push({ type: 'DUPLICATE_TELEGRAM_ID', severity: 'CRITICAL', message: `${duplicates.length} TelegramId تکراری یافت شد` });
    }

    // 3. Check broadcast logs with invalid chatId
    const invalidChatIds = await prisma.broadcastDeliveryLog.count({
      where: { chatId: null, finalStatus: 'FAILED', errorCategory: 'INVALID_CHAT_ID' },
    });
    if (invalidChatIds > 0) {
      issues.push({ type: 'INVALID_CHAT_IDS', severity: 'HIGH', message: `${invalidChatIds} رکورد با ChatId نامعتبر` });
    }

    // 4. Check broadcast logs sent to user.id instead of telegramUserId
    const wrongTarget = await prisma.broadcastDeliveryLog.count({
      where: {
        finalStatus: 'SUCCESS',
        chatId: { not: null },
      },
    });

    // 5. Check for users with missing required fields
    const incompleteUsers = await prisma.user.count({
      where: { firstName: '' },
    });
    if (incompleteUsers > 0) {
      issues.push({ type: 'INCOMPLETE_USER_DATA', severity: 'MEDIUM', message: `${incompleteUsers} کاربر با firstName خالی` });
    }

    // 6. Calculate database health score
    const totalUsers = await prisma.user.count();
    const blockedUsers = await prisma.user.count({ where: { isBlocked: true } });
    const healthyUsers = totalUsers - blockedUsers;
    const healthScore = totalUsers > 0 ? Math.round((healthyUsers / totalUsers) * 100) : 100;

    return {
      issues,
      totalUsers,
      blockedUsers,
      healthyUsers,
      healthScore,
      duplicateCount: duplicates.length,
    };
  },

  // Dry Run: اعتبارسنجی لیست گیرندگان بدون ارسال واقعی
  async dryRun(broadcastId: number) {
    const broadcast = await prisma.broadcast.findUnique({ where: { id: broadcastId } });
    if (!broadcast) return null;

    const users = await prisma.user.findMany({
      where: { isBlocked: false },
      select: { id: true, telegramId: true, username: true, firstName: true },
    });

    const issues: Array<{ userId: number; telegramId: string; username: string; issue: string; severity: string }> = [];

    for (const user of users) {
      const telegramIdStr = user.telegramId.toString();

      // Check for empty/zero telegramId
      if (!user.telegramId || user.telegramId === BigInt(0)) {
        issues.push({ userId: user.id, telegramId: telegramIdStr, username: user.username || '-', issue: 'TelegramId خالی یا صفر', severity: 'CRITICAL' });
        continue;
      }

      // Check for invalid telegramId format (should be positive integer)
      const tidNum = Number(user.telegramId);
      if (isNaN(tidNum) || tidNum <= 0) {
        issues.push({ userId: user.id, telegramId: telegramIdStr, username: user.username || '-', issue: 'TelegramId فرمت نامعتبر', severity: 'CRITICAL' });
      }

      // Check for missing firstName
      if (!user.firstName) {
        issues.push({ userId: user.id, telegramId: telegramIdStr, username: user.username || '-', issue: 'firstName خالی', severity: 'MEDIUM' });
      }
    }

    // Check for duplicate telegramIds in the send list
    const telegramIds = users.map((u) => u.telegramId.toString());
    const seen = new Set<string>();
    const dupes = telegramIds.filter((tid) => { if (seen.has(tid)) return true; seen.add(tid); return false; });
    if (dupes.length > 0) {
      issues.push({ userId: 0, telegramId: dupes[0], username: '-', issue: `${dupes.length} TelegramId تکراری در لیست ارسال`, severity: 'HIGH' });
    }

    return {
      broadcastId,
      totalRecipients: users.length,
      issuesCount: issues.length,
      issues,
    };
  },

  // Validation: تحلیل 50 نمونه تصادفی از کاربران ناموفق
  async validateFailedSamples(broadcastId: number) {
    const samples = await prisma.broadcastDeliveryLog.findMany({
      where: { broadcastId, finalStatus: 'FAILED' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { broadcastLog: { include: { user: { select: { id: true, telegramId: true, username: true, firstName: true } } } } },
    });

    const analysis = samples.map((sample) => {
      const category = categorizeError(sample.errorMessage || '', sample.httpStatusCode ?? undefined);
      const isUserBehavior = ['USER_BLOCKED', 'USER_DEACTIVATED', 'NO_CHAT_ACCESS'].includes(category);
      const isSystemBug = ['DATABASE_ERROR', 'PROGRAMMING_ERROR', 'INVALID_CHAT_ID'].includes(category);

      return {
        id: sample.id,
        userId: sample.userId,
        telegramId: sample.telegramUserId.toString(),
        username: sample.broadcastLog?.user?.username || '-',
        firstName: sample.broadcastLog?.user?.firstName || '-',
        error: sample.errorMessage,
        category,
        isUserBehavior,
        isSystemBug,
        httpStatusCode: sample.httpStatusCode,
        telegramErrorCode: sample.telegramErrorCode,
      };
    });

    const userBehaviorCount = analysis.filter((a) => a.isUserBehavior).length;
    const systemBugCount = analysis.filter((a) => a.isSystemBug).length;
    const unknownCount = analysis.filter((a) => !a.isUserBehavior && !a.isSystemBug).length;

    return {
      totalSamples: samples.length,
      userBehaviorCount,
      systemBugCount,
      unknownCount,
      userBehaviorRate: samples.length > 0 ? Math.round((userBehaviorCount / samples.length) * 100) : 0,
      systemBugRate: samples.length > 0 ? Math.round((systemBugCount / samples.length) * 100) : 0,
      analysis,
    };
  },
};

export { categorizeError, isCriticalCategory };
