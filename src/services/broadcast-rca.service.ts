// src/services/broadcast-rca.service.ts
// سرویس Root Cause Analysis برای آنالیز ریشه‌ای خطاهای Broadcast

import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { logger } from '../utils/logger';

// ─── Root Cause Definitions ─────────────────────────────────
const ROOT_CAUSES: Record<string, { label: string; description: string; severity: string }> = {
  INVALID_USER_ID: {
    label: 'ذخیره شناسه اشتباه',
    description: 'TelegramUserId در دیتابیس با مقدار واقعی کاربر متفاوت است',
    severity: 'CRITICAL',
  },
  INVALID_CHAT_ID: {
    label: 'ChatId نامعتبر',
    description: 'ChatId ذخیره شده فرمت صحیح ندارد یا صفر/خالی است',
    severity: 'CRITICAL',
  },
  MIGRATION_CORRUPTION: {
    label: 'مهاجرت ناقص',
    description: 'داده‌ها هنگام مهاجرت از سیستم قبلی خراب شده‌اند',
    severity: 'HIGH',
  },
  USER_DEACTIVATED: {
    label: 'اکانت غیرفعال',
    description: 'کاربر اکانت تلگرام خود را غیرفعال کرده',
    severity: 'LOW',
  },
  USER_BLOCKED_BOT: {
    label: 'بلاک ربات',
    description: 'کاربر ربات را بلاک کرده',
    severity: 'LOW',
  },
  DATABASE_SCHEMA_ERROR: {
    label: 'خطای Schema دیتابیس',
    description: 'مشکل در ساختار جداول دیتابیس',
    severity: 'CRITICAL',
  },
  CODE_LOGIC_ERROR: {
    label: 'خطای منطق برنامه‌نویسی',
    description: 'Exception در کد ارسال پیام',
    severity: 'HIGH',
  },
  TELEGRAM_API_ERROR: {
    label: 'خطای Telegram API',
    description: 'خطای سمت سرور تلگرام',
    severity: 'MEDIUM',
  },
  NETWORK_TIMEOUT: {
    label: 'تایم‌اوت شبکه',
    description: 'ارتباط با سرور تلگرام قطع شده',
    severity: 'MEDIUM',
  },
  UNKNOWN: {
    label: 'نامشخص',
    description: 'دلیل خطا قابل تشخیص نیست',
    severity: 'UNKNOWN',
  },
};

// ─── Error Analysis ─────────────────────────────────────────
interface ErrorAnalysis {
  deliveryLogId: number;
  userId: number;
  telegramUserId: string;
  chatId: string | null;
  username: string | null;
  userCreatedAt: string | null;
  lastActivityAt: string | null;
  lastStartAt: string | null;
  userStatus: string;
  errorMessage: string | null;
  httpStatusCode: number | null;
  telegramErrorCode: number | null;
  telegramDescription: string | null;
  rootCause: string;
  rootCauseLabel: string;
  rootCauseDescription: string;
  severity: string;
  validationChecks: ValidationCheck[];
}

interface ValidationCheck {
  name: string;
  passed: boolean;
  details: string;
}

