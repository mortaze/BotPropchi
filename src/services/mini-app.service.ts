import crypto from 'crypto';
import { PointLogType, Prisma, SystemEventType } from '@prisma/client';
import { config } from '../config';
import { prisma } from '../prisma/client';
import { scoringService } from './scoring.service';
import { discountService } from './discount.service';
import { pointService } from './point.service';
import { referralService } from './referral.service';
import { systemLogService } from './system-log.service';
import { MiniAppFailureEvent, miniAppLogService } from './mini-app-log.service';
import { logger } from '../utils/logger';

const INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60;

export type TelegramWebAppUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

export type MiniAppProfileInput = {
  firstName: string;
  lastName: string;
  phoneNumber?: string | null;
};

export class MiniAppValidationError extends Error {
  constructor(public code: MiniAppFailureEvent, message: string, public details: Prisma.InputJsonObject = {}) {
    super(message);
    this.name = 'MiniAppValidationError';
  }
}

type ValidationSnapshot = {
  rawInitData: string;
  initDataLength: number;
  hash: string | null;
  authDate: string | null;
  queryId: string | null;
  userId: number | null;
  username: string | null;
  parseError?: string;
};

type ValidationContext = {
  userAgent?: string | null;
  endpoint?: string;
  method?: string;
};

function normalizePhoneNumber(value?: string | null) {
  if (!value) return null;
  const compact = value.trim().replace(/[\s\-()]/g, '');
  if (!compact) return null;
  let normalized = compact;
  if (normalized.startsWith('+98')) normalized = `0${normalized.slice(3)}`;
  else if (normalized.startsWith('0098')) normalized = `0${normalized.slice(4)}`;
  else if (normalized.startsWith('98')) normalized = `0${normalized.slice(2)}`;
  if (!/^09\d{9}$/.test(normalized)) {
    throw new MiniAppValidationError('MINI_APP_INVALID_PROFILE', 'شماره موبایل معتبر ایران وارد کنید. نمونه: 09123456789', { reason: 'invalid_iran_mobile', receivedLength: normalized.length });
  }
  return normalized;
}

function sanitizeName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function serializeBigInts(value: any): any {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(serializeBigInts);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializeBigInts(item)]));
  return value;
}

function miniAppLog(message: string, payload: Record<string, unknown> = {}) {
  logger.info(`[MiniApp] ${message}`, payload);
}

function miniAppErrorLog(message: string, payload: Record<string, unknown> = {}) {
  logger.error(`[MiniApp Error] ${message}`, payload);
}


async function userRepositoryLikeRank(userId: number) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { points: true } });
  if (!user) return 0;
  return (await prisma.user.count({ where: { points: { gt: user.points }, isBlocked: false } })) + 1;
}

function getValidationSnapshot(initData: string): ValidationSnapshot {
  const snapshot: ValidationSnapshot = {
    rawInitData: config.miniApp.debug ? initData : '[redacted]',
    initDataLength: initData.length,
    hash: null,
    authDate: null,
    queryId: null,
    userId: null,
    username: null,
  };

  try {
    const params = new URLSearchParams(initData);
    snapshot.hash = params.get('hash');
    snapshot.authDate = params.get('auth_date');
    snapshot.queryId = params.get('query_id');
    const rawUser = params.get('user');
    if (rawUser) {
      const user = JSON.parse(rawUser) as TelegramWebAppUser;
      snapshot.userId = user?.id ?? null;
      snapshot.username = user?.username ?? null;
    }
  } catch (error) {
    snapshot.parseError = error instanceof Error ? error.message : 'Unable to parse initData snapshot';
  }

  return snapshot;
}

