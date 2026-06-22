import { Prisma, PointLogType, SystemEventType } from '@prisma/client';
import { prisma } from '../prisma/client';
import { logger } from '../utils/logger';
import { pointService } from './point.service';
import { systemLogService } from './system-log.service';
import { scoringService } from './scoring.service';
import { leaderboardService } from './leaderboard.service';
import { leaderboardQueue } from '../queue/leaderboard.queue';
import { DEFAULT_BOT_USERNAME } from '../constants';

const SETTINGS_ID = 1;
const DEFAULT_REWARD_POINTS = 20;
const DEFAULT_SHARE_TEXT = 'این ربات بیشتر کد تخفیف پراپ فرم دارم استارش کن 👇';
const CLEAN_START_PARAM = 'app';

export function buildReferralCode(userId: number): string {
  return `REF_${userId.toString(36).toUpperCase().padStart(6, '0')}`;
}

export function parseReferralCode(code?: string | null): number | null {
  if (!code) return null;
  const normalized = code.trim();
  if (!normalized) return null;

  const refMatch = normalized.match(/^REF_([0-9A-Z]+)$/i);
  if (refMatch) {
    const id = parseInt(refMatch[1], 36);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  }

  const legacyMatch = normalized.match(/^ref_(\d+)$/i);
  if (legacyMatch) return Number(legacyMatch[1]);

  if (/^\d+$/.test(normalized)) return Number(normalized);
  return null;
}

