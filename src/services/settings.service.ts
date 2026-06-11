import { AdminRole } from '@prisma/client';
import { prisma } from '../prisma/client';
import { BRAND_NAME } from '../constants';

export const DEFAULT_MENU_ITEMS = [
  { key: 'dashboard', label: 'داشبورد', href: '/dashboard', order: 10, ownerOnly: false, featureKey: null },
  { key: 'users', label: 'کاربران', href: '/dashboard/users', order: 20, ownerOnly: false, featureKey: null },
  { key: 'lotteries', label: 'قرعه‌کشی‌ها', href: '/dashboard/lotteries', order: 30, ownerOnly: false, featureKey: 'lottery' },
  { key: 'discounts', label: 'تخفیف‌ها', href: '/dashboard/discounts', order: 40, ownerOnly: false, featureKey: 'discount_codes' },
  { key: 'prop-firms', label: 'پراپ فرم‌ها', href: '/dashboard/prop-firms', order: 50, ownerOnly: false, featureKey: 'prop_firms' },
  { key: 'referrals', label: 'دعوت دوستان', href: '/dashboard/referrals', order: 60, ownerOnly: false, featureKey: 'referrals' },
  { key: 'scoring', label: 'سیستم امتیازدهی', href: '/dashboard/scoring', order: 65, ownerOnly: false, featureKey: 'points' },
  { key: 'required-channels', label: 'عضویت اجباری', href: '/dashboard/required-channels', order: 70, ownerOnly: false, featureKey: 'force_join' },
  { key: 'groups', label: 'مدیریت گروه‌ها', href: '/dashboard/groups', order: 80, ownerOnly: false, featureKey: 'groups' },
  { key: 'keyword-replies', label: 'پاسخ‌های خودکار', href: '/dashboard/keyword-replies', order: 90, ownerOnly: false, featureKey: 'auto_replies' },
  { key: 'bot-admins', label: 'ادمین‌های ربات', href: '/dashboard/bot-admins', order: 110, ownerOnly: false, featureKey: null },
  { key: 'admin-users', label: 'مدیریت ادمین‌ها', href: '/dashboard/admin-users', order: 115, ownerOnly: true, featureKey: null },
  { key: 'analytics', label: 'گزارشات', href: '/dashboard/analytics', order: 120, ownerOnly: false, featureKey: 'reports' },
  { key: 'system-logs', label: 'لاگ سیستم', href: '/dashboard/system-logs', order: 130, ownerOnly: false, featureKey: null },
  { key: 'mini-app-logs', label: 'Mini App Logs', href: '/dashboard/mini-app-logs', order: 135, ownerOnly: false, featureKey: null },
  { key: 'ai-assistant', label: '🤖 AI Assistant', href: '/dashboard/ai-assistant', order: 136, ownerOnly: true, featureKey: 'ai_assistant' },
  { key: 'settings', label: '⚙️ تنظیمات', href: '/dashboard/settings', order: 140, ownerOnly: true, featureKey: null },
];

export const DEFAULT_FEATURES = [
  { key: 'discount_codes', label: 'کدهای تخفیف' },
  { key: 'lottery', label: 'قرعه کشی' },
  { key: 'referrals', label: 'دعوت دوستان' },
  { key: 'force_join', label: 'عضویت اجباری' },
  { key: 'auto_replies', label: 'پاسخ خودکار' },
  { key: 'reports', label: 'گزارشات' },
  { key: 'groups', label: 'مدیریت گروه‌ها' },
  { key: 'leaderboard', label: 'لیدربورد' },
  { key: 'points', label: 'امتیازدهی' },
  { key: 'prop_firms', label: 'پراپ فرم‌ها' },
  { key: 'prop_firm_check', label: 'Prop Firm Check' },
  { key: 'ai_assistant', label: 'AI Assistant' },
  { key: 'posts', label: 'Posts / CMS' },
];

export function isOwnerRole(role?: string | null) {
  return role === AdminRole.OWNER || role === 'SUPER_ADMIN';
}

