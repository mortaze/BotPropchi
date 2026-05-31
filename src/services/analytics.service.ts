import { BroadcastLogStatus, RequiredChannelStatus } from '@prisma/client';
import { prisma } from '../prisma/client';

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const startOfDay = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };

export const analyticsService = {
  async dashboard() {
    const today = startOfDay();
    const week = daysAgo(7);
    const month = daysAgo(30);
    const [
      totalUsers, activeToday, activeWeek, activeMonth, newUsers,
      totalInvites, verifiedInvites, pendingInvites,
      forceApproved, forceRejected, forcePending,
      topClicks, topUsage, popularPropFirms,
      lotteryParticipants, winnersCount, pointsSpent,
      broadcastCount, broadcastSuccess, broadcastFailed,
      dailyUsers, dailyBroadcasts,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { lastActiveAt: { gte: today } } }),
      prisma.user.count({ where: { lastActiveAt: { gte: week } } }),
      prisma.user.count({ where: { lastActiveAt: { gte: month } } }),
      prisma.user.count({ where: { createdAt: { gte: month } } }),
      prisma.referral.count(),
      prisma.referral.count({ where: { membershipVerificationStatus: 'VERIFIED' } }),
      prisma.referral.count({ where: { membershipVerificationStatus: { not: 'VERIFIED' } } }),
      prisma.requiredChannel.count({ where: { status: RequiredChannelStatus.APPROVED, isActive: true } }),
      prisma.requiredChannel.count({ where: { status: RequiredChannelStatus.REJECTED } }),
      prisma.requiredChannel.count({ where: { status: RequiredChannelStatus.PENDING } }),
      prisma.clickLog.groupBy({ by: ['discountCodeId'], _count: { discountCodeId: true }, orderBy: { _count: { discountCodeId: 'desc' } }, take: 5 }),
      prisma.discountCode.findMany({ orderBy: { usageCount: 'desc' }, take: 5, include: { propFirm: true } }),
      prisma.propFirm.findMany({ take: 5, include: { _count: { select: { discountCodes: true } } }, orderBy: { discountCodes: { _count: 'desc' } } }),
      prisma.lotteryEntry.count(),
      prisma.lotteryWinner.count(),
      prisma.pointLog.aggregate({ where: { type: 'LOTTERY_ENTRY' }, _sum: { amount: true } }),
      prisma.broadcast.count(),
      prisma.broadcastLog.count({ where: { status: BroadcastLogStatus.SUCCESS } }),
      prisma.broadcastLog.count({ where: { status: BroadcastLogStatus.FAILED } }),
      prisma.user.groupBy({ by: ['createdAt'], where: { createdAt: { gte: daysAgo(30) } }, _count: { id: true }, orderBy: { createdAt: 'asc' } }),
      prisma.broadcast.groupBy({ by: ['createdAt'], where: { createdAt: { gte: daysAgo(30) } }, _count: { id: true }, orderBy: { createdAt: 'asc' } }),
    ]);
    const totalBroadcastLogs = broadcastSuccess + broadcastFailed;
    return {
      users: { totalUsers, activeToday, activeWeek, activeMonth, newUsers },
      referrals: { totalInvites, successful: verifiedInvites, failed: pendingInvites, conversionRate: totalInvites ? Math.round((verifiedInvites / totalInvites) * 10000) / 100 : 0 },
      forceJoin: { approved: forceApproved, rejected: forceRejected, pending: forcePending },
      discounts: { topClicks, topUsage, popularPropFirms },
      lotteries: { participants: lotteryParticipants, winners: winnersCount, pointsSpent: Math.abs(pointsSpent._sum.amount || 0) },
      broadcasts: { total: broadcastCount, successRate: totalBroadcastLogs ? Math.round((broadcastSuccess / totalBroadcastLogs) * 10000) / 100 : 0, errorRate: totalBroadcastLogs ? Math.round((broadcastFailed / totalBroadcastLogs) * 10000) / 100 : 0, success: broadcastSuccess, failed: broadcastFailed },
      charts: { dailyUsers, dailyBroadcasts },
    };
  },
};
