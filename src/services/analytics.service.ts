import { BroadcastLogStatus, RequiredChannelStatus, RequiredChannelType } from '@prisma/client';
import { prisma } from '../prisma/client';
import { logger } from '../utils/logger';
import { redisClient } from '../utils/redis';

// ─── IMPORTANT: PostgreSQL column names match Prisma field names (camelCase).
// The @@map("table_name") only changes the TABLE name, not column names.
// So: users table has "createdAt" column, NOT "created_at".
//     point_logs table has "userId" column, NOT "user_id".
// ─────────────────────────────────────────────────────────────

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

// ─── Raw SQL Queries (camelCase columns!) ───────────────────
async function dailyNewUsers(startDate: Date, endDate: Date): Promise<Map<string, number>> {
  const rows = await prisma.$queryRawUnsafe<Array<{ day: string; count: bigint }>>(
    `SELECT DATE("createdAt" AT TIME ZONE 'UTC')::text AS day, COUNT(*)::bigint AS count
     FROM "users"
     WHERE "createdAt" >= $1 AND "createdAt" <= $2
     GROUP BY DATE("createdAt" AT TIME ZONE 'UTC')
     ORDER BY day`,
    startDate, endDate,
  );
  const map = new Map<string, number>();
  for (const r of rows) {
    const key = typeof r.day === 'string' ? r.day.slice(0, 10) : String(r.day);
    map.set(key, safeNumber(r.count));
  }
  logger.info(`[Analytics] dailyNewUsers: ${rows.length} rows, ${map.size} days with data`);
  return map;
}

