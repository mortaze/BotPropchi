import { prisma } from '../prisma/client';
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

  async endSeason(seasonId: number): Promise<void> {
    await prisma.season.update({
      where: { id: seasonId },
      data: { isActive: false },
    });
    await redisClient.del(ACTIVE_SEASON_CACHE_KEY);
    await redisClient.invalidateByPrefix(`${LEADERBOARD_CACHE_PREFIX}${seasonId}`);
  },

  async createSeason(data: { name: string; startDate: Date; endDate: Date }): Promise<SeasonInfo> {
    const season = await prisma.season.create({ data: { ...data, isActive: false } });
    logger.info(`[Leaderboard] Created season #${season.id}: ${season.name}`);
    return season;
  },

  async listSeasons(): Promise<SeasonInfo[]> {
    return prisma.season.findMany({ orderBy: { startDate: 'desc' } });
  },

  async logReferral(inviterId: number, referredId: number): Promise<void> {
    const season = await this.getActiveSeason();
    if (!season) return;

    await prisma.referralLog.create({
      data: {
        inviterId,
        referredId,
        seasonId: season.id,
      },
    });
  },

  async getLeaderboard(seasonId: number, limit = 10): Promise<LeaderboardEntry[]> {
    const cacheKey = `${LEADERBOARD_CACHE_PREFIX}${seasonId}:${limit}`;
    const cached = await redisClient.get<LeaderboardEntry[]>(cacheKey);
    if (cached) return cached;

    const rows = await prisma.referralLog.groupBy({
      by: ['inviterId'],
      where: { seasonId },
      _count: { id: true },
      orderBy: [{ _count: { id: 'desc' } }],
      take: limit,
    });

    if (rows.length === 0) return [];

    const userIds = rows.map((r) => r.inviterId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firstName: true, lastName: true, username: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    const leaderboard: LeaderboardEntry[] = rows.map((row, index) => {
      const user = userMap.get(row.inviterId);
      return {
        rank: index + 1,
        userId: row.inviterId,
        firstName: user?.firstName ?? null,
        lastName: user?.lastName ?? null,
        username: user?.username ?? null,
        inviteCount: row._count.id,
      };
    });

    await redisClient.set(cacheKey, leaderboard, LEADERBOARD_CACHE_TTL);
    return leaderboard;
  },

  async getLeaderboardStats(seasonId: number): Promise<{ totalReferrals: number; totalInviters: number }> {
    const [totalReferrals, inviters] = await Promise.all([
      prisma.referralLog.count({ where: { seasonId } }),
      prisma.referralLog.groupBy({ by: ['inviterId'], where: { seasonId }, _count: { id: true } }),
    ]);
    return { totalReferrals, totalInviters: inviters.length };
  },

  async invalidateCache(seasonId: number): Promise<void> {
    await redisClient.invalidateByPrefix(`${LEADERBOARD_CACHE_PREFIX}${seasonId}`);
  },
};
