import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';

const SETTINGS_ID = 1;

export const DEFAULT_SCORING_SETTINGS = {
  startPoints: 0,
  channelJoinPoints: 0,
  futureActivityPoints: 0,
  dailyActivityPoints: 5,
  linkClickPoints: 2,
  referralRewardPoints: 20,
  welcomeMessageText: 'سلام {name} عزیز! 👋\n\n🎯 به ربات کدهای تخفیف پراپ فرم خوش آمدید\n\nاز منوی زیر انتخاب کنید:',
  initialPointsMessageText: '🎁 {points} امتیاز اولیه به حساب شما اضافه شد.',
  isWelcomeMessageEnabled: true,
};

export type ScoringSettingsUpdate = Partial<typeof DEFAULT_SCORING_SETTINGS>;

class ScoringService {
  private cache?: { value: Awaited<ReturnType<typeof prisma.scoringSettings.upsert>>; expires: number };

  async getSettings() {
    if (this.cache && this.cache.expires > Date.now()) return this.cache.value;
    const value = await prisma.scoringSettings.upsert({
      where: { id: SETTINGS_ID },
      update: {},
      create: { id: SETTINGS_ID, ...DEFAULT_SCORING_SETTINGS },
    });
    this.cache = { value, expires: Date.now() + 30_000 };
    return value;
  }

  async updateSettings(data: ScoringSettingsUpdate) {
    this.cache = undefined;
    const settings = await prisma.scoringSettings.upsert({
      where: { id: SETTINGS_ID },
      update: data as Prisma.ScoringSettingsUpdateInput,
      create: { id: SETTINGS_ID, ...DEFAULT_SCORING_SETTINGS, ...data },
    });

    if (typeof data.referralRewardPoints === 'number') {
      await prisma.referralSettings.upsert({
        where: { id: SETTINGS_ID },
        update: { inviteRewardPoints: data.referralRewardPoints },
        create: { id: SETTINGS_ID, inviteRewardPoints: data.referralRewardPoints, isEnabled: true },
      });
    }

    return settings;
  }

  formatTemplate(template: string, values: Record<string, string | number | null | undefined>) {
    return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''));
  }
}

export const scoringService = new ScoringService();
