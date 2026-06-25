import { PostMessageParseMode, PostMessageType, Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { logger } from '../utils/logger';
import { normalizeEntities, telegramLength } from '../shared/message-format/normalizer';
import { buildTelegramKeyboard, MEDIA_SENDERS, TelegramPayload } from './renderer';

export type TelegramEntity = { type: string; offset: number; length: number; [key: string]: any };

export interface NormalizedMessage {
  id: number | string;
  postId: number;
  order: number;
  messageType: PostMessageType | string;
  text?: string;
  entities: TelegramEntity[];
  parseMode: PostMessageParseMode | string;
  mediaFileId?: string | null;
  mediaGroupId?: string | null;
  caption?: string | null;
  captionEntities: TelegramEntity[];
  replyMarkup?: any;
  delayMs: number;
}

function cloneJson<T>(value: T): T {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function arrayJson(value: unknown): TelegramEntity[] {
  return Array.isArray(value) ? cloneJson(value) : [];
}

export function validateEntities(text: string | null | undefined, entities: TelegramEntity[], messageId?: number | string): TelegramEntity[] {
  const source = text ?? '';
  const len = telegramLength(source);
  for (const entity of entities) {
    if (!Number.isInteger(entity.offset) || !Number.isInteger(entity.length) || entity.offset < 0 || entity.length <= 0 || entity.offset + entity.length > len) {
      throw new Error(`[PostMessage] invalid entity messageId=${messageId ?? 'unknown'} offset=${entity.offset} length=${entity.length} textLength=${len}`);
    }
  }
  return normalizeEntities(source, entities as any) as TelegramEntity[];
}

export function sanitizeEntities(payload: TelegramPayload, messageId?: number | string): TelegramPayload {
  const safe = cloneJson(payload);
  let valid = true;
  try {
    if (Array.isArray(safe.entities)) safe.entities = validateEntities(safe.text ?? '', safe.entities, messageId);
    if (Array.isArray(safe.caption_entities)) safe.caption_entities = validateEntities(safe.caption ?? '', safe.caption_entities, messageId);
    if (Array.isArray(safe.media)) {
      safe.media = safe.media.map((item: any, index: number) => ({
        ...item,
        caption_entities: Array.isArray(item.caption_entities)
          ? validateEntities(item.caption ?? '', item.caption_entities, `${messageId ?? 'unknown'}:${index}`)
          : undefined,
      }));
    }
  } catch (err) {
    valid = false;
    logger.warn(`[Sanitize] messageId=${messageId ?? 'unknown'} entities=${Array.isArray(payload.entities) ? payload.entities.length : 0} valid=false error=${(err as Error).message}`);
    throw err;
  }
  logger.debug(`[Sanitize] messageId=${messageId ?? 'unknown'} entities=${Array.isArray(safe.entities) ? safe.entities.length : 0} valid=${valid}`);
  return safe;
}

export function normalizeSingleMessage(row: any): NormalizedMessage {
  const parseMode = row.parseMode ?? row.parse_mode ?? PostMessageParseMode.None;
  const entities = parseMode === PostMessageParseMode.None ? validateEntities(row.text ?? '', arrayJson(row.entities), row.id) : [];
  const captionEntities = parseMode === PostMessageParseMode.None ? validateEntities(row.caption ?? '', arrayJson(row.captionEntities ?? row.caption_entities), `${row.id}:caption`) : [];
  const normalized: NormalizedMessage = {
    id: row.id,
    postId: row.postId ?? row.post_id,
    order: row.order,
    messageType: row.messageType ?? row.message_type ?? PostMessageType.text,
    text: row.text ?? undefined,
    entities,
    parseMode,
    mediaFileId: row.mediaFileId ?? row.media_file_id ?? null,
    mediaGroupId: row.mediaGroupId ?? row.media_group_id ?? null,
    caption: row.caption ?? null,
    captionEntities,
    replyMarkup: row.replyMarkup ?? row.reply_markup ?? null,
    delayMs: row.delayMs ?? row.delay_ms ?? 0,
  };
  logger.debug(`[PostNormalizer] messageId=${normalized.id} post=${normalized.postId} order=${normalized.order} text=${telegramLength(normalized.text ?? '')} entities=${normalized.entities.length}`);
  return normalized;
}

export async function normalizePost(postId: number): Promise<NormalizedMessage[]> {
  const rows = await prisma.postMessage.findMany({ where: { postId }, orderBy: { order: 'asc' } });
  return rows.map(row => normalizeSingleMessage(row));
}

export function buildTelegramPayload(msg: NormalizedMessage): TelegramPayload {
  const buttons = Array.isArray(msg.replyMarkup) ? msg.replyMarkup : msg.replyMarkup?.inline_keyboard;
  const reply_markup = buttons?.length ? { inline_keyboard: buildTelegramKeyboard(cloneJson(buttons), msg.postId) } : undefined;
  const parse_mode = msg.parseMode !== PostMessageParseMode.None ? msg.parseMode : undefined;
  if (parse_mode && (msg.entities.length || msg.captionEntities.length)) {
    throw new Error(`[PostMessage] parseMode cannot be mixed with entities messageId=${msg.id}`);
  }

  if (msg.messageType === PostMessageType.album) {
    const media = Array.isArray((msg as any).media) ? (msg as any).media : [];
    return { method: 'sendMediaGroup', media, reply_markup };
  }
  if (msg.messageType !== PostMessageType.text && msg.mediaFileId) {
    const sender = MEDIA_SENDERS[String(msg.messageType)] || MEDIA_SENDERS.document;
    return {
      method: sender.apiMethod,
      media: msg.mediaFileId,
      caption: msg.caption ?? msg.text,
      caption_entities: msg.captionEntities.length ? cloneJson(msg.captionEntities) : undefined,
      parse_mode,
      reply_markup,
      link_preview_options: { is_disabled: true },
    };
  }
  return {
    method: 'sendMessage',
    text: msg.text || '(پست خالی)',
    entities: msg.entities.length ? cloneJson(msg.entities) : undefined,
    parse_mode,
    reply_markup,
    link_preview_options: { is_disabled: true },
  };
}

function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, Math.max(0, ms))); }

