import { prisma } from '../prisma/client';
import { logger } from '../utils/logger';

export interface ForceJoinSettingsData {
  id: number;
  title: string;
  welcomeMessage: string;
  notJoinedMessage: string;
  joinButtonText: string;
  checkMembershipButtonText: string;
  successJoinMessage: string;
  errorMessage: string;
  retryMessage: string;
  emptyChannelsMessage: string;
  createdAt: Date;
  updatedAt: Date;
}

export type ForceJoinMessageType =
  | 'welcome'
  | 'not_joined'
  | 'join_button'
  | 'check_button'
  | 'success'
  | 'error'
  | 'retry'
  | 'empty_channels';

const FALLBACKS: Record<ForceJoinMessageType, string> = {
  welcome: 'برای استفاده از ربات ابتدا در کانال‌های زیر عضو شوید',
  not_joined: 'هنوز در همه کانال‌ها عضو نشده‌اید',
  join_button: 'عضویت',
  check_button: 'بررسی عضویت',
  success: 'عضویت شما تایید شد ✅',
  error: 'خطا در بررسی عضویت',
  retry: 'دوباره تلاش کنید',
  empty_channels: 'فعلاً کانالی تعریف نشده است',
};

const DEFAULT_SETTINGS: Omit<ForceJoinSettingsData, 'id' | 'createdAt' | 'updatedAt'> = {
  title: 'عضویت اجباری',
  welcomeMessage: 'برای استفاده از ربات ابتدا در کانال‌های زیر عضو شوید',
  notJoinedMessage: 'هنوز در همه کانال‌ها عضو نشده‌اید',
  joinButtonText: 'عضویت',
  checkMembershipButtonText: 'بررسی عضویت',
  successJoinMessage: 'عضویت شما تایید شد ✅',
  errorMessage: 'خطا در بررسی عضویت',
  retryMessage: 'دوباره تلاش کنید',
  emptyChannelsMessage: 'فعلاً کانالی تعریف نشده است',
};

const FIELD_TO_TYPE: Record<keyof Omit<ForceJoinSettingsData, 'id' | 'createdAt' | 'updatedAt' | 'title'>, ForceJoinMessageType> = {
  welcomeMessage: 'welcome',
  notJoinedMessage: 'not_joined',
  joinButtonText: 'join_button',
  checkMembershipButtonText: 'check_button',
  successJoinMessage: 'success',
  errorMessage: 'error',
  retryMessage: 'retry',
  emptyChannelsMessage: 'empty_channels',
};

const TYPE_TO_FIELD: Record<ForceJoinMessageType, keyof Omit<ForceJoinSettingsData, 'id' | 'createdAt' | 'updatedAt' | 'title'>> = {
  welcome: 'welcomeMessage',
  not_joined: 'notJoinedMessage',
  join_button: 'joinButtonText',
  check_button: 'checkMembershipButtonText',
  success: 'successJoinMessage',
  error: 'errorMessage',
  retry: 'retryMessage',
  empty_channels: 'emptyChannelsMessage',
};

class ForceJoinService {
  private cache: ForceJoinSettingsData | null = null;
  private cacheExpires = 0;
  private readonly CACHE_TTL = 30_000;

  private async ensureRow(): Promise<void> {
    await prisma.forceJoinSettings.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1, ...DEFAULT_SETTINGS },
    });
  }

  invalidateCache(): void {
    this.cache = null;
    this.cacheExpires = 0;
  }

  async getSettings(): Promise<ForceJoinSettingsData> {
    if (this.cache && Date.now() < this.cacheExpires) {
      return this.cache;
    }

    await this.ensureRow();

    const row = await prisma.forceJoinSettings.findUnique({ where: { id: 1 } });

    if (!row) {
      this.cache = {
        id: 1,
        ...DEFAULT_SETTINGS,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.cacheExpires = Date.now() + this.CACHE_TTL;
      return this.cache;
    }

    const settings: ForceJoinSettingsData = {
      id: row.id,
      title: row.title,
      welcomeMessage: row.welcomeMessage,
      notJoinedMessage: row.notJoinedMessage,
      joinButtonText: row.joinButtonText,
      checkMembershipButtonText: row.checkMembershipButtonText,
      successJoinMessage: row.successJoinMessage,
      errorMessage: row.errorMessage,
      retryMessage: row.retryMessage,
      emptyChannelsMessage: row.emptyChannelsMessage,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };

    this.cache = settings;
    this.cacheExpires = Date.now() + this.CACHE_TTL;
    return settings;
  }

  async updateSettings(data: Partial<Omit<ForceJoinSettingsData, 'id' | 'createdAt' | 'updatedAt'>>): Promise<ForceJoinSettingsData> {
    await this.ensureRow();

    const updateData: Record<string, unknown> = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.welcomeMessage !== undefined) updateData.welcomeMessage = data.welcomeMessage;
    if (data.notJoinedMessage !== undefined) updateData.notJoinedMessage = data.notJoinedMessage;
    if (data.joinButtonText !== undefined) updateData.joinButtonText = data.joinButtonText;
    if (data.checkMembershipButtonText !== undefined) updateData.checkMembershipButtonText = data.checkMembershipButtonText;
    if (data.successJoinMessage !== undefined) updateData.successJoinMessage = data.successJoinMessage;
    if (data.errorMessage !== undefined) updateData.errorMessage = data.errorMessage;
    if (data.retryMessage !== undefined) updateData.retryMessage = data.retryMessage;
    if (data.emptyChannelsMessage !== undefined) updateData.emptyChannelsMessage = data.emptyChannelsMessage;

    const updated = await prisma.forceJoinSettings.update({
      where: { id: 1 },
      data: updateData,
    });

    const settings: ForceJoinSettingsData = {
      id: updated.id,
      title: updated.title,
      welcomeMessage: updated.welcomeMessage,
      notJoinedMessage: updated.notJoinedMessage,
      joinButtonText: updated.joinButtonText,
      checkMembershipButtonText: updated.checkMembershipButtonText,
      successJoinMessage: updated.successJoinMessage,
      errorMessage: updated.errorMessage,
      retryMessage: updated.retryMessage,
      emptyChannelsMessage: updated.emptyChannelsMessage,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };

    this.cache = settings;
    this.cacheExpires = Date.now() + this.CACHE_TTL;
    logger.info('[ForceJoinService] Settings updated');
    return settings;
  }

  async buildForceJoinMessage(type: ForceJoinMessageType): Promise<string> {
    const settings = await this.getSettings();
    const field = TYPE_TO_FIELD[type];
    const value = settings[field];
    if (value && value.trim().length > 0) return value.trim();
    return FALLBACKS[type];
  }

  async resetToDefaults(): Promise<ForceJoinSettingsData> {
    return this.updateSettings({ ...DEFAULT_SETTINGS });
  }
}

export const forceJoinService = new ForceJoinService();