class MiniAppService {
  async verifyInitData(initData: string, context: ValidationContext = {}): Promise<TelegramWebAppUser> {
    const snapshot = getValidationSnapshot(initData || '');
    const basePayload = { ...snapshot, endpoint: context.endpoint, method: context.method } as Prisma.InputJsonObject;

    await miniAppLogService.log({
      telegramId: snapshot.userId,
      eventType: 'MINI_APP_VALIDATE_BEFORE',
      message: 'Mini App initData validation started',
      payload: basePayload,
      userAgent: context.userAgent,
    });

    try {
      if (!initData) {
        throw new MiniAppValidationError('MINI_APP_NO_INIT_DATA', 'InitData تلگرام دریافت نشد', { ...basePayload, reason: 'empty_init_data' });
      }

      const params = new URLSearchParams(initData);
      const hash = params.get('hash');
      if (!hash) {
        throw new MiniAppValidationError('MINI_APP_INVALID_HASH', 'Hash احراز هویت تلگرام در initData وجود ندارد', { ...basePayload, reason: 'missing_hash' });
      }

      params.delete('hash');
      const dataCheckString = Array.from(params.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

      const secretKey = crypto.createHmac('sha256', 'WebAppData').update(config.bot.token).digest();
      const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
      if (!/^[a-f0-9]{64}$/i.test(hash)) {
        throw new MiniAppValidationError('MINI_APP_INVALID_HASH', 'فرمت Hash احراز هویت تلگرام معتبر نیست', { ...basePayload, reason: 'malformed_hash' });
      }
      const hashBuffer = Buffer.from(hash, 'hex');
      const calculatedBuffer = Buffer.from(calculatedHash, 'hex');

      if (hashBuffer.length !== calculatedBuffer.length || !crypto.timingSafeEqual(hashBuffer, calculatedBuffer)) {
        throw new MiniAppValidationError('MINI_APP_INVALID_HASH', 'امضای Mini App معتبر نیست', { ...basePayload, reason: 'hash_mismatch', receivedHash: config.miniApp.debug ? hash : '[redacted]', calculatedHash: config.miniApp.debug ? calculatedHash : '[redacted]' });
      }

      const authDate = Number(params.get('auth_date'));
      const ageSeconds = Date.now() / 1000 - authDate;
      if (!Number.isFinite(authDate) || ageSeconds > INIT_DATA_MAX_AGE_SECONDS) {
        throw new MiniAppValidationError('MINI_APP_EXPIRED_AUTH', 'اعتبار ورود تلگرام منقضی شده است', { ...basePayload, reason: 'expired_or_invalid_auth_date', ageSeconds });
      }

      const rawUser = params.get('user');
      if (!rawUser) {
        throw new MiniAppValidationError('MINI_APP_INVALID_USER', 'کاربر تلگرام در InitData یافت نشد', { ...basePayload, reason: 'missing_user' });
      }

      const user = JSON.parse(rawUser) as TelegramWebAppUser;
      if (!user?.id) {
        throw new MiniAppValidationError('MINI_APP_INVALID_USER', 'آیدی تلگرام معتبر نیست', { ...basePayload, reason: 'missing_user_id' });
      }

      miniAppLog('Validation Result', { telegramId: user.id, validationResult: true, initDataLength: initData.length });

      await miniAppLogService.log({
        telegramId: user.id,
        eventType: 'MINI_APP_AUTH_SUCCESS',
        message: 'Mini App initData validation succeeded',
        payload: { ...basePayload, success: true, user: { id: user.id, username: user.username, firstName: user.first_name, lastName: user.last_name } } as Prisma.InputJsonObject,
        userAgent: context.userAgent,
      });

      return user;
    } catch (error) {
      const validationError = error instanceof MiniAppValidationError
        ? error
        : new MiniAppValidationError('MINI_APP_SERVER_ERROR', error instanceof Error ? error.message : 'خطای داخلی در اعتبارسنجی Mini App', { ...basePayload, reason: 'unexpected_error' });

      miniAppErrorLog('Validation Failure', {
        reason: validationError.message,
        telegramId: snapshot.userId,
        initDataLength: snapshot.initDataLength,
        validationFailure: validationError.code,
      });

      await miniAppLogService.log({
        telegramId: snapshot.userId,
        eventType: validationError.code,
        message: validationError.message,
        payload: { ...basePayload, success: false, failure: true, failureReason: validationError.message, failureCode: validationError.code, details: validationError.details } as Prisma.InputJsonObject,
        userAgent: context.userAgent,
      });

      throw validationError;
    }
  }

  async getOrCreateProfile(initData: string, context: ValidationContext = {}) {
    const telegramUser = await this.verifyInitData(initData, context);
    const telegramId = BigInt(telegramUser.id);
    miniAppLog('Telegram ID', { telegramId: telegramId.toString() });

    const existing = await prisma.user.findUnique({ where: { telegramId } });
    miniAppLog('User Found', { telegramId: telegramId.toString(), userFound: Boolean(existing) });

    const user = existing
      ? await prisma.user.update({
          where: { telegramId },
          data: {
            username: telegramUser.username,
            telegramFirstName: telegramUser.first_name,
            telegramLastName: telegramUser.last_name,
            firstName: existing.profileCompleted ? existing.firstName : (existing.firstName || telegramUser.first_name || 'کاربر تلگرام'),
            lastName: existing.profileCompleted ? existing.lastName : (existing.lastName || telegramUser.last_name),
          },
        })
      : await prisma.user.create({
          data: {
            telegramId,
            username: telegramUser.username,
            firstName: telegramUser.first_name || 'کاربر تلگرام',
            lastName: telegramUser.last_name,
            telegramFirstName: telegramUser.first_name,
            telegramLastName: telegramUser.last_name,
          },
        });

    if (!existing) miniAppLog('User Created', { telegramId: telegramId.toString(), userId: user.id });
    miniAppLog('Profile Loaded', { telegramId: telegramId.toString(), userId: user.id, profileCompleted: user.profileCompleted });

    await miniAppLogService.log({
      telegramId,
      userId: user.id,
      eventType: 'MINI_APP_PROFILE_LOADED',
      message: 'Mini App user profile loaded',
      payload: { profileCompleted: user.profileCompleted, userFound: Boolean(existing), userCreated: !existing } as Prisma.InputJsonObject,
      userAgent: context.userAgent,
    });

    const referralStats = await this.getReferralStats(user.id);
    return serializeBigInts({ user: this.toMiniAppUser(user), referralStats, isComplete: this.isProfileComplete(user), telegramUser, debug: { validation: true, hashValid: true, userReceived: true } });
  }

  async updateProfile(initData: string, input: MiniAppProfileInput, context: ValidationContext = {}) {
    const telegramUser = await this.verifyInitData(initData, context);
    const telegramId = BigInt(telegramUser.id);
    const firstName = sanitizeName(input.firstName);
    const lastName = sanitizeName(input.lastName);
    const phoneNumber = normalizePhoneNumber(input.phoneNumber);
    const completedNow = Boolean(firstName && lastName && phoneNumber);
    const scoring = await scoringService.getSettings();

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { telegramId } });
      const userRecord = existing
        ? await tx.user.update({
            where: { telegramId },
            data: { username: telegramUser.username, telegramFirstName: telegramUser.first_name, telegramLastName: telegramUser.last_name },
          })
        : await tx.user.create({
            data: {
              telegramId,
              username: telegramUser.username,
              firstName: telegramUser.first_name || firstName || 'کاربر تلگرام',
              lastName: telegramUser.last_name || lastName,
              telegramFirstName: telegramUser.first_name,
              telegramLastName: telegramUser.last_name,
            },
          });

