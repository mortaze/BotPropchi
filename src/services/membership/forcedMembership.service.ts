import { prisma } from '../../prisma/client';
import { logger } from '../../utils/logger';

export interface ForcedMembershipSettingsData {
  enabled: boolean;
  channelId: string;
  notJoinedMessage: string;
  leaveWarningMessage: string;
  helpMessage: string;
  joinButtonText: string;
  checkButtonText: string;
  instructionText: string;
  welcomeBackMessage: string;
  checkingMessage: string;
  verifiedMessage: string;
  updatedAt: Date;
}

const DEFAULT_SETTINGS: ForcedMembershipSettingsData = {
  enabled: true,
  channelId: '',
  notJoinedMessage: '⚠️ برای استفاده از ربات باید ابتدا در کانال زیر عضو شوید.',
  leaveWarningMessage: '❌ شما کانال را ترک کردید. لطفاً دوباره عضو شوید.',
  helpMessage: 'برای استفاده از ربات باید عضو کانال ما باشید.\n\nلطفاً در کانال زیر عضو شده و دکمه بررسی را بزنید.',
  joinButtonText: 'عضویت در کانال',
  checkButtonText: '✅ عضو شدم، بررسی کن',
  instructionText: 'لطفاً در کانال(های) زیر عضو شده و دکمه بررسی را بزنید.',
  welcomeBackMessage: '✅ خوش آمدید! عضویت شما تایید شد و اکنون می‌توانید از ربات استفاده کنید.',
  checkingMessage: 'در حال بررسی عضویت شما...',
  verifiedMessage: '✅ عضویت شما تایید شد. حالا می‌توانید از امکانات ربات استفاده کنید.',
  updatedAt: new Date(),
};

class ForcedMembershipSettingsService {
  private cache: ForcedMembershipSettingsData | null = null;
  private cacheExpires = 0;
  private readonly CACHE_TTL = 30_000;

  private async ensureRow(): Promise<void> {
    await prisma.forcedMembershipSettings.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1, ...DEFAULT_SETTINGS },
    });
  }

  invalidateCache(): void {
    this.cache = null;
    this.cacheExpires = 0;
  }

  async getSettings(): Promise<ForcedMembershipSettingsData> {
    if (this.cache && Date.now() < this.cacheExpires) {
      return this.cache;
    }

    await this.ensureRow();

    const row = await prisma.forcedMembershipSettings.findUnique({ where: { id: 1 } });
    const settings: ForcedMembershipSettingsData = row
      ? {
          enabled: row.enabled,
          channelId: row.channelId,
          notJoinedMessage: row.notJoinedMessage,
          leaveWarningMessage: row.leaveWarningMessage,
          helpMessage: row.helpMessage,
          joinButtonText: row.joinButtonText,
          checkButtonText: row.checkButtonText,
          instructionText: row.instructionText,
          welcomeBackMessage: row.welcomeBackMessage,
          checkingMessage: row.checkingMessage,
          verifiedMessage: row.verifiedMessage,
          updatedAt: row.updatedAt,
        }
      : { ...DEFAULT_SETTINGS };

    this.cache = settings;
    this.cacheExpires = Date.now() + this.CACHE_TTL;
    return settings;
  }

  async updateSettings(data: Partial<Omit<ForcedMembershipSettingsData, 'updatedAt'>>): Promise<ForcedMembershipSettingsData> {
    await this.ensureRow();

    const updateData: any = {};
    if (data.enabled !== undefined) updateData.enabled = data.enabled;
    if (data.channelId !== undefined) updateData.channelId = data.channelId;
    if (data.notJoinedMessage !== undefined) updateData.notJoinedMessage = data.notJoinedMessage;
    if (data.leaveWarningMessage !== undefined) updateData.leaveWarningMessage = data.leaveWarningMessage;
    if (data.helpMessage !== undefined) updateData.helpMessage = data.helpMessage;
    if (data.joinButtonText !== undefined) updateData.joinButtonText = data.joinButtonText;
    if (data.checkButtonText !== undefined) updateData.checkButtonText = data.checkButtonText;
    if (data.instructionText !== undefined) updateData.instructionText = data.instructionText;
    if (data.welcomeBackMessage !== undefined) updateData.welcomeBackMessage = data.welcomeBackMessage;
    if (data.checkingMessage !== undefined) updateData.checkingMessage = data.checkingMessage;
    if (data.verifiedMessage !== undefined) updateData.verifiedMessage = data.verifiedMessage;

    const updated = await prisma.forcedMembershipSettings.update({
      where: { id: 1 },
      data: updateData,
    });

    const settings: ForcedMembershipSettingsData = {
      enabled: updated.enabled,
      channelId: updated.channelId,
      notJoinedMessage: updated.notJoinedMessage,
      leaveWarningMessage: updated.leaveWarningMessage,
      helpMessage: updated.helpMessage,
      joinButtonText: updated.joinButtonText,
      checkButtonText: updated.checkButtonText,
      instructionText: updated.instructionText,
      welcomeBackMessage: updated.welcomeBackMessage,
      checkingMessage: updated.checkingMessage,
      verifiedMessage: updated.verifiedMessage,
      updatedAt: updated.updatedAt,
    };

    this.cache = settings;
    this.cacheExpires = Date.now() + this.CACHE_TTL;
    logger.info('[ForcedMembershipSettings] Settings updated');
    return settings;
  }

  async isEnabled(): Promise<boolean> {
    const settings = await this.getSettings();
    return settings.enabled;
  }
}

export const forcedMembershipSettingsService = new ForcedMembershipSettingsService();
