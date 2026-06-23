// src/services/system-integrity.service.ts
// سرویس گزارش سلامت سیستم

import { prisma } from '../prisma/client';
import { logger } from '../utils/logger';

interface HealthSection {
  name: string;
  score: number;
  maxScore: number;
  issues: Array<{ severity: string; message: string; count: number }>;
}

interface SystemHealthReport {
  overallScore: number;
  sections: HealthSection[];
  timestamp: string;
}

export const systemIntegrityService = {
  async getHealthReport(): Promise<SystemHealthReport> {
    const sections: HealthSection[] = [];

    // 1. Date Integrity
    sections.push(await this.checkDateIntegrity());

    // 2. User Identity Integrity
    sections.push(await this.checkUserIdentityIntegrity());

    // 3. Attribution Integrity
    sections.push(await this.checkAttributionIntegrity());

    // 4. Activity Integrity
    sections.push(await this.checkActivityIntegrity());

    // 5. Broadcast Integrity
    sections.push(await this.checkBroadcastIntegrity());

    const totalScore = sections.reduce((a, s) => a + s.score, 0);
    const maxScore = sections.reduce((a, s) => a + s.maxScore, 0);
    const overallScore = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 100;

    return {
      overallScore,
      sections,
      timestamp: new Date().toISOString(),
    };
  },

  async checkDateIntegrity(): Promise<HealthSection> {
    const issues: HealthSection['issues'] = [];
    let score = 100;
    let maxScore = 100;

    // Check for users with null createdAt
    const nullCreatedAt = await prisma.user.count({ where: { createdAt: null } as any });
    if (nullCreatedAt > 0) {
      issues.push({ severity: 'HIGH', message: 'کاربران با createdAt خالی', count: nullCreatedAt });
      score -= 20;
    }

    // Check for users with invalid dates
    const invalidDates = await prisma.user.count({
      where: { createdAt: new Date('1970-01-01') } as any,
    });
    if (invalidDates > 0) {
      issues.push({ severity: 'HIGH', message: 'کاربران با تاریخ نامعتبر', count: invalidDates });
      score -= 20;
    }

    // Check for attributions with null dates
    const nullAttributionDates = await prisma.userAttribution.count({
      where: { startedAt: null },
    });
    if (nullAttributionDates > 0) {
      issues.push({ severity: 'MEDIUM', message: 'Attribution با startedAt خالی', count: nullAttributionDates });
      score -= 10;
    }

    return { name: 'سلامت تاریخ‌ها', score: Math.max(0, score), maxScore, issues };
  },

  async checkUserIdentityIntegrity(): Promise<HealthSection> {
    const issues: HealthSection['issues'] = [];
    let score = 100;
    const maxScore = 100;

    // Check for zero telegramId
    const zeroTelegramId = await prisma.user.count({ where: { telegramId: BigInt(0) } });
    if (zeroTelegramId > 0) {
      issues.push({ severity: 'CRITICAL', message: 'کاربران با telegramId صفر', count: zeroTelegramId });
      score -= 30;
    }

    // Check for duplicate telegramIds
    const duplicates = await prisma.$queryRawUnsafe<Array<{ telegramId: bigint; count: bigint }>>(
      `SELECT "telegramId", COUNT(*)::bigint AS count FROM "users" GROUP BY "telegramId" HAVING COUNT(*) > 1`
    );
    if (duplicates.length > 0) {
      issues.push({ severity: 'CRITICAL', message: 'TelegramId تکراری', count: duplicates.length });
      score -= 30;
    }

    // Check for empty firstName
    const emptyFirstName = await prisma.user.count({ where: { firstName: '' } });
    if (emptyFirstName > 0) {
      issues.push({ severity: 'LOW', message: 'کاربران با firstName خالی', count: emptyFirstName });
      score -= 10;
    }

    return { name: 'سلامت هویت کاربران', score: Math.max(0, score), maxScore, issues };
  },

  async checkAttributionIntegrity(): Promise<HealthSection> {
    const issues: HealthSection['issues'] = [];
    let score = 100;
    const maxScore = 100;

    // Check for users without attribution
    const usersWithoutAttribution = await prisma.user.count({
      where: { attribution: null },
    });
    if (usersWithoutAttribution > 0) {
      issues.push({ severity: 'MEDIUM', message: 'کاربران بدون Attribution', count: usersWithoutAttribution });
      score -= 15;
    }

    // Check for low confidence attributions
    const lowConfidence = await prisma.userAttribution.count({ where: { confidenceScore: { lt: 50 } } });
    if (lowConfidence > 0) {
      issues.push({ severity: 'LOW', message: 'Attribution با اعتماد کم', count: lowConfidence });
      score -= 10;
    }

    return { name: 'سلامت Attribution', score: Math.max(0, score), maxScore, issues };
  },

  async checkActivityIntegrity(): Promise<HealthSection> {
    const issues: HealthSection['issues'] = [];
    let score = 100;
    const maxScore = 100;

    // Check for users with starts > activities (logically impossible)
    const inconsistent = await prisma.$queryRawUnsafe<Array<{ userId: number; starts: number; activities: number }>>(
      `SELECT u.id AS "userId", u."startCount" AS starts, u."activitiesCount" AS activities
       FROM users u
       WHERE u."startCount" > 0 AND u."activitiesCount" < u."startCount"`
    );
    if (inconsistent.length > 0) {
      issues.push({ severity: 'HIGH', message: 'شروع‌ها بیشتر از فعالیت‌ها', count: inconsistent.length });
      score -= 25;
    }

    // Check for users with zero activities but many starts
    const zeroActivities = await prisma.user.count({
      where: { startCount: { gt: 3 }, activitiesCount: 0 },
    });
    if (zeroActivities > 0) {
      issues.push({ severity: 'HIGH', message: 'شروع‌های زیاد بدون فعالیت', count: zeroActivities });
      score -= 25;
    }

    return { name: 'سلامت فعالیت‌ها', score: Math.max(0, score), maxScore, issues };
  },

  async checkBroadcastIntegrity(): Promise<HealthSection> {
    const issues: HealthSection['issues'] = [];
    let score = 100;
    const maxScore = 100;

    // Check for delivery logs with null chatId
    const nullChatId = await prisma.broadcastDeliveryLog.count({ where: { chatId: null } });
    if (nullChatId > 0) {
      issues.push({ severity: 'MEDIUM', message: 'Delivery logs با chatId خالی', count: nullChatId });
      score -= 15;
    }

    // Check for system errors
    const systemErrors = await prisma.broadcastDeliveryLog.count({
      where: {
        finalStatus: 'FAILED',
        errorCategory: { in: ['DATABASE_ERROR', 'PROGRAMMING_ERROR'] },
      },
    });
    if (systemErrors > 0) {
      issues.push({ severity: 'CRITICAL', message: 'خطاهای سیستمی در ارسال', count: systemErrors });
      score -= 30;
    }

    return { name: 'سلامت Broadcast', score: Math.max(0, score), maxScore, issues };
  },
};