class SettingsService {
  private seeded = false;
  private featureCache = new Map<string, { enabled: boolean; expires: number }>();

  async ensureDefaults() {
    if (this.seeded) return;
    await prisma.$transaction([
      ...DEFAULT_MENU_ITEMS.map((item) => prisma.menuOrder.upsert({ where: { key: item.key }, update: {}, create: item as any })),
      ...DEFAULT_FEATURES.map((item) => prisma.featureToggle.upsert({ where: { key: item.key }, update: {}, create: { ...item, isEnabled: true } })),
    ]);
    this.seeded = true;
  }

  async getMenus(role?: string) {
    await this.ensureDefaults();
    const features = await this.getFeatureMap();
    const menus = await prisma.menuOrder.findMany({ where: { isActive: true }, orderBy: [{ order: 'asc' }, { id: 'asc' }] });
    return menus.filter((item) => item.key !== 'broadcasts' && (!item.ownerOnly || isOwnerRole(role)) && (!item.featureKey || features[item.featureKey] !== false));
  }

  async reorderMenus(keys: string[]) {
    await this.ensureDefaults();
    await prisma.$transaction(keys.map((key, index) => prisma.menuOrder.update({ where: { key }, data: { order: (index + 1) * 10 } })));
    return prisma.menuOrder.findMany({ orderBy: [{ order: 'asc' }, { id: 'asc' }] });
  }

  async getServices() {
    return this.getFeatures();
  }

  async getFeatures() {
    await this.ensureDefaults();
    return prisma.featureToggle.findMany({ orderBy: [{ id: 'asc' }] });
  }

  async getFeatureMap() {
    const rows = await this.getFeatures();
    return Object.fromEntries(rows.map((row) => [row.key, row.isEnabled]));
  }

  async setFeature(key: string, isEnabled: boolean) {
    await this.ensureDefaults();
    this.featureCache.delete(key);
    return prisma.featureToggle.update({ where: { key }, data: { isEnabled } });
  }

  async getMiniAppContentSettings() {
    const defaults = {
      siteUrl: '',
      aboutText: `${BRAND_NAME} همراه هوشمند معامله‌گران برای دریافت کد تخفیف، بررسی پراپ فرم‌ها و مدیریت امتیازهاست.`,
    };
    const rows = await prisma.systemSetting.findMany({ where: { key: { in: ['mini_app_site_url', 'mini_app_about_text'] } } });
    const valueOf = (key: string) => {
      const value = rows.find((row) => row.key === key)?.value;
      return typeof value === 'string' ? value : '';
    };
    return { siteUrl: valueOf('mini_app_site_url') || defaults.siteUrl, aboutText: valueOf('mini_app_about_text') || defaults.aboutText };
  }

  async updateMiniAppContentSettings(data: { siteUrl?: string; aboutText?: string }) {
    const entries = [
      ['mini_app_site_url', data.siteUrl ?? ''],
      ['mini_app_about_text', data.aboutText ?? ''],
    ] as const;
    await prisma.$transaction(entries.map(([key, value]) => prisma.systemSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    })));
    return this.getMiniAppContentSettings();
  }

  async isFeatureEnabled(key: string) {
    const cached = this.featureCache.get(key);
    if (cached && cached.expires > Date.now()) return cached.enabled;
    await this.ensureDefaults();
    const normalizedKey = key === 'prop_firm_check' ? 'prop_firm_check' : key;
    const feature = await prisma.featureToggle.findUnique({ where: { key: normalizedKey } });
    const enabled = feature?.isEnabled ?? true;
    this.featureCache.set(key, { enabled, expires: Date.now() + 30_000 });
    return enabled;
  }

  async getSetting(key: string): Promise<any | null> {
    const row = await prisma.systemSetting.findUnique({ where: { key } });
    return row?.value ?? null;
  }

  async setSetting(key: string, value: any) {
    await prisma.systemSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
}

export const settingsService = new SettingsService();
