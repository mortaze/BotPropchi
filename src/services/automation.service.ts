import { prisma } from '../prisma/client';
import { logger } from '../utils/logger';

export type AutomationEventType =
  | 'AUTO_REPLY_SENT' | 'AUTO_REPLY_FAILED'
  | 'SCHEDULED_SENT' | 'SCHEDULED_FAILED'
  | 'KEYWORD_MATCH'
  | 'BUTTON_CLICK' | 'POPUP_CLICK' | 'COMMAND_CLICK';

export interface LogActivityParams {
  eventType: AutomationEventType;
  source: string;
  sourceId?: number;
  targetChatId?: bigint;
  targetTopicId?: bigint;
  userTelegramId?: bigint;
  messageText?: string;
  keyword?: string;
  status?: string;
  errorMessage?: string;
  metadata?: any;
  executionTimeMs?: number;
}

class AutomationService {
  async logActivity(params: LogActivityParams) {
    try {
      await prisma.automationActivityLog.create({
        data: {
          eventType: params.eventType,
          source: params.source,
          sourceId: params.sourceId,
          targetChatId: params.targetChatId,
          targetTopicId: params.targetTopicId,
          userTelegramId: params.userTelegramId,
          messageText: params.messageText?.slice(0, 500),
          keyword: params.keyword,
          status: params.status || 'SUCCESS',
          errorMessage: params.errorMessage?.slice(0, 900),
          metadata: params.metadata,
          executionTimeMs: params.executionTimeMs,
        },
      });
    } catch (err: any) {
      logger.error(`[AutomationLog] FAILED to write activity log: ${err.message}`);
    }
  }

  async getDashboardStats() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalAutoReplies,
      activeAutoReplies,
      totalScheduledMessages,
      activeScheduledMessages,
      draftScheduledMessages,
      totalKeywords,
      totalTriggers,
      todayTriggers,
      weekTriggers,
      monthTriggers,
      successTriggers,
      failedTriggers,
      lastActivity,
      topKeywords,
      topGroups,
      topUsers,
      dailyStats,
    ] = await Promise.all([
      prisma.autoReply.count(),
      prisma.autoReply.count({ where: { isPublished: true } }),
      prisma.scheduledMessage.count(),
      prisma.scheduledMessage.count({ where: { isPublished: true, status: 'PUBLISHED' } }),
      prisma.scheduledMessage.count({ where: { isPublished: false, status: 'DRAFT' } }),
      prisma.autoReplyKeyword.count(),
      prisma.automationActivityLog.count(),
      prisma.automationActivityLog.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.automationActivityLog.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.automationActivityLog.count({ where: { createdAt: { gte: monthAgo } } }),
      prisma.automationActivityLog.count({ where: { status: 'SUCCESS' } }),
      prisma.automationActivityLog.count({ where: { status: 'FAILED' } }),
      prisma.automationActivityLog.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
      prisma.automationActivityLog.groupBy({
        by: ['keyword'],
        where: { keyword: { not: null }, createdAt: { gte: monthAgo } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
      prisma.automationActivityLog.groupBy({
        by: ['targetChatId'],
        where: { targetChatId: { not: null }, createdAt: { gte: monthAgo } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
      prisma.automationActivityLog.groupBy({
        by: ['userTelegramId'],
        where: { userTelegramId: { not: null }, createdAt: { gte: monthAgo } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
      prisma.$queryRaw`
        SELECT DATE(createdAt) as date, COUNT(*) as count
        FROM automation_activity_logs
        WHERE createdAt >= ${monthAgo}
        GROUP BY DATE(createdAt)
        ORDER BY date DESC
      ` as Promise<{ date: Date; count: bigint }[]>,
    ]);

    return {
      autoReplies: { total: totalAutoReplies, active: activeAutoReplies },
      scheduledMessages: { total: totalScheduledMessages, active: activeScheduledMessages, draft: draftScheduledMessages },
      keywords: { total: totalKeywords },
      triggers: {
        total: totalTriggers,
        today: todayTriggers,
        week: weekTriggers,
        month: monthTriggers,
        success: successTriggers,
        failed: failedTriggers,
        successRate: totalTriggers > 0 ? Math.round((successTriggers / totalTriggers) * 100) : 0,
      },
      lastActivity: lastActivity?.createdAt || null,
      topKeywords: topKeywords.map(k => ({ keyword: k.keyword, count: k._count.id })),
      topGroups: topGroups.map(g => ({ chatId: g.targetChatId?.toString(), count: g._count.id })),
      topUsers: topUsers.map(u => ({ telegramId: u.userTelegramId?.toString(), count: u._count.id })),
      dailyStats: (dailyStats as any[]).map(d => ({ date: d.date?.toISOString?.()?.split('T')[0] || String(d.date), count: Number(d.count) })),
    };
  }

  async getActivityLog(params: {
    page?: number;
    limit?: number;
    eventType?: string;
    source?: string;
    status?: string;
    from?: string;
    to?: string;
    search?: string;
  }) {
    const page = params.page || 1;
    const limit = Math.min(params.limit || 50, 100);
    const where: any = {};

    if (params.eventType) where.eventType = params.eventType;
    if (params.source) where.source = params.source;
    if (params.status) where.status = params.status;
    if (params.from || params.to) {
      where.createdAt = {};
      if (params.from) where.createdAt.gte = new Date(params.from);
      if (params.to) where.createdAt.lte = new Date(params.to + 'T23:59:59.999Z');
    }
    if (params.search) {
      where.OR = [
        { keyword: { contains: params.search, mode: 'insensitive' } },
        { messageText: { contains: params.search, mode: 'insensitive' } },
        { errorMessage: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.automationActivityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.automationActivityLog.count({ where }),
    ]);

    return { items, total, pages: Math.ceil(total / limit), page };
  }

  async getAnalyticsSummary() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      unusedKeywords,
      activeGroups,
      activeUsers,
      avgDailyTriggers,
    ] = await Promise.all([
      prisma.autoReplyKeyword.findMany({
        where: {
          autoReply: { isPublished: true },
          keyword: { notIn: (await prisma.automationActivityLog.groupBy({
            by: ['keyword'],
            where: { keyword: { not: null } },
          })).map(k => k.keyword || '').filter(Boolean) },
        },
        select: { keyword: true, autoReplyId: true },
      }),
      prisma.automationActivityLog.groupBy({
        by: ['targetChatId'],
        where: { targetChatId: { not: null }, createdAt: { gte: weekAgo } },
        _count: { id: true },
      }),
      prisma.automationActivityLog.groupBy({
        by: ['userTelegramId'],
        where: { userTelegramId: { not: null }, createdAt: { gte: weekAgo } },
        _count: { id: true },
      }),
      prisma.$queryRaw`
        SELECT AVG(daily_count) as avg_count FROM (
          SELECT DATE(createdAt) as day, COUNT(*) as daily_count
          FROM automation_activity_logs
          WHERE createdAt >= ${weekAgo}
          GROUP BY DATE(createdAt)
        ) sub
      ` as Promise<{ avg_count: number | null }[]>,
    ]);

    return {
      unusedKeywords: unusedKeywords.map(k => ({ keyword: k.keyword, autoReplyId: k.autoReplyId })),
      activeGroupsCount: activeGroups.length,
      activeUsersCount: activeUsers.length,
      avgDailyTriggers: Math.round(avgDailyTriggers[0]?.avg_count || 0),
    };
  }
}

export const automationService = new AutomationService();
