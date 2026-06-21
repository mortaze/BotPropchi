import { BroadcastLogStatus, RequiredChannelStatus, RequiredChannelType } from '@prisma/client';
import { prisma } from '../prisma/client';

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const startOfDay = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
const dayKey = (date: Date) => date.toISOString().slice(0, 10);

function fillDaily(rows: Array<{ createdAt: Date; _count: { id?: number; _all?: number } }>, days = 30) {
  const map = new Map<string, number>();
  rows.forEach((row) => map.set(dayKey(row.createdAt), (map.get(dayKey(row.createdAt)) ?? 0) + (row._count.id ?? row._count._all ?? 0)));
  return Array.from({ length: days }, (_, index) => {
    const date = dayKey(daysAgo(days - index - 1));
    return { date, count: map.get(date) ?? 0 };
  });
}

// ─── User Analytics (Performance Dashboard) ─────────────────

function dateRange(start: string, end: string): string[] {
  const days: string[] = [];
  const cursor = new Date(start);
  const endDate = new Date(end);
  while (cursor <= endDate) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

async function dailyNewUsers(startDate: Date, endDate: Date): Promise<Map<string, number>> {
  const rows = await prisma.$queryRawUnsafe<Array<{ day: string; count: bigint }>>(
    `SELECT DATE(created_at)::text AS day, COUNT(*)::bigint AS count FROM users WHERE created_at >= $1 AND created_at <= $2 GROUP BY DATE(created_at) ORDER BY day`,
    startDate, endDate,
  );
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.day, Number(r.count));
  return map;
}

async function dailyActiveUsers(startDate: Date, endDate: Date): Promise<Map<string, Set<number>>> {
  const rows = await prisma.$queryRawUnsafe<Array<{ day: string; user_id: number }>>(
    `SELECT DATE(created_at)::text AS day, user_id FROM point_logs WHERE created_at >= $1 AND created_at <= $2`,
    startDate, endDate,
  );
  const map = new Map<string, Set<number>>();
  for (const r of rows) {
    if (!map.has(r.day)) map.set(r.day, new Set());
    map.get(r.day)!.add(r.user_id);
  }
  return map;
}

function rollingActiveUsers(dayIdx: number, days: string[], activeByDay: Map<string, Set<number>>, window: number): number {
  const users = new Set<number>();
  for (let j = Math.max(0, dayIdx - window + 1); j <= dayIdx; j++) {
    const set = activeByDay.get(days[j]);
    if (set) set.forEach(u => users.add(u));
  }
  return users.size;
}