export const referralService = {
  async getSettings() {
    const scoring = await scoringService.getSettings();
    return prisma.referralSettings.upsert({
      where: { id: SETTINGS_ID },
      update: { inviteRewardPoints: scoring.referralRewardPoints },
      create: { id: SETTINGS_ID, inviteRewardPoints: scoring.referralRewardPoints ?? DEFAULT_REWARD_POINTS, isEnabled: true, referralShareText: DEFAULT_SHARE_TEXT },
    });
  },

  async updateSettings(data: { inviteRewardPoints?: number; isEnabled?: boolean; referralShareText?: string }) {
    logger.info('Updating referral settings', data);
    if (typeof data.inviteRewardPoints === 'number') {
      await scoringService.updateSettings({ referralRewardPoints: data.inviteRewardPoints });
    }
    return prisma.referralSettings.upsert({
      where: { id: SETTINGS_ID },
      update: data,
      create: {
        id: SETTINGS_ID,
        inviteRewardPoints: data.inviteRewardPoints ?? DEFAULT_REWARD_POINTS,
        isEnabled: data.isEnabled ?? true,
        referralShareText: data.referralShareText ?? DEFAULT_SHARE_TEXT,
      },
    });
  },

  async getReferralLink(userId: number, botUsername: string) {
    return `https://t.me/${botUsername}?start=${buildReferralCode(userId)}`;
  },

  async getCleanReferralLink(botUsername: string) {
    return `https://t.me/${botUsername}?start=${CLEAN_START_PARAM}`;
  },

  async getShareText(): Promise<string> {
    const settings = await this.getSettings();
    return settings.referralShareText || DEFAULT_SHARE_TEXT;
  },

  async registerSuccessfulReferral(referrerId: number, referredUserId: number, referredFirstName?: string, membershipVerified = false) {
    logger.info(`Referral registration started referrerId=${referrerId}, referredUserId=${referredUserId}`);

    if (referrerId === referredUserId) {
      logger.warn(`Self referral ignored for userId=${referredUserId}`);
      return null;
    }

    const settings = await this.getSettings();
    if (!settings.isEnabled) {
      logger.info(`Referral ignored because system is disabled. referrerId=${referrerId}, referredUserId=${referredUserId}`);
      return null;
    }

    const existing = await prisma.referral.findUnique({ where: { referredUserId } });
    if (existing) {
      await prisma.user.updateMany({
        where: { id: referredUserId, referredById: null },
        data: { referredById: existing.referrerId },
      });
      logger.info(`Duplicate referral ignored for referredUserId=${referredUserId}; referredById sync attempted`);
      return existing;
    }

    const result = await prisma.$transaction(async (tx) => {
      const [referrer, referredUser] = await Promise.all([
        tx.user.findUnique({ where: { id: referrerId }, select: { id: true, telegramId: true, isBlocked: true } }),
        tx.user.findUnique({ where: { id: referredUserId }, select: { id: true, telegramId: true, referredById: true } }),
      ]);

      if (!referrer || !referredUser) {
        logger.warn(`Referral ignored because user was not found. referrerId=${referrerId}, referredUserId=${referredUserId}`);
        return null;
      }

      if (referrer.telegramId === referredUser.telegramId) {
        logger.warn(`Self referral ignored by telegramId for userId=${referredUserId}`);
        return null;
      }

      if (referredUser.referredById && referredUser.referredById !== referrerId) {
        logger.info(
          `Referral ignored because referred user already has another referrer. referredUserId=${referredUserId}, referredById=${referredUser.referredById}`
        );
        return null;
      }

      if (!referredUser.referredById) {
        await tx.user.update({
          where: { id: referredUserId },
          data: { referredById: referrerId },
        });
      }

      const referral = await tx.referral.create({
        data: {
          referrerId,
          referredUserId,
          rewardPoints: settings.inviteRewardPoints,
          membershipVerifiedAt: membershipVerified ? new Date() : null,
          membershipVerificationStatus: membershipVerified ? 'VERIFIED' : 'LEGACY_VERIFIED',
        },
      });

      await pointService.addPoints(
        referrerId,
        settings.inviteRewardPoints,
        PointLogType.REFERRAL_REWARD,
        `پاداش دعوت ${referredFirstName || `کاربر ${referredUserId}`}`,
        tx
      );

      await tx.user.update({
        where: { id: referrerId },
        data: { totalReferrals: { increment: 1 } },
      });

      await leaderboardService.logReferralInTx(tx, referrerId, referredUserId);

      return referral;
    }).catch(async (error) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        logger.info(`Referral race duplicate ignored for referredUserId=${referredUserId}`);
        return prisma.referral.findUnique({ where: { referredUserId } });
      }
      throw error;
    });

    if (result) {
      logger.info(`Referral reward granted. referrerId=${referrerId}, referredUserId=${referredUserId}, points=${settings.inviteRewardPoints}`);
      await systemLogService.log({ eventType: SystemEventType.REFERRAL, userId: referrerId, message: 'Referral reward granted', metadata: { referrerId, referredUserId, points: settings.inviteRewardPoints } });

      const season = await leaderboardService.getActiveSeason().catch(() => null);
      if (season) {
        await leaderboardQueue.add({ type: 'REBUILD_LEADERBOARD', seasonId: season.id }).catch(() => {});
      }
    }
    return result;
  },

  async getMe(userId: number, botUsername = DEFAULT_BOT_USERNAME) {
    const [user, totalReward] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        include: {
          sentReferrals: {
            include: { referredUser: { select: { id: true, telegramId: true, username: true, firstName: true, lastName: true } } },
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
      prisma.referral.aggregate({ where: { referrerId: userId }, _sum: { rewardPoints: true }, _count: true }),
    ]);

    if (!user) return null;
    return {
      user,
      referralLink: await this.getReferralLink(user.id, botUsername),
      inviteCount: totalReward._count,
      totalRewardPoints: totalReward._sum.rewardPoints || 0,
      referrals: user.sentReferrals,
    };
  },

  async getStats() {
    const [totalInvites, totalRewards, settings] = await Promise.all([
      prisma.referral.count(),
      prisma.referral.aggregate({ _sum: { rewardPoints: true } }),
      this.getSettings(),
    ]);

    return {
      totalInvites,
      totalRewardPoints: totalRewards._sum.rewardPoints || 0,
      settings,
    };
  },

  async getLeaderboard(limit = 10) {
    const grouped = await prisma.referral.groupBy({
      by: ['referrerId'],
      _count: { _all: true },
      _sum: { rewardPoints: true },
      orderBy: [{ _count: { referrerId: 'desc' } }, { _sum: { rewardPoints: 'desc' } }],
      take: limit,
    });

    const users = await prisma.user.findMany({
      where: { id: { in: grouped.map((item) => item.referrerId) } },
      select: { id: true, telegramId: true, username: true, firstName: true, lastName: true, points: true, totalReferrals: true },
    });
    const userMap = new Map(users.map((user) => [user.id, user]));

    return grouped.map((item) => ({
      referrer: userMap.get(item.referrerId),
      referrerId: item.referrerId,
      inviteCount: item._count._all,
      totalRewardPoints: item._sum.rewardPoints || 0,
    }));
  },

  async getAdminList(params: { page?: number; limit?: number; q?: string; referrerId?: number }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;
    const q = params.q?.trim();

    const where: any = {
      ...(params.referrerId ? { referrerId: params.referrerId } : {}),
      ...(q
        ? {
            OR: [
              { referrer: { firstName: { contains: q, mode: 'insensitive' } } },
              { referrer: { lastName: { contains: q, mode: 'insensitive' } } },
              { referrer: { username: { contains: q, mode: 'insensitive' } } },
              { referredUser: { firstName: { contains: q, mode: 'insensitive' } } },
              { referredUser: { lastName: { contains: q, mode: 'insensitive' } } },
              { referredUser: { username: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [items, total, stats, leaderboard] = await Promise.all([
      prisma.referral.findMany({
        where,
        include: {
          referrer: { select: { id: true, telegramId: true, username: true, firstName: true, lastName: true, points: true, totalReferrals: true } },
          referredUser: { select: { id: true, telegramId: true, username: true, firstName: true, lastName: true, createdAt: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.referral.count({ where }),
      this.getStats(),
      this.getLeaderboard(10),
    ]);

    return { items, total, pages: Math.ceil(total / limit), stats, leaderboard };
  },
};
