// src/services/system-integrity.service.ts
// سرویس گزارش سلامت سیستم — crash-safe, no null queries on non-nullable fields

import { prisma } from '../prisma/client';
import { logger } from '../utils/logger';

interface HealthIssue {
  severity: string;
  message: string;
  count: number;
  sampleUsers?: Array<{ userId: number; telegramId: string; field: string; value: string; reason: string }>;
}

interface HealthSection {
  name: string;
  score: number;
  maxScore: number;
  issues: HealthIssue[];
}

interface SystemHealthReport {
  overallScore: number;
  sections: HealthSection[];
  timestamp: string;
}

interface DebugReport {
  schemaChecks: Array<{ field: string; nullable: boolean; required: boolean; indexed: boolean }>;
  dateChecks: Array<{ field: string; futureCount: number; epochCount: number; samples: any[] }>;
  userChecks: Array<{ check: string; passed: boolean; count: number; details: string }>;
  errors: Array<{ section: string; error: string }>;
}

// ─── Schema Field Info ──────────────────────────────────────
const SCHEMA_FIELDS = [
  { field: 'User.id', nullable: false, required: true, indexed: true },
  { field: 'User.telegramId', nullable: false, required: true, indexed: true },
  { field: 'User.firstName', nullable: false, required: true, indexed: false },
  { field: 'User.createdAt', nullable: false, required: true, indexed: false },
  { field: 'User.updatedAt', nullable: false, required: true, indexed: false },
  { field: 'User.lastActivityAt', nullable: true, required: false, indexed: true },
  { field: 'User.firstActivityAt', nullable: true, required: false, indexed: false },
  { field: 'User.startCount', nullable: false, required: false, indexed: false },
  { field: 'User.activitiesCount', nullable: false, required: false, indexed: false },
  { field: 'User.messagesSentCount', nullable: false, required: false, indexed: false },
  { field: 'UserAttribution.startedAt', nullable: true, required: false, indexed: true },
  { field: 'UserAttribution.firstActivityAt', nullable: true, required: false, indexed: false },
  { field: 'UserAttribution.lastActivityAt', nullable: true, required: false, indexed: false },
  { field: 'UserAttribution.confidenceScore', nullable: false, required: false, indexed: true },
  { field: 'BroadcastDeliveryLog.chatId', nullable: true, required: false, indexed: false },
  { field: 'BroadcastDeliveryLog.attemptedAt', nullable: true, required: false, indexed: false },
];

// ─── Safe Query Wrapper ─────────────────────────────────────
async function safeQuery<T>(fn: () => Promise<T>, fallback: T, section: string, errors: DebugReport['errors']): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    errors.push({ section, error: err.message || String(err) });
    return fallback;
  }
}

function isFutureDate(date: Date | null): boolean {
  if (!date) return false;
  const now = new Date();
  now.setHours(now.getHours() + 1);
  return date > now;
}

function isEpochDate(date: Date | null): boolean {
  if (!date) return false;
  return date.getFullYear() <= 1971;
}

function dateToJalaliString(date: Date | null): string {
  if (!date) return 'null';
  try {
    return date.toISOString();
  } catch {
    return 'invalid';
  }
}