export const analyticsService = {
  async userAnalytics(params: { startDate: string; endDate: string; compareStart?: string; compareEnd?: string }) {
    const start = new Date(params.startDate);
    const end = new Date(params.endDate);
    end.setHours(23, 59, 59, 999);
    const periodDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;

    // ── Compare period ──────────────────────────────────
    let compareActiveByDay: Map<string, Set<number>> | null = null;
    let compareNewUsersByDay: Map<string, number> | null = null;
    let compareDays: string[] | null = null;
    if (params.compareStart && params.compareEnd) {
      const cStart = new Date(params.compareStart);
      const cEnd = new Date(params.compareEnd);
      cEnd.setHours(23, 59, 59, 999);
      compareNewUsersByDay = await dailyNewUsers(cStart, cEnd);
      compareActiveByDay = await dailyActiveUsers(cStart, cEnd);
      compareDays = dateRange(params.compareStart, params.compareEnd);
    }

    // ── Main period data ────────────────────────────────
    const newUsersByDay = await dailyNewUsers(start, end);
    const activeByDay = await dailyActiveUsers(start, end);
    const days = dateRange(params.startDate, params.endDate);

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const monthAgo = new Date(now.getTime() - 30 * 86400000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 86400000);

    const [
      totalUsers,
      currentBlocked,
      realUsers,
      dauToday,
      wau,
      mau,
      inactive30,
      inactive60,
      inactive90,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isBlocked: true } }),
      // Real Users = active in last 60 days
      prisma.pointLog.groupBy({ by: ['userId'], where: { createdAt: { gte: sixtyDaysAgo } }, _count: { userId: true } }),
      // DAU today
      prisma.pointLog.groupBy({ by: ['userId'], where: { createdAt: { gte: now } }, _count: { userId: true } }),
      // WAU = active in last 7 days
      prisma.pointLog.groupBy({ by: ['userId'], where: { createdAt: { gte: weekAgo } }, _count: { userId: true } }),
      // MAU = active in last 30 days
      prisma.pointLog.groupBy({ by: ['userId'], where: { createdAt: { gte: monthAgo } }, _count: { userId: true } }),
      // Inactive 30 days
      prisma.user.count({ where: { updatedAt: { lt: monthAgo } } }),
      // Inactive 60 days
      prisma.user.count({ where: { updatedAt: { lt: sixtyDaysAgo } } }),
      // Inactive 90 days
      prisma.user.count({ where: { updatedAt: { lt: new Date(now.getTime() - 90 * 86400000) } } }),
    ]);

    // ── Build daily series ──────────────────────────────
    const series: Array<{
      date: string; realUsers: number; dau: number; wau: number; mau: number;
      newUsers: number; blocked: number; deleted: number; growthRate: number | null; healthScore: number;
    }> = [];

    let prevTotalUsers = 0;
    for (let i = 0; i < days.length; i++) {
      const day = days[i];
      const dayDate = new Date(day + 'T00:00:00');
      const dayEnd = new Date(day + 'T23:59:59.999');
      const dayActive = activeByDay.get(day)?.size ?? 0;
      const dayWau = rollingActiveUsers(i, days, activeByDay, 7);
      const dayMau = rollingActiveUsers(i, days, activeByDay, 30);
      const dayNew = newUsersByDay.get(day) ?? 0;

      // Real Users for this day = active in 60 days ending on this day
      let dayRealUsers = 0;
      if (i >= 59) {
        dayRealUsers = rollingActiveUsers(i, days, activeByDay, 60);
      } else {
        // First 60 days: count active users from start to this day
        dayRealUsers = rollingActiveUsers(i, days, activeByDay, i + 1);
      }

      // Growth Rate
      let growthRate: number | null = null;
      if (prevTotalUsers > 0) {
        growthRate = Math.round(((dayNew) / prevTotalUsers) * 10000) / 100;
      }
      prevTotalUsers += dayNew;

      // Health Score
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
        dau: dayActive,
        wau: dayWau,
        mau: dayMau,
        newUsers: dayNew,
        blocked: currentBlocked,
        deleted: 0,
        growthRate,
        healthScore,
      });
    }

    // ── Compare period totals ───────────────────────────
    let compareSummary: any = null;
    if (compareDays) {
      let compareTotalNew = 0;
      let compareTotalDau = 0;
      for (const day of compareDays) {
        compareTotalNew += compareNewUsersByDay?.get(day) ?? 0;
        compareTotalDau += compareActiveByDay?.get(day)?.size ?? 0;
      }
      compareSummary = { totalNewUsers: compareTotalNew, totalDAU: compareTotalDau };
    }

    // ── Current period totals ───────────────────────────
    const periodTotalNew = Array.from(newUsersByDay.values()).reduce((a, b) => a + b, 0);
    const periodTotalDau = Array.from(activeByDay.values()).reduce((a, b) => a + b.size, 0);

    return {
      kpis: {
        totalUsers,
        realUsers: realUsers.length,
        dau: dauToday.length,
        wau: wau.length,
        mau: mau.length,
        newUsers: periodTotalNew,
        blocked: currentBlocked,
        deleted: 0,
        inactive30,
        inactive60,
        inactive90,
        growthRate: prevTotalUsers > 0 ? Math.round((periodTotalNew / prevTotalUsers) * 10000) / 100 : 0,
        healthScore: Math.round(
          (realUsers.length / Math.max(totalUsers, 1)) * 30 +
          (mau.length / Math.max(totalUsers, 1)) * 30 +
          Math.max(0, 100 - (totalUsers > 0 ? (currentBlocked / totalUsers) * 100 : 0)) * 0.25 +
          (periodTotalNew > 0 ? 15 : 0)
        ),
      },
      compareSummary,
      series,
      days,
    };
  },

  async dashboard() {
    const today = startOfDay();
    const week = daysAgo(7);
    const month = daysAgo(30);
    const [
      totalUsers, activeToday, activeWeek, activeMonth, newUsers,
      totalInvites, verifiedInvites, topReferrers,
      forceChannels, forceGroups, verifiedMemberships,
      topClickGroups, topUsage, topViewedCodes,
      lotteryCount, lotteryParticipants, ticketAgg, topLottery,
      broadcastCount, broadcastSuccess, broadcastFailed,
      approvedGroups, activeGroups,
      dailyUsers, dailyReferrals, dailyDiscountClicks, dailyLotteryEntries,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.pointLog.count({ where: { createdAt: { gte: today } } }),
      prisma.pointLog.count({ where: { createdAt: { gte: week } } }),
      prisma.pointLog.count({ where: { createdAt: { gte: month } } }),
      prisma.user.count({ where: { createdAt: { gte: month } } }),
      prisma.referral.count(),
      prisma.referral.count({ where: { membershipVerificationStatus: 'VERIFIED' } }),
      prisma.referral.groupBy({ by: ['referrerId'], _count: { _all: true }, _sum: { rewardPoints: true }, orderBy: { _count: { referrerId: 'desc' } }, take: 5 }),
      prisma.requiredChannel.count({ where: { type: RequiredChannelType.CHANNEL, status: RequiredChannelStatus.APPROVED, isActive: true } }),
      prisma.requiredChannel.count({ where: { type: RequiredChannelType.GROUP, status: RequiredChannelStatus.APPROVED, isActive: true } }),
      prisma.userRequiredChannelMembership.count({ where: { verifiedAt: { not: null } } }),
      prisma.clickLog.groupBy({ by: ['discountCodeId'], _count: { discountCodeId: true }, orderBy: { _count: { discountCodeId: 'desc' } }, take: 5 }),
      prisma.discountCode.findMany({ orderBy: { usageCount: 'desc' }, take: 5, include: { propFirm: true } }),
      prisma.discountCode.findMany({ orderBy: [{ usageCount: 'desc' }, { createdAt: 'desc' }], take: 5, include: { propFirm: true } }),
      prisma.lottery.count(),
      prisma.lotteryEntry.count(),
      prisma.lotteryEntry.aggregate({ _sum: { ticketCount: true, pointsSpent: true, chanceWeight: true } }),
      prisma.lotteryEntry.groupBy({ by: ['lotteryId'], _sum: { ticketCount: true }, _count: { userId: true }, orderBy: { _sum: { ticketCount: 'desc' } }, take: 1 }),
      prisma.broadcast.count(),
      prisma.broadcastLog.count({ where: { status: BroadcastLogStatus.SUCCESS } }),
      prisma.broadcastLog.count({ where: { status: BroadcastLogStatus.FAILED } }),
      prisma.telegramGroup.count({ where: { status: 'APPROVED' } }),
      prisma.telegramGroup.count({ where: { status: 'APPROVED', botIsAdmin: true } }),
      prisma.user.groupBy({ by: ['createdAt'], where: { createdAt: { gte: daysAgo(30) } }, _count: { id: true }, orderBy: { createdAt: 'asc' } }),
      prisma.referral.groupBy({ by: ['createdAt'], where: { createdAt: { gte: daysAgo(30) } }, _count: { id: true }, orderBy: { createdAt: 'asc' } }),
      prisma.clickLog.groupBy({ by: ['createdAt'], where: { createdAt: { gte: daysAgo(30) } }, _count: { id: true }, orderBy: { createdAt: 'asc' } }),
      prisma.lotteryEntry.groupBy({ by: ['createdAt'], where: { createdAt: { gte: daysAgo(30) } }, _count: { id: true }, orderBy: { createdAt: 'asc' } }),
    ]);

    const referrerUsers = topReferrers.length ? await prisma.user.findMany({ where: { id: { in: topReferrers.map((r) => r.referrerId) } } }) : [];
    const referrerMap = new Map(referrerUsers.map((user) => [user.id, user]));
    const topClickCodes = topClickGroups.length ? await prisma.discountCode.findMany({ where: { id: { in: topClickGroups.map((g) => g.discountCodeId) } }, include: { propFirm: true } }) : [];
    const codeMap = new Map(topClickCodes.map((code) => [code.id, code]));
    const topLotteryRecord = topLottery[0]
      ? await prisma.lottery.findUnique({ where: { id: topLottery[0].lotteryId } })
      : null;

    const totalBroadcastLogs = broadcastSuccess + broadcastFailed;
    const totalTickets = ticketAgg._sum.ticketCount ?? 0;
    return {
      users: { totalUsers, activeToday, activeWeek, activeMonth, newUsers },
      referrals: {
        totalInvites,
        successful: verifiedInvites,
        failed: totalInvites - verifiedInvites,
        conversionRate: totalInvites ? Math.round((verifiedInvites / totalInvites) * 10000) / 100 : 0,
        topReferrers: topReferrers.map((item) => ({ ...item, user: referrerMap.get(item.referrerId) })),
      },
      forceJoin: { channels: forceChannels, groups: forceGroups, verifiedUsers: verifiedMemberships },
      discounts: {
        topClicks: topClickGroups.map((item) => ({ ...item, discountCode: codeMap.get(item.discountCodeId), clicks: item._count.discountCodeId })),
        topUsage,
        topViewed: topViewedCodes,
      },
      lotteries: {
        total: lotteryCount,
        participants: lotteryParticipants,
        ticketsSold: totalTickets,
        pointsSpent: ticketAgg._sum.pointsSpent ?? 0,
        totalChance: ticketAgg._sum.chanceWeight ?? totalTickets,
        topLottery: topLotteryRecord ? { lottery: topLotteryRecord, tickets: topLottery[0]._sum.ticketCount ?? 0, participants: topLottery[0]._count.userId } : null,
      },
      broadcasts: { total: broadcastCount, successRate: totalBroadcastLogs ? Math.round((broadcastSuccess / totalBroadcastLogs) * 10000) / 100 : 0, errorRate: totalBroadcastLogs ? Math.round((broadcastFailed / totalBroadcastLogs) * 10000) / 100 : 0, success: broadcastSuccess, failed: broadcastFailed },
      groups: { approved: approvedGroups, active: activeGroups },
      charts: { dailyUsers: fillDaily(dailyUsers), dailyReferrals: fillDaily(dailyReferrals), dailyDiscountClicks: fillDaily(dailyDiscountClicks), dailyLotteryEntries: fillDaily(dailyLotteryEntries) },
    };
  },
};