async function dailyActiveUserSets(startDate: Date, endDate: Date): Promise<Map<string, Set<number>>> {
  const rows = await prisma.$queryRawUnsafe<Array<{ day: string; userId: number }>>(
    `SELECT DATE("createdAt" AT TIME ZONE 'UTC')::text AS day, "userId"
     FROM "point_logs"
     WHERE "createdAt" >= $1 AND "createdAt" <= $2
     GROUP BY DATE("createdAt" AT TIME ZONE 'UTC'), "userId"
     ORDER BY day`,
    startDate, endDate,
  );
  const map = new Map<string, Set<number>>();
  for (const r of rows) {
    const key = typeof r.day === 'string' ? r.day.slice(0, 10) : String(r.day);
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(Number(r.userId));
  }
  logger.info(`[Analytics] dailyActiveUserSets: ${rows.length} rows, ${map.size} days with data`);
  return map;
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

    // Skip cache in debug — force fresh query every time until confirmed working
    // const cached = await redisClient.get<any>(cacheKey);
    // if (cached) return cached;

    const start = utcStartOfDay(new Date(params.startDate + 'T12:00:00.000Z'));
    const end = utcEndOfDay(new Date(params.endDate + 'T12:00:00.000Z'));
    const days = utcDateRange(params.startDate, params.endDate);

    logger.info(`[Analytics] userAnalytics called: start=${params.startDate} end=${params.endDate} days=${days.length}`);

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

    // Current period data — NO try/catch, let errors propagate
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
      prisma.user.count(),
      prisma.user.count({ where: { isBlocked: true } }),
      prisma.user.count({
        where: { updatedAt: { gte: sixtyDaysAgo }, isBlocked: false },
      }),
      prisma.user.count({
        where: { createdAt: { gte: start, lte: end } },
      }),
      prisma.user.count({
        where: { updatedAt: { lt: monthAgo } },
      }),
      prisma.user.count({
        where: { updatedAt: { lt: utcStartOfDay(utcDaysAgo(59)) } },
      }),
      prisma.user.count({
        where: { updatedAt: { lt: utcStartOfDay(utcDaysAgo(89)) } },
      }),
    ]);

    logger.info(`[Analytics] KPIs: totalUsers=${totalUsers} realUsers=${realUsersCount} newUsers=${newUsersInPeriod} blocked=${currentBlocked}`);
    logger.info(`[Analytics] Inactive: 30d=${inactive30} 60d=${inactive60} 90d=${inactive90}`);

    // Debug: log raw map sizes
    logger.info(`[Analytics] newUsersByDay map size: ${newUsersByDay.size}, activeSetsByDay map size: ${activeSetsByDay.size}`);

    // Compare period totals
    let compareTotalNew = 0;
    let prevTotalUsers = 0;
    if (compareDays && compareNewUsersByDay) {
      for (const day of compareDays) {
        compareTotalNew += compareNewUsersByDay.get(day) ?? 0;
      }
      prevTotalUsers = totalUsers - compareTotalNew;
    }

    // Build series — shared dataset for chart, table, and export
    const series: Array<{
      date: string;
      realUsers: number;
      newUsers: number;
      blocked: number;
      growthRate: number | null;
      healthScore: number;
    }> = [];

    let cumulativeNew = 0;
    let nonZeroCount = 0;
    for (let i = 0; i < days.length; i++) {
      const day = days[i];
      const dayNew = newUsersByDay.get(day) ?? 0;
      cumulativeNew += dayNew;

      const dayRealUsers = rollingUniqueUsers(i, days, activeSetsByDay, Math.min(i + 1, 60));

      if (dayRealUsers > 0 || dayNew > 0) nonZeroCount++;

      // Growth rate
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

      // Health score
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

    logger.info(`[Analytics] Series built: ${series.length} days, ${nonZeroCount} non-zero rows`);
    logger.info(`[Analytics] First 5 series:`, series.slice(0, 5));

    // Validation: if KPI says realUsers=78 but sum of series is 0, something is wrong
    const sumRealUsers = series.reduce((a, s) => a + s.realUsers, 0);
    if (realUsersCount > 0 && sumRealUsers === 0) {
      logger.error(`[Analytics] VALIDATION FAILED: KPI realUsers=${realUsersCount} but sum of series realUsers=0. This indicates the active users query returned no data for the selected date range.`);
    }

    // Period growth rate
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
  },

  async dashboard() {
    const cacheKey = `${CACHE_PREFIX}dashboard`;
    const cached = await redisClient.get<any>(cacheKey);
    if (cached) return cached;

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
      prisma.user.count(),
      prisma.pointLog.count({ where: { createdAt: { gte: today } } }),
      prisma.pointLog.count({ where: { createdAt: { gte: week } } }),
      prisma.pointLog.count({ where: { createdAt: { gte: month } } }),
      prisma.user.count({ where: { createdAt: { gte: month } } }),
      prisma.referral.count(),
      prisma.referral.count({ where: { membershipVerificationStatus: 'VERIFIED' } }),
      prisma.requiredChannel.count({ where: { type: RequiredChannelType.CHANNEL, status: RequiredChannelStatus.APPROVED, isActive: true } }),
      prisma.requiredChannel.count({ where: { type: RequiredChannelType.GROUP, status: RequiredChannelStatus.APPROVED, isActive: true } }),
      prisma.userRequiredChannelMembership.count({ where: { verifiedAt: { not: null } } }),
      prisma.lottery.count(),
      prisma.lotteryEntry.count(),
      prisma.broadcast.count(),
      prisma.broadcastLog.count({ where: { status: BroadcastLogStatus.SUCCESS } }),
      prisma.broadcastLog.count({ where: { status: BroadcastLogStatus.FAILED } }),
      prisma.telegramGroup.count({ where: { status: 'APPROVED' } }),
      prisma.telegramGroup.count({ where: { status: 'APPROVED', botIsAdmin: true } }),
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
      charts: { dailyUsers: [], dailyReferrals: [], dailyLotteryEntries: [] },
    };

    await redisClient.set(cacheKey, result, CACHE_TTL).catch(() => {});
    return result;
  },

  async invalidateCache() {
    await redisClient.invalidateByPrefix(CACHE_PREFIX).catch(() => {});
    logger.info('[Analytics] Cache invalidated');
  },

  async acquisitionSources(params: { startDate: string; endDate: string }) {
    const start = utcStartOfDay(new Date(params.startDate + 'T12:00:00.000Z'));
    const end = utcEndOfDay(new Date(params.endDate + 'T12:00:00.000Z'));

    const rows = await prisma.$queryRawUnsafe<Array<{
      source: string;
      count: bigint;
    }>>(
      `SELECT COALESCE("acquisitionSource", 'direct') AS source, COUNT(*)::bigint AS count
       FROM "users"
       WHERE "createdAt" >= $1 AND "createdAt" <= $2
       GROUP BY COALESCE("acquisitionSource", 'direct')
       ORDER BY count DESC`,
      start, end,
    );

    const total = rows.reduce((a, r) => a + safeNumber(r.count), 0);

    const sources = rows.map((r) => ({
      source: r.source || 'direct',
      label: SOURCE_LABELS[r.source] || SOURCE_LABELS['direct'],
      count: safeNumber(r.count),
      percentage: total > 0 ? Math.round((safeNumber(r.count) / total) * 10000) / 100 : 0,
    }));

    // Get active users per source
    const activeRows = await prisma.$queryRawUnsafe<Array<{
      source: string;
      count: bigint;
    }>>(
      `SELECT COALESCE("acquisitionSource", 'direct') AS source, COUNT(DISTINCT "userId")::bigint AS count
       FROM "point_logs" pl
       JOIN "users" u ON u.id = pl."userId"
       WHERE pl."createdAt" >= $1 AND pl."createdAt" <= $2
       GROUP BY COALESCE("acquisitionSource", 'direct')`,
      start, end,
    );

    const activeMap = new Map<string, number>();
    for (const r of activeRows) activeMap.set(r.source || 'direct', safeNumber(r.count));

    // Get inactive users per source
    const result = sources.map((s) => ({
      ...s,
      activeUsers: activeMap.get(s.source) ?? 0,
      inactiveUsers: s.count - (activeMap.get(s.source) ?? 0),
    }));

    logger.info(`[Analytics] acquisitionSources: ${result.length} sources, total=${total}`);
    return { sources: result, total };
  },

  async activityHeatmap(params: { startDate: string; endDate: string }) {
    const start = utcStartOfDay(new Date(params.startDate + 'T12:00:00.000Z'));
    const end = utcEndOfDay(new Date(params.endDate + 'T12:00:00.000Z'));

    // Hourly activity (Asia/Tehran = UTC+3:30, but we use AT TIME ZONE for correctness)
    const hourlyRows = await prisma.$queryRawUnsafe<Array<{
      hour: number;
      day_of_week: number;
      count: bigint;
    }>>(
      `SELECT EXTRACT(HOUR FROM "createdAt" AT TIME ZONE 'Asia/Tehran')::int AS hour,
              EXTRACT(DOW FROM "createdAt" AT TIME ZONE 'Asia/Tehran')::int AS day_of_week,
              COUNT(DISTINCT "userId")::bigint AS count
       FROM "point_logs"
       WHERE "createdAt" >= $1 AND "createdAt" <= $2
       GROUP BY hour, day_of_week
       ORDER BY day_of_week, hour`,
      start, end,
    );

    // Build heatmap grid: 7 days x 24 hours
    const heatmap: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const r of hourlyRows) {
      const dow = r.day_of_week; // 0=Sun, 1=Mon, ..., 6=Sat
      const hour = r.hour;
      if (dow >= 0 && dow < 7 && hour >= 0 && hour < 24) {
        heatmap[dow][hour] = safeNumber(r.count);
      }
    }

    // Daily totals for the chart
    const dailyRows = await prisma.$queryRawUnsafe<Array<{
      day: string;
      count: bigint;
    }>>(
      `SELECT DATE("createdAt" AT TIME ZONE 'Asia/Tehran')::text AS day,
              COUNT(DISTINCT "userId")::bigint AS count
       FROM "point_logs"
       WHERE "createdAt" >= $1 AND "createdAt" <= $2
       GROUP BY day
       ORDER BY day`,
      start, end,
    );

    const dailyData = dailyRows.map((r) => ({
      date: typeof r.day === 'string' ? r.day.slice(0, 10) : String(r.day),
      count: safeNumber(r.count),
    }));

    // Hourly totals for the chart
    const hourlyTotals = Array(24).fill(0);
    for (const r of hourlyRows) {
      hourlyTotals[r.hour] += safeNumber(r.count);
    }

    logger.info(`[Analytics] activityHeatmap: ${hourlyRows.length} hourly rows, ${dailyRows.length} daily rows`);

    return {
      heatmap,
      hourlyTotals: hourlyTotals.map((count, hour) => ({ hour, count })),
      dailyData,
      dayLabels: ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'],
    };
  },
};

const SOURCE_LABELS: Record<string, string> = {
  referral: 'دعوت دوستان',
  direct: 'استارت مستقیم',
  ads: 'تبلیغات',
  website: 'سایت',
  telegram: 'تلگرام',
  utm: 'کمپین',
  unknown: 'ناشناس',
};
