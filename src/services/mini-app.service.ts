import crypto from 'crypto';
import { PointLogType, Prisma, SystemEventType } from '@prisma/client';
import { config } from '../config';
import { prisma } from '../prisma/client';
import { scoringService } from './scoring.service';
import { pointService } from './point.service';
import { systemLogService } from './system-log.service';

const INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60;

type TelegramWebAppUser = {
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

class MiniAppService {
  verifyInitData(initData: string): TelegramWebAppUser {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) throw new Error('داده احراز هویت تلگرام معتبر نیست');

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
      throw new Error('امضای Mini App معتبر نیست');
    }

    const authDate = Number(params.get('auth_date'));
    if (!Number.isFinite(authDate) || Date.now() / 1000 - authDate > INIT_DATA_MAX_AGE_SECONDS) {
      throw new Error('اعتبار ورود تلگرام منقضی شده است');
    }

    const rawUser = params.get('user');
    if (!rawUser) throw new Error('کاربر تلگرام در InitData یافت نشد');

    const user = JSON.parse(rawUser) as TelegramWebAppUser;
    if (!user?.id) throw new Error('آیدی تلگرام معتبر نیست');
    return user;
  }

  async getOrCreateProfile(initData: string) {
    const telegramUser = this.verifyInitData(initData);
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

    return serializeBigInts({ user, isComplete: this.isProfileComplete(user), telegramUser });
  }

  async updateProfile(initData: string, input: MiniAppProfileInput) {
    const telegramUser = this.verifyInitData(initData);
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

    await systemLogService.log({
      eventType: result.wasComplete ? SystemEventType.USER_PROFILE_UPDATED : SystemEventType.USER_PROFILE_COMPLETED,
      userId: result.user.id,
      telegramId: result.user.telegramId,
      message: result.wasComplete ? 'User profile updated from Telegram Mini App' : 'User profile completed from Telegram Mini App',
      metadata: { rewardPoints: result.rewardPoints, profileCompleted: result.completedNow } as Prisma.InputJsonObject,
    });

    return serializeBigInts(result);
  }

  private isProfileComplete(user: { firstName?: string | null; lastName?: string | null; phoneNumber?: string | null; profileCompleted?: boolean }) {
    return Boolean(user.profileCompleted || (user.firstName && user.lastName && user.phoneNumber));
  }
}

export const miniAppService = new MiniAppService();
