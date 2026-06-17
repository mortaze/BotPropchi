import { AdminRole } from '@prisma/client';
import { prisma } from '../prisma/client';
import { BRAND_NAME } from '../constants';
import { logger } from '../utils/logger';
import { eventBus, Events } from '../utils/events';

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
  { key: 'posts', label: '📝 پست‌ها', href: '/dashboard/posts', order: 25, ownerOnly: false, featureKey: 'posts' },
  { key: 'menu', label: '🎛 ویرایش منو', href: '/dashboard/menu', order: 27, ownerOnly: false, featureKey: null },
  { key: 'force-join', label: 'متن‌های عضویت اجباری', href: '/dashboard/force-join', order: 72, ownerOnly: false, featureKey: 'force_join' },
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

  // ─── Menu Layout: STABLE PERSISTENCE (single source of truth) ───
  // WARNING: NEVER auto-rebuild, sync, or modify menu_layout outside explicit admin actions.
  // The menu_layout in DB is the ONLY source of truth for the Telegram main menu.

  private menuLayoutCache: { layout: any[][]; snapshot: any[][] | null; version: number } | null = null;
  private readonly MENU_LAYOUT_KEY = 'menu_layout';
  private readonly MENU_LAYOUT_VERSION_KEY = 'menu_layout_version';
  private readonly MENU_LAYOUT_SNAPSHOT_KEY = 'menu_layout_snapshot';
  private nextButtonId = 1;

  private ensureButtonIds(layout: any[][]): any[][] {
    return layout.map(row =>
      row.map(btn => {
        if (!btn.id) {
          btn.id = `btn_${this.nextButtonId++}`;
        }
        return btn;
      })
    );
  }

  async getMenuLayout(): Promise<any[][]> {
    if (this.menuLayoutCache) {
      logger.debug('[MenuLayout] Returning cached layout (version ' + this.menuLayoutCache.version + ')');
      return this.menuLayoutCache.layout;
    }
    // Load next ID from DB
    const savedNextId = await this.getSetting('menu_layout_next_id');
    this.nextButtonId = Number(savedNextId) || 1;

    logger.debug('[MenuLayout] Reading layout from DB');
    let layout: any[][] = [];
    let snapshot: any[][] | null = null;
    let version = 0;

    try {
      const raw = await this.getSetting(this.MENU_LAYOUT_KEY);
      if (raw) {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed)) {
          layout = this.ensureButtonIds(parsed);
          version = (await this.getSetting(this.MENU_LAYOUT_VERSION_KEY)) || 0;
          const snapRaw = await this.getSetting(this.MENU_LAYOUT_SNAPSHOT_KEY);
          if (snapRaw) {
            const snapParsed = typeof snapRaw === 'string' ? JSON.parse(snapRaw) : snapRaw;
            if (Array.isArray(snapParsed)) snapshot = snapParsed;
          }
          logger.debug(`[MenuLayout] Loaded layout version ${version}, ${layout.length} rows, snapshot available: ${snapshot !== null}`);
        }
      }
    } catch (err) {
      logger.error('[MenuLayout] Corrupted layout detected! Attempting snapshot fallback.', err);
      layout = [];
    }

    // Validate layout integrity
    const validation = this.validateMenuLayout(layout);
    if (!validation.valid) {
      logger.warn(`[MenuLayout] Validation failed: ${validation.reason}. Trying snapshot.`);
      if (snapshot && this.validateMenuLayout(snapshot).valid) {
        logger.info('[MenuLayout] Restoring from snapshot');
        layout = snapshot;
        await this.saveMenuLayout(layout, version);
      } else {
        logger.warn('[MenuLayout] Snapshot also invalid or missing. Starting fresh layout.');
        layout = [];
        await this.saveMenuLayout(layout, 0);
      }
    }

    this.menuLayoutCache = { layout, snapshot, version };
    return layout;
  }

  async saveMenuLayout(layout: any[][], preserveVersion?: number) {
    const oldLayout = this.menuLayoutCache?.layout || [];

    // Ensure all buttons have stable IDs
    layout = this.ensureButtonIds(layout);

    // Save layout to DB
    await this.setSetting(this.MENU_LAYOUT_KEY, layout);

    // Save snapshot of previous valid layout
    if (this.menuLayoutCache?.layout && this.menuLayoutCache.layout.length > 0) {
      await this.setSetting(this.MENU_LAYOUT_SNAPSHOT_KEY, this.menuLayoutCache.layout);
    }

    // Persist next ID for stable IDs across restarts
    await this.setSetting('menu_layout_next_id', this.nextButtonId);

    // Increment version
    const newVersion = preserveVersion ?? ((this.menuLayoutCache?.version ?? 0) + 1);
    await this.setSetting(this.MENU_LAYOUT_VERSION_KEY, newVersion);

    // Update cache
    this.menuLayoutCache = {
      layout,
      snapshot: this.menuLayoutCache?.layout || null,
      version: newVersion,
    };

    // Log diff
    const oldSerialized = JSON.stringify(oldLayout);
    const newSerialized = JSON.stringify(layout);
    if (oldSerialized !== newSerialized) {
      logger.info(`[MenuLayout] Saved version ${newVersion} (${layout.length} rows). Changed: ${oldSerialized !== newSerialized}`);
    } else {
      logger.debug(`[MenuLayout] Saved version ${newVersion} (no change)`);
    }
  }

  validateMenuLayout(layout: any[][]): { valid: boolean; reason?: string } {
    if (!Array.isArray(layout)) return { valid: false, reason: 'Layout root is not an array' };
    for (let r = 0; r < layout.length; r++) {
      if (!Array.isArray(layout[r])) return { valid: false, reason: `Row ${r} is not an array` };
      for (let c = 0; c < layout[r].length; c++) {
        const btn = layout[r][c];
        if (!btn || typeof btn !== 'object') return { valid: false, reason: `Button [${r}][${c}] is not an object` };
        if (!btn.text && !btn.ref) return { valid: false, reason: `Button [${r}][${c}] has no text or ref` };
        if (layout[r].length > 8) return { valid: false, reason: `Row ${r} exceeds 8 buttons` };
      }
    }
    if (layout.length > 20) return { valid: false, reason: 'Layout exceeds 20 rows' };
    return { valid: true };
  }

  // Migrate old key to new key if needed
  async migrateMenuLayoutKey() {
    try {
      const oldVal = await this.getSetting('menu_layout_saved');
      const newVal = await this.getSetting(this.MENU_LAYOUT_KEY);
      if (oldVal && !newVal) {
        logger.info('[MenuLayout] Migrating from menu_layout_saved to menu_layout');
        await this.setSetting(this.MENU_LAYOUT_KEY, oldVal);
        this.menuLayoutCache = null; // invalidate cache
      }
    } catch (err) {
      logger.error('[MenuLayout] Migration failed', err);
    }
  }

  // Invalidate the cache (call after direct DB changes from admin panel)
  invalidateMenuLayoutCache() {
    this.menuLayoutCache = null;
    logger.debug('[MenuLayout] Cache invalidated');
  }

  // Listen for post events to invalidate menu cache
  setupEventListeners() {
    const invalidate = () => {
      this.invalidateMenuLayoutCache();
    };
    eventBus.on(Events.POST_CREATED, invalidate);
    eventBus.on(Events.POST_PUBLISHED, invalidate);
    eventBus.on(Events.POST_DELETED, invalidate);
    eventBus.on(Events.POST_HIDDEN, invalidate);
    eventBus.on(Events.POST_UPDATED, invalidate);
    eventBus.on(Events.POST_UNPUBLISHED, invalidate);
    logger.info('[MenuLayout] Event listeners registered');
  }

  // Get ref-to-text mapping for post routing
  getMenuButtonTextMap(layout: any[][]): Map<string, { ref: string; row: number; col: number }> {
    const map = new Map<string, { ref: string; row: number; col: number }>();
    for (let r = 0; r < layout.length; r++) {
      for (let c = 0; c < layout[r].length; c++) {
        const btn = layout[r][c];
        if (btn && btn.text && btn.ref) {
          map.set(btn.text, { ref: btn.ref, row: r, col: c });
        }
      }
    }
    return map;
  }

  // ─── Post ↔ Menu auto-linking ─────────────────────────
  async addPostToMenu(postId: number, title: string, visible = false): Promise<void> {
    const layout = await this.getMenuLayout();
    const ref = `post:${postId}`;

    // Check if already exists in layout
    let exists = false;
    for (const row of layout) {
      for (const btn of row) {
        if (btn.ref === ref) {
          exists = true;
          // Update title if changed
          if (btn.text !== title) {
            btn.text = title;
          }
          break;
        }
      }
      if (exists) break;
    }
    if (exists) {
      await this.saveMenuLayout(layout);
      logger.debug(`[MenuLayout] Post already in menu: "${title}" (${ref}) — updated`);
      return;
    }

    // Add as a new row with visibility controlled by param
    this.ensureButtonIds(layout);
    layout.push([{ id: `btn_${this.nextButtonId++}`, ref, text: title, visible }]);
    await this.saveMenuLayout(layout);
    logger.info(`[MenuLayout] Added post to menu: "${title}" (ref: ${ref}, visible: ${visible})`);
  }

  async removePostFromMenu(postId: number): Promise<void> {
    const layout = await this.getMenuLayout();
    const ref = `post:${postId}`;

    for (const row of layout) {
      for (let c = row.length - 1; c >= 0; c--) {
        if (row[c].ref === ref) {
          row.splice(c, 1);
        }
      }
    }

    // Remove empty rows
    const cleaned = layout.filter(row => row.length > 0);
    await this.saveMenuLayout(cleaned);
    logger.info(`[MenuLayout] Removed post from menu: ref=${ref}`);
  }

  // ─── Individual button removal ─────────────────────────
  async removeButtonFromLayout(buttonId: string): Promise<void> {
    const layout = await this.getMenuLayout();
    let removed = false;

    for (const row of layout) {
      for (let c = row.length - 1; c >= 0; c--) {
        if (row[c].id === buttonId) {
          row.splice(c, 1);
          removed = true;
        }
      }
    }

    if (!removed) {
      logger.warn(`[MenuLayout] Button ${buttonId} not found in layout`);
      return;
    }

    // Remove empty rows
    const cleaned = layout.filter(row => row.length > 0);
    await this.saveMenuLayout(cleaned);
    logger.info(`[MenuLayout] Removed button: ${buttonId}`);
  }

  // ─── Full menu synchronisation ─────────────────────────
  // Scans all posts, adds missing publishable ones, removes invalid refs.
  // Safe and idempotent — running multiple times never creates duplicates.
  async syncMenuWithPosts(): Promise<{ added: number; removed: number; madeVisible: number }> {
    const layout = await this.getMenuLayout();
    const added: number[] = [];
    let removed = 0;
    let madeVisible = 0;

    // 1. Scan all publishable posts
    const posts = await prisma.post.findMany({
      where: {
        status: { in: ['PUBLISHED', 'SCHEDULED'] },
        isPublished: true,
      },
      select: { id: true, title: true },
    });

    // Build ref set of valid posts
    const validRefs = new Set(posts.map(p => `post:${p.id}`));
    const postMap = new Map(posts.map(p => [`post:${p.id}`, p.title]));

    // 2. Scan layout — remove invalid refs, identify missing posts
    const existingRefs = new Set<string>();
    for (const row of layout) {
      for (let c = row.length - 1; c >= 0; c--) {
        const btn = row[c];
        if (btn.ref && btn.ref.startsWith('post:')) {
          if (!validRefs.has(btn.ref)) {
            // Remove invalid reference (post was deleted / unpublished / archived)
            row.splice(c, 1);
            removed++;
          } else {
            existingRefs.add(btn.ref);
            // Make visible if it's a published/scheduled post that was hidden
            if (!btn.visible) {
              btn.visible = true;
              madeVisible++;
            }
          }
        }
      }
    }

    // 3. Add missing publishable posts
    this.ensureButtonIds(layout);
    for (const ref of validRefs) {
      if (!existingRefs.has(ref)) {
        const title = postMap.get(ref) || 'Post';
        layout.push([{ id: `btn_${this.nextButtonId++}`, ref, text: title, visible: true }]);
        added.push(Number(ref.replace('post:', '')));
      }
    }

    // 4. Clean empty rows and save
    const cleaned = layout.filter(row => row.length > 0);
    await this.saveMenuLayout(cleaned);
    logger.info(`[MenuLayout] Sync complete: ${added.length} added, ${removed} removed, ${madeVisible} made visible`);
    return { added: added.length, removed, madeVisible };
  }

  // ─── Menu Display Mode ────────────────────────────────
  async getMenuDisplayMode(): Promise<'always_open' | 'toggle_allowed'> {
    const mode = await this.getSetting('menu_display_mode');
    if (mode === 'toggle_allowed') return 'toggle_allowed';
    return 'always_open';
  }

  async setMenuDisplayMode(mode: 'always_open' | 'toggle_allowed'): Promise<void> {
    await this.setSetting('menu_display_mode', mode);
    logger.info(`[MenuDisplay] Display mode set to: ${mode}`);
  }

}

export const settingsService = new SettingsService();
// Auto-register event listeners for live cache invalidation
settingsService.setupEventListeners();
