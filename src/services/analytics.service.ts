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

export const analyticsService = {
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
      prisma.user.count({ where: { lastActiveAt: { gte: today } } }),
      prisma.user.count({ where: { lastActiveAt: { gte: week } } }),
      prisma.user.count({ where: { lastActiveAt: { gte: month } } }),
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
