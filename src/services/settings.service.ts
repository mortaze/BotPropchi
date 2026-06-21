import { AdminRole } from '@prisma/client';
import { prisma } from '../prisma/client';
import { BRAND_NAME } from '../constants';
import { logger } from '../utils/logger';
import { eventBus, Events } from '../utils/events';
import { sanitizeTelegramText, validateUnicode, sanitizeJsonStrings, validateTelegramButton } from '../utils/unicode';

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
  private featuresCache: { rows: any[]; expires: number } | null = null;
  private readonly FEATURES_CACHE_TTL = 60_000;

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
    if (this.featuresCache && this.featuresCache.expires > Date.now()) {
      return this.featuresCache.rows;
    }
    await this.ensureDefaults();
    const rows = await prisma.featureToggle.findMany({ orderBy: [{ id: 'asc' }] });
    this.featuresCache = { rows, expires: Date.now() + this.FEATURES_CACHE_TTL };
    return rows;
  }

  async getFeatureMap() {
    const rows = await this.getFeatures();
    return Object.fromEntries(rows.map((row) => [row.key, row.isEnabled]));
  }

  async setFeature(key: string, isEnabled: boolean) {
    await this.ensureDefaults();
    this.featureCache.delete(key);
    this.featuresCache = null;
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

  private normalizeLayout(layout: any[][]): any[][] {
    return layout
      .map(row => Array.isArray(row) ? row.filter(btn => btn != null) : [])
      .filter(row => row.length > 0);
  }

  private validateLayoutSafe(layout: any[][]): void {
    for (const row of layout) {
      if (!Array.isArray(row)) {
        throw new Error('Invalid menu layout: row is not an array');
      }
      for (const btn of row) {
        if (btn === undefined || btn === null) {
          throw new Error('Invalid menu layout: undefined/ null button detected');
        }
      }
    }
  }

  private ensureButtonIds(layout: any[][]): any[][] {
    for (const row of layout) {
      for (const btn of row) {
        if (!btn) continue;
        const idNumber = Number(String(btn.id || '').replace('btn_', ''));
        if (Number.isFinite(idNumber) && idNumber >= this.nextButtonId) this.nextButtonId = idNumber + 1;
      }
    }
    return layout.map(row =>
      row.filter(btn => btn != null).map(btn => {
        if (!btn.id) {
          btn.id = `btn_${this.nextButtonId++}`;
        }
        return btn;
      })
    );
  }

  private normalizeMenuButton(btn: any, rowIndex: number, colIndex: number): any {
    const normalized = { ...btn, rowIndex, position: colIndex };
    const label = normalized.text ?? normalized.label ?? normalized.title ?? '';
    normalized.text = typeof label === 'string' ? sanitizeTelegramText(label) : '';
    if (typeof normalized.label === 'string') normalized.label = sanitizeTelegramText(normalized.label);
    if (typeof normalized.title === 'string') normalized.title = sanitizeTelegramText(normalized.title);
    return normalized;
  }  private menuTextSummary(layout: any[][]): string {
  try {
    return layout
      .flat()
      .map(btn => {
        if (!btn) return '[empty]';
        const txt =
          btn.text ||
          btn.label ||
          btn.title ||
          btn.ref ||
          '[empty]';

        return String(txt).substring(0, 30);
      })
      .join(' | ');
  } catch {
    return '[summary_failed]';
  }
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
          logger.info(`[MenuLayout] DB read summary: ${this.menuTextSummary(layout)}`);
        }
      }
    } catch (err) {
      logger.error('[MenuLayout] Corrupted layout detected! Attempting snapshot fallback.', err);
      layout = [];
    }

    // Validate & sanitize layout integrity
    if (layout.length > 0) {
      const unicodeCheck = validateUnicode(JSON.stringify(layout));
      if (!unicodeCheck.valid) {
        logger.warn(`[MenuLayout] Unicode validation failed on stored layout — sanitizing`);
        layout = sanitizeJsonStrings(layout) as any[][];
      }
    }

    const validation = this.validateMenuLayout(layout);
    if (!validation.valid) {
      logger.warn(`[MenuLayout] Validation failed: ${validation.reason}. Trying snapshot.`);
      if (snapshot) {
        const normalizedSnapshot = this.normalizeLayout(snapshot);
        if (this.validateMenuLayout(normalizedSnapshot).valid) {
          logger.info('[MenuLayout] Restoring from snapshot');
          layout = normalizedSnapshot;
          await this.saveMenuLayout(layout, version);
        } else {
          logger.warn('[MenuLayout] Snapshot also invalid or missing. Starting fresh layout.');
          layout = [];
          await this.saveMenuLayout(layout, 0);
        }
      } else {
        logger.warn('[MenuLayout] Snapshot also invalid or missing. Starting fresh layout.');
        layout = [];
        await this.saveMenuLayout(layout, 0);
      }
    }

    this.menuLayoutCache = { layout: this.normalizeLayout(layout), snapshot: snapshot ? this.normalizeLayout(snapshot) : null, version };
    return this.menuLayoutCache.layout;
  }

  // Get layout with live post titles resolved from DB (single source of truth)
  async getResolvedMenuLayout(live = true): Promise<any[][]> {
    const layout = await this.getMenuLayout();
    return this.resolveMenuLayout(layout, live);
  }

  async saveMenuLayout(layout: any[][], preserveVersion?: number) {
    const oldLayout = this.menuLayoutCache?.layout ? JSON.parse(JSON.stringify(this.menuLayoutCache.layout)) : [];

    // Normalize FIRST: remove undefined/null from all rows and empty rows
    layout = this.normalizeLayout(layout);

    // Validate normalised layout before any operation
    this.validateLayoutSafe(layout);

    // Ensure all buttons have stable IDs and preserve every metadata field while normalizing text fields.
    layout = this.ensureButtonIds(layout).map((row, rowIndex) =>
      row.map((btn, colIndex) => this.normalizeMenuButton(btn, rowIndex, colIndex))
    );

    const validation = this.validateMenuLayout(layout);
    if (!validation.valid) {
      logger.warn(`[MenuLayout] Refusing to save invalid layout: ${validation.reason}`);
      throw new Error(validation.reason || 'Invalid menu layout');
    }

    // Final safety: ensure no undefined leaks into Prisma
    this.validateLayoutSafe(layout);

    // Save layout to DB as JSONB through Prisma; PostgreSQL stores UTF-8 natively.
    await prisma.$transaction(async (tx) => {
      await tx.systemSetting.upsert({
        where: { key: this.MENU_LAYOUT_KEY },
        update: { value: layout },
        create: { key: this.MENU_LAYOUT_KEY, value: layout },
      });

      // Save snapshot of previous valid layout (normalized)
      if (this.menuLayoutCache?.layout && this.menuLayoutCache.layout.length > 0) {
        const normalizedSnapshotLayout = this.normalizeLayout(this.menuLayoutCache.layout);
        await tx.systemSetting.upsert({
          where: { key: this.MENU_LAYOUT_SNAPSHOT_KEY },
          update: { value: normalizedSnapshotLayout },
          create: { key: this.MENU_LAYOUT_SNAPSHOT_KEY, value: normalizedSnapshotLayout },
        });
      }

      await tx.systemSetting.upsert({
        where: { key: 'menu_layout_next_id' },
        update: { value: this.nextButtonId },
        create: { key: 'menu_layout_next_id', value: this.nextButtonId },
      });

      const newVersion = preserveVersion ?? ((this.menuLayoutCache?.version ?? 0) + 1);
      await tx.systemSetting.upsert({
        where: { key: this.MENU_LAYOUT_VERSION_KEY },
        update: { value: newVersion },
        create: { key: this.MENU_LAYOUT_VERSION_KEY, value: newVersion },
      });
    });

    const newVersion = preserveVersion ?? ((this.menuLayoutCache?.version ?? 0) + 1);

    // Update cache (normalize snapshot too)
    this.menuLayoutCache = {
      layout,
      snapshot: this.menuLayoutCache?.layout ? this.normalizeLayout(this.menuLayoutCache.layout) : null,
      version: newVersion,
    };

    // Log diff
    const oldSerialized = JSON.stringify(oldLayout);
    const newSerialized = JSON.stringify(layout);
    logger.info(`[MenuLayout] Post-save summary: ${this.menuTextSummary(layout)}`);
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
        const text = typeof btn.text === 'string' ? btn.text : '';
        const label = typeof btn.label === 'string' ? btn.label : '';
        const title = typeof btn.title === 'string' ? btn.title : '';
        const ref = typeof btn.ref === 'string' ? btn.ref : '';
        if (!ref) return { valid: false, reason: `Button [${r}][${c}] has no ref` };
        const isPostRef = ref.startsWith('post:') || ref.startsWith('post_');
        if (!isPostRef && !(text || label || title).trim()) return { valid: false, reason: `Button [${r}][${c}] has empty text` };
        for (const value of [text, label, title]) {
          if (value.includes('???')) return { valid: false, reason: `Button [${r}][${c}] contains corrupted text` };
          const check = validateTelegramButton(value);
          if (!check.valid) return { valid: false, reason: `Button [${r}][${c}] has malformed Unicode` };
        }
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
    if ((this as any)._listenersRegistered) return;
    (this as any)._listenersRegistered = true;
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

  // ─── Resolve: replace stored (stale) post text with live DB data ───
  // Posts database is the SINGLE SOURCE OF TRUTH for titles & status.
  // Menu layout only stores structural data (refs, ordering, visibility hints).
  async resolveMenuLayout(layout: any[][], live = true): Promise<any[][]> {
    // Normalize input layout first
    layout = this.normalizeLayout(layout);

    // Collect all post refs
    const postIds = new Set<number>();
    for (const row of layout) {
      for (const btn of row) {
        if (btn?.ref && btn.ref.startsWith('post:')) {
          postIds.add(Number(btn.ref.replace('post:', '')));
        }
      }
    }

    // Batch-load all referenced posts from DB (single source of truth)
    const posts = postIds.size > 0
      ? await prisma.post.findMany({
          where: { id: { in: [...postIds] } },
          select: { id: true, title: true, status: true, isPublished: true },
        })
      : [];
    const postMap = new Map(posts.map(p => [p.id, p]));

    const resolved: any[][] = [];
    for (const row of layout) {
      const resolvedRow: any[] = [];
      for (const btn of row) {
        if (!btn) continue;
        if (btn.ref && btn.ref.startsWith('post:')) {
          const postId = Number(btn.ref.replace('post:', ''));
          const post = postMap.get(postId);
          if (!post) continue; // Post deleted — skip entirely
          if (live && post.status !== 'PUBLISHED') continue; // Not published — skip in live mode
          resolvedRow.push({
            ...btn,
            text: post.title, // Always use current title from DB
            _postStatus: post.status,
            _isPublished: post.isPublished,
          });
        } else {
          // Non-post button: use stored text as-is (system buttons)
          resolvedRow.push(btn);
        }
      }
      if (resolvedRow.length > 0) resolved.push(resolvedRow);
    }
    return resolved;
  }

  // ─── Post ↔ Menu auto-linking ─────────────────────────
  async addPostToMenu(postId: number, title?: string, visible = false): Promise<void> {
    const layout = await this.getMenuLayout();
    const ref = `post:${postId}`;

    // Check if already exists in layout
    let exists = false;
    for (const row of layout) {
      for (const btn of row) {
        if (btn?.ref === ref) {
          exists = true;
          break;
        }
      }
      if (exists) break;
    }
    if (exists) {
      await this.saveMenuLayout(layout);
      logger.debug(`[MenuLayout] Post already in menu: ref=${ref}`);
      return;
    }

    // Add as a new row — title is NOT stored (resolved from DB at render time)
    this.ensureButtonIds(layout);
    layout.push([{ id: `btn_${this.nextButtonId++}`, ref, text: '', visible }]);
    await this.saveMenuLayout(layout);
    logger.info(`[MenuLayout] Added post to menu: ref=${ref}, visible: ${visible}`);
  }

  async removePostFromMenu(postId: number): Promise<void> {
    const layout = await this.getMenuLayout();
    const ref = `post:${postId}`;

    for (const row of layout) {
      for (let c = row.length - 1; c >= 0; c--) {
        if (row[c]?.ref === ref) {
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
        if (row[c]?.id === buttonId) {
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
      select: { id: true },
    });

    // Build ref set of valid posts
    const validRefs = new Set(posts.map(p => `post:${p.id}`));

    // 2. Scan layout — remove invalid refs, identify missing posts
    const existingRefs = new Set<string>();
    for (const row of layout) {
      for (let c = row.length - 1; c >= 0; c--) {
        const btn = row[c];
        if (!btn) continue;
        if (btn.ref && btn.ref.startsWith('post:')) {
          if (!validRefs.has(btn.ref)) {
            row.splice(c, 1);
            removed++;
          } else {
            existingRefs.add(btn.ref);
            if (!btn.visible) {
              btn.visible = true;
              madeVisible++;
            }
          }
        }
      }
    }

    // 3. Add missing publishable posts (title is NOT stored — resolved from DB at render time)
    this.ensureButtonIds(layout);
    for (const ref of validRefs) {
      if (!existingRefs.has(ref)) {
        layout.push([{ id: `btn_${this.nextButtonId++}`, ref, text: '', visible: true }]);
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