// ─── Main Service ───────────────────────────────────────────
export const broadcastRcaService = {
  // دریافت آنالیز کامل خطاها برای یک Broadcast
  async analyzeBroadcastErrors(broadcastId: number) {
    const logs = await prisma.broadcastDeliveryLog.findMany({
      where: { broadcastId, finalStatus: 'FAILED' },
      orderBy: { createdAt: 'desc' },
    });

    const analyses: ErrorAnalysis[] = [];
    for (const log of logs) {
      const analysis = await this.analyzeSingleError(log);
      analyses.push(analysis);
    }

    // گروه‌بندی بر اساس root cause
    const byRootCause: Record<string, ErrorAnalysis[]> = {};
    for (const a of analyses) {
      if (!byRootCause[a.rootCause]) byRootCause[a.rootCause] = [];
      byRootCause[a.rootCause].push(a);
    }

    // گروه‌بندی بر اساس دسته خطا
    const byErrorCategory: Record<string, ErrorAnalysis[]> = {};
    for (const a of analyses) {
      const cat = this.getErrorCategory(a.errorMessage, a.httpStatusCode);
      if (!byErrorCategory[cat]) byErrorCategory[cat] = [];
      byErrorCategory[cat].push(a);
    }

    // آمار نهایی
    const totalErrors = analyses.length;
    const rootCauseSummary = Object.entries(byRootCause).map(([cause, items]) => ({
      cause,
      label: ROOT_CAUSES[cause]?.label ?? cause,
      description: ROOT_CAUSES[cause]?.description ?? '',
      severity: ROOT_CAUSES[cause]?.severity ?? 'UNKNOWN',
      count: items.length,
      percentage: totalErrors > 0 ? Math.round((items.length / totalErrors) * 10000) / 100 : 0,
    }));

    // دسته‌بندی بر اساس منشا
    const userBehaviorErrors = analyses.filter(a => ['USER_DEACTIVATED', 'USER_BLOCKED_BOT'].includes(a.rootCause)).length;
    const databaseErrors = analyses.filter(a => ['DATABASE_SCHEMA_ERROR', 'INVALID_USER_ID', 'INVALID_CHAT_ID', 'MIGRATION_CORRUPTION'].includes(a.rootCause)).length;
    const codeErrors = analyses.filter(a => ['CODE_LOGIC_ERROR'].includes(a.rootCause)).length;
    const telegramApiErrors = analyses.filter(a => ['TELEGRAM_API_ERROR', 'NETWORK_TIMEOUT'].includes(a.rootCause)).length;
    const unknownErrors = analyses.filter(a => ['UNKNOWN'].includes(a.rootCause)).length;

    return {
      broadcastId,
      totalErrors,
      analyses: analyses.slice(0, 100), // Limit for performance
      byRootCause: rootCauseSummary,
      byErrorCategory: Object.entries(byErrorCategory).map(([cat, items]) => ({
        category: cat,
        count: items.length,
        percentage: totalErrors > 0 ? Math.round((items.length / totalErrors) * 10000) / 100 : 0,
      })),
      summary: {
        userBehaviorErrors,
        userBehaviorPercentage: totalErrors > 0 ? Math.round((userBehaviorErrors / totalErrors) * 10000) / 100 : 0,
        databaseErrors,
        databasePercentage: totalErrors > 0 ? Math.round((databaseErrors / totalErrors) * 10000) / 100 : 0,
        codeErrors,
        codePercentage: totalErrors > 0 ? Math.round((codeErrors / totalErrors) * 10000) / 100 : 0,
        telegramApiErrors,
        telegramApiPercentage: totalErrors > 0 ? Math.round((telegramApiErrors / totalErrors) * 10000) / 100 : 0,
        unknownErrors,
        unknownPercentage: totalErrors > 0 ? Math.round((unknownErrors / totalErrors) * 10000) / 100 : 0,
      },
    };
  },

  // آنالیز یک خطای واحد
  async analyzeSingleError(log: any): Promise<ErrorAnalysis> {
    const user = await prisma.user.findUnique({ where: { id: log.userId } });
    const attribution = await prisma.userAttribution.findUnique({ where: { userId: log.userId } });

    const validationChecks = this.runValidationChecks(log, user, attribution);
    const rootCause = this.determineRootCause(log, user, attribution, validationChecks);
    const rootCauseInfo = ROOT_CAUSES[rootCause] ?? ROOT_CAUSES.UNKNOWN;

    return {
      deliveryLogId: log.id,
      userId: log.userId,
      telegramUserId: log.telegramUserId.toString(),
      chatId: log.chatId,
      username: log.username ?? user?.username ?? null,
      userCreatedAt: user?.createdAt?.toISOString() ?? null,
      lastActivityAt: user?.lastActivityAt?.toISOString() ?? null,
      lastStartAt: attribution?.startedAt?.toISOString() ?? null,
      userStatus: user?.isBlocked ? 'blocked' : 'active',
      errorMessage: log.errorMessage,
      httpStatusCode: log.httpStatusCode,
      telegramErrorCode: log.telegramErrorCode,
      telegramDescription: log.telegramDescription,
      rootCause,
      rootCauseLabel: rootCauseInfo.label,
      rootCauseDescription: rootCauseInfo.description,
      severity: rootCauseInfo.severity,
      validationChecks,
    };
  },

  // اجرای تست‌های اعتبارسنجی
  runValidationChecks(log: any, user: any, attribution: any): ValidationCheck[] {
    const checks: ValidationCheck[] = [];

    // 1. آیا TelegramUserId معتبر است?
    const tid = log.telegramUserId?.toString() ?? '';
    checks.push({
      name: 'TelegramUserId معتبر',
      passed: tid.length > 0 && tid !== '0' && !tid.startsWith('-'),
      details: tid ? `مقدار: ${tid}` : 'خالی',
    });

    // 2. آیا ChatId معتبر است?
    const chatId = log.chatId;
    checks.push({
      name: 'ChatId معتبر',
      passed: Boolean(chatId && chatId !== '0' && chatId !== 'null'),
      details: chatId ? `مقدار: ${chatId}` : 'خالی یا نامعتبر',
    });

    // 3. آیا این دو مقدار یکسان هستند?
    if (chatId && tid) {
      checks.push({
        name: 'TelegramUserId و ChatId یکسان',
        passed: chatId === tid,
        details: `TelegramUserId=${tid}, ChatId=${chatId}`,
      });
    }

    // 4. آیا رکورد کاربر ناقص است?
    checks.push({
      name: 'داده کاربر کامل',
      passed: Boolean(user?.firstName && user?.telegramId),
      details: user ? `firstName=${user.firstName}, telegramId=${user.telegramId}` : 'کاربر یافت نشد',
    });

    // 5. آیا کاربر بعد از ثبت‌نام Start مجدد زده?
    checks.push({
      name: 'Start مجدد ثبت شده',
      passed: Boolean(attribution?.startedAt && attribution.startCount > 1),
      details: attribution ? `startCount=${attribution.startCount}` : 'Attribution یافت نشد',
    });

    // 6. آیا داده هنگام مهاجرت خراب شده?
    const hasMigrationCorruption = user && !user.telegramId && user.id > 0;
    checks.push({
      name: 'بدون نشانه مهاجرت',
      passed: !hasMigrationCorruption,
      details: hasMigrationCorruption ? 'telegramId خالی برای کاربر موجود' : 'سالم',
    });

    return checks;
  },

  // تعیین Root Cause
  determineRootCause(log: any, user: any, attribution: any, checks: ValidationCheck[]): string {
    const msg = (log.errorMessage || '').toLowerCase();

    // Check validation failures first
    const failedChecks = checks.filter(c => !c.passed);

    // Invalid TelegramUserId
    if (failedChecks.some(c => c.name === 'TelegramUserId معتبر')) {
      return 'INVALID_USER_ID';
    }

    // Invalid ChatId
    if (failedChecks.some(c => c.name === 'ChatId معتبر')) {
      return 'INVALID_CHAT_ID';
    }

    // Migration corruption
    if (failedChecks.some(c => c.name.includes('مهاجرت'))) {
      return 'MIGRATION_CORRUPTION';
    }

    // Error message analysis
    if (msg.includes('deactivated') || msg.includes('user is deactivated')) return 'USER_DEACTIVATED';
    if (msg.includes('blocked') || msg.includes('bot was blocked')) return 'USER_BLOCKED_BOT';
    if (msg.includes('database') || msg.includes('prisma') || msg.includes('unique constraint')) return 'DATABASE_SCHEMA_ERROR';
    if (msg.includes('typeerror') || msg.includes('referenceerror') || msg.includes('cannot read') || msg.includes('undefined is not')) return 'CODE_LOGIC_ERROR';
    if (msg.includes('timeout') || msg.includes('network') || msg.includes('econnrefused') || msg.includes('econnreset')) return 'NETWORK_TIMEOUT';
    if (log.httpStatusCode && log.httpStatusCode >= 400 && log.httpStatusCode < 500) return 'TELEGRAM_API_ERROR';
    if (log.httpStatusCode && log.httpStatusCode >= 500) return 'NETWORK_TIMEOUT';

    return 'UNKNOWN';
  },

  // دریافت Data Integrity Report
  async getDataIntegrityReport() {
    const totalUsers = await prisma.user.count();

    // کاربران با TelegramId معتبر
    const validTelegramId = await prisma.user.count({
      where: { telegramId: { not: BigInt(0) } },
    });

    // کاربران با ChatId معتبر (از BroadcastDeliveryLog)
    const validChatId = await prisma.broadcastDeliveryLog.groupBy({
      by: ['userId'],
      where: { chatId: { not: null } },
      _count: { id: true },
    });

    // کاربران با داده ناقص
    const incompleteData = await prisma.user.count({
      where: { firstName: '' },
    });

    // کاربران با شناسه تکراری
    const duplicateTelegramIds = await prisma.$queryRawUnsafe<Array<{ telegramId: bigint; count: bigint }>>(
      `SELECT "telegramId", COUNT(*)::bigint AS count FROM "users" GROUP BY "telegramId" HAVING COUNT(*) > 1`
    );

    // کاربران با ChatId صفر یا Null
    const zeroChatId = await prisma.broadcastDeliveryLog.count({
      where: { chatId: null },
    });

    // کاربران با TelegramId نامعتبر
    const invalidTelegramId = await prisma.user.count({
      where: { telegramId: BigInt(0) },
    });

    const healthScore = totalUsers > 0
      ? Math.round(((validTelegramId - invalidTelegramId) / totalUsers) * 100)
      : 100;

    return {
      totalUsers,
      validTelegramId,
      validChatIdCount: validChatId.length,
      incompleteData,
      duplicateCount: duplicateTelegramIds.length,
      duplicateTelegramIds: duplicateTelegramIds.map(d => d.telegramId.toString()),
      zeroChatId,
      invalidTelegramId,
      healthScore,
    };
  },

  // دریافت Error Explorer - لیست کاربران بر اساس نوع خطا
  async getErrorExplorer(broadcastId: number, errorCategory: string) {
    const logs = await prisma.broadcastDeliveryLog.findMany({
      where: { broadcastId, errorCategory },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const enriched = [];
    for (const log of logs) {
      const user = await prisma.user.findUnique({ where: { id: log.userId } });
      const attribution = await prisma.userAttribution.findUnique({ where: { userId: log.userId } });

      enriched.push({
        deliveryLogId: log.id,
        userId: log.userId,
        telegramUserId: log.telegramUserId.toString(),
        chatId: log.chatId,
        username: log.username ?? user?.username ?? null,
        firstName: user?.firstName ?? null,
        userCreatedAt: user?.createdAt?.toISOString() ?? null,
        lastActivityAt: user?.lastActivityAt?.toISOString() ?? null,
        lastStartAt: attribution?.startedAt?.toISOString() ?? null,
        userStatus: user?.isBlocked ? 'blocked' : 'active',
        errorMessage: log.errorMessage,
        httpStatusCode: log.httpStatusCode,
        telegramErrorCode: log.telegramErrorCode,
        telegramDescription: log.telegramDescription,
      });
    }

    return enriched;
  },

  // دریافت کاربران مشکوک به مشکل سیستمی
  async getSystemErrorUsers(broadcastId?: number) {
    const where: Prisma.BroadcastDeliveryLogWhereInput = {
      finalStatus: 'FAILED',
      errorCategory: { in: ['INVALID_CHAT_ID', 'CHAT_NOT_FOUND', 'DATABASE_ERROR', 'PROGRAMMING_ERROR'] },
    };
    if (broadcastId) where.broadcastId = broadcastId;

    const logs = await prisma.broadcastDeliveryLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const enriched = [];
    for (const log of logs) {
      const user = await prisma.user.findUnique({ where: { id: log.userId } });
      enriched.push({
        deliveryLogId: log.id,
        userId: log.userId,
        telegramUserId: log.telegramUserId.toString(),
        chatId: log.chatId,
        username: log.username ?? user?.username ?? null,
        firstName: user?.firstName ?? null,
        errorCategory: log.errorCategory,
        errorMessage: log.errorMessage,
        httpStatusCode: log.httpStatusCode,
        telegramErrorCode: log.telegramErrorCode,
      });
    }

    return enriched;
  },

  // Helper: تشخیص دسته خطا
  getErrorCategory(errorMessage: string | null, httpStatusCode: number | null): string {
    const msg = (errorMessage || '').toLowerCase();
    if (msg.includes('blocked') || msg.includes('bot was blocked')) return 'USER_BLOCKED';
    if (msg.includes('deactivated') || msg.includes('user is deactivated')) return 'USER_DEACTIVATED';
    if (msg.includes('forbidden') || msg.includes('not a member')) return 'NO_CHAT_ACCESS';
    if (msg.includes('chat not found') || msg.includes('user not found')) return 'CHAT_NOT_FOUND';
    if (msg.includes('invalid chat id') || (msg.includes('bad request') && msg.includes('chat'))) return 'INVALID_CHAT_ID';
    if (msg.includes('retry after') || msg.includes('too many requests') || httpStatusCode === 429) return 'RATE_LIMITED';
    if (msg.includes('timeout') || msg.includes('network') || msg.includes('econnrefused')) return 'NETWORK_ERROR';
    if (msg.includes('database') || msg.includes('prisma') || msg.includes('unique constraint')) return 'DATABASE_ERROR';
    if (msg.includes('typeerror') || msg.includes('referenceerror') || msg.includes('cannot read')) return 'PROGRAMMING_ERROR';
    if (httpStatusCode === 403) return 'USER_BLOCKED';
    if (httpStatusCode === 404) return 'CHAT_NOT_FOUND';
    if (httpStatusCode === 400) return 'INVALID_CHAT_ID';
    if (httpStatusCode && httpStatusCode >= 500) return 'NETWORK_ERROR';
    return 'UNKNOWN_ERROR';
  },
};

export { ROOT_CAUSES };
