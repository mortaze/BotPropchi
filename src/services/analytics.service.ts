import { BroadcastLogStatus, RequiredChannelStatus, RequiredChannelType } from '@prisma/client';
import { prisma } from '../prisma/client';
import { logger } from '../utils/logger';
import { redisClient } from '../utils/redis';

const CACHE_TTL = 300;
const CACHE_PREFIX = 'analytics:';

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const startOfDay = (date?: Date) => { const d = date ? new Date(date) : new Date(); d.setHours(0, 0, 0, 0); return d; };
const endOfDay = (date?: Date) => { const d = date ? new Date(date) : new Date(); d.setHours(23, 59, 59, 999); return d; };
const dayKey = (date: Date) => date.toISOString().slice(0, 10);

function fillDaily(rows: Array<{ createdAt: Date; _count: { id?: number; _all?: number } }>, days = 30) {
  const map = new Map<string, number>();
  rows.forEach((row) => map.set(dayKey(row.createdAt), (map.get(dayKey(row.createdAt)) ?? 0) + (row._count.id ?? row._count._all ?? 0)));
  return Array.from({ length: days }, (_, index) => {
    const date = dayKey(daysAgo(days - index - 1));
    return { date, count: map.get(date) ?? 0 };
  });
}

function dateRange(start: string, end: string): string[] {
  const days: string[] = [];
  const cursor = new Date(start + 'T00:00:00Z');
  const endDate = new Date(end + 'T00:00:00Z');
  while (cursor <= endDate) {
    days.push(dayKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function rollingUniqueUsers(dayIdx: number, days: string[], userSetsByDay: Map<string, Set<number>>, window: number): number {
  const combined = new Set<number>();
  for (let j = Math.max(0, dayIdx - window + 1); j <= dayIdx; j++) {
    const daySet = userSetsByDay.get(days[j]);
    if (daySet) daySet.forEach((id) => combined.add(id));
  }
  return combined.size;
}

function safeNumber(val: unknown, fallback = 0): number {
  if (typeof val === 'bigint') return Number(val);
  if (typeof val === 'number') return val;
  return fallback;
}

export const analyticsService = {
  async userAnalytics(params: { startDate: string; endDate: string; compareStart?: string; compareEnd?: string }) {
    const cacheKey = `${CACHE_PREFIX}users:${params.startDate}:${params.endDate}:${params.compareStart || ''}:${params.compareEnd || ''}`;
    const cached = await redisClient.get<ReturnType<typeof analyticsService.userAnalytics>>(cacheKey);
    if (cached) return cached;

    try {
      const start = startOfDay(new Date(params.startDate));
      const end = endOfDay(new Date(params.endDate));
      const periodDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;

      let compareActiveSets: Map<string, Set<number>> | null = null;
      let compareNewUsersByDay: Map<string, number> | null = null;
      let compareDays: string[] | null = null;
      if (params.compareStart && params.compareEnd) {
        const cStart = startOfDay(new Date(params.compareStart));
        const cEnd = endOfDay(new Date(params.compareEnd));
        compareNewUsersByDay = await dailyNewUsers(cStart, cEnd);
        compareActiveSets = await dailyActiveUserSets(cStart, cEnd);
        compareDays = dateRange(params.compareStart, params.compareEnd);
      }

      const newUsersByDay = await dailyNewUsers(start, end);
      const activeSetsByDay = await dailyActiveUserSets(start, end);
      const days = dateRange(params.startDate, params.endDate);

      const now = new Date();
      const todayStart = startOfDay(now);
      const todayEnd = endOfDay(now);
      const weekAgoStart = startOfDay(daysAgo(6));
      const monthAgoStart = startOfDay(daysAgo(29));
      const sixtyDaysAgoStart = startOfDay(daysAgo(59));

      const [
        totalUsers,
        currentBlocked,
        blockedBotsCount,
        realUsersCount,
        dauTodayCount,
        wauCount,
        mauCount,
        inactive30,
        inactive60,
        inactive90,
      ] = await Promise.all([
        prisma.user.count().catch(() => 0),
        prisma.user.count({ where: { isBlocked: true } }).catch(() => 0),
        prisma.user.count({ where: { isBlocked: true, username: null } }).catch(() => 0),
        prisma.user.count({
          where: {
            updatedAt: { gte: sixtyDaysAgoStart },
            isBlocked: false,
          },
        }).catch(() => 0),
        prisma.pointLog.findMany({
          where: { createdAt: { gte: todayStart, lte: todayEnd } },
          select: { userId: true },
          distinct: ['userId'],
        }).then((r) => r.length).catch(() => 0),
        prisma.pointLog.findMany({
          where: { createdAt: { gte: weekAgoStart } },
          select: { userId: true },
          distinct: ['userId'],
        }).then((r) => r.length).catch(() => 0),
        prisma.pointLog.findMany({
          where: { createdAt: { gte: monthAgoStart } },
          select: { userId: true },
          distinct: ['userId'],
        }).then((r) => r.length).catch(() => 0),
        prisma.user.count({ where: { updatedAt: { lt: monthAgoStart } } }).catch(() => 0),
        prisma.user.count({ where: { updatedAt: { lt: sixtyDaysAgoStart } } }).catch(() => 0),
        prisma.user.count({ where: { updatedAt: { lt: startOfDay(daysAgo(89)) } } }).catch(() => 0),
      ]);

      const series: Array<{
        date: string; realUsers: number; dau: number; wau: number; mau: number;
        newUsers: number; blocked: number; bots: number; growthRate: number | null; healthScore: number;
      }> = [];

      let prevTotalUsers = 0;
      for (let i = 0; i < days.length; i++) {
        const day = days[i];
        const dayActiveSet = activeSetsByDay.get(day);
        const dayActiveCount = dayActiveSet?.size ?? 0;
        const dayWau = rollingUniqueUsers(i, days, activeSetsByDay, 7);
        const dayMau = rollingUniqueUsers(i, days, activeSetsByDay, 30);
        const dayNew = newUsersByDay.get(day) ?? 0;
        const dayRealUsers = i >= 59
          ? rollingUniqueUsers(i, days, activeSetsByDay, 60)
          : rollingUniqueUsers(i, days, activeSetsByDay, i + 1);

        let growthRate: number | null = null;
        if (prevTotalUsers > 0) {
          growthRate = Math.round(((dayNew) / prevTotalUsers) * 10000) / 100;
        }
        prevTotalUsers += dayNew;

        const blockRate = totalUsers > 0 ? (currentBlocked / totalUsers) * 100 : 0;
        const retention = totalUsers > 0 ? (dayMau / totalUsers) * 100 : 0;
        const healthScore = Math.round(
          Math.max(0, Math.min(100,
            (dayRealUsers / Math.max(totalUsers, 1)) * 30 +
            (retention / 100) * 30 +
            Math.max(0, 100 - blockRate) * 0.25 +
            (dayNew > 0 ? 15 : 0)
          ))
        );

        series.push({
          date: day,
          realUsers: dayRealUsers,
          dau: dayActiveCount,
          wau: dayWau,
          mau: dayMau,
          newUsers: dayNew,
          blocked: currentBlocked,
          bots: blockedBotsCount,
          growthRate,
          healthScore,
        });
      }

      let compareSummary: any = null;
      if (compareDays && compareActiveSets) {
        let compareTotalNew = 0;
        let compareTotalDau = 0;
        for (const day of compareDays) {
          compareTotalNew += compareNewUsersByDay?.get(day) ?? 0;
          compareTotalDau += compareActiveSets.get(day)?.size ?? 0;
        }
        compareSummary = { totalNewUsers: compareTotalNew, totalDAU: compareTotalDau };
      }

      const periodTotalNew = Array.from(newUsersByDay.values()).reduce((a, b) => a + b, 0);
      const periodTotalDau = Array.from(activeSetsByDay.values()).reduce((a, b) => a + b.size, 0);

      const result = {
        kpis: {
          totalUsers,
          realUsers: realUsersCount,
          dau: dauTodayCount,
          wau: wauCount,
          mau: mauCount,
          newUsers: periodTotalNew,
          blocked: currentBlocked,
          bots: blockedBotsCount,
          inactive30,
          inactive60,
          inactive90,
          growthRate: prevTotalUsers > 0 ? Math.round((periodTotalNew / prevTotalUsers) * 10000) / 100 : 0,
          healthScore: Math.round(
            (realUsersCount / Math.max(totalUsers, 1)) * 30 +
            (mauCount / Math.max(totalUsers, 1)) * 30 +
            Math.max(0, 100 - (totalUsers > 0 ? (currentBlocked / totalUsers) * 100 : 0)) * 0.25 +
            (periodTotalNew > 0 ? 15 : 0)
          ),
        },
        compareSummary,
        series,
        days,
      };

      await redisClient.set(cacheKey, result, CACHE_TTL).catch(() => {});
      return result;
    } catch (error) {
      logger.error('[Analytics] userAnalytics error:', error);
      return {
        kpis: {
          totalUsers: 0, realUsers: 0, dau: 0, wau: 0, mau: 0,
          newUsers: 0, blocked: 0, bots: 0,
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
      const today = startOfDay();
      const week = daysAgo(7);
      const month = daysAgo(30);
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

      const [
        dailyUsers,
        dailyReferrals,
      ] = await Promise.all([
        prisma.user.groupBy({ by: ['createdAt'], where: { createdAt: { gte: daysAgo(30) } }, _count: { id: true }, orderBy: { createdAt: 'asc' } }).catch(() => []),
        prisma.referral.groupBy({ by: ['createdAt'], where: { createdAt: { gte: daysAgo(30) } }, _count: { id: true }, orderBy: { createdAt: 'asc' } }).catch(() => []),
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
        charts: { dailyUsers: fillDaily(dailyUsers), dailyReferrals: fillDaily(dailyReferrals), dailyDiscountClicks: [], dailyLotteryEntries: [] },
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

async function dailyNewUsers(startDate: Date, endDate: Date): Promise<Map<string, number>> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ day: string; count: bigint }>>(
      `SELECT DATE(created_at)::text AS day, COUNT(*)::bigint AS count FROM users WHERE created_at >= $1 AND created_at <= $2 GROUP BY DATE(created_at) ORDER BY day`,
      startDate, endDate,
    );
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.day, safeNumber(r.count));
    return map;
  } catch (error) {
    logger.error('[Analytics] dailyNewUsers error:', error);
    return new Map();
  }
}

async function dailyActiveUserSets(startDate: Date, endDate: Date): Promise<Map<string, Set<number>>> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ day: string; user_id: number }>>(
      `SELECT DATE(created_at)::text AS day, user_id FROM point_logs WHERE created_at >= $1 AND created_at <= $2 GROUP BY DATE(created_at), user_id ORDER BY day`,
      startDate, endDate,
    );
    const map = new Map<string, Set<number>>();
    for (const r of rows) {
      if (!map.has(r.day)) map.set(r.day, new Set());
      map.get(r.day)!.add(Number(r.user_id));
    }
    return map;
  } catch (error) {
    logger.error('[Analytics] dailyActiveUserSets error:', error);
    return new Map();
  }
}

async function dailyActiveUserCounts(startDate: Date, endDate: Date): Promise<Map<string, number>> {
  const sets = await dailyActiveUserSets(startDate, endDate);
  const counts = new Map<string, number>();
  sets.forEach((s, k) => counts.set(k, s.size));
  return counts;
}
