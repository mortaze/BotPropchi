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
  updatedAt: Date;
}

const DEFAULT_SETTINGS: ForcedMembershipSettingsData = {
  enabled: true,
  channelId: '',
  notJoinedMessage: '⚠️ To use this bot, you must join our channel first.',
  leaveWarningMessage: '❌ You left the channel. Please rejoin to continue using the bot.',
  helpMessage: 'To use this bot, you must be a member of our channel.\n\nPlease join the channel below and click the check button.',
  joinButtonText: 'Join Channel',
  checkButtonText: '✅ I joined, check again',
  instructionText: 'Please join the channel(s) below and click the check button to verify your membership.',
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
