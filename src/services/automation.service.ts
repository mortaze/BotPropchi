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
      scheduledSentCount,
      scheduledFailedCount,
      autoReplySentCount,
      autoReplyFailedCount,
      keywordMatchCount,
      lastScheduledActivity,
      lastAutoReplyActivity,
      lastKeywordActivity,
      topKeywordsFromDb,
      topGroupsFromScheduled,
      topGroupsFromAutoReply,
      topUsersFromKeyword,
      dailyScheduledStats,
      dailyAutoReplyStats,
      dailyKeywordStats,
      totalScheduledSends,
      totalAutoReplySends,
    ] = await Promise.all([
      prisma.autoReply.count(),
      prisma.autoReply.count({ where: { isPublished: true } }),
      prisma.scheduledMessage.count(),
      prisma.scheduledMessage.count({ where: { isPublished: true, status: 'PUBLISHED' } }),
      prisma.scheduledMessage.count({ where: { isPublished: false, status: 'DRAFT' } }),
      prisma.autoReplyKeyword.count(),
      // Scheduled post logs — SUCCESS count
      prisma.scheduledPostLog.count({ where: { status: 'SUCCESS' } }),
      prisma.scheduledPostLog.count({ where: { status: 'FAILED' } }),
      // Auto reply send logs — SUCCESS count
      prisma.autoReplySendLog.count({ where: { status: 'SUCCESS' } }),
      prisma.autoReplySendLog.count({ where: { status: 'FAILED' } }),
      // Keyword reply logs — total matches
      prisma.keywordReplyLog.count(),
      // Last activity timestamps
      prisma.scheduledPostLog.findFirst({ orderBy: { sentAt: 'desc' }, select: { sentAt: true } }),
      prisma.autoReplySendLog.findFirst({ orderBy: { sentAt: 'desc' }, select: { sentAt: true } }),
      prisma.keywordReplyLog.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
      // Top keywords from keyword_reply_logs (join to get keyword text)
      prisma.$queryRaw`
        SELECT kr.keyword, COUNT(*) as cnt
        FROM keyword_reply_logs krl
        JOIN keyword_replies kr ON kr.id = krl.keywordReplyId
        WHERE krl.createdAt >= ${monthAgo}
        GROUP BY kr.keyword
        ORDER BY cnt DESC
        LIMIT 10
      ` as Promise<{ keyword: string; cnt: bigint }[]>,
      // Top groups from scheduled_post_logs
      prisma.$queryRaw`
        SELECT targetChatId as "chatId", COUNT(*) as cnt
        FROM scheduled_post_logs
        WHERE sentAt >= ${monthAgo} AND targetChatId IS NOT NULL
        GROUP BY targetChatId
        ORDER BY cnt DESC
        LIMIT 10
      ` as Promise<{ chatId: bigint; cnt: bigint }[]>,
      // Top groups from auto_reply_send_logs
      prisma.$queryRaw`
        SELECT targetChatId as "chatId", COUNT(*) as cnt
        FROM auto_reply_send_logs
        WHERE sentAt >= ${monthAgo} AND targetChatId IS NOT NULL
        GROUP BY targetChatId
        ORDER BY cnt DESC
        LIMIT 10
      ` as Promise<{ chatId: bigint; cnt: bigint }[]>,
      // Top users from keyword_reply_logs
      prisma.$queryRaw`
        SELECT userTelegramId as "telegramId", COUNT(*) as cnt
        FROM keyword_reply_logs
        WHERE createdAt >= ${monthAgo} AND userTelegramId IS NOT NULL
        GROUP BY userTelegramId
        ORDER BY cnt DESC
        LIMIT 10
      ` as Promise<{ telegramId: bigint; cnt: bigint }[]>,
      // Daily stats from scheduled_post_logs
      prisma.$queryRaw`
        SELECT DATE(sentAt) as date, COUNT(*) as count
        FROM scheduled_post_logs
        WHERE sentAt >= ${monthAgo}
        GROUP BY DATE(sentAt)
        ORDER BY date DESC
      ` as Promise<{ date: Date; count: bigint }[]>,
      // Daily stats from auto_reply_send_logs
      prisma.$queryRaw`
        SELECT DATE(sentAt) as date, COUNT(*) as count
        FROM auto_reply_send_logs
        WHERE sentAt >= ${monthAgo}
        GROUP BY DATE(sentAt)
        ORDER BY date DESC
      ` as Promise<{ date: Date; count: bigint }[]>,
      // Daily stats from keyword_reply_logs
      prisma.$queryRaw`
        SELECT DATE(createdAt) as date, COUNT(*) as count
        FROM keyword_reply_logs
        WHERE createdAt >= ${monthAgo}
        GROUP BY DATE(createdAt)
        ORDER BY date DESC
      ` as Promise<{ date: Date; count: bigint }[]>,
      // Total send counts from scheduled_messages table
      prisma.scheduledMessage.aggregate({ _sum: { sendCount: true } }),
      // Total send counts from auto_replies table
      prisma.autoReply.aggregate({ _sum: { sendCount: true } }),
    ]);

    // Merge daily stats from all 3 sources
    const dailyMap = new Map<string, number>();
    for (const d of dailyScheduledStats) {
      const key = d.date instanceof Date ? d.date.toISOString().split('T')[0] : String(d.date);
      dailyMap.set(key, (dailyMap.get(key) || 0) + Number(d.count));
    }
    for (const d of dailyAutoReplyStats) {
      const key = d.date instanceof Date ? d.date.toISOString().split('T')[0] : String(d.date);
      dailyMap.set(key, (dailyMap.get(key) || 0) + Number(d.count));
    }
    for (const d of dailyKeywordStats) {
      const key = d.date instanceof Date ? d.date.toISOString().split('T')[0] : String(d.date);
      dailyMap.set(key, (dailyMap.get(key) || 0) + Number(d.count));
    }
    const dailyStats = Array.from(dailyMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => b.date.localeCompare(a.date));

    // Merge top groups from scheduled + auto reply
    const groupMap = new Map<string, number>();
    for (const g of topGroupsFromScheduled) {
      const key = g.chatId?.toString() || 'unknown';
      groupMap.set(key, (groupMap.get(key) || 0) + Number(g.cnt));
    }
    for (const g of topGroupsFromAutoReply) {
      const key = g.chatId?.toString() || 'unknown';
      groupMap.set(key, (groupMap.get(key) || 0) + Number(g.cnt));
    }
    const topGroups = Array.from(groupMap.entries())
      .map(([chatId, count]) => ({ chatId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Determine last activity across all sources
    const allLastActivity = [lastScheduledActivity?.sentAt, lastAutoReplyActivity?.sentAt, lastKeywordActivity?.createdAt].filter(Boolean);
    const lastActivity = allLastActivity.length > 0 ? new Date(Math.max(...allLastActivity.map(d => d!.getTime()))) : null;

    // Total triggers = scheduled sends + auto reply sends + keyword matches
    const totalScheduledOps = scheduledSentCount + scheduledFailedCount;
    const totalAutoReplyOps = autoReplySentCount + autoReplyFailedCount;
    const totalTriggers = totalScheduledOps + totalAutoReplyOps + keywordMatchCount;
    const successTriggers = scheduledSentCount + autoReplySentCount + keywordMatchCount;
    const failedTriggers = scheduledFailedCount + autoReplyFailedCount;

    // Total sends from aggregate fields
    const totalSendsFromScheduledMsgs = Number(totalScheduledSends._sum.sendCount || 0);
    const totalSendsFromAutoReplies = Number(totalAutoReplySends._sum.sendCount || 0);

    return {
      autoReplies: { total: totalAutoReplies, active: activeAutoReplies },
      scheduledMessages: { total: totalScheduledMessages, active: activeScheduledMessages, draft: draftScheduledMessages },
      keywords: { total: totalKeywords },
      triggers: {
        total: totalTriggers,
        today: 0, // today counts would need date-filtered queries on existing logs
        week: 0,
        month: totalTriggers,
        success: successTriggers,
        failed: failedTriggers,
        successRate: totalTriggers > 0 ? Math.round((successTriggers / totalTriggers) * 100) : 0,
        scheduledSends: totalScheduledSends,
        autoReplySends: totalAutoReplySends,
        keywordMatches: keywordMatchCount,
      },
      lastActivity: lastActivity?.toISOString() || null,
      topKeywords: topKeywordsFromDb.map(k => ({ keyword: k.keyword, count: Number(k.cnt) })),
      topGroups,
      topUsers: topUsersFromKeyword.map(u => ({ telegramId: u.telegramId?.toString(), count: Number(u.cnt) })),
      dailyStats,
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

    // Build combined activity from all 3 log tables
    const allLogs: any[] = [];

    const from = params.from ? new Date(params.from) : undefined;
    const to = params.to ? new Date(params.to + 'T23:59:59.999Z') : undefined;

    // Fetch from scheduled_post_logs
    if (!params.source || params.source === 'scheduled_message') {
      const where: any = {};
      if (params.status) where.status = params.status;
      if (from || to) {
        where.sentAt = {};
        if (from) where.sentAt.gte = from;
        if (to) where.sentAt.lte = to;
      }
      const logs = await prisma.scheduledPostLog.findMany({
        where,
        include: { scheduledMessage: { select: { title: true } } },
        orderBy: { sentAt: 'desc' },
        take: 200,
      });
      for (const l of logs) {
        allLogs.push({
          id: `spl_${l.id}`,
          eventType: l.status === 'SUCCESS' ? 'SCHEDULED_SENT' : 'SCHEDULED_FAILED',
          source: 'scheduled_message',
          sourceId: l.scheduledMessageId,
          sourceName: l.scheduledMessage?.title,
          targetChatId: l.targetChatId?.toString(),
          targetTopicId: l.targetTopicId?.toString(),
          status: l.status,
          errorMessage: l.errorMessage,
          createdAt: l.sentAt?.toISOString() || l.createdAt?.toISOString(),
          sortDate: l.sentAt || l.createdAt,
        });
      }
    }

    // Fetch from auto_reply_send_logs
    if (!params.source || params.source === 'auto_reply') {
      const where: any = {};
      if (params.status) where.status = params.status;
      if (from || to) {
        where.sentAt = {};
        if (from) where.sentAt.gte = from;
        if (to) where.sentAt.lte = to;
      }
      const logs = await prisma.autoReplySendLog.findMany({
        where,
        include: { autoReply: { select: { title: true } } },
        orderBy: { sentAt: 'desc' },
        take: 200,
      });
      for (const l of logs) {
        allLogs.push({
          id: `arsl_${l.id}`,
          eventType: l.status === 'SUCCESS' ? 'AUTO_REPLY_SENT' : 'AUTO_REPLY_FAILED',
          source: 'auto_reply',
          sourceId: l.autoReplyId,
          sourceName: l.autoReply?.title,
          targetChatId: l.targetChatId?.toString(),
          targetTopicId: l.targetTopicId?.toString(),
          status: l.status,
          errorMessage: l.errorMessage,
          createdAt: l.sentAt?.toISOString() || l.createdAt?.toISOString(),
          sortDate: l.sentAt || l.createdAt,
        });
      }
    }

    // Fetch from keyword_reply_logs
    if (!params.source || params.source === 'keyword_reply') {
      const where: any = {};
      if (from || to) {
        where.createdAt = {};
        if (from) where.createdAt.gte = from;
        if (to) where.createdAt.lte = to;
      }
      const logs = await prisma.keywordReplyLog.findMany({
        where,
        include: { keywordReply: { select: { keyword: true } }, telegramGroup: { select: { title: true } } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      for (const l of logs) {
        allLogs.push({
          id: `krl_${l.id}`,
          eventType: 'KEYWORD_MATCH',
          source: 'keyword_reply',
          sourceId: l.keywordReplyId,
          sourceName: l.keywordReply?.keyword,
          keyword: l.keywordReply?.keyword,
          matchedText: l.matchedText,
          userTelegramId: l.userTelegramId?.toString(),
          targetChatId: l.telegramGroupId?.toString(),
          groupName: l.telegramGroup?.title,
          status: 'SUCCESS',
          createdAt: l.createdAt?.toISOString(),
          sortDate: l.createdAt,
        });
      }
    }

    // Sort by date descending
    allLogs.sort((a, b) => {
      const da = a.sortDate instanceof Date ? a.sortDate.getTime() : 0;
      const db = b.sortDate instanceof Date ? b.sortDate.getTime() : 0;
      return db - da;
    });

    // Apply event type filter
    let filtered = allLogs;
    if (params.eventType) {
      filtered = allLogs.filter(l => l.eventType === params.eventType);
    }
    if (params.search) {
      const s = params.search.toLowerCase();
      filtered = filtered.filter(l =>
        (l.sourceName || '').toLowerCase().includes(s) ||
        (l.keyword || '').toLowerCase().includes(s) ||
        (l.matchedText || '').toLowerCase().includes(s) ||
        (l.userTelegramId || '').includes(s) ||
        (l.errorMessage || '').toLowerCase().includes(s)
      );
    }

    const total = filtered.length;
    const start = (page - 1) * limit;
    const items = filtered.slice(start, start + limit);

    return { items, total, pages: Math.ceil(total / limit), page };
  }

  async getAnalyticsSummary() {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      usedKeywords,
      allKeywords,
      activeGroupsScheduled,
      activeGroupsAutoReply,
      activeUsersKeyword,
    ] = await Promise.all([
      prisma.keywordReplyLog.findMany({
        select: { keywordReplyId: true },
        distinct: ['keywordReplyId'],
      }),
      prisma.autoReplyKeyword.findMany({
        select: { keyword: true, autoReplyId: true },
      }),
      prisma.$queryRaw`
        SELECT DISTINCT targetChatId FROM scheduled_post_logs WHERE sentAt >= ${weekAgo} AND targetChatId IS NOT NULL
      ` as Promise<{ targetChatId: bigint }[]>,
      prisma.$queryRaw`
        SELECT DISTINCT targetChatId FROM auto_reply_send_logs WHERE sentAt >= ${weekAgo} AND targetChatId IS NOT NULL
      ` as Promise<{ targetChatId: bigint }[]>,
      prisma.$queryRaw`
        SELECT DISTINCT userTelegramId FROM keyword_reply_logs WHERE createdAt >= ${weekAgo} AND userTelegramId IS NOT NULL
      ` as Promise<{ userTelegramId: bigint }[]>,
    ]);

    const usedKeywordIds = new Set(usedKeywords.map(k => k.keywordReplyId));
    const unusedKeywords = allKeywords
      .filter(k => !usedKeywordIds.has(k.autoReplyId))
      .map(k => ({ keyword: k.keyword, autoReplyId: k.autoReplyId }));

    const activeGroupIds = new Set([
      ...activeGroupsScheduled.map(g => g.targetChatId?.toString()),
      ...activeGroupsAutoReply.map(g => g.targetChatId?.toString()),
    ]);

    return {
      unusedKeywords,
      activeGroupsCount: activeGroupIds.size,
      activeUsersCount: activeUsersKeyword.length,
      avgDailyTriggers: 0,
    };
  }
}

export const automationService = new AutomationService();
