import type { ForceJoinSettingsData } from '../forceJoin.service';
import { forceJoinService } from '../forceJoin.service';
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

const LEGACY_FALLBACKS: ForcedMembershipSettingsData = {
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

function toLegacy(newSettings: ForceJoinSettingsData): ForcedMembershipSettingsData {
  return {
    enabled: true,
    channelId: '',
    notJoinedMessage: newSettings.notJoinedMessage || LEGACY_FALLBACKS.notJoinedMessage,
    leaveWarningMessage: newSettings.welcomeMessage || LEGACY_FALLBACKS.leaveWarningMessage,
    helpMessage: newSettings.welcomeMessage || LEGACY_FALLBACKS.helpMessage,
    joinButtonText: newSettings.joinButtonText || LEGACY_FALLBACKS.joinButtonText,
    checkButtonText: newSettings.checkMembershipButtonText || LEGACY_FALLBACKS.checkButtonText,
    instructionText: newSettings.notJoinedMessage || LEGACY_FALLBACKS.instructionText,
    welcomeBackMessage: newSettings.successJoinMessage || LEGACY_FALLBACKS.welcomeBackMessage,
    checkingMessage: newSettings.retryMessage || LEGACY_FALLBACKS.checkingMessage,
    verifiedMessage: newSettings.successJoinMessage || LEGACY_FALLBACKS.verifiedMessage,
    updatedAt: newSettings.updatedAt,
  };
}

class ForcedMembershipSettingsService {
  invalidateCache(): void {
    forceJoinService.invalidateCache();
  }

  async getSettings(): Promise<ForcedMembershipSettingsData> {
    try {
      const newSettings = await forceJoinService.getSettings();
      return toLegacy(newSettings);
    } catch (err) {
      logger.error('[ForcedMembershipSettings] Fallback to legacy defaults:', err);
      return { ...LEGACY_FALLBACKS, updatedAt: new Date() };
    }
  }

  async updateSettings(data: Partial<Omit<ForcedMembershipSettingsData, 'updatedAt'>>): Promise<ForcedMembershipSettingsData> {
    const mapped: Partial<Omit<ForceJoinSettingsData, 'id' | 'createdAt' | 'updatedAt'>> = {};

    if (data.notJoinedMessage !== undefined) {
      mapped.notJoinedMessage = data.notJoinedMessage;
    }
    if (data.leaveWarningMessage !== undefined) mapped.welcomeMessage = data.leaveWarningMessage;
    if (data.helpMessage !== undefined) mapped.welcomeMessage = data.helpMessage;
    if (data.joinButtonText !== undefined) mapped.joinButtonText = data.joinButtonText;
    if (data.checkButtonText !== undefined) mapped.checkMembershipButtonText = data.checkButtonText;
    if (data.welcomeBackMessage !== undefined) mapped.successJoinMessage = data.welcomeBackMessage;
    if (data.checkingMessage !== undefined) mapped.retryMessage = data.checkingMessage;
    if (data.verifiedMessage !== undefined) mapped.successJoinMessage = data.verifiedMessage;

    const updated = await forceJoinService.updateSettings(mapped);
    forceJoinService.invalidateCache();
    logger.info('[ForcedMembershipSettings] Settings updated via adapter');
    return toLegacy(updated);
  }

  async isEnabled(): Promise<boolean> {
    return true;
  }
}

export const forcedMembershipSettingsService = new ForcedMembershipSettingsService();
