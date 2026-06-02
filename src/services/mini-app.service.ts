import crypto from 'crypto';
import { PointLogType, Prisma, SystemEventType } from '@prisma/client';
import { config } from '../config';
import { prisma } from '../prisma/client';
import { scoringService } from './scoring.service';
import { pointService } from './point.service';
import { systemLogService } from './system-log.service';
import { MiniAppFailureEvent, miniAppLogService } from './mini-app-log.service';

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
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.replace(/[\s\-()]/g, '');
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

function getValidationSnapshot(initData: string): ValidationSnapshot {
  const snapshot: ValidationSnapshot = {
    rawInitData: initData,
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
      const hashBuffer = Buffer.from(hash, 'hex');
      const calculatedBuffer = Buffer.from(calculatedHash, 'hex');

      if (hashBuffer.length !== calculatedBuffer.length || !crypto.timingSafeEqual(hashBuffer, calculatedBuffer)) {
        throw new MiniAppValidationError('MINI_APP_INVALID_HASH', 'امضای Mini App معتبر نیست', { ...basePayload, reason: 'hash_mismatch', receivedHash: hash, calculatedHash });
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
    const user = await prisma.user.upsert({
      where: { telegramId },
      update: {
        username: telegramUser.username,
        lastActiveAt: new Date(),
      },
      create: {
        telegramId,
        username: telegramUser.username,
        firstName: telegramUser.first_name || 'کاربر تلگرام',
        lastName: telegramUser.last_name,
      },
    });

    await miniAppLogService.log({
      telegramId,
      userId: user.id,
      eventType: 'MINI_APP_PROFILE_LOADED',
      message: 'Mini App user profile loaded',
      payload: { profileCompleted: user.profileCompleted } as Prisma.InputJsonObject,
      userAgent: context.userAgent,
    });

    return serializeBigInts({ user, isComplete: this.isProfileComplete(user), telegramUser, debug: { validation: true, hashValid: true, userReceived: true } });
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
      const existing = await tx.user.upsert({
        where: { telegramId },
        update: {
          username: telegramUser.username,
          lastActiveAt: new Date(),
        },
        create: {
          telegramId,
          username: telegramUser.username,
          firstName: telegramUser.first_name || firstName,
          lastName: telegramUser.last_name || lastName,
        },
      });

      const rewardClaim = completedNow
        ? await tx.user.updateMany({
            where: { id: existing.id, profileCompleted: false },
            data: { profileCompleted: true, profileCompletedAt: existing.profileCompletedAt || new Date() },
          })
        : { count: 0 };
      const shouldGrantReward = rewardClaim.count === 1 && scoring.profileCompletionPoints > 0;

      const updated = await tx.user.update({
        where: { id: existing.id },
        data: {
          firstName,
          lastName,
          phoneNumber,
          profileCompleted: completedNow,
          profileCompletedAt: completedNow ? existing.profileCompletedAt || new Date() : existing.profileCompletedAt,
          username: telegramUser.username,
          lastActiveAt: new Date(),
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

      return { user: updated, rewardPoints: shouldGrantReward ? scoring.profileCompletionPoints : 0, wasComplete: Boolean(existing.profileCompleted), completedNow };
    });

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

    return serializeBigInts({ ...result, debug: { validation: true, hashValid: true, userReceived: true } });
  }

  private isProfileComplete(user: { firstName?: string | null; lastName?: string | null; phoneNumber?: string | null; profileCompleted?: boolean }) {
    return Boolean(user.profileCompleted || (user.firstName && user.lastName && user.phoneNumber));
  }
}

export const miniAppService = new MiniAppService();
