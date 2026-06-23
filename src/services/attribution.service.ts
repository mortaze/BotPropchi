// src/services/attribution.service.ts
// سرویس Attribution و ردیابی مسیر جذب کاربران

import { prisma } from '../prisma/client';
import { logger } from '../utils/logger';

const SOURCE_LABELS: Record<string, string> = {
  referral: 'دعوت دوستان',
  direct: 'استارت مستقیم',
  ads: 'تبلیغات',
  website: 'سایت',
  telegram: 'تلگرام',
  utm: 'کمپین',
  unknown: 'ناشناس',
};

function detectAcquisitionSource(params: {
  referralCode?: string;
  startPayload?: string;
  existingUser?: boolean;
}): string {
  if (params.existingUser) return 'returning';
  if (params.referralCode) return 'referral';
  if (!params.startPayload) return 'direct';
  const payload = params.startPayload.trim();
  if (payload.startsWith('utm_') || payload.includes('utm_source')) return 'utm';
  if (payload.startsWith('ad_') || payload.startsWith('campaign_')) return 'ads';
  if (payload.startsWith('site_') || payload.startsWith('web_')) return 'website';
  if (payload.startsWith('tg_') || payload.startsWith('channel_')) return 'telegram';
  return 'direct';
}

function calculateConfidence(params: {
  hasReferralCode: boolean;
  hasStartPayload: boolean;
  hasInviter: boolean;
  hasUsername: boolean;
  hasLanguageCode: boolean;
  source: string;
  startCount: number;
  hasFirstActivity: boolean;
  hasLastActivity: boolean;
}): number {
  let score = 0;
  if (params.source && params.source !== 'unknown' && params.source !== 'direct') score += 25;
  if (params.hasReferralCode) score += 20;
  if (params.hasInviter) score += 15;
  if (params.hasStartPayload) score += 10;
  if (params.hasUsername) score += 5;
  if (params.hasLanguageCode) score += 5;
  if (params.hasFirstActivity) score += 10;
  if (params.hasLastActivity) score += 5;
  if (params.startCount > 1) score += 5;
  return Math.min(100, score);
}

