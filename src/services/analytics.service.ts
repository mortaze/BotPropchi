import { BroadcastLogStatus, RequiredChannelStatus, RequiredChannelType } from '@prisma/client';
import { prisma } from '../prisma/client';
import { logger } from '../utils/logger';
import { redisClient } from '../utils/redis';

const CACHE_TTL = 300;
const CACHE_PREFIX = 'analytics:';

// ─── UTC-safe Date Helpers ──────────────────────────────────
function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utcStartOfDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function utcEndOfDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

function utcDaysAgo(n: number): Date {
  return new Date(Date.now() - n * 86400000);
}

function utcDateRange(startStr: string, endStr: string): string[] {
  const days: string[] = [];
  const cursor = new Date(startStr + 'T00:00:00.000Z');
  const end = new Date(endStr + 'T00:00:00.000Z');
  while (cursor <= end) {
    days.push(utcDayKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

// ─── Helpers ────────────────────────────────────────────────
function safeNumber(val: unknown, fallback = 0): number {
  if (typeof val === 'bigint') return Number(val);
  if (typeof val === 'number') return val;
  return fallback;
}

function rollingUniqueUsers(dayIdx: number, days: string[], userSetsByDay: Map<string, Set<number>>, window: number): number {
  const combined = new Set<number>();
  for (let j = Math.max(0, dayIdx - window + 1); j <= dayIdx; j++) {
    const daySet = userSetsByDay.get(days[j]);
    if (daySet) daySet.forEach((id) => combined.add(id));
  }
  return combined.size;
}

// ─── Raw SQL Queries ────────────────────────────────────────
async function dailyNewUsers(startDate: Date, endDate: Date): Promise<Map<string, number>> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ day: string; count: bigint }>>(
      `SELECT DATE(created_at AT TIME ZONE 'UTC')::text AS day, COUNT(*)::bigint AS count
       FROM users
       WHERE created_at >= $1 AND created_at <= $2
       GROUP BY DATE(created_at AT TIME ZONE 'UTC')
       ORDER BY day`,
      startDate, endDate,
    );
    const map = new Map<string, number>();
    for (const r of rows) {
      const key = typeof r.day === 'string' ? r.day.slice(0, 10) : String(r.day);
      map.set(key, safeNumber(r.count));
    }
    return map;
  } catch (error) {
    logger.error('[Analytics] dailyNewUsers error:', error);
    return new Map();
  }
}

async function dailyActiveUserSets(startDate: Date, endDate: Date): Promise<Map<string, Set<number>>> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ day: string; user_id: number }>>(
      `SELECT DATE(created_at AT TIME ZONE 'UTC')::text AS day, user_id
       FROM point_logs
       WHERE created_at >= $1 AND created_at <= $2
       GROUP BY DATE(created_at AT TIME ZONE 'UTC'), user_id
       ORDER BY day`,
      startDate, endDate,
    );
    const map = new Map<string, Set<number>>();
    for (const r of rows) {
      const key = typeof r.day === 'string' ? r.day.slice(0, 10) : String(r.day);
      if (!map.has(key)) map.set(key, new Set());
      map.get(key)!.add(Number(r.user_id));
    }
    return map;
  } catch (error) {
    logger.error('[Analytics] dailyActiveUserSets error:', error);
    return new Map();
  }
}

