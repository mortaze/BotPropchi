import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import type { PrismaClient } from '@prisma/client';
import { redisClient } from '../utils/redis';
import { logger } from '../utils/logger';

const LEADERBOARD_CACHE_PREFIX = 'leaderboard:';
const LEADERBOARD_CACHE_TTL = 300;
const ACTIVE_SEASON_CACHE_KEY = 'leaderboard:active_season';

export interface LeaderboardEntry {
  rank: number;
  userId: number;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  inviteCount: number;
}

export interface SeasonInfo {
  id: number;
  name: string;
  isActive: boolean;
  startDate: Date;
  endDate: Date;
}

function formatLeaderboard(cacheRows: { userId: number; score: number }[], users: { id: number; firstName: string; lastName: string | null; username: string | null }[]): LeaderboardEntry[] {
  const userMap = new Map(users.map((u) => [u.id, u]));
  return cacheRows.map((row, index) => {
    const user = userMap.get(row.userId);
    return {
      rank: index + 1,
      userId: row.userId,
      firstName: user?.firstName ?? null,
      lastName: user?.lastName ?? null,
      username: user?.username ?? null,
      inviteCount: row.score,
    };
  });
}

export const leaderboardService = {
  async getOrCreateActiveSeason(name?: string): Promise<SeasonInfo> {
    let season = await prisma.season.findFirst({ where: { isActive: true } });
    if (season) return season;

    const now = new Date();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    season = await prisma.season.create({
      data: {
        name: name || `Season ${now.toLocaleDateString('en-CA')}`,
        isActive: true,
        startDate: now,
        endDate: endOfMonth,
      },
    });
    logger.info(`[Leaderboard] Created active season #${season.id}: ${season.name}`);
    await redisClient.del(ACTIVE_SEASON_CACHE_KEY);
    return season;
  },

  async getActiveSeason(): Promise<SeasonInfo | null> {
    const cached = await redisClient.get<SeasonInfo>(ACTIVE_SEASON_CACHE_KEY);
    if (cached) return cached;

    const season = await prisma.season.findFirst({ where: { isActive: true } });
    if (season) {
      await redisClient.set(ACTIVE_SEASON_CACHE_KEY, season, LEADERBOARD_CACHE_TTL);
    }
    return season;
  },

  async activateSeason(seasonId: number): Promise<SeasonInfo> {
    await prisma.$transaction(async (tx) => {
      await tx.season.updateMany({ where: { isActive: true }, data: { isActive: false } });
      return tx.season.update({ where: { id: seasonId }, data: { isActive: true } });
    });
    await redisClient.invalidateByPrefix(ACTIVE_SEASON_CACHE_KEY);
    const season = await prisma.season.findUnique({ where: { id: seasonId } });
    logger.info(`[Leaderboard] Season #${seasonId} activated`);
    return season!;
  },

  async endSeason(seasonId: number): Promise<void> {
    await prisma.season.update({
      where: { id: seasonId },
      data: { isActive: false },
    });
    await redisClient.del(ACTIVE_SEASON_CACHE_KEY);
    await redisClient.invalidateByPrefix(`${LEADERBOARD_CACHE_PREFIX}${seasonId}`);
    logger.info(`[Leaderboard] Season #${seasonId} ended`);
  },

  async createSeason(data: { name: string; startDate: Date; endDate: Date }): Promise<SeasonInfo> {
    const season = await prisma.season.create({ data: { ...data, isActive: false } });
    logger.info(`[Leaderboard] Created season #${season.id}: ${season.name}`);
    return season;
  },

  async listSeasons(): Promise<SeasonInfo[]> {
    return prisma.season.findMany({ orderBy: { startDate: 'desc' } });
  },

  async logReferralInTx(tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>, inviterId: number, referredId: number): Promise<void> {
    const season = await tx.season.findFirst({ where: { isActive: true } });
    if (!season) return;

    await tx.referralLog.create({
      data: { inviterId, referredId, seasonId: season.id },
    });

    await tx.leaderboardCache.upsert({
      where: { userId_seasonId: { userId: inviterId, seasonId: season.id } },
      update: { score: { increment: 1 } },
      create: { userId: inviterId, seasonId: season.id, score: 1 },
    });
  },

  async logReferral(inviterId: number, referredId: number): Promise<void> {
    const season = await this.getActiveSeason();
    if (!season) return;

    await prisma.referralLog.create({
      data: { inviterId, referredId, seasonId: season.id },
    });

    await prisma.leaderboardCache.upsert({
      where: { userId_seasonId: { userId: inviterId, seasonId: season.id } },
      update: { score: { increment: 1 } },
      create: { userId: inviterId, seasonId: season.id, score: 1 },
    });
  },

  async getLeaderboard(seasonId: number, limit = 10): Promise<LeaderboardEntry[]> {
    const cacheKey = `${LEADERBOARD_CACHE_PREFIX}${seasonId}:${limit}`;
    const cached = await redisClient.get<LeaderboardEntry[]>(cacheKey);
    if (cached) return cached;

    const cacheRows = await prisma.leaderboardCache.findMany({
      where: { seasonId },
      orderBy: { score: 'desc' },
      take: limit,
    });

    if (cacheRows.length === 0) return [];

    const userIds = cacheRows.map((r) => r.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firstName: true, lastName: true, username: true },
    });

    const leaderboard = formatLeaderboard(cacheRows, users);
    await redisClient.set(cacheKey, leaderboard, LEADERBOARD_CACHE_TTL);
    return leaderboard;
  },

  async getUserRank(seasonId: number, userId: number): Promise<{ rank: number; score: number } | null> {
    const cacheKey = `${LEADERBOARD_CACHE_PREFIX}${seasonId}:rank:${userId}`;
    const cached = await redisClient.get<{ rank: number; score: number }>(cacheKey);
    if (cached) return cached;

    const entry = await prisma.leaderboardCache.findUnique({
      where: { userId_seasonId: { userId, seasonId } },
    });
    if (!entry || entry.score === 0) return null;

    const higherCount = await prisma.leaderboardCache.count({
      where: { seasonId, score: { gt: entry.score } },
    });
    const result = { rank: higherCount + 1, score: entry.score };
    await redisClient.set(cacheKey, result, LEADERBOARD_CACHE_TTL);
    return result;
  },

  async searchUserInLeaderboard(seasonId: number, query: string): Promise<LeaderboardEntry[]> {
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { firstName: { contains: query, mode: 'insensitive' } },
          { lastName: { contains: query, mode: 'insensitive' } },
          { username: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: { id: true, firstName: true, lastName: true, username: true },
      take: 20,
    });

    if (users.length === 0) return [];

    const userIds = users.map((u) => u.id);
    const cacheRows = await prisma.leaderboardCache.findMany({
      where: { seasonId, userId: { in: userIds }, score: { gt: 0 } },
      orderBy: { score: 'desc' },
    });

    if (cacheRows.length === 0) return [];

    const scoredUserIds = new Set(cacheRows.map((r) => r.userId));
    const matchedUsers = users.filter((u) => scoredUserIds.has(u.id));

    return formatLeaderboard(cacheRows, matchedUsers);
  },

  async getLeaderboardStats(seasonId: number): Promise<{ totalReferrals: number; totalInviters: number }> {
    const [totalReferrals, inviters] = await Promise.all([
      prisma.referralLog.count({ where: { seasonId } }),
      prisma.leaderboardCache.count({ where: { seasonId, score: { gt: 0 } } }),
    ]);
    return { totalReferrals, totalInviters: inviters };
  },

  async invalidateCache(seasonId: number): Promise<void> {
    await redisClient.invalidateByPrefix(`${LEADERBOARD_CACHE_PREFIX}${seasonId}`);
  },
};