export const attributionService = {
  // ثبت Attribution هنگام اولین /start
  async recordFirstStart(params: {
    userId: number;
    telegramId: bigint;
    username?: string;
    firstName: string;
    lastName?: string;
    languageCode?: string;
    startPayload?: string;
    referralCode?: string;
    inviterUserId?: number;
    deviceType?: string;
  }) {
    const now = new Date();
    const source = detectAcquisitionSource({
      referralCode: params.referralCode,
      startPayload: params.startPayload,
      existingUser: false,
    });

    // Parse deep link payload
    let campaignId: string | undefined;
    let inviteLinkId: string | undefined;
    let deepLinkPayload: string | undefined;
    if (params.startPayload) {
      const payload = params.startPayload.trim();
      if (payload.startsWith('campaign_')) campaignId = payload.replace('campaign_', '');
      else if (payload.startsWith('invite_')) inviteLinkId = payload.replace('invite_', '');
      else deepLinkPayload = payload;
    }

    const confidence = calculateConfidence({
      hasReferralCode: Boolean(params.referralCode),
      hasStartPayload: Boolean(params.startPayload),
      hasInviter: Boolean(params.inviterUserId),
      hasUsername: Boolean(params.username),
      hasLanguageCode: Boolean(params.languageCode),
      source,
      startCount: 1,
      hasFirstActivity: true,
      hasLastActivity: true,
    });

    const confidenceFlags: Record<string, boolean> = {
      hasReferralCode: Boolean(params.referralCode),
      hasStartPayload: Boolean(params.startPayload),
      hasInviter: Boolean(params.inviterUserId),
      hasUsername: Boolean(params.username),
      hasLanguageCode: Boolean(params.languageCode),
      sourceIsDirect: source === 'direct',
      sourceIsUnknown: source === 'unknown',
    };

    // Create UserAttribution
    const attribution = await prisma.userAttribution.create({
      data: {
        userId: params.userId,
        telegramId: params.telegramId,
        startedAt: now,
        firstSeenAt: now,
        firstStartPayload: params.startPayload,
        acquisitionSource: source,
        referralCode: params.referralCode,
        inviterUserId: params.inviterUserId,
        campaignId,
        inviteLinkId,
        deepLinkPayload,
        registrationDate: now,
        firstActivityAt: now,
        lastActivityAt: now,
        startCount: 1,
        activeDaysCount: 1,
        messagesSentCount: 0,
        activitiesCount: 0,
        successfulReferrals: 0,
        lastDeviceType: params.deviceType,
        confidenceScore: confidence,
        confidenceFlags,
      },
    });

    // Create AttributionEvent
    await prisma.attributionEvent.create({
      data: {
        userId: params.userId,
        attributionId: attribution.id,
        eventType: 'BOT_STARTED',
        payload: {
          firstName: params.firstName,
          lastName: params.lastName,
          username: params.username,
          languageCode: params.languageCode,
          startPayload: params.startPayload,
          deviceType: params.deviceType,
        },
        source,
        referralCode: params.referralCode,
        inviterUserId: params.inviterUserId,
        campaignId,
        sessionId: `start_${Date.now()}`,
        confidenceContribution: confidence,
      },
    });

    logger.info(`[Attribution] First start recorded: userId=${params.userId} source=${source} confidence=${confidence}`);
    return attribution;
  },

  // ثبت Attribution هنگام start مجدد
  async recordSubsequentStart(params: {
    userId: number;
    telegramId: bigint;
    username?: string;
    firstName: string;
    lastName?: string;
    languageCode?: string;
    startPayload?: string;
    deviceType?: string;
  }) {
    const now = new Date();
    const attribution = await prisma.userAttribution.findUnique({ where: { userId: params.userId } });
    if (!attribution) {
      // Fallback: create if missing
      return this.recordFirstStart({
        userId: params.userId,
        telegramId: params.telegramId,
        username: params.username,
        firstName: params.firstName,
        lastName: params.lastName,
        languageCode: params.languageCode,
        startPayload: params.startPayload,
        deviceType: params.deviceType,
      });
    }

    const newStartCount = attribution.startCount + 1;
    const confidence = calculateConfidence({
      hasReferralCode: Boolean(attribution.referralCode),
      hasStartPayload: Boolean(attribution.firstStartPayload),
      hasInviter: Boolean(attribution.inviterUserId),
      hasUsername: Boolean(params.username),
      hasLanguageCode: Boolean(params.languageCode),
      source: attribution.acquisitionSource,
      startCount: newStartCount,
      hasFirstActivity: Boolean(attribution.firstActivityAt),
      hasLastActivity: true,
    });

    await prisma.userAttribution.update({
      where: { userId: params.userId },
      data: {
        startCount: newStartCount,
        lastActivityAt: now,
        lastDeviceType: params.deviceType ?? attribution.lastDeviceType,
        confidenceScore: confidence,
      },
    });

    await prisma.attributionEvent.create({
      data: {
        userId: params.userId,
        attributionId: attribution.id,
        eventType: 'BOT_RESTARTED',
        payload: {
          firstName: params.firstName,
          lastName: params.lastName,
          username: params.username,
          languageCode: params.languageCode,
          startPayload: params.startPayload,
          startCount: newStartCount,
        },
        source: attribution.acquisitionSource,
        sessionId: `start_${Date.now()}`,
        confidenceContribution: 0,
      },
    });

    return attribution;
  },

  // ثبت فعالیت کاربر
  async recordActivity(userId: number, activityType: string = 'message') {
    const now = new Date();
    const today = new Date(now);
    today.setUTCHours(0, 0, 0, 0);

    await prisma.userAttribution.update({
      where: { userId },
      data: {
        lastActivityAt: now,
        messagesSentCount: activityType === 'message' ? { increment: 1 } : undefined,
        activitiesCount: { increment: 1 },
      },
    }).catch(() => {});

    // Update User model too
    await prisma.user.update({
      where: { id: userId },
      data: {
        lastActivityAt: now,
        messagesSentCount: activityType === 'message' ? { increment: 1 } : undefined,
        activitiesCount: { increment: 1 },
      },
    }).catch(() => {});
  },

  // ثبت دعوت موفق
  async recordSuccessfulReferral(inviterUserId: number) {
    await prisma.userAttribution.update({
      where: { userId: inviterUserId },
      data: { successfulReferrals: { increment: 1 } },
    }).catch(() => {});

    await prisma.user.update({
      where: { id: inviterUserId },
      data: { successfulReferrals: { increment: 1 } },
    }).catch(() => {});
  },

  // دریافت Attribution یک کاربر
  async getUserAttribution(userId: number) {
    return prisma.userAttribution.findUnique({
      where: { userId },
      include: { events: { orderBy: { createdAt: 'desc' }, take: 20 } },
    });
  },

  // دریافت Attribution با TelegramId
  async getUserAttributionByTelegramId(telegramId: bigint) {
    return prisma.userAttribution.findUnique({
      where: { telegramId },
      include: { events: { orderBy: { createdAt: 'desc' }, take: 20 } },
    });
  },

  // Data Validation: بررسی صحت داده‌ها
  async validateAttribution(userId: number) {
    const attribution = await prisma.userAttribution.findUnique({ where: { userId } });
    if (!attribution) return { valid: false, issues: ['Attribution record not found'] };

    const issues: string[] = [];
    const warnings: string[] = [];

    if (!attribution.acquisitionSource || attribution.acquisitionSource === 'unknown') {
      issues.push('Source is missing or unknown');
    }
    if (attribution.inviterUserId && !attribution.referralCode) {
      warnings.push('Has inviter but no referral code');
    }
    if (attribution.referralCode && !attribution.inviterUserId) {
      warnings.push('Has referral code but no inviter user');
    }
    if (!attribution.firstStartPayload && attribution.acquisitionSource === 'direct') {
      warnings.push('Direct source with no start payload');
    }
    if (!attribution.firstActivityAt) {
      issues.push('No first activity recorded');
    }
    if (attribution.startCount === 0) {
      issues.push('Start count is zero');
    }

    return {
      valid: issues.length === 0,
      issues,
      warnings,
      confidenceScore: attribution.confidenceScore,
    };
  },

  // لیست کاربران با Attribution کم اعتماد
  async getLowConfidenceUsers(minConfidence: number = 80, limit: number = 50) {
    return prisma.userAttribution.findMany({
      where: { confidenceScore: { lt: minConfidence } },
      orderBy: { confidenceScore: 'asc' },
      take: limit,
      select: {
        userId: true,
        telegramId: true,
        acquisitionSource: true,
        confidenceScore: true,
        confidenceFlags: true,
        startedAt: true,
        inviterUserId: true,
      },
    });
  },
};

export { SOURCE_LABELS, detectAcquisitionSource, calculateConfidence };