// ─── Main Service ───────────────────────────────────────────
export const systemIntegrityService = {
  async getHealthReport(): Promise<SystemHealthReport> {
    const errors: DebugReport['errors'] = [];
    const sections: HealthSection[] = [];

    sections.push(await safeQuery(() => this.checkDateIntegrity(errors), { name: 'سلامت تاریخ‌ها', score: 100, maxScore: 100, issues: [] }, 'date', errors));
    sections.push(await safeQuery(() => this.checkUserIdentityIntegrity(errors), { name: 'سلامت هویت', score: 100, maxScore: 100, issues: [] }, 'identity', errors));
    sections.push(await safeQuery(() => this.checkAttributionIntegrity(errors), { name: 'سلامت Attribution', score: 100, maxScore: 100, issues: [] }, 'attribution', errors));
    sections.push(await safeQuery(() => this.checkActivityIntegrity(errors), { name: 'سلامت فعالیت‌ها', score: 100, maxScore: 100, issues: [] }, 'activity', errors));
    sections.push(await safeQuery(() => this.checkBroadcastIntegrity(errors), { name: 'سلامت Broadcast', score: 100, maxScore: 100, issues: [] }, 'broadcast', errors));

    const totalScore = sections.reduce((a, s) => a + s.score, 0);
    const maxScore = sections.reduce((a, s) => a + s.maxScore, 0);
    const overallScore = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 100;

    return { overallScore, sections, timestamp: new Date().toISOString() };
  },

  async checkDateIntegrity(errors: DebugReport['errors']): Promise<HealthSection> {
    const issues: HealthIssue[] = [];
    let score = 100;

    // createdAt is REQUIRED — cannot be null. Check for future/impossible dates instead.
    const futureCreatedAt = await safeQuery(
      () => prisma.user.count({ where: { createdAt: { gt: new Date(Date.now() + 86400000) } } }),
      0, 'date.futureCreatedAt', errors
    );
    if (futureCreatedAt > 0) {
      issues.push({ severity: 'HIGH', message: 'کاربران با تاریخ آینده', count: futureCreatedAt });
      score -= 20;
    }

    // Check for epoch dates (corrupted)
    const epochCreatedAt = await safeQuery(
      () => prisma.user.count({ where: { createdAt: { lte: new Date('1971-01-01') } } }),
      0, 'date.epochCreatedAt', errors
    );
    if (epochCreatedAt > 0) {
      issues.push({ severity: 'HIGH', message: 'کاربران با تاریخ نامعتبر (قبل ۱۹۷۱)', count: epochCreatedAt });
      score -= 20;
    }

    // Check attributions with null startedAt (nullable field — this IS valid)
    const nullStartedAt = await safeQuery(
      () => prisma.userAttribution.count({ where: { startedAt: null } }),
      0, 'date.nullStartedAt', errors
    );
    if (nullStartedAt > 0) {
      issues.push({ severity: 'MEDIUM', message: 'Attribution با startedAt خالی', count: nullStartedAt });
      score -= 10;
    }

    return { name: 'سلامت تاریخ‌ها', score: Math.max(0, score), maxScore: 100, issues };
  },

  async checkUserIdentityIntegrity(errors: DebugReport['errors']): Promise<HealthSection> {
    const issues: HealthIssue[] = [];
    let score = 100;

    // telegramId is REQUIRED BigInt @unique — check for zero
    const zeroTelegramId = await safeQuery(
      () => prisma.user.count({ where: { telegramId: BigInt(0) } }),
      0, 'identity.zeroTelegramId', errors
    );
    if (zeroTelegramId > 0) {
      issues.push({ severity: 'CRITICAL', message: 'کاربران با telegramId صفر', count: zeroTelegramId });
      score -= 30;
    }

    // Duplicate telegramIds
    const duplicates = await safeQuery(
      () => prisma.$queryRawUnsafe<Array<{ telegramId: bigint; count: bigint }>>(
        `SELECT "telegramId", COUNT(*)::bigint AS count FROM "users" GROUP BY "telegramId" HAVING COUNT(*) > 1`
      ),
      [], 'identity.duplicates', errors
    );
    if (duplicates.length > 0) {
      issues.push({ severity: 'CRITICAL', message: 'TelegramId تکراری', count: duplicates.length });
      score -= 30;
    }

    // Empty firstName (REQUIRED field)
    const emptyFirstName = await safeQuery(
      () => prisma.user.count({ where: { firstName: '' } }),
      0, 'identity.emptyFirstName', errors
    );
    if (emptyFirstName > 0) {
      issues.push({ severity: 'LOW', message: 'کاربران با firstName خالی', count: emptyFirstName });
      score -= 10;
    }

    return { name: 'سلامت هویت', score: Math.max(0, score), maxScore: 100, issues };
  },

  async checkAttributionIntegrity(errors: DebugReport['errors']): Promise<HealthSection> {
    const issues: HealthIssue[] = [];
    let score = 100;

    // Users without attribution (relation check — safe)
    const usersWithoutAttribution = await safeQuery(
      () => prisma.user.count({ where: { attribution: null } }),
      0, 'attribution.missing', errors
    );
    if (usersWithoutAttribution > 0) {
      issues.push({ severity: 'MEDIUM', message: 'کاربران بدون Attribution', count: usersWithoutAttribution });
      score -= 15;
    }

    // Low confidence
    const lowConfidence = await safeQuery(
      () => prisma.userAttribution.count({ where: { confidenceScore: { lt: 50 } } }),
      0, 'attribution.lowConfidence', errors
    );
    if (lowConfidence > 0) {
      issues.push({ severity: 'LOW', message: 'Attribution با اعتماد کم', count: lowConfidence });
      score -= 10;
    }

    return { name: 'سلامت Attribution', score: Math.max(0, score), maxScore: 100, issues };
  },

  async checkActivityIntegrity(errors: DebugReport['errors']): Promise<HealthSection> {
    const issues: HealthIssue[] = [];
    let score = 100;

    // starts > activities (logically impossible)
    const inconsistent = await safeQuery(
      () => prisma.$queryRawUnsafe<Array<{ userId: number; starts: number; activities: number }>>(
        `SELECT u.id AS "userId", u."startCount" AS starts, u."activitiesCount" AS activities
         FROM users u
         WHERE u."startCount" > 0 AND u."activitiesCount" < u."startCount"`
      ),
      [], 'activity.inconsistent', errors
    );
    if (inconsistent.length > 0) {
      issues.push({ severity: 'HIGH', message: 'شروع‌ها بیشتر از فعالیت‌ها', count: inconsistent.length });
      score -= 25;
    }

    // Many starts, zero activities
    const zeroActivities = await safeQuery(
      () => prisma.user.count({ where: { startCount: { gt: 3 }, activitiesCount: 0 } }),
      0, 'activity.zeroActivities', errors
    );
    if (zeroActivities > 0) {
      issues.push({ severity: 'HIGH', message: 'شروع‌های زیاد بدون فعالیت', count: zeroActivities });
      score -= 25;
    }

    return { name: 'سلامت فعالیت‌ها', score: Math.max(0, score), maxScore: 100, issues };
  },

  async checkBroadcastIntegrity(errors: DebugReport['errors']): Promise<HealthSection> {
    const issues: HealthIssue[] = [];
    let score = 100;

    // chatId is nullable String? — null IS valid for this field
    const nullChatId = await safeQuery(
      () => prisma.broadcastDeliveryLog.count({ where: { chatId: null } }),
      0, 'broadcast.nullChatId', errors
    );
    if (nullChatId > 0) {
      issues.push({ severity: 'MEDIUM', message: 'Delivery logs با chatId خالی', count: nullChatId });
      score -= 15;
    }

    // System errors
    const systemErrors = await safeQuery(
      () => prisma.broadcastDeliveryLog.count({
        where: { finalStatus: 'FAILED', errorCategory: { in: ['DATABASE_ERROR', 'PROGRAMMING_ERROR'] } },
      }),
      0, 'broadcast.systemErrors', errors
    );
    if (systemErrors > 0) {
      issues.push({ severity: 'CRITICAL', message: 'خطاهای سیستمی در ارسال', count: systemErrors });
      score -= 30;
    }

    return { name: 'سلامت Broadcast', score: Math.max(0, score), maxScore: 100, issues };
  },

  async getDebugReport(): Promise<DebugReport> {
    const errors: DebugReport['errors'] = [];
    const dateChecks: DebugReport['dateChecks'] = [];
    const userChecks: DebugReport['userChecks'] = [];

    // Date checks
    const futureUsers = await safeQuery(
      () => prisma.user.findMany({ where: { createdAt: { gt: new Date(Date.now() + 86400000) } }, select: { id: true, telegramId: true, createdAt: true }, take: 5 }),
      [], 'debug.futureUsers', errors
    );
    dateChecks.push({
      field: 'User.createdAt (آینده)',
      futureCount: futureUsers.length,
      epochCount: 0,
      samples: futureUsers.map(u => ({ userId: u.id, telegramId: u.telegramId.toString(), value: dateToJalaliString(u.createdAt) })),
    });

    const epochUsers = await safeQuery(
      () => prisma.user.findMany({ where: { createdAt: { lte: new Date('1971-01-01') } }, select: { id: true, telegramId: true, createdAt: true }, take: 5 }),
      [], 'debug.epochUsers', errors
    );
    dateChecks.push({
      field: 'User.createdAt (epoch)',
      futureCount: 0,
      epochCount: epochUsers.length,
      samples: epochUsers.map(u => ({ userId: u.id, telegramId: u.telegramId.toString(), value: dateToJalaliString(u.createdAt) })),
    });

    // User checks
    const zeroTid = await safeQuery(() => prisma.user.count({ where: { telegramId: BigInt(0) } }), 0, 'debug.zeroTid', errors);
    userChecks.push({ check: 'telegramId صفر', passed: zeroTid === 0, count: zeroTid, details: `${zeroTid} کاربر` });

    const emptyName = await safeQuery(() => prisma.user.count({ where: { firstName: '' } }), 0, 'debug.emptyName', errors);
    userChecks.push({ check: 'firstName خالی', passed: emptyName === 0, count: emptyName, details: `${emptyName} کاربر` });

    const noAttribution = await safeQuery(() => prisma.user.count({ where: { attribution: null } }), 0, 'debug.noAttribution', errors);
    userChecks.push({ check: 'بدون Attribution', passed: noAttribution === 0, count: noAttribution, details: `${noAttribution} کاربر` });

    const inconsistent = await safeQuery(
      () => prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*)::bigint AS count FROM users WHERE "startCount" > 0 AND "activitiesCount" < "startCount"`
      ),
      [{ count: BigInt(0) }], 'debug.inconsistent', errors
    );
    userChecks.push({ check: 'شروع > فعالیت', passed: Number(inconsistent[0]?.count ?? 0) === 0, count: Number(inconsistent[0]?.count ?? 0), details: `${Number(inconsistent[0]?.count ?? 0)} کاربر` });

    return { schemaChecks: SCHEMA_FIELDS, dateChecks, userChecks, errors };
  },
};