      if (!existing) miniAppLog('User Created', { telegramId: telegramId.toString(), userId: userRecord.id });

      const rewardClaim = completedNow
        ? await tx.user.updateMany({
            where: { id: userRecord.id, profileCompleted: false },
            data: { profileCompleted: true },
          })
        : { count: 0 };
      const shouldGrantReward = rewardClaim.count === 1 && scoring.profileCompletionPoints > 0;

      const updated = await tx.user.update({
        where: { id: userRecord.id },
        data: {
          firstName,
          lastName,
          realFirstName: firstName,
          realLastName: lastName,
          phoneNumber,
          profileCompleted: completedNow || userRecord.profileCompleted,
          username: telegramUser.username,
        },
      });

      if (shouldGrantReward) {
        await pointService.addPoints(
          updated.id,
          scoring.profileCompletionPoints,
          PointLogType.PROFILE_COMPLETION_REWARD,
          'پاداش تکمیل پروفایل کاربری',
          tx,
        );
      }

      return { user: updated, rewardPoints: shouldGrantReward ? scoring.profileCompletionPoints : 0, wasComplete: Boolean(userRecord.profileCompleted), completedNow };
    });

    miniAppLog('Profile Updated', { telegramId: telegramId.toString(), userId: result.user.id, profileCompleted: result.completedNow, rewardPoints: result.rewardPoints });

    await Promise.all([
      systemLogService.log({
        eventType: result.wasComplete ? SystemEventType.USER_PROFILE_UPDATED : SystemEventType.USER_PROFILE_COMPLETED,
        userId: result.user.id,
        telegramId: result.user.telegramId,
        message: result.wasComplete ? 'User profile updated from Telegram Mini App' : 'User profile completed from Telegram Mini App',
        metadata: { rewardPoints: result.rewardPoints, profileCompleted: result.completedNow } as Prisma.InputJsonObject,
      }),
      miniAppLogService.log({
        telegramId,
        userId: result.user.id,
        eventType: 'MINI_APP_PROFILE_UPDATED',
        message: result.wasComplete ? 'Mini App profile updated' : 'Mini App profile completed',
        payload: { rewardPoints: result.rewardPoints, profileCompleted: result.completedNow } as Prisma.InputJsonObject,
        userAgent: context.userAgent,
      }),
    ]);

    const referralStats = await this.getReferralStats(result.user.id);
    return serializeBigInts({ ...result, user: this.toMiniAppUser(result.user), referralStats, debug: { validation: true, hashValid: true, userReceived: true } });
  }

  async getAppData() {
    const [settings, scoring, propFirms] = await Promise.all([
      this.getMiniAppSettings(),
      scoringService.getSettings(),
      prisma.propFirm.findMany({
        where: { isActive: true },
        select: {
          id: true, name: true, slug: true, description: true, logoUrl: true, websiteUrl: true, reviewLink: true, isActive: true,
          discountCodes: {
            where: { isActive: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
            orderBy: [{ isFeatured: 'desc' }, { usageCount: 'desc' }, { createdAt: 'desc' }],
            take: 1,
            select: { id: true, title: true, code: true, discountPercent: true, affiliateLink: true, expiresAt: true, isFeatured: true },
          },
        },
        orderBy: { name: 'asc' },
      }),
    ]);
    return serializeBigInts({ settings: { ...settings, profileCompletionPoints: scoring.profileCompletionPoints }, propFirms });
  }

  async getDiscountsForPropFirm(propFirmId: number) {
    return serializeBigInts(await discountService.getByPropFirm(propFirmId, 1, 50));
  }

  async registerDiscountClick(initData: string, discountCodeId: number, context: ValidationContext = {}) {
    const telegramUser = await this.verifyInitData(initData, context);
    const user = await prisma.user.findUnique({ where: { telegramId: BigInt(telegramUser.id) } });
    const discount = await prisma.discountCode.findUnique({ where: { id: discountCodeId }, include: { propFirm: true } });
    if (!discount || !discount.isActive || (discount.expiresAt && discount.expiresAt <= new Date())) {
      throw new MiniAppValidationError('MINI_APP_INVALID_PROFILE', 'کد تخفیف فعال یافت نشد', { reason: 'inactive_discount', discountCodeId });
    }
    if (user) await discountService.handleClick(discountCodeId, user.id);
    else await discountService.incrementUsage(discountCodeId);
    return serializeBigInts({ discount });
  }

  private async getMiniAppSettings() {
    const rows = await prisma.systemSetting.findMany({ where: { key: { in: ['mini_app_site_url', 'mini_app_about_text'] } } });
    const map = Object.fromEntries(rows.map((row) => [row.key, typeof row.value === 'string' ? row.value : String(row.value ?? '')]));
    return {
      siteUrl: map.mini_app_site_url || '',
      aboutText: map.mini_app_about_text || '',
    };
  }

  private async getReferralStats(userId: number) {
    const [stats, rank] = await Promise.all([
      referralService.getMe(userId, process.env.BOT_USERNAME || 'BotPropchiBot'),
      userRepositoryLikeRank(userId),
    ]);
    return stats ? { referralLink: stats.referralLink, inviteCount: stats.inviteCount, totalRewardPoints: stats.totalRewardPoints, successfulInvites: stats.inviteCount, rank } : null;
  }

  private toMiniAppUser(user: { [key: string]: any }) {
    return { ...user, firstName: user.realFirstName || (user.profileCompleted ? user.firstName : ''), lastName: user.realLastName || (user.profileCompleted ? user.lastName : '') };
  }

  private isProfileComplete(user: { realFirstName?: string | null; realLastName?: string | null; phoneNumber?: string | null; profileCompleted?: boolean }) {
    return Boolean(user.profileCompleted || (user.realFirstName && user.realLastName && user.phoneNumber));
  }
}

export const miniAppService = new MiniAppService();
