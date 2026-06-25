import { PostMessageParseMode, PostMessageType, Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { logger } from '../utils/logger';
import { normalizeEntities, telegramLength } from '../shared/message-format/normalizer';
import { buildTelegramKeyboard, MEDIA_SENDERS, TelegramPayload } from './renderer';

export type TelegramEntity = { type: string; offset: number; length: number; [key: string]: any };

function cloneJson<T>(value: T): T {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function arrayJson(value: unknown): TelegramEntity[] {
  return Array.isArray(value) ? cloneJson(value) : [];
}

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

const STYLE_ENTITY_TYPES = new Set(['bold', 'italic', 'underline', 'strikethrough', 'spoiler', 'blockquote', 'expandable_blockquote']);
const ATOMIC_ENTITY_TYPES = new Set(['code', 'pre', 'text_link', 'text_mention', 'url', 'email', 'phone_number', 'mention', 'hashtag', 'cashtag', 'bot_command', 'custom_emoji']);

function entityEnd(e: TelegramEntity): number { return e.offset + e.length; }

function isFullyContained(inner: TelegramEntity, outer: TelegramEntity): boolean {
  return outer.offset <= inner.offset && entityEnd(inner) <= entityEnd(outer);
}

function doPartiallyOverlap(a: TelegramEntity, b: TelegramEntity): boolean {
  const aStart = a.offset, aEnd = entityEnd(a);
  const bStart = b.offset, bEnd = entityEnd(b);
  return aStart < bEnd && bStart < aEnd && !(isFullyContained(a, b) || isFullyContained(b, a));
}

export function validateEntityOverlap(entities: TelegramEntity[]): TelegramEntity[] {
  const valid: TelegramEntity[] = [];
  for (const e of entities) {
    const hasOverlap = valid.some(v => doPartiallyOverlap(e, v));
    if (hasOverlap) {
      logger.warn(`[EntityOverlap] dropping entity type=${e.type} offset=${e.offset} length=${e.length} due to partial overlap`);
      continue;
    }
    valid.push(e);
  }
  return valid;
}

function doEntitiesOverlap(a: TelegramEntity, b: TelegramEntity): boolean {
  return a.offset < entityEnd(b) && b.offset < entityEnd(a);
}

export function validateEntityNesting(entities: TelegramEntity[]): TelegramEntity[] {
  const valid: TelegramEntity[] = [];
  for (const e of entities) {
    const sameTypeOverlap = valid.some(v =>
      v.type === e.type && doEntitiesOverlap(e, v)
    );
    if (sameTypeOverlap) {
      logger.warn(`[EntityNesting] dropping entity type=${e.type} offset=${e.offset} length=${e.length} due to same-type overlap`);
      continue;
    }
    valid.push(e);
  }
  return valid;
}

export function validateStyleEntities(entities: TelegramEntity[]): TelegramEntity[] {
  if (entities.length <= 1) return entities;
  const afterOverlap = validateEntityOverlap(entities);
  const afterNesting = validateEntityNesting(afterOverlap);
  return afterNesting;
}

export function createEntity(type: string, offset: number, length: number, extra?: Record<string, any>): TelegramEntity {
  if (!Number.isInteger(offset) || offset < 0) throw new Error(`createEntity: invalid offset ${offset}`);
  if (!Number.isInteger(length) || length <= 0) throw new Error(`createEntity: invalid length ${length}`);
  return { type, offset, length, ...extra };
}

export function validateEntities(text: string | null | undefined, entities: TelegramEntity[], messageId?: number | string): TelegramEntity[] {
  const source = text ?? '';
  const len = telegramLength(source);
  for (const entity of entities) {
    if (!Number.isInteger(entity.offset) || !Number.isInteger(entity.length) || entity.offset < 0 || entity.length <= 0 || entity.offset + entity.length > len) {
      throw new Error(`[PostMessage] invalid entity messageId=${messageId ?? 'unknown'} offset=${entity.offset} length=${entity.length} textLength=${len}`);
    }
  }
  const normalized = normalizeEntities(source, entities as any) as TelegramEntity[];
  return validateStyleEntities(normalized);
}

export function validateMessages(messages: any[], postId: number): any[] {
  const valid: any[] = [];
  for (const msg of messages) {
    const text = msg.text ?? '';
    const rawEntities = Array.isArray(msg.entities) ? msg.entities : [];
    const validEntities = rawEntities.filter((e: any) => {
      const ok = (
        Number.isInteger(e.offset) &&
        Number.isInteger(e.length) &&
        e.offset >= 0 &&
        e.length > 0 &&
        e.offset + e.length <= text.length
      );
      if (!ok) {
        logger.warn(`[ValidateMessages] postId=${postId} order=${msg.order} dropping entity type=${e.type} offset=${e.offset} length=${e.length} textLen=${text.length}`);
      }
      return ok;
    });
    if (validEntities.length !== rawEntities.length) {
      logger.warn(`[ValidateMessages] postId=${postId} order=${msg.order} dropped ${rawEntities.length - validEntities.length}/${rawEntities.length} invalid entities`);
    }
    const styleValidated = validateStyleEntities(validEntities);
    if (styleValidated.length !== validEntities.length) {
      logger.warn(`[ValidateMessages] postId=${postId} order=${msg.order} removed ${validEntities.length - styleValidated.length} entities via style validation`);
    }
    valid.push({ ...msg, entities: styleValidated });
  }
  return valid;
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
  const entities = validateEntities(row.text ?? '', arrayJson(row.entities), row.id);
  const captionEntities = validateEntities(row.caption ?? '', arrayJson(row.captionEntities ?? row.caption_entities), `${row.id}:caption`);
  const normalized: NormalizedMessage = {
    id: row.id,
    postId: row.postId ?? row.post_id,
    order: row.order,
    messageType: row.messageType ?? row.message_type ?? PostMessageType.text,
    text: row.text ?? undefined,
    entities,
    parseMode: PostMessageParseMode.None,
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
  const rows = await getPostMessageRows(postId);
  return rows.map(row => normalizeSingleMessage(row));
}

export async function loadPostMessages(postId: number): Promise<any[]> {
  const rows = await getPostMessageRows(postId);
  return rows;
}

async function getPostMessageRows(postId: number): Promise<any[]> {
  return prisma.postMessage.findMany({ where: { postId }, orderBy: { order: 'asc' } });
}

export function buildTelegramPayload(msg: NormalizedMessage): TelegramPayload {
  const buttons = Array.isArray(msg.replyMarkup) ? msg.replyMarkup : msg.replyMarkup?.inline_keyboard;
  const reply_markup = buttons?.length ? { inline_keyboard: buildTelegramKeyboard(cloneJson(buttons), msg.postId) } : undefined;

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
      reply_markup,
      link_preview_options: { is_disabled: true },
    };
  }
  return {
    method: 'sendMessage',
    text: msg.text || '(پست خالی)',
    entities: msg.entities.length ? cloneJson(msg.entities) : undefined,
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

const TEMPLATE_VAR_PATTERN = /\{(first_name|last_name|username|user_id|join_date|bot_name)\}/g;

function applyTemplateVars(text: string, vars: Record<string, string>): string {
  return text.replace(TEMPLATE_VAR_PATTERN, (_m: string, key: string) => vars[key] || '');
}

function buildShiftMap(oldText: string, newText: string): Map<number, number> {
  const map = new Map<number, number>();
  if (oldText === newText) return map;
  const pattern = /\{(\w+)\}/g;
  let match: RegExpExecArray | null;
  let totalDiff = 0;
  while ((match = pattern.exec(oldText)) !== null) {
    const placeholder = match[0];
    const replacement = newText.slice(match.index + totalDiff, match.index + totalDiff + placeholder.length + totalDiff);
    const actual = newText.slice(match.index + totalDiff);
    let end = 0;
    for (let i = 0; i < actual.length; i++) {
      if (oldText[match.index + i] === undefined || oldText[match.index + i] !== actual[i]) {
        end = i;
        break;
      }
    }
    const actualReplacement = actual.slice(0, end > 0 ? end : actual.length);
    const diff = actualReplacement.length - placeholder.length;
    totalDiff += diff;
    map.set(match.index, diff);
  }
  return map;
}

function getShiftAtOffset(shiftMap: Map<number, number>, offset: number): number {
  let total = 0;
  for (const [pos, shift] of shiftMap) {
    if (pos < offset) total += shift;
  }
  return total;
}

function applyVarsToRow(row: any, vars: Record<string, string>): any {
  if (!vars || Object.keys(vars).length === 0) return row;
  const oldText = row.text ?? '';
  const newText = applyTemplateVars(oldText, vars);
  if (newText === oldText) return row;
  const shiftMap = buildShiftMap(oldText, newText);
  const entities = Array.isArray(row.entities) ? row.entities : [];
  const adjustedEntities = entities.map((e: any) => {
    const shift = getShiftAtOffset(shiftMap, e.offset);
    return { ...e, offset: Math.max(0, e.offset + shift) };
  }).filter((e: any) => e.offset + e.length <= newText.length);
  const oldCaption = row.caption ?? '';
  const newCaption = applyTemplateVars(oldCaption, vars);
  const capShiftMap = buildShiftMap(oldCaption, newCaption);
  const captionEntities = Array.isArray(row.captionEntities) ? row.captionEntities : [];
  const adjustedCaptionEntities = newCaption !== oldCaption
    ? captionEntities.map((e: any) => {
        const shift = getShiftAtOffset(capShiftMap, e.offset);
        return { ...e, offset: Math.max(0, e.offset + shift) };
      }).filter((e: any) => e.offset + e.length <= newCaption.length)
    : captionEntities;
  return {
    ...row,
    text: newText,
    entities: adjustedEntities,
    caption: newCaption,
    captionEntities: adjustedCaptionEntities,
  };
}

export async function sendPostToChat(ctx: any, postId: number, templateVars?: Record<string, string>): Promise<void> {
  const rows = await loadPostMessages(postId);
  if (rows.length === 0) {
    logger.error(`[SendPost] post=${postId} has no post_messages — cannot send.`);
    await ctx.reply('❌ این پست مشکل ساختاری دارد. لطفاً به ادمین اطلاع دهید.');
    return;
  }
  const withVars = templateVars ? rows.map(r => applyVarsToRow(r, templateVars)) : rows;
  const validated = validateMessages(withVars, postId);
  logger.info(`[SendPost] postId=${postId} messageCount=${validated.length}`);
  for (const row of validated) {
    const msg = normalizeSingleMessage(row);
    if (msg.delayMs > 0) await sleep(msg.delayMs);
    const payload = sanitizeEntities(buildTelegramPayload(msg), msg.id);
    const { method, ...params } = payload as any;
    logger.info(`[SendSingleMessage] postId=${msg.postId} order=${msg.order} type=${msg.messageType} entities=${msg.entities.length}`);
    if (method === 'sendMessage') {
      await ctx.reply(params.text, params);
    } else if (method === 'sendMediaGroup') {
      await ctx.replyWithMediaGroup(params.media);
    } else {
      const media = params.media;
      delete params.media;
      const methodMap: Record<string, string> = {
        sendPhoto: 'replyWithPhoto', sendVideo: 'replyWithVideo',
        sendDocument: 'replyWithDocument', sendAudio: 'replyWithAudio',
        sendAnimation: 'replyWithAnimation', sendVoice: 'replyWithVoice',
      };
      await ctx[methodMap[method] || 'replyWithDocument'](media, params);
    }
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
  const entities = validateEntities(data.text ?? '', arrayJson(data.entities), 'new');
  const captionEntities = validateEntities(data.caption ?? '', arrayJson(data.captionEntities), 'new:caption');
  return { postId, order: data.order, messageType: data.messageType ?? PostMessageType.text, text: data.text ?? null, entities, parseMode: PostMessageParseMode.None, mediaFileId: data.mediaFileId ?? null, mediaGroupId: data.mediaGroupId ?? null, caption: data.caption ?? null, captionEntities, replyMarkup: data.replyMarkup ?? null, delayMs: data.delayMs ?? 0 } as any;
}

function normalizeUpdateData(data: any): Prisma.PostMessageUncheckedUpdateInput {
  const out: any = { ...data };
  if (out.entities) out.entities = arrayJson(out.entities);
  if (out.captionEntities) out.captionEntities = arrayJson(out.captionEntities);
  return out;
}
