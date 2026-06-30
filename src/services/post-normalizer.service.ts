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

function formatMessages(rawMessages: any[]): any[] {
  if (!Array.isArray(rawMessages)) return [];
  return rawMessages.map((m: any) => ({
    id: m.id,
    postId: m.postId,
    order: m.order,
    messageType: m.messageType ?? 'text',
    text: m.text ?? '',
    entities: Array.isArray(m.entities) ? m.entities : [],
    parseMode: 'None',
    mediaFileId: m.mediaFileId ?? null,
    mediaGroupId: m.mediaGroupId ?? null,
    caption: m.caption ?? null,
    captionEntities: Array.isArray(m.captionEntities) ? m.captionEntities : [],
    replyMarkup: m.replyMarkup ?? null,
    delayMs: m.delayMs ?? 0,
    forwardSource: m.forwardSource ?? null,
  }));
}

export function sanitizePost(post: any): any {
  if (!post) return post;
  return {
    ...post,
    id: post.id ?? undefined,
    title: post.title ?? '',
    slug: post.slug ?? '',
    command: post.command ?? null,
    status: post.status ?? 'DRAFT',
    sortOrder: post.sortOrder ?? 0,
    scheduledAt: post.scheduledAt ?? null,
    publishedAt: post.publishedAt ?? null,
    createdAt: post.createdAt ?? null,
    updatedAt: post.updatedAt ?? null,
    isPublished: post.isPublished ?? false,
    messages: Array.isArray(post.messages) ? post.messages : [],
    commands: Array.isArray(post.commands) ? post.commands : [],
    _count: post._count ?? { views: 0, clickLogs: 0 },
  };
}

export function normalizePost(raw: any): any {
  if (!raw) return raw;

  const post = sanitizePost(raw);
  const normalized = cloneJson(post);

  normalized.messages = formatMessages(post.messages);

  // Message-first: no legacy fields generated
  // All consumers must use normalized.messages
  normalized.renderMode = 'telegram_entities';

  logger.debug(`[PostNormalizer] normalized post=${normalized.id} messages=${normalized.messages.length}`);

  return normalized;
}
