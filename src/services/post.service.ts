import { PostStatus, Prisma, SystemEventType } from '@prisma/client';
import { prisma } from '../prisma/client';
import { postRepository } from '../repositories/post.repository';
import { cache } from '../utils/cache';
import { systemLogService } from './system-log.service';
import { settingsService } from './settings.service';
import { eventBus, Events } from '../utils/events';
import { logger } from '../utils/logger';
import { sanitizeTelegramText, sanitizeJsonStrings, validateDbInput } from '../utils/unicode';
import { extractTelegramSnapshot, validateTelegramEntities, validateTelegramHtml } from './post-renderer.service';

const CACHE_KEY_PUBLISHED = 'posts:published';
const CACHE_KEY_COMMANDS = 'posts:commands';
const CACHE_KEY_MENU = 'posts:menu';

export const postService = {
  async create(data: {
    title: string;
    slug: string;
    content?: string;
    caption?: string;
    mediaFileId?: string;
    mediaType?: string;
    albumMediaIds?: string[];
    parseMode?: string;
    buttons?: any[];
    entities?: any[];
    telegramPayload?: any;
    telegramMessageSnapshot?: any;
    contentFormat?: string;
    contentVersion?: number;
    command?: string;
    status?: PostStatus;
    sortOrder?: number;
    createdBy?: bigint;
  }) {
    const sanitized = {
      title: validateDbInput(data.title, 'post.title'),
      slug: data.slug,
      content: data.content ? sanitizeTelegramText(data.content) : undefined,
      caption: data.caption ? sanitizeTelegramText(data.caption) : undefined,
      mediaFileId: data.mediaFileId,
      mediaType: data.mediaType,
      albumMediaIds: data.albumMediaIds ? JSON.parse(JSON.stringify(data.albumMediaIds)) : undefined,
      parseMode: data.parseMode ?? 'Markdown',
      buttons: data.buttons ? sanitizeJsonStrings(JSON.parse(JSON.stringify(data.buttons))) : undefined,
      entities: data.entities ? sanitizeJsonStrings(JSON.parse(JSON.stringify(data.entities))) : undefined,
      telegramPayload: data.telegramPayload ? sanitizeJsonStrings(JSON.parse(JSON.stringify(data.telegramPayload))) : undefined,
      telegramMessageSnapshot: data.telegramMessageSnapshot ? sanitizeJsonStrings(JSON.parse(JSON.stringify(data.telegramMessageSnapshot))) : undefined,
      contentFormat: data.contentFormat,
      contentVersion: data.contentVersion ?? 1,
      contentText: data.contentText,
      contentEntities: data.contentEntities ? sanitizeJsonStrings(JSON.parse(JSON.stringify(data.contentEntities))) : undefined,
      renderMode: data.renderMode ?? 'telegram_entities',
      previewText: data.previewText,
      command: data.command,
      status: data.status ?? PostStatus.DRAFT,
      sortOrder: data.sortOrder ?? 0,
      createdBy: data.createdBy,
    };
    const post = await postRepository.create(sanitized);
    this.invalidateCache();
    await systemLogService.log({
      eventType: SystemEventType.ADMIN_ACTION,
      message: `Post Created: "${post.title}" (slug: ${post.slug})`,
      metadata: { postId: post.id, slug: post.slug } as any,
    });
    eventBus.emit(Events.POST_CREATED, { postId: post.id, title: post.title });
    logger.info(`[Post] Created: "${post.title}" (${post.slug})`);
    return post;
  },

  async update(id: number, data: Prisma.PostUncheckedUpdateInput & { updatedBy?: bigint }) {
    const existing = await postRepository.findById(id);
    if (!existing) return null;
    await postRepository.saveVersion(id, {
      id: existing.id,
      title: existing.title,
      slug: existing.slug,
      content: existing.content,
      caption: existing.caption,
      mediaFileId: existing.mediaFileId,
      mediaType: existing.mediaType,
      albumMediaIds: existing.albumMediaIds,
      parseMode: existing.parseMode,
      buttons: existing.buttons,
      entities: (existing as any).entities,
      telegramPayload: (existing as any).telegramPayload,
      telegramMessageSnapshot: (existing as any).telegramMessageSnapshot,
      contentFormat: (existing as any).contentFormat,
      contentVersion: (existing as any).contentVersion,
      command: existing.command,
      status: existing.status,
      sortOrder: existing.sortOrder,
    });
    // Sanitize text fields before update
    if (typeof data.title === 'string') data.title = validateDbInput(data.title, 'post.title');
    if (typeof data.content === 'string') data.content = sanitizeTelegramText(data.content);
    if (typeof data.caption === 'string') data.caption = sanitizeTelegramText(data.caption);
    if (data.buttons) data.buttons = sanitizeJsonStrings(JSON.parse(JSON.stringify(data.buttons)));
    if ((data as any).entities) (data as any).entities = sanitizeJsonStrings(JSON.parse(JSON.stringify((data as any).entities)));
    if ((data as any).telegramPayload) (data as any).telegramPayload = sanitizeJsonStrings(JSON.parse(JSON.stringify((data as any).telegramPayload)));
    if ((data as any).telegramMessageSnapshot) (data as any).telegramMessageSnapshot = sanitizeJsonStrings(JSON.parse(JSON.stringify((data as any).telegramMessageSnapshot)));
    if ((data as any).contentEntities) (data as any).contentEntities = sanitizeJsonStrings(JSON.parse(JSON.stringify((data as any).contentEntities)));
    const post = await postRepository.update(id, { ...data, updatedBy: data.updatedBy ?? undefined });
    this.invalidateCache();

    // Auto-sync published posts to menu (single source of truth = post database — title resolved at render time)
    if (post.status === 'PUBLISHED' && post.isPublished) {
      settingsService.addPostToMenu(post.id, undefined, true).catch(err => {
        logger.warn(`[Post] Menu sync failed for post ${id}:`, err);
      });
    }

    await systemLogService.log({
      eventType: SystemEventType.ADMIN_ACTION,
      message: `Post Updated: "${post.title}"`,
      metadata: { postId: id, changes: Object.keys(data) } as any,
    });
    eventBus.emit(Events.POST_UPDATED, { postId: id, changes: Object.keys(data) });
    logger.info(`[Post] Updated: "${post.title}" (id: ${id})`);
    return post;
  },

  async delete(id: number) {
    const post = await postRepository.findById(id);
    if (!post) return null;
    // Remove all menu references before deletion
    await settingsService.removePostFromMenu(id).catch(err => {
      logger.warn(`[Post] Failed to remove post ${id} from menu:`, err);
    });
    // Invalidate caches before deletion
    this.invalidateCache();
    // Prisma cascade deletes: PostCommand, PostButton, PostView, PostClickLog, PostVersion
    await postRepository.delete(id);
    await systemLogService.log({
      eventType: SystemEventType.ADMIN_ACTION,
      message: `Post Deleted: "${post.title}"`,
      metadata: { postId: id } as any,
    });
    eventBus.emit(Events.POST_DELETED, { postId: id, title: post.title });
    logger.info(`[Post] Deleted: "${post.title}" (id: ${id})`);
    return post;
  },

  async publish(id: number, publishedBy?: bigint) {
    const post = await postRepository.update(id, {
      status: PostStatus.PUBLISHED,
      isPublished: true,
      publishedAt: new Date(),
      updatedBy: publishedBy ?? undefined,
    });
    this.invalidateCache();
    // Auto-add to menu_layout (visible by default for published posts — title resolved from DB at render time)
    await settingsService.addPostToMenu(post.id, undefined, true).catch(err => {
      logger.error(`[Post] Failed to add post "${post.title}" to menu:`, err);
    });
    await systemLogService.log({
      eventType: SystemEventType.ADMIN_ACTION,
      message: `Post Published: "${post.title}"`,
      metadata: { postId: id } as any,
    });
    eventBus.emit(Events.POST_PUBLISHED, { postId: post.id, title: post.title });
    logger.info(`[Post] Published: "${post.title}"`);
    return post;
  },

  async unpublish(id: number) {
    const post = await postRepository.update(id, {
      status: PostStatus.DRAFT,
      isPublished: false,
      updatedBy: undefined,
    });
    this.invalidateCache();
    // Remove from menu (unpublished posts should not appear)
    await settingsService.removePostFromMenu(post.id).catch(err => {
      logger.warn(`[Post] Failed to remove unpublished post from menu:`, err);
    });
    eventBus.emit(Events.POST_UNPUBLISHED, { postId: id, title: post.title });
    logger.info(`[Post] Unpublished: "${post.title}"`);
    return post;
  },

  async archive(id: number) {
    const post = await postRepository.update(id, {
      status: PostStatus.ARCHIVED,
      isPublished: false,
    });
    this.invalidateCache();
    // Remove from menu (archived posts should not appear)
    await settingsService.removePostFromMenu(post.id).catch(err => {
      logger.warn(`[Post] Failed to remove archived post from menu:`, err);
    });
    eventBus.emit(Events.POST_UNPUBLISHED, { postId: id, title: post.title });
    logger.info(`[Post] Archived: "${post.title}"`);
    return post;
  },

  async schedule(id: number, scheduledAt: Date) {
    const post = await postRepository.update(id, {
      status: PostStatus.SCHEDULED,
      scheduledAt,
      isPublished: false,
    });
    this.invalidateCache();
    await systemLogService.log({
      eventType: SystemEventType.ADMIN_ACTION,
      message: `Post Scheduled for publish: "${post.title}" at ${scheduledAt.toISOString()}`,
      metadata: { postId: id, scheduledAt: scheduledAt.toISOString() } as any,
    });
    logger.info(`[Post] Scheduled: "${post.title}" at ${scheduledAt.toISOString()}`);
    return post;
  },

  async scheduleUnpublish(id: number, unpublishAt: Date) {
    const post = await postRepository.update(id, {
      unpublishAt,
    });
    this.invalidateCache();
    await systemLogService.log({
      eventType: SystemEventType.ADMIN_ACTION,
      message: `Post Scheduled for unpublish: "${post.title}" at ${unpublishAt.toISOString()}`,
      metadata: { postId: id, unpublishAt: unpublishAt.toISOString() } as any,
    });
    logger.info(`[Post] Scheduled unpublish: "${post.title}" at ${unpublishAt.toISOString()}`);
    return post;
  },

  async hide(id: number) {
    const post = await postRepository.update(id, {
      status: PostStatus.HIDDEN,
      isPublished: false,
    });
    this.invalidateCache();
    // Optionally hide from menu too (by removing, since hidden posts shouldn't be in menu)
    await settingsService.removePostFromMenu(post.id).catch(err => {
      logger.error(`[Post] Failed to remove hidden post from menu:`, err);
    });
    eventBus.emit(Events.POST_HIDDEN, { postId: id, title: post.title });
    logger.info(`[Post] Hidden: "${post.title}"`);
    return post;
  },

  async show(id: number) {
    const post = await postRepository.update(id, {
      status: PostStatus.PUBLISHED,
      isPublished: true,
    });
    this.invalidateCache();
    await settingsService.addPostToMenu(post.id, undefined, true).catch(err => {
      logger.error(`[Post] Failed to add post "${post.title}" to menu:`, err);
    });
    logger.info(`[Post] Shown (restored): "${post.title}"`);
    return post;
  },

  async getHidden() {
    return postRepository.getHidden();
  },

  async processScheduled(): Promise<number> {
    const now = new Date();
    let processed = 0;
    const dueForPublish = await prisma.post.findMany({
      where: {
        status: PostStatus.SCHEDULED,
        scheduledAt: { lte: now },
        isPublished: false,
      },
    });
    for (const post of dueForPublish) {
      await this.publish(post.id);
      processed++;
      logger.info(`[Scheduler] Auto-published post: "${post.title}" (id: ${post.id})`);
    }
    const dueForUnpublish = await prisma.post.findMany({
      where: {
        status: PostStatus.PUBLISHED,
        isPublished: true,
        unpublishAt: { lte: now },
      },
    });
    for (const post of dueForUnpublish) {
      await this.unpublish(post.id);
      processed++;
      logger.info(`[Scheduler] Auto-unpublished post: "${post.title}" (id: ${post.id})`);
    }
    return processed;
  },

  validateNativePostInput(input: { content?: string | null; caption?: string | null; entities?: any[] | null; buttons?: any[] | null; media?: any[] | null; contentFormat?: string | null }) {
    const text = input.content || input.caption || '';
    const issues = [
      ...validateTelegramEntities(text, input.entities || undefined),
      ...(input.contentFormat === 'HTML' ? validateTelegramHtml(text) : []),
    ];
    if (input.buttons && !Array.isArray(input.buttons)) issues.push('[PostKeyboard] buttons must be an array of rows');
    (input.buttons || []).forEach((row: any, r: number) => {
      if (!Array.isArray(row)) issues.push(`[PostKeyboard] row ${r} must be an array`);
      (Array.isArray(row) ? row : []).forEach((btn: any, c: number) => {
        if (!btn?.text) issues.push(`[PostKeyboard] button ${r}:${c} requires text`);
        if (btn?.type === 'URL' && !(btn.value || btn.url)) issues.push(`[PostKeyboard] URL button ${r}:${c} requires value/url`);
      });
    });
    (input.media || []).forEach((m: any, i: number) => {
      if (!m?.fileId) issues.push(`[PostMedia] media ${i} requires fileId`);
      if (!m?.type) issues.push(`[PostMedia] media ${i} requires type`);
    });
    issues.forEach(issue => logger.warn(issue));
    return { valid: issues.length === 0, issues };
  },

  async importFromTelegram(postId: number, message: any, updatedBy?: bigint) {
    const snapshot = extractTelegramSnapshot(message);
    const content = message.text || '';
    const caption = message.caption || undefined;
    const media = snapshot.media;
    const entities = snapshot.entities || [];
    const captionEntities = snapshot.captionEntities || [];
    const keyboard = snapshot.keyboard || [];
    const validation = this.validateNativePostInput({ content: content || caption, caption, entities: caption ? captionEntities : entities, buttons: keyboard, media, contentFormat: 'entities' });
    if (!validation.valid) logger.warn(`[PostImport] Validation warnings for post ${postId}: ${validation.issues.join('; ')}`);
    const payload = { text: content || '', caption, entities, captionEntities, media, keyboard, rawMessage: snapshot.rawMessage };
    const contentText = content || undefined;
    const contentEntities = (caption ? captionEntities : entities) || [];
    const previewText = (content || caption || '').slice(0, 200);
    const update: any = {
      content: content || undefined,
      caption,
      entities: caption ? captionEntities : entities,
      telegramPayload: payload,
      telegramMessageSnapshot: snapshot.message,
      contentFormat: 'telegram_entities',
      contentVersion: 2,
      contentText,
      contentEntities,
      renderMode: 'telegram_entities',
      previewText,
      buttons: keyboard.length ? keyboard.map((row: any[]) => row.map((b: any) => ({ text: b.text, type: b.url ? 'URL' : b.web_app ? 'WEB_APP' : b.login_url ? 'LOGIN_URL' : b.copy_text ? 'COPY_TEXT' : b.switch_inline_query ? 'SWITCH_INLINE' : 'CALLBACK', value: b.url || b.callback_data || b.web_app?.url || b.login_url?.url || b.copy_text?.text || b.switch_inline_query || '', payload: b }))) : undefined,
      mediaFileId: media[0]?.fileId,
      mediaType: media[0]?.type,
      albumMediaIds: media.length > 1 ? media.map((m: any) => m.fileId) : undefined,
      parseMode: null,
      updatedBy,
    };
    logger.info(`[PostImport] Importing Telegram message into post ${postId} entities=${entities.length} captionEntities=${captionEntities.length} media=${media.length} buttons=${keyboard.length}`);
    const post = await postRepository.update(postId, update);
    await prisma.$transaction([
      prisma.postMedia.deleteMany({ where: { postId } }),
      prisma.postEntity.deleteMany({ where: { postId } }),
      prisma.postKeyboard.deleteMany({ where: { postId } }),
    ]);
    for (let i = 0; i < media.length; i++) await prisma.postMedia.create({ data: { postId, ...media[i], order: i } as any });
    for (let i = 0; i < entities.length; i++) await prisma.postEntity.create({ data: { postId, source: 'text', type: entities[i].type, offset: entities[i].offset, length: entities[i].length, url: entities[i].url, user: entities[i].user, language: entities[i].language, customEmojiId: entities[i].custom_emoji_id, payload: entities[i] } as any });
    for (let i = 0; i < captionEntities.length; i++) await prisma.postEntity.create({ data: { postId, source: 'caption', type: captionEntities[i].type, offset: captionEntities[i].offset, length: captionEntities[i].length, url: captionEntities[i].url, user: captionEntities[i].user, language: captionEntities[i].language, customEmojiId: captionEntities[i].custom_emoji_id, payload: captionEntities[i] } as any });
    for (let r = 0; r < keyboard.length; r++) for (let c = 0; c < keyboard[r].length; c++) await prisma.postKeyboard.create({ data: { postId, row: r, col: c, text: keyboard[r][c].text, type: keyboard[r][c].url ? 'URL' : keyboard[r][c].callback_data ? 'CALLBACK' : 'NATIVE', value: keyboard[r][c].url || keyboard[r][c].callback_data, payload: keyboard[r][c] } as any });
    this.invalidateCache();
    return post;
  },

  async duplicate(id: number, createdBy?: bigint) {
    return postRepository.duplicateWithCommands(id, `${id} (کپی)`, `copy-${id}-${Date.now()}`, createdBy);
  },

  async findById(id: number) {
    return postRepository.findById(id);
  },

  async findBySlug(slug: string) {
    return postRepository.findBySlug(slug);
  },

  async findByCommand(command: string) {
    return postRepository.findByCommand(command);
  },

  async findAll(params: {
    page?: number;
    limit?: number;
    status?: PostStatus;
    isPublished?: boolean;
    search?: string;
    category?: string;
  }) {
    return postRepository.findAll(params);
  },

  async getPublished() {
    const cached = cache.get<any[]>(CACHE_KEY_PUBLISHED);
    if (cached) return cached;
    const posts = await postRepository.getPublished();
    cache.set(CACHE_KEY_PUBLISHED, posts, 10);
    return posts;
  },

  async getPublishedByPage(page: number, limit: number = 5) {
    return postRepository.getPublishedByPage(page, limit);
  },

  async getDrafts() {
    return postRepository.getDrafts();
  },

  async getCommandMap(): Promise<Map<string, any>> {
    const cached = cache.get<Map<string, any>>(CACHE_KEY_COMMANDS);
    if (cached) {
      logger.debug(`[CommandMap] Using cache (${cached.size} entries)`);
      return cached;
    }
    const posts = await postRepository.getPublished();
    const map = new Map<string, any>();
    for (const post of posts) {
      if (post.command) {
        map.set(post.command, post);
        logger.debug(`[CommandMap] Post.command: /${post.command} -> "${post.title}"`);
      }
      const cmds = (post as any).commands;
      if (cmds && Array.isArray(cmds) && cmds.length > 0) {
        for (const cmd of cmds) {
          map.set(cmd.command, post);
          logger.debug(`[CommandMap] PostCommand: /${cmd.command} -> "${post.title}"`);
          if (cmd.aliases && Array.isArray(cmd.aliases)) {
            for (const alias of cmd.aliases) {
              map.set(alias, post);
              logger.debug(`[CommandMap] Alias: /${alias} -> "${post.title}"`);
            }
          }
        }
      }
    }
    logger.info(`[CommandMap] Built map with ${map.size} command entries from ${posts.length} published posts`);
    cache.set(CACHE_KEY_COMMANDS, map, 300);
    return map;
  },

  async reorder(id: number, sortOrder: number) {
    const post = await postRepository.update(id, { sortOrder });
    this.invalidateCache();
    return post;
  },

  async incrementViews(id: number, userId?: number | null, telegramId?: bigint | null) {
    return postRepository.incrementViews(id, userId, telegramId);
  },

  async logClick(data: {
    postId: number;
    userId?: number | null;
    telegramId?: bigint | null;
    buttonText?: string | null;
    buttonType?: string | null;
  }) {
    return postRepository.logClick(data);
  },

  async getAnalytics(postId: number) {
    return postRepository.getAnalytics(postId);
  },

  async getGlobalAnalytics() {
    return postRepository.getGlobalAnalytics();
  },

  async getTopPosts(limit?: number) {
    return postRepository.getTopPosts(limit);
  },

  async addCommand(postId: number, command: string, aliases?: string[]) {
    const existing = await prisma.postCommand.findUnique({ where: { command } });
    if (existing) throw new Error(`❌ Command /${command} already exists`);
    const aliasConflicts = await prisma.postCommand.findMany({
      where: { OR: [{ command }, { aliases: { array_contains: command } }] },
    });
    if (aliases) {
      for (const alias of aliases) {
        const conflict = await prisma.postCommand.findFirst({
          where: { OR: [{ command: alias }, { aliases: { array_contains: alias } }] },
        });
        if (conflict) throw new Error(`❌ Alias /${alias} conflicts with existing command /${conflict.command}`);
      }
    }
    const result = await prisma.postCommand.create({
      data: { postId, command, aliases: aliases ?? undefined },
    });
    this.invalidateCache();
    await systemLogService.log({
      eventType: SystemEventType.ADMIN_ACTION,
      message: `Post Command Added: /${command}`,
      metadata: { postId, command } as any,
    });
    eventBus.emit(Events.COMMAND_ADDED, { postId, command });
    logger.info(`[Post] Command added: /${command} -> post ${postId}`);
    return result;
  },

  async removeCommand(commandId: number) {
    const cmd = await prisma.postCommand.findUnique({ where: { id: commandId } });
    if (!cmd) throw new Error('Command not found');
    await prisma.postCommand.delete({ where: { id: commandId } });
    this.invalidateCache();
    await systemLogService.log({
      eventType: SystemEventType.ADMIN_ACTION,
      message: `Post Command Removed: /${cmd.command}`,
      metadata: { postId: cmd.postId, command: cmd.command } as any,
    });
    eventBus.emit(Events.COMMAND_REMOVED, { postId: cmd.postId, command: cmd.command });
    logger.info(`[Post] Command removed: /${cmd.command}`);
  },

  async updateCommand(commandId: number, data: { command?: string; aliases?: string[] }) {
    const cmd = await prisma.postCommand.findUnique({ where: { id: commandId } });
    if (!cmd) throw new Error('Command not found');
    // Check conflict if command name is changing
    if (data.command && data.command !== cmd.command) {
      const conflict = await prisma.postCommand.findFirst({
        where: { command: data.command, NOT: { id: commandId } },
      });
      if (conflict) throw new Error(`Command /${data.command} already exists`);
    }
    const updated = await prisma.postCommand.update({
      where: { id: commandId },
      data: { ...(data.command && { command: data.command }), ...(data.aliases && { aliases: data.aliases }) },
    });
    this.invalidateCache();
    await systemLogService.log({
      eventType: SystemEventType.ADMIN_ACTION,
      message: `Post Command Updated: /${updated.command}`,
      metadata: { commandId, changes: Object.keys(data) } as any,
    });
    eventBus.emit(Events.COMMAND_UPDATED, { commandId, command: updated.command });
    logger.info(`[Post] Command updated: /${updated.command} (id: ${commandId})`);
    return updated;
  },

  async addCommandAlias(commandId: number, alias: string) {
    const cmd = await prisma.postCommand.findUnique({ where: { id: commandId } });
    if (!cmd) throw new Error('Command not found');
    const conflict = await prisma.postCommand.findFirst({
      where: {
        NOT: { id: commandId },
        OR: [{ command: alias }, { aliases: { array_contains: alias } }],
      },
    });
    if (conflict) throw new Error(`❌ Alias /${alias} conflicts with command /${conflict.command}`);
    const aliases = (cmd.aliases as string[]) || [];
    if (aliases.includes(alias)) throw new Error(`Alias /${alias} already exists on this command`);
    aliases.push(alias);
    await prisma.postCommand.update({ where: { id: commandId }, data: { aliases } });
    this.invalidateCache();
    await systemLogService.log({
      eventType: SystemEventType.ADMIN_ACTION,
      message: `Post Command Alias Added: /${alias} -> /${cmd.command}`,
      metadata: { postId: cmd.postId, command: cmd.command, alias } as any,
    });
    logger.info(`[Post] Command alias added: /${alias} -> /${cmd.command}`);
  },

  async removeCommandAlias(commandId: number, alias: string) {
    const cmd = await prisma.postCommand.findUnique({ where: { id: commandId } });
    if (!cmd) throw new Error('Command not found');
    const aliases = (cmd.aliases as string[]) || [];
    const filtered = aliases.filter((a: string) => a !== alias);
    await prisma.postCommand.update({ where: { id: commandId }, data: { aliases: filtered } });
    this.invalidateCache();
    logger.info(`[Post] Command alias removed: /${alias}`);
  },

  async getCommands(postId: number) {
    return prisma.postCommand.findMany({ where: { postId } });
  },

  async resolveCommand(command: string): Promise<any | null> {
    logger.debug(`[CommandResolve] Resolving /${command}`);
    const map = await this.getCommandMap();
    const found = map.get(command);
    if (found) {
      logger.debug(`[CommandResolve] Found /${command} -> "${found.title}" (id: ${found.id})`);
      return found;
    }
    // Fallback: direct DB query in case cache is stale or command was added to unpublished post
    logger.debug(`[CommandResolve] /${command} not in map, querying DB...`);
    const dbPost = await postRepository.findByCommand(command);
    if (dbPost && dbPost.status === 'PUBLISHED' && dbPost.isPublished) {
      logger.info(`[CommandResolve] DB fallback found /${command} -> "${dbPost.title}" (id: ${dbPost.id})`);
      // Invalidate cache so next lookup uses fresh data
      this.invalidateCache();
      return dbPost;
    }
    logger.warn(`[CommandResolve] /${command} not found`);
    return null;
  },

  async saveVersion(postId: number) {
    const post = await postRepository.findById(postId);
    if (!post) return null;
    const snapshot = {
      id: post.id,
      title: post.title,
      slug: post.slug,
      content: post.content,
      caption: post.caption,
      mediaFileId: post.mediaFileId,
      mediaType: post.mediaType,
      albumMediaIds: post.albumMediaIds,
      parseMode: post.parseMode,
      buttons: post.buttons,
      command: post.command,
      status: post.status,
      sortOrder: post.sortOrder,
    };
    return postRepository.saveVersion(postId, snapshot);
  },

  async getVersions(postId: number) {
    return postRepository.getVersions(postId);
  },

  async restoreVersion(versionId: number) {
    const post = await postRepository.restoreVersion(versionId);
    if (post) this.invalidateCache();
    return post;
  },

  async integrityCheck(): Promise<string[]> {
    return postRepository.integrityCheck();
  },

  invalidateCache() {
    cache.del(CACHE_KEY_PUBLISHED);
    cache.del(CACHE_KEY_COMMANDS);
    cache.del(CACHE_KEY_MENU);
  },

  async getAllForMenu(): Promise<any[]> {
    const cached = cache.get<any[]>(CACHE_KEY_MENU);
    if (cached) return cached;
    const published = await postRepository.getPublished();
    cache.set(CACHE_KEY_MENU, published, 10);
    return published;
  },
};
