import { prisma } from '../../prisma/client';
import { logger } from '../../utils/logger';

export interface ForcedMembershipSettingsData {
  enabled: boolean;
  channelId: string;
  warningMessage: string;
  helpMessage: string;
  joinButtonText: string;
  updatedAt: Date;
}

const DEFAULT_SETTINGS: ForcedMembershipSettingsData = {
  enabled: true,
  channelId: '',
  warningMessage: '❌ You left the channel. Please rejoin to continue using the bot.',
  helpMessage: 'To use this bot, you must be a member of our channel.\n\nPlease join the channel below and click the check button.',
  joinButtonText: 'Join Channel',
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
          warningMessage: row.warningMessage,
          helpMessage: row.helpMessage,
          joinButtonText: row.joinButtonText,
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
    if (data.warningMessage !== undefined) updateData.warningMessage = data.warningMessage;
    if (data.helpMessage !== undefined) updateData.helpMessage = data.helpMessage;
    if (data.joinButtonText !== undefined) updateData.joinButtonText = data.joinButtonText;

    const updated = await prisma.forcedMembershipSettings.update({
      where: { id: 1 },
      data: updateData,
    });

    const settings: ForcedMembershipSettingsData = {
      enabled: updated.enabled,
      channelId: updated.channelId,
      warningMessage: updated.warningMessage,
      helpMessage: updated.helpMessage,
      joinButtonText: updated.joinButtonText,
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