// ─── Main Service ───────────────────────────────────────────
export const analyticsService = {
  async userAnalytics(params: {
    startDate: string;
    endDate: string;
    compareStart?: string;
    compareEnd?: string;
  }) {
    const cacheKey = `${CACHE_PREFIX}users:${params.startDate}:${params.endDate}:${params.compareStart || ''}:${params.compareEnd || ''}`;
    const cached = await redisClient.get<any>(cacheKey);
    if (cached) return cached;

    try {
      const start = utcStartOfDay(new Date(params.startDate + 'T12:00:00.000Z'));
      const end = utcEndOfDay(new Date(params.endDate + 'T12:00:00.000Z'));
      const days = utcDateRange(params.startDate, params.endDate);

      // Compare period
      let compareNewUsersByDay: Map<string, number> | null = null;
      let compareActiveSets: Map<string, Set<number>> | null = null;
      let compareDays: string[] | null = null;
      if (params.compareStart && params.compareEnd) {
        const cStart = utcStartOfDay(new Date(params.compareStart + 'T12:00:00.000Z'));
        const cEnd = utcEndOfDay(new Date(params.compareEnd + 'T12:00:00.000Z'));
        compareNewUsersByDay = await dailyNewUsers(cStart, cEnd);
        compareActiveSets = await dailyActiveUserSets(cStart, cEnd);
        compareDays = utcDateRange(params.compareStart, params.compareEnd);
      }

      // Current period data
      const newUsersByDay = await dailyNewUsers(start, end);
      const activeSetsByDay = await dailyActiveUserSets(start, end);

      // Current aggregates
      const now = new Date();
      const sixtyDaysAgo = utcStartOfDay(utcDaysAgo(59));
      const monthAgo = utcStartOfDay(utcDaysAgo(29));

      const [
        totalUsers,
        currentBlocked,
        realUsersCount,
        newUsersInPeriod,
        inactive30,
        inactive60,
        inactive90,
      ] = await Promise.all([
        prisma.user.count().catch(() => 0),
        prisma.user.count({ where: { isBlocked: true } }).catch(() => 0),
        prisma.user.count({
          where: { updatedAt: { gte: sixtyDaysAgo }, isBlocked: false },
        }).catch(() => 0),
        prisma.user.count({
          where: { createdAt: { gte: start, lte: end } },
        }).catch(() => 0),
        prisma.user.count({
          where: { updatedAt: { lt: monthAgo } },
        }).catch(() => 0),
        prisma.user.count({
          where: { updatedAt: { lt: utcStartOfDay(utcDaysAgo(59)) } },
        }).catch(() => 0),
        prisma.user.count({
          where: { updatedAt: { lt: utcStartOfDay(utcDaysAgo(89)) } },
        }).catch(() => 0),
      ]);

      // Compare period totals
      let compareTotalNew = 0;
      let prevTotalUsers = 0;
      if (compareDays && compareNewUsersByDay) {
        for (const day of compareDays) {
          compareTotalNew += compareNewUsersByDay.get(day) ?? 0;
        }
        prevTotalUsers = totalUsers - compareTotalNew;
      }

      // Build series
      const series: Array<{
        date: string;
        realUsers: number;
        newUsers: number;
        blocked: number;
        growthRate: number | null;
        healthScore: number;
      }> = [];

      let cumulativeNew = 0;
      for (let i = 0; i < days.length; i++) {
        const day = days[i];
        const dayNew = newUsersByDay.get(day) ?? 0;
        cumulativeNew += dayNew;

        const dayRealUsers = rollingUniqueUsers(i, days, activeSetsByDay, Math.min(i + 1, 60));

        // Growth rate: compare daily new users with previous period's daily average
        let growthRate: number | null = null;
        if (compareDays && compareDays.length > 0) {
          const prevDailyAvg = compareTotalNew / compareDays.length;
          if (prevDailyAvg > 0) {
            growthRate = Math.round(((dayNew - prevDailyAvg) / prevDailyAvg) * 10000) / 100;
          }
        } else if (i > 0) {
          const prevDayNew = newUsersByDay.get(days[i - 1]) ?? 0;
          if (prevDayNew > 0) {
            growthRate = Math.round(((dayNew - prevDayNew) / prevDayNew) * 10000) / 100;
          }
        }

        // Health score: real indicators
        const realUserRatio = totalUsers > 0 ? dayRealUsers / totalUsers : 0;
        const blockRatio = totalUsers > 0 ? currentBlocked / totalUsers : 0;
        const newGrowth = dayNew > 0 ? Math.min(dayNew / Math.max(totalUsers, 1), 1) : 0;
        const healthScore = Math.round(
          Math.max(0, Math.min(100,
            realUserRatio * 40 +
            Math.max(0, 1 - blockRatio) * 30 +
            newGrowth * 30
          ))
        );

        series.push({
          date: day,
          realUsers: dayRealUsers,
          newUsers: dayNew,
          blocked: currentBlocked,
          growthRate,
          healthScore,
        });
      }

      // Period growth rate (compare with previous period)
      let periodGrowthRate = 0;
      if (prevTotalUsers > 0) {
        periodGrowthRate = Math.round((newUsersInPeriod / prevTotalUsers) * 10000) / 100;
      }

      const result = {
        kpis: {
          totalUsers,
          realUsers: realUsersCount,
          newUsers: newUsersInPeriod,
          blocked: currentBlocked,
          inactive30,
          inactive60,
          inactive90,
          growthRate: periodGrowthRate,
          healthScore: Math.round(
            (realUsersCount / Math.max(totalUsers, 1)) * 40 +
            Math.max(0, 1 - (totalUsers > 0 ? currentBlocked / totalUsers : 0)) * 30 +
            (newUsersInPeriod > 0 ? Math.min(newUsersInPeriod / Math.max(totalUsers, 1), 1) * 30 : 0)
          ),
        },
        compareSummary: compareDays ? {
          totalNewUsers: compareTotalNew,
          prevTotalUsers,
        } : null,
        series,
        days,
      };

      await redisClient.set(cacheKey, result, CACHE_TTL).catch(() => {});
      return result;
    } catch (error) {
      logger.error('[Analytics] userAnalytics error:', error);
      return {
        kpis: {
          totalUsers: 0, realUsers: 0, newUsers: 0, blocked: 0,
          inactive30: 0, inactive60: 0, inactive90: 0,
          growthRate: 0, healthScore: 0,
        },
        compareSummary: null,
        series: [],
        days: [],
      };
    }
  },

  async dashboard() {
    const cacheKey = `${CACHE_PREFIX}dashboard`;
    const cached = await redisClient.get<any>(cacheKey);
    if (cached) return cached;

    try {
      const today = utcStartOfDay(new Date());
      const week = utcDaysAgo(7);
      const month = utcDaysAgo(30);
      const [
        totalUsers, activeToday, activeWeek, activeMonth, newUsers,
        totalInvites, verifiedInvites,
        forceChannels, forceGroups, verifiedMemberships,
        lotteryCount, lotteryParticipants,
        broadcastCount, broadcastSuccess, broadcastFailed,
        approvedGroups, activeGroups,
      ] = await Promise.all([
        prisma.user.count().catch(() => 0),
        prisma.pointLog.count({ where: { createdAt: { gte: today } } }).catch(() => 0),
        prisma.pointLog.count({ where: { createdAt: { gte: week } } }).catch(() => 0),
        prisma.pointLog.count({ where: { createdAt: { gte: month } } }).catch(() => 0),
        prisma.user.count({ where: { createdAt: { gte: month } } }).catch(() => 0),
        prisma.referral.count().catch(() => 0),
        prisma.referral.count({ where: { membershipVerificationStatus: 'VERIFIED' } }).catch(() => 0),
        prisma.requiredChannel.count({ where: { type: RequiredChannelType.CHANNEL, status: RequiredChannelStatus.APPROVED, isActive: true } }).catch(() => 0),
        prisma.requiredChannel.count({ where: { type: RequiredChannelType.GROUP, status: RequiredChannelStatus.APPROVED, isActive: true } }).catch(() => 0),
        prisma.userRequiredChannelMembership.count({ where: { verifiedAt: { not: null } } }).catch(() => 0),
        prisma.lottery.count().catch(() => 0),
        prisma.lotteryEntry.count().catch(() => 0),
        prisma.broadcast.count().catch(() => 0),
        prisma.broadcastLog.count({ where: { status: BroadcastLogStatus.SUCCESS } }).catch(() => 0),
        prisma.broadcastLog.count({ where: { status: BroadcastLogStatus.FAILED } }).catch(() => 0),
        prisma.telegramGroup.count({ where: { status: 'APPROVED' } }).catch(() => 0),
        prisma.telegramGroup.count({ where: { status: 'APPROVED', botIsAdmin: true } }).catch(() => 0),
      ]);

      const totalBroadcastLogs = broadcastSuccess + broadcastFailed;
      const result = {
        users: { totalUsers, activeToday, activeWeek, activeMonth, newUsers },
        referrals: {
          totalInvites,
          successful: verifiedInvites,
          failed: totalInvites - verifiedInvites,
          conversionRate: totalInvites ? Math.round((verifiedInvites / totalInvites) * 10000) / 100 : 0,
          topReferrers: [],
        },
        forceJoin: { channels: forceChannels, groups: forceGroups, verifiedUsers: verifiedMemberships },
        discounts: { topClicks: [], topUsage: [], topViewed: [] },
        lotteries: {
          total: lotteryCount,
          participants: lotteryParticipants,
          ticketsSold: 0,
          pointsSpent: 0,
          totalChance: 0,
          topLottery: null,
        },
        broadcasts: { total: broadcastCount, successRate: totalBroadcastLogs ? Math.round((broadcastSuccess / totalBroadcastLogs) * 10000) / 100 : 0, errorRate: totalBroadcastLogs ? Math.round((broadcastFailed / totalBroadcastLogs) * 10000) / 100 : 0, success: broadcastSuccess, failed: broadcastFailed },
        groups: { approved: approvedGroups, active: activeGroups },
        charts: { dailyUsers: [], dailyReferrals: [], dailyDiscountClicks: [], dailyLotteryEntries: [] },
      };

      await redisClient.set(cacheKey, result, CACHE_TTL).catch(() => {});
      return result;
    } catch (error) {
      logger.error('[Analytics] dashboard error:', error);
      return {
        users: { totalUsers: 0, activeToday: 0, activeWeek: 0, activeMonth: 0, newUsers: 0 },
        referrals: { totalInvites: 0, successful: 0, failed: 0, conversionRate: 0, topReferrers: [] },
        forceJoin: { channels: 0, groups: 0, verifiedUsers: 0 },
        discounts: { topClicks: [], topUsage: [], topViewed: [] },
        lotteries: { total: 0, participants: 0, ticketsSold: 0, pointsSpent: 0, totalChance: 0, topLottery: null },
        broadcasts: { total: 0, successRate: 0, errorRate: 0, success: 0, failed: 0 },
        groups: { approved: 0, active: 0 },
        charts: { dailyUsers: [], dailyReferrals: [], dailyDiscountClicks: [], dailyLotteryEntries: [] },
      };
    }
  },

  async invalidateCache() {
    await redisClient.invalidateByPrefix(CACHE_PREFIX).catch(() => {});
    logger.info('[Analytics] Cache invalidated');
  },
};
