import { PostStatus, Prisma, SystemEventType } from '@prisma/client';
import { prisma } from '../prisma/client';
import { postRepository } from '../repositories/post.repository';
import { commandRepository } from '../repositories/command.repository';
import { cache, cacheKey } from '../utils/cache';
import { redisClient } from '../utils/redis';
import { systemLogService } from './system-log.service';
import { settingsService } from './settings.service';
import { eventBus, Events } from '../utils/events';
import { logger } from '../utils/logger';
import { sanitizeTelegramText, sanitizeJsonStrings, validateDbInput } from '../utils/unicode';
import { extractTelegramSnapshot, validateTelegramEntities, validateTelegramHtml } from './post-renderer.service';
import { normalizePost, sanitizePost } from './post-normalizer.service';
import { postMessageService } from './post-message.service';

const CACHE_KEY_PUBLISHED = cacheKey('posts:published');
const CACHE_KEY_COMMANDS = cacheKey('posts:commands');
const CACHE_KEY_MENU = cacheKey('posts:menu');
const CACHE_KEY_TITLE = cacheKey('posts:title');
let _cacheListenersRegistered = false;

export const postService = {
  async create(data: {
    title?: string;
    slug?: string;
    content?: string;
    caption?: string;
    mediaFileId?: string;
    mediaType?: string;
    mediaFileUniqueId?: string;
    mediaCaption?: string;
    mediaMimeType?: string;
    mediaMeta?: any;
    albumMediaIds?: string[];
    replyMessageType?: string;
    replyMessageText?: string;
    replyMediaFileId?: string;
    replyMediaType?: string;
    isForwarded?: boolean;
    forwardMeta?: any;
    forwardSourceChatId?: bigint;
    forwardSourceMessageId?: number;
    parseMode?: string;
    buttons?: any[];
    entities?: any[];
    telegramPayload?: any;
    messages?: any[];
    telegramMessageSnapshot?: any;
    contentFormat?: string;
    contentVersion?: number;
    contentText?: string;
    contentEntities?: any[];
    renderMode?: string;
    previewText?: string;
    command?: string;
    status?: PostStatus;
    sortOrder?: number;
    createdBy?: bigint;
  }) {
    const isDraft = (data.status ?? PostStatus.DRAFT) === PostStatus.DRAFT;
    const clonedMessages = Array.isArray(data.messages) && data.messages.length > 0
      ? sanitizeJsonStrings(JSON.parse(JSON.stringify(data.messages)))
      : undefined;
    const telegramPayload = data.telegramPayload
      ? sanitizeJsonStrings(JSON.parse(JSON.stringify(data.telegramPayload)))
      : undefined;

    const sanitized: any = {
      title: data.title ? validateDbInput(data.title, 'post.title') : (isDraft ? 'بدون عنوان' : validateDbInput(data.title ?? '', 'post.title')),
      slug: data.slug ?? (isDraft ? `draft-${Date.now()}` : ''),
      content: data.content ? sanitizeTelegramText(data.content) : undefined,
      caption: data.caption ? sanitizeTelegramText(data.caption) : undefined,
      mediaFileId: data.mediaFileId ?? null,
      mediaType: data.mediaType ?? null,
      mediaFileUniqueId: data.mediaFileUniqueId ?? null,
      mediaCaption: data.mediaCaption ?? null,
      mediaMimeType: data.mediaMimeType ?? null,
      mediaMeta: data.mediaMeta ?? null,
      albumMediaIds: Array.isArray(data.albumMediaIds) && (data.albumMediaIds?.length ?? 0) > 0 ? sanitizeJsonStrings(JSON.parse(JSON.stringify(data.albumMediaIds))) : undefined,
      replyMessageType: data.replyMessageType ?? null,
      replyMessageText: data.replyMessageText ?? null,
      replyMediaFileId: data.replyMediaFileId ?? null,
      replyMediaType: data.replyMediaType ?? null,
      isForwarded: data.isForwarded ?? false,
      forwardMeta: data.forwardMeta ?? null,
      forwardSourceChatId: data.forwardSourceChatId ?? null,
      forwardSourceMessageId: data.forwardSourceMessageId ?? null,
      parseMode: data.parseMode ?? 'HTML',
      buttons: Array.isArray(data.buttons) && (data.buttons?.length ?? 0) > 0 ? sanitizeJsonStrings(JSON.parse(JSON.stringify(data.buttons))) : undefined,
      entities: Array.isArray(data.entities) && (data.entities?.length ?? 0) > 0 ? sanitizeJsonStrings(JSON.parse(JSON.stringify(data.entities))) : undefined,
      telegramPayload,
      telegramMessageSnapshot: data.telegramMessageSnapshot ? sanitizeJsonStrings(JSON.parse(JSON.stringify(data.telegramMessageSnapshot))) : undefined,
      contentFormat: data.contentFormat ?? null,
      contentVersion: data.contentVersion ?? 1,
      contentText: data.contentText ?? (data.content || undefined),
      contentEntities: Array.isArray(data.contentEntities) && (data.contentEntities?.length ?? 0) > 0 ? sanitizeJsonStrings(JSON.parse(JSON.stringify(data.contentEntities))) : undefined,
      renderMode: data.renderMode ?? 'telegram_entities',
      previewText: data.previewText ?? (data.content ? data.content.slice(0, 200) : undefined),
      command: data.command ?? null,
      status: data.status ?? PostStatus.DRAFT,
      sortOrder: data.sortOrder ?? 0,
      createdBy: data.createdBy,
    };
    const post = await postRepository.create(sanitized);
    // Persist post_messages rows
    if (clonedMessages) {
      const messageRows = clonedMessages.map((m: any, i: number) => {
        const entities = Array.isArray(m.entities) ? m.entities : [];
        const captionEntities = Array.isArray(m.captionEntities) ? m.captionEntities : [];
        return {
          postId: post.id,
          order: m.order ?? i,
          messageType: m.messageType ?? 'text',
          text: m.text ?? null,
          entities,
          parseMode: 'None',
          mediaFileId: m.mediaFileId ?? null,
          mediaGroupId: m.mediaGroupId ?? null,
          caption: m.caption ?? null,
          captionEntities,
          replyMarkup: m.replyMarkup ?? null,
          delayMs: m.delayMs ?? 0,
        };
      });
      await prisma.postMessage.createMany({ data: messageRows as any });
      for (const row of messageRows) {
        logger.debug(`[PostCreate] postId=${post.id} order=${row.order} entities=%j`, row.entities);
        const linkEntities = (row.entities || []).filter((e: any) => e.type === 'text_link' || e.type === 'url');
        for (const e of linkEntities) {
          logger.info(`[PostCreate][EntityStore] post=${post.id} order=${row.order} type=${e.type} offset=${e.offset} length=${e.length} url=${e.url ?? 'NONE'} displayFragment="${(row.text ?? '').substring(e.offset, e.offset + e.length)}"`);
        }
      }
      logger.info(`[PostEditor][MessageCreate] post=${post.id} created ${messageRows.length} post_messages`);
    }
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
      mediaFileUniqueId: (existing as any).mediaFileUniqueId,
      mediaCaption: (existing as any).mediaCaption,
      mediaMimeType: (existing as any).mediaMimeType,
      mediaMeta: (existing as any).mediaMeta,
      albumMediaIds: existing.albumMediaIds,
      replyMessageType: (existing as any).replyMessageType,
      replyMessageText: (existing as any).replyMessageText,
      replyMediaFileId: (existing as any).replyMediaFileId,
      replyMediaType: (existing as any).replyMediaType,
      isForwarded: (existing as any).isForwarded,
      forwardMeta: (existing as any).forwardMeta,
      forwardSourceChatId: (existing as any).forwardSourceChatId,
      forwardSourceMessageId: (existing as any).forwardSourceMessageId,
      parseMode: existing.parseMode,
      buttons: existing.buttons,
      entities: (existing as any).entities,
      telegramPayload: (existing as any).telegramPayload,
      telegramMessageSnapshot: (existing as any).telegramMessageSnapshot,
      contentFormat: (existing as any).contentFormat,
      contentVersion: (existing as any).contentVersion,
      contentText: (existing as any).contentText,
      contentEntities: (existing as any).contentEntities,
      renderMode: (existing as any).renderMode,
      previewText: (existing as any).previewText,
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
    let clonedMessages: any[] | undefined;
    if (Array.isArray((data as any).messages)) {
      clonedMessages = sanitizeJsonStrings(JSON.parse(JSON.stringify((data as any).messages)));
      delete (data as any).messages;
    }
    if ((data as any).telegramPayload) {
      (data as any).telegramPayload = sanitizeJsonStrings(JSON.parse(JSON.stringify((data as any).telegramPayload)));
    }
    if ((data as any).telegramMessageSnapshot) (data as any).telegramMessageSnapshot = sanitizeJsonStrings(JSON.parse(JSON.stringify((data as any).telegramMessageSnapshot)));
    if (typeof (data as any).contentText === 'string') (data as any).contentText = sanitizeTelegramText((data as any).contentText);
    if ((data as any).contentEntities) (data as any).contentEntities = sanitizeJsonStrings(JSON.parse(JSON.stringify((data as any).contentEntities)));
    const post = await postRepository.update(id, { ...data, updatedBy: data.updatedBy ?? undefined });
    // Persist post_messages rows if messages were provided
    if (clonedMessages) {
      const messageRows = clonedMessages.map((m: any, i: number) => ({
        postId: post.id,
        order: m.order ?? i,
        messageType: m.messageType ?? 'text',
        text: m.text ?? null,
        entities: Array.isArray(m.entities) ? m.entities : [],
        parseMode: 'None',
        mediaFileId: m.mediaFileId ?? null,
        mediaGroupId: m.mediaGroupId ?? null,
        caption: m.caption ?? null,
        captionEntities: Array.isArray(m.captionEntities) ? m.captionEntities : [],
        replyMarkup: m.replyMarkup ?? null,
        delayMs: m.delayMs ?? 0,
      }));
      await prisma.$transaction([
        prisma.postMessage.deleteMany({ where: { postId: post.id } }),
        ...messageRows.map((row: any) => prisma.postMessage.create({ data: row })),
      ]);
      for (const row of messageRows) {
        logger.debug(`[PostUpdate] postId=${post.id} order=${row.order} entities=%j`, row.entities);
        const linkEntities = (row.entities || []).filter((e: any) => e.type === 'text_link' || e.type === 'url');
        for (const e of linkEntities) {
          logger.info(`[PostUpdate][EntityStore] post=${post.id} order=${row.order} type=${e.type} offset=${e.offset} length=${e.length} url=${e.url ?? 'NONE'} displayFragment="${(row.text ?? '').substring(e.offset, e.offset + e.length)}"`);
        }
      }
      logger.info(`[PostEditor][MessageUpdate] post=${post.id} replaced ${messageRows.length} post_messages`);
    }

    // ─── Sync post.buttons to post_messages.replyMarkup ───
    // When buttons are updated via the bot editor (without explicit messages),
    // sync to the corresponding post_message row(s).
    // The bot editor stores buttons as {messages: {"0": [[...]], "1": [[...]]}}
    // which buildTelegramPayload cannot parse. We extract and store the simple
    // array format per message.
    const rawButtons = (data as any).buttons;
    if (rawButtons && !clonedMessages) {
      try {
        const existingMessages = await prisma.postMessage.findMany({
          where: { postId: post.id },
          orderBy: { order: 'asc' },
        });
          if (existingMessages.length > 0) {
          const messagesFormat = (rawButtons as any)?.messages;
          if (messagesFormat && typeof messagesFormat === 'object') {
            let syncedCount = 0;
            for (const msg of existingMessages) {
              const idx = String(msg.id);
              const perMsgButtons = (messagesFormat as any)[idx];
              const btnCount = Array.isArray(perMsgButtons) ? perMsgButtons.flat().length : 0;
              const sampleTypes = Array.isArray(perMsgButtons) ? perMsgButtons.flat().slice(0, 3).map((b: any) => `${b?.type}:${b?.value?.substring(0, 20)}`) : [];
              logger.info(`[REPLYMARKUP_SYNC] postId=${post.id} msgId=${msg.id} msgIdx=${idx} buttonCount=${btnCount} sampleTypes=[${sampleTypes.join(', ')}]`);
              await prisma.postMessage.update({
                where: { id: msg.id },
                data: { replyMarkup: perMsgButtons !== undefined && perMsgButtons !== null ? perMsgButtons : null } as any,
              });
              syncedCount++;
            }
            logger.info(`[KeyboardSync] post=${post.id} synced ${syncedCount}/${existingMessages.length} messages (messages format)`);
          } else if (Array.isArray(rawButtons)) {
            const lastMsg = existingMessages[existingMessages.length - 1];
            await prisma.postMessage.update({
              where: { id: lastMsg.id },
              data: { replyMarkup: rawButtons } as any,
            });
            logger.info(`[KeyboardSync] post=${post.id} synced buttons to messageId=${lastMsg.id} (array format)`);
          }
          // ── Sync to post_keyboards: clear + re-insert per message ──
          for (const msg of existingMessages) {
            const msgBtns = (messagesFormat && typeof messagesFormat === 'object')
              ? (messagesFormat as any)[String(msg.id)]
              : (Array.isArray(rawButtons) && msg === existingMessages[existingMessages.length - 1] ? rawButtons : null);
            if (!Array.isArray(msgBtns) || msgBtns.length === 0) continue;
            const newRows = msgBtns.flatMap((row: any[], r: number) =>
              row.map((btn: any, c: number) => {
                const dbType = btn.url ? 'URL' : btn.callback_data ? 'CALLBACK' : btn.type || 'NATIVE';
                const dbValue = btn.url || btn.callback_data || btn.value || null;
                logger.info(`[BTN_SYNC] postId=${post.id} msgId=${msg.id} row=${r} col=${c} input_type="${btn.type}" input_value="${btn.value}" → db_type="${dbType}" db_value="${dbValue}"`);
                return {
                  postId: post.id,
                  messageId: msg.id,
                  row: r,
                  col: c,
                  text: btn.text || btn.label || '',
                  type: dbType,
                  value: dbValue,
                  payload: btn,
                };
              })
            );
            await prisma.$transaction([
              prisma.postKeyboard.deleteMany({ where: { messageId: msg.id } }),
              prisma.postKeyboard.createMany({ data: newRows }),
            ]);
            logger.debug(`[KeyboardSave] cleared old keyboards for messageId=%d before save`, msg.id);
          }
        }
      } catch (e) {
        logger.warn(`[KeyboardSync] post=${post.id} failed to sync buttons: ${e}`);
      }
    }

    this.invalidateCache();

    // Auto-sync published posts to menu (single source of truth = post database — title resolved at render time)
    if (post.status === 'PUBLISHED' && post.isPublished && post.slug !== '__start__' && post.slug !== '__anonymous__') {
      settingsService.invalidateMenuLayoutCache();
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
    settingsService.invalidateMenuLayoutCache();
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
    if (post.slug !== '__start__' && post.slug !== '__anonymous__') {
      settingsService.invalidateMenuLayoutCache();
      await settingsService.addPostToMenu(post.id, undefined, true).catch(err => {
        logger.error(`[Post] Failed to add post "${post.title}" to menu:`, err);
      });
    }
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
    return (await postRepository.getHidden()).map((p: any) => normalizePost(sanitizePost(p)));
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
      select: { id: true, title: true },
    });
    if (dueForPublish.length > 0) {
      await prisma.post.updateMany({
        where: { id: { in: dueForPublish.map(p => p.id) } },
        data: { status: PostStatus.PUBLISHED, isPublished: true, publishedAt: now },
      });
      this.invalidateCache();
      for (const post of dueForPublish) {
        await settingsService.addPostToMenu(post.id, undefined, true).catch(err => {
          logger.warn(`[Scheduler] Menu sync failed for post ${post.id}:`, err);
        });
        await systemLogService.log({
          eventType: SystemEventType.ADMIN_ACTION,
          message: `Post Published: "${post.title}"`,
          metadata: { postId: post.id, source: 'scheduler' } as any,
        });
        eventBus.emit(Events.POST_PUBLISHED, { postId: post.id, title: post.title });
        logger.info(`[Scheduler] Auto-published post: "${post.title}" (id: ${post.id})`);
        processed++;
      }
    }
    const dueForUnpublish = await prisma.post.findMany({
      where: {
        status: PostStatus.PUBLISHED,
        isPublished: true,
        unpublishAt: { lte: now },
      },
      select: { id: true, title: true },
    });
    if (dueForUnpublish.length > 0) {
      await prisma.post.updateMany({
        where: { id: { in: dueForUnpublish.map(p => p.id) } },
        data: { status: PostStatus.DRAFT, isPublished: false },
      });
      this.invalidateCache();
      for (const post of dueForUnpublish) {
        await settingsService.removePostFromMenu(post.id).catch(err => {
          logger.warn(`[Scheduler] Menu sync failed for post ${post.id}:`, err);
        });
        eventBus.emit(Events.POST_UNPUBLISHED, { postId: post.id, title: post.title });
        logger.info(`[Scheduler] Auto-unpublished post: "${post.title}" (id: ${post.id})`);
        processed++;
      }
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

    const reply = message.reply_to_message;
    let replyMessageType: string | null = null;
    let replyMessageText: string | null = null;
    let replyMediaFileId: string | null = null;
    let replyMediaType: string | null = null;
    if (reply) {
      replyMessageText = reply.text || reply.caption || null;
      if (reply.photo) { replyMediaType = 'photo'; replyMediaFileId = reply.photo[reply.photo.length - 1].file_id; }
      else if (reply.video) { replyMediaType = 'video'; replyMediaFileId = reply.video.file_id; }
      else if (reply.document) { replyMediaType = 'document'; replyMediaFileId = reply.document.file_id; }
      else if (reply.animation) { replyMediaType = 'animation'; replyMediaFileId = reply.animation.file_id; }
      else if (reply.audio) { replyMediaType = 'audio'; replyMediaFileId = reply.audio.file_id; }
      else if (reply.voice) { replyMediaType = 'voice'; replyMediaFileId = reply.voice.file_id; }
      else if (reply.sticker) { replyMediaType = 'sticker'; replyMediaFileId = reply.sticker.file_id; }
      else if (reply.video_note) { replyMediaType = 'video_note'; replyMediaFileId = reply.video_note.file_id; }
      else { replyMessageType = 'text'; }
    }

    const isForward = !!(message.forward_origin || message.forward_from_chat || message.forward_from || message.forward_date || message.forward_sender_name);
    let forwardMeta: any = null;
    let forwardSourceChatId: bigint | null = null;
    let forwardSourceMessageId: number | null = null;
    if (isForward) {
      let type = 'hidden_user';
      let originName = message.forward_sender_name || '';
      let originChatId: number | null = null;
      let originMessageId: number | null = null;
      if (message.forward_from_chat) {
        type = message.forward_from_chat.type || 'channel';
        originName = message.forward_from_chat.title || '';
        originChatId = message.forward_from_chat.id;
        originMessageId = message.forward_from_message_id || null;
      } else if (message.forward_from) {
        type = 'user';
        originName = [message.forward_from.first_name, message.forward_from.last_name].filter(Boolean).join(' ');
      }
      forwardMeta = { type, originName, originChatId, originMessageId, forwardDate: message.forward_date || null };
      forwardSourceChatId = originChatId ? BigInt(originChatId) : null;
      forwardSourceMessageId = originMessageId;
      logger.info(`[ForwardDetect] postId=${postId} messageId=${message.message_id} hasForwardOrigin=true originChat=${originChatId} originMsg=${originMessageId}`);
    }

    const firstMedia = media[0];
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
      mediaFileId: firstMedia?.fileId,
      mediaType: firstMedia?.type,
      mediaFileUniqueId: firstMedia?.fileUniqueId,
      mediaCaption: caption,
      mediaMimeType: firstMedia?.mimeType,
      mediaMeta: firstMedia?.payload,
      albumMediaIds: media.length > 1 ? media.map((m: any) => m.fileId) : undefined,
      replyMessageType,
      replyMessageText,
      replyMediaFileId,
      replyMediaType,
      isForwarded: isForward,
      forwardMeta,
      forwardSourceChatId,
      forwardSourceMessageId,
      parseMode: null,
      updatedBy,
    };
    logger.info(`[PostSave] postId=${postId} isForwarded=${isForward} forwardMeta=${forwardMeta ? JSON.stringify(forwardMeta) : 'null'}`);
    logger.info(`[PostImport] Importing Telegram message into post ${postId} entities=${entities.length} captionEntities=${captionEntities.length} media=${media.length} buttons=${keyboard.length}`);
    for (const e of entities) {
      if (e.type === 'text_link' || e.type === 'url') {
        logger.info(`[PostImport][EntityStore] post=${postId} source=text type=${e.type} offset=${e.offset} length=${e.length} url=${e.url ?? 'NONE'} displayFragment="${(content || '').substring(e.offset, e.offset + e.length)}"`);
      }
    }
    const post = await postRepository.update(postId, update);
    await prisma.$transaction([
      prisma.postMedia.deleteMany({ where: { postId } }),
      prisma.postEntity.deleteMany({ where: { postId } }),
      prisma.postKeyboard.deleteMany({ where: { postId } }),
      ...(media.length ? [prisma.postMedia.createMany({ data: media.map((m: any, i: number) => ({ postId, ...m, order: i })) })] : []),
      ...(entities.length ? [prisma.postEntity.createMany({ data: entities.map((e: any) => ({ postId, source: 'text' as const, type: e.type, offset: e.offset, length: e.length, url: e.url, user: e.user, language: e.language, customEmojiId: e.custom_emoji_id, payload: e })) })] : []),
      ...(captionEntities.length ? [prisma.postEntity.createMany({ data: captionEntities.map((e: any) => ({ postId, source: 'caption' as const, type: e.type, offset: e.offset, length: e.length, url: e.url, user: e.user, language: e.language, customEmojiId: e.custom_emoji_id, payload: e })) })] : []),
      ...(keyboard.length ? [prisma.postKeyboard.createMany({ data: keyboard.flatMap((row: any[], r: number) => row.map((btn: any, c: number) => ({ postId, row: r, col: c, text: btn.text, type: btn.url ? 'URL' : btn.callback_data ? 'CALLBACK' : 'NATIVE', value: btn.url || btn.callback_data, payload: btn }))) })] : []),
    ]);
    this.invalidateCache();
    return post;
  },

  async duplicate(id: number, createdBy?: bigint) {
    return postRepository.duplicateWithCommands(id, `${id} (کپی)`, `copy-${id}-${Date.now()}`, createdBy);
  },

  async findById(id: number) {
    const post = await postRepository.findById(id);
    return post ? normalizePost(sanitizePost(post)) : null;
  },

  async getPostMeta(id: number) {
    return postRepository.getPostMeta(id);
  },

  async findByTitle(title: string) {
    const ck = `${CACHE_KEY_TITLE}:${title.toLowerCase()}`;
    const cached = cache.get<any>(ck);
    if (cached !== undefined) return cached === null ? null : cached;
    const post = await postRepository.findByTitle(title);
    const result = post ? normalizePost(sanitizePost(post)) : null;
    cache.set(ck, result, 60);
    return result;
  },

  async findBySlug(slug: string) {
    const post = await postRepository.findBySlug(slug);
    return post ? normalizePost(sanitizePost(post)) : null;
  },

  async findByCommand(command: string) {
    const post = await postRepository.findByCommand(command);
    return post ? normalizePost(sanitizePost(post)) : null;
  },

  async findAll(params: {
    page?: number;
    limit?: number;
    status?: PostStatus;
    isPublished?: boolean;
    search?: string;
    category?: string;
  }) {
    const result = await postRepository.findAll(params);
    return {
      ...result,
      items: (result.items ?? []).map((p: any) => normalizePost(sanitizePost(p))),
    };
  },

  async getPublished() {
    const memCached = cache.get<any[]>(CACHE_KEY_PUBLISHED);
    if (memCached) return memCached;
    const redisCached = await redisClient.get<any[]>(CACHE_KEY_PUBLISHED);
    if (redisCached) {
      cache.set(CACHE_KEY_PUBLISHED, redisCached, 10);
      return redisCached;
    }
    const posts = (await postRepository.getPublished()).map((p: any) => normalizePost(sanitizePost(p)));
    await redisClient.set(CACHE_KEY_PUBLISHED, posts, 10);
    cache.set(CACHE_KEY_PUBLISHED, posts, 10);
    return posts;
  },

  async getPublishedByPage(page: number, limit: number = 5) {
    const result = await postRepository.getPublishedByPage(page, limit);
    return { ...result, items: (result.items ?? []).map((p: any) => normalizePost(sanitizePost(p))) };
  },

  async getDrafts() {
    return (await postRepository.getDrafts()).map((p: any) => normalizePost(sanitizePost(p)));
  },

  async getCommandMap(): Promise<Map<string, any>> {
    const cmdMap = await commandRepository.load();
    const postMap = new Map<string, any>();
    for (const [key, record] of cmdMap) {
      const post = await this.getPostMeta(record.postId);
      if (post) postMap.set(key, post);
    }
    return postMap;
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
    return (await postRepository.getTopPosts(limit)).map((p: any) => normalizePost(sanitizePost(p)));
  },

  async addCommand(postId: number, command: string, aliases?: string[]) {
    await commandRepository.create(postId, command, aliases);
    await systemLogService.log({
      eventType: SystemEventType.ADMIN_ACTION,
      message: `Post Command Added: /${command}`,
      metadata: { postId, command } as any,
    });
    eventBus.emit(Events.COMMAND_ADDED, { postId, command });
    return await prisma.postCommand.findFirst({ where: { postId, command } });
  },

  async removeCommand(commandId: number) {
    const cmd = await prisma.postCommand.findUnique({ where: { id: commandId } });
    if (!cmd) throw new Error('Command not found');
    await commandRepository.delete(commandId);
    await systemLogService.log({
      eventType: SystemEventType.ADMIN_ACTION,
      message: `Post Command Removed: /${cmd.command}`,
      metadata: { postId: cmd.postId, command: cmd.command } as any,
    });
    eventBus.emit(Events.COMMAND_REMOVED, { postId: cmd.postId, command: cmd.command });
  },

  async updateCommand(commandId: number, data: { command?: string; aliases?: string[] }) {
    await commandRepository.update(commandId, data);
    const updated = await prisma.postCommand.findUnique({ where: { id: commandId } });
    await systemLogService.log({
      eventType: SystemEventType.ADMIN_ACTION,
      message: `Post Command Updated: /${updated?.command}`,
      metadata: { commandId, changes: Object.keys(data) } as any,
    });
    eventBus.emit(Events.COMMAND_UPDATED, { commandId, command: updated?.command });
    return updated;
  },

  async addCommandAlias(commandId: number, alias: string) {
    await commandRepository.addAlias(commandId, alias);
    const cmd = await prisma.postCommand.findUnique({ where: { id: commandId } });
    await systemLogService.log({
      eventType: SystemEventType.ADMIN_ACTION,
      message: `Post Command Alias Added: /${alias} -> /${cmd?.command}`,
      metadata: { postId: cmd?.postId, command: cmd?.command, alias } as any,
    });
  },

  async removeCommandAlias(commandId: number, alias: string) {
    await commandRepository.removeAlias(commandId, alias);
  },

  async getCommands(postId: number) {
    return prisma.postCommand.findMany({ where: { postId } });
  },

  async getCommandByPostId(postId: number) {
    return commandRepository.getByPostId(postId);
  },

  async setCommand(postId: number, command: string) {
    await commandRepository.deleteByPostId(postId);
    await commandRepository.create(postId, command);
    eventBus.emit(Events.COMMAND_ADDED, { postId, command });
  },

  async removeCommandByPostId(postId: number) {
    const existing = await commandRepository.getByPostId(postId);
    if (!existing) throw new Error('No command for this post');
    await commandRepository.deleteByPostId(postId);
    eventBus.emit(Events.COMMAND_REMOVED, { postId, command: existing.command });
  },

  async resolveCommand(command: string): Promise<any | null> {
    const record = await commandRepository.resolve(command);
    if (!record) return null;
    const post = await this.getPostMeta(record.postId);
    if (!post || post.status !== 'PUBLISHED' || !post.isPublished) {
      logger.warn(`[ResolveCommand] Command "${command}" resolved to post #${record.postId} but post not published (status=${post?.status} isPublished=${post?.isPublished})`);
      return null;
    }
    return post;
  },

  async saveVersion(postId: number) {
    const post = await postRepository.findById(postId);
    if (!post) return null;
    const messages = await postMessageService.list(postId);
    const snapshot = {
      id: post.id,
      title: post.title,
      slug: post.slug,
      messages,
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
    cache.delByPrefix(CACHE_KEY_TITLE);
    commandRepository.invalidate();
  },

  setupCacheListeners() {
    if (_cacheListenersRegistered) return;
    _cacheListenersRegistered = true;
    const invalidateAll = () => this.invalidateCache();
    const events = [Events.POST_CREATED, Events.POST_UPDATED, Events.POST_DELETED, Events.POST_PUBLISHED, Events.POST_UNPUBLISHED, Events.POST_HIDDEN, Events.COMMAND_ADDED, Events.COMMAND_REMOVED, Events.COMMAND_UPDATED];
    for (const ev of events) {
      eventBus.on(ev, invalidateAll);
    }
    logger.info(`[Cache] Auto-invalidation listeners registered for ${events.length} events`);
  },

  async getAllForMenu(): Promise<any[]> {
    const memCached = cache.get<any[]>(CACHE_KEY_MENU);
    if (memCached) return memCached;
    const redisCached = await redisClient.get<any[]>(CACHE_KEY_MENU);
    if (redisCached) {
      cache.set(CACHE_KEY_MENU, redisCached, 10);
      return redisCached;
    }
    const published = (await postRepository.getPublished()).map(normalizePost);
    await redisClient.set(CACHE_KEY_MENU, published, 10);
    cache.set(CACHE_KEY_MENU, published, 10);
    return published;
  },

  // ─── Start Post ────────────────────────────────────────
  async getOrCreateStartPost(): Promise<any> {
    const slug = '__start__';
    let post = await postRepository.findBySlug(slug);
    if (!post) {
      await postRepository.create({
        title: '🚀 پیام Start',
        slug,
        content: 'به ربات خوش آمدید! 🙌',
        status: PostStatus.PUBLISHED,
        isPublished: true,
        publishedAt: new Date(),
        parseMode: 'Markdown',
        renderMode: 'telegram_entities',
        previewText: 'به ربات خوش آمدید! 🙌',
      });
      post = await postRepository.findBySlug(slug);
      logger.info('[StartPost] Created start post');
    }
    return post ? normalizePost(post) : null;
  },

  isStartPost(post: any): boolean {
    return post?.slug === '__start__';
  },

  // ─── Anonymous Post ──────────────────────────────────
  async getOrCreateAnonymousPost(): Promise<any> {
    const slug = '__anonymous__';
    let post = await postRepository.findBySlug(slug);
    if (!post) {
      await postRepository.create({
        title: '📩 پیام ناشناس',
        slug,
        content: '✍ لطفاً پیام ناشناس خود را ارسال کنید.',
        status: PostStatus.DRAFT,
        isPublished: false,
        parseMode: 'Markdown',
        renderMode: 'telegram_entities',
        previewText: 'پیام ناشناس',
      });
      post = await postRepository.findBySlug(slug);
      logger.info('[AnonymousPost] Created anonymous message post');
    }
    return post ? normalizePost(post) : null;
  },

  isAnonymousPost(post: any): boolean {
    return post?.slug === '__anonymous__';
  },
};