export async function sendSingleMessage(telegram: any, chatId: number | string, msg: NormalizedMessage) {
  const payload = sanitizeEntities(buildTelegramPayload(msg), msg.id);
  logger.info(`[PostSender] post=${msg.postId} messageId=${msg.id} order=${msg.order} method=${payload.method}`);
  switch (payload.method) {
    case 'sendMessage': return telegram.sendMessage(chatId, payload.text, payload);
    case 'sendMediaGroup': return telegram.sendMediaGroup(chatId, payload.media, payload);
    default: return telegram[payload.method](chatId, payload.media, payload);
  }
}

export async function sendPost(postId: number, chatId: number | string, telegram: any) {
  const messages = await normalizePost(postId);
  for (const msg of messages) {
    await sleep(msg.delayMs ?? 0);
    await sendSingleMessage(telegram, chatId, msg);
  }
}

export const postMessageService = {
  list(postId: number) { return prisma.postMessage.findMany({ where: { postId }, orderBy: { order: 'asc' } }); },
  get(id: number) { return prisma.postMessage.findUnique({ where: { id } }); },
  async create(postId: number, data: any) {
    const last = await prisma.postMessage.aggregate({ where: { postId }, _max: { order: true } });
    return prisma.postMessage.create({ data: normalizeWriteData(postId, { order: (last._max.order ?? -1) + 1, ...data }) as any });
  },
  update(id: number, data: any) { return prisma.postMessage.update({ where: { id }, data: normalizeUpdateData(data) as any }); },
  delete(id: number) { return prisma.postMessage.delete({ where: { id } }); },
  async reorder(postId: number, orderedIds: number[]) {
    return prisma.$transaction(orderedIds.map((id, order) => prisma.postMessage.update({ where: { id, postId } as any, data: { order } })));
  },
};

function normalizeWriteData(postId: number, data: any): Prisma.PostMessageUncheckedCreateInput {
  const parseMode = data.parseMode ?? PostMessageParseMode.None;
  const entities = parseMode === PostMessageParseMode.None ? validateEntities(data.text ?? '', arrayJson(data.entities), 'new') : [];
  const captionEntities = parseMode === PostMessageParseMode.None ? validateEntities(data.caption ?? '', arrayJson(data.captionEntities), 'new:caption') : [];
  return { postId, order: data.order, messageType: data.messageType ?? PostMessageType.text, text: data.text ?? null, entities, parseMode, mediaFileId: data.mediaFileId ?? null, mediaGroupId: data.mediaGroupId ?? null, caption: data.caption ?? null, captionEntities, replyMarkup: data.replyMarkup ?? null, delayMs: data.delayMs ?? 0 } as any;
}

function normalizeUpdateData(data: any): Prisma.PostMessageUncheckedUpdateInput {
  const out: any = { ...data };
  if (out.entities) out.entities = arrayJson(out.entities);
  if (out.captionEntities) out.captionEntities = arrayJson(out.captionEntities);
  return out;
}
