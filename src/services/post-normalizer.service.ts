import { logger } from '../utils/logger';

function cloneJson<T>(value: T): T {
  if (value == null) return value;
  try {
    return JSON.parse(
      JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? v.toString() : v)),
    );
  } catch {
    return value;
  }
}

export function sanitizePost(post: any): any {
  if (!post) return post;
  return {
    ...post,
    id: post.id ?? undefined,
    title: post.title ?? '',
    slug: post.slug ?? '',
    content: post.content ?? '',
    caption: post.caption ?? '',
    contentText: post.contentText ?? null,
    contentEntities: Array.isArray(post.contentEntities) ? post.contentEntities : [],
    entities: Array.isArray(post.entities) ? post.entities : [],
    buttons: Array.isArray(post.buttons) ? post.buttons : [],
    albumMediaIds: Array.isArray(post.albumMediaIds) ? post.albumMediaIds : [],
    mediaFileId: post.mediaFileId ?? null,
    mediaType: post.mediaType ?? null,
    parseMode: post.parseMode ?? 'HTML',
    command: post.command ?? null,
    telegramPayload: post.telegramPayload ?? null,
    telegramMessageSnapshot: post.telegramMessageSnapshot ?? null,
    contentFormat: post.contentFormat ?? null,
    contentVersion: post.contentVersion ?? 1,
    renderMode: post.renderMode ?? 'telegram_entities',
    previewText: post.previewText ?? '',
    status: post.status ?? 'DRAFT',
    sortOrder: post.sortOrder ?? 0,
    scheduledAt: post.scheduledAt ?? null,
    publishedAt: post.publishedAt ?? null,
    createdAt: post.createdAt ?? null,
    updatedAt: post.updatedAt ?? null,
    isPublished: post.isPublished ?? false,
    richMedia: Array.isArray(post.richMedia) ? post.richMedia : [],
    richEntities: Array.isArray(post.richEntities) ? post.richEntities : [],
    keyboards: Array.isArray(post.keyboards) ? post.keyboards : [],
    commands: Array.isArray(post.commands) ? post.commands : [],
    _count: post._count ?? { views: 0, clickLogs: 0 },
  };
}

function extractEntities(post: any): any[] | undefined {
  const sources = [
    ...(Array.isArray(post.contentEntities) && (post.contentEntities?.length ?? 0) > 0 ? [post.contentEntities] : []),
    ...(Array.isArray(post.entities) && (post.entities?.length ?? 0) > 0 ? [post.entities] : []),
    ...(Array.isArray(post.richEntities) && (post.richEntities?.length ?? 0) > 0 ? [post.richEntities] : []),
    ...(Array.isArray(post.postEntities) && (post.postEntities?.length ?? 0) > 0 ? [post.postEntities] : []),
    ...(Array.isArray(post.telegramPayload?.entities) && (post.telegramPayload?.entities?.length ?? 0) > 0 ? [post.telegramPayload.entities] : []),
    ...(Array.isArray(post.telegramMessageSnapshot?.entities) && (post.telegramMessageSnapshot?.entities?.length ?? 0) > 0 ? [post.telegramMessageSnapshot.entities] : []),
  ];
  for (const source of sources) {
    if (Array.isArray(source) && (source?.length ?? 0) > 0) return cloneJson(source);
  }
  return undefined;
}

function extractButtons(post: any): any {
  if (Array.isArray(post.buttons) && (post.buttons?.length ?? 0) > 0) {
    return cloneJson(post.buttons);
  }
  if (Array.isArray(post.keyboards) && (post.keyboards?.length ?? 0) > 0) {
    const rows: any[][] = [];
    for (const kb of post.keyboards) {
      if (kb?.row == null) continue;
      if (!rows[kb.row]) rows[kb.row] = [];
      rows[kb.row][kb.col] = { text: kb.text ?? '', type: kb.type || 'URL', value: kb.value || '' };
    }
    return rows;
  }
  if (Array.isArray(post.telegramPayload?.keyboard) && (post.telegramPayload?.keyboard?.length ?? 0) > 0) {
    return cloneJson(post.telegramPayload.keyboard);
  }
  if (Array.isArray(post.telegramMessageSnapshot?.reply_markup?.inline_keyboard) && (post.telegramMessageSnapshot?.reply_markup?.inline_keyboard?.length ?? 0) > 0) {
    return cloneJson(post.telegramMessageSnapshot.reply_markup.inline_keyboard);
  }
  return [];
}

function extractMedia(post: any): any[] {
  if (Array.isArray(post.telegramPayload?.media) && (post.telegramPayload?.media?.length ?? 0) > 0) {
    return cloneJson(post.telegramPayload.media);
  }
  if (Array.isArray(post.richMedia) && (post.richMedia?.length ?? 0) > 0) {
    return (post.richMedia ?? []).map((m: any) => ({
      type: m?.type ?? null,
      fileId: m?.fileId ?? null,
      caption: m?.caption ?? null,
      captionEntities: m?.captionEntities ?? null,
      width: m?.width ?? null,
      height: m?.height ?? null,
      duration: m?.duration ?? null,
      fileName: m?.fileName ?? null,
      mimeType: m?.mimeType ?? null,
      fileSize: m?.fileSize ?? null,
      mediaGroupId: m?.mediaGroupId ?? null,
    }));
  }
  if (post?.mediaFileId && post?.mediaType) {
    const items: any[] = [];
    if (Array.isArray(post.albumMediaIds) && (post.albumMediaIds?.length ?? 0) > 0) {
      for (const fileId of post.albumMediaIds) {
        items.push({ type: post.mediaType, fileId });
      }
    } else {
      items.push({ type: post.mediaType, fileId: post.mediaFileId, caption: post.caption ?? null });
    }
    return items;
  }
  return [];
}

export function normalizePost(raw: any): any {
  if (!raw) return raw;

  const post = sanitizePost(raw);
  const normalized = cloneJson(post);

  if ((normalized.contentText ?? '') && !(normalized.content ?? '')) {
    normalized.content = normalized.contentText;
  } else if (!(normalized.content ?? '') && !(normalized.contentText ?? '')) {
    normalized.content = normalized.caption ?? '';
  }
  normalized.contentText = undefined;

  const entities = extractEntities(normalized);
  if (entities && Array.isArray(entities) && (entities?.length ?? 0) > 0) {
    normalized.entities = entities;
  } else {
    normalized.entities = [];
  }
  normalized.contentEntities = undefined;
  normalized.richEntities = undefined;
  normalized.postEntities = undefined;

  normalized.buttons = extractButtons(normalized);
  normalized.keyboards = undefined;

  normalized.media = extractMedia(normalized);

  normalized.renderMode = 'telegram_entities';
  normalized.contentFormat = 'telegram_entities';

  if (normalized.telegramPayload) {
    normalized.telegramPayload = undefined;
  }

  logger.debug(`[PostNormalizer] normalized post=${normalized.id} title="${(normalized.title ?? '').slice(0, 50)}" content=${(normalized.content ?? '').length}ch entities=${(normalized.entities?.length ?? 0)} media=${(normalized.media?.length ?? 0)} buttons=${(normalized.buttons?.length ?? 0)}`);

  return normalized;
}
