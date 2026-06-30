import { PostMessageParseMode, PostMessageType, Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { logger } from '../utils/logger';
import { normalizeEntities, normalizeTelegramEntities, telegramLength, isAtomicEntity, normalizeFinalEntities } from '../shared/message-format/normalizer';
import { buildTelegramKeyboard, MEDIA_SENDERS, TelegramPayload } from './renderer';
import { postService } from './post.service';

export type TelegramEntity = { type: string; offset: number; length: number; [key: string]: any };

function cloneJson<T>(value: T): T {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v));
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
  forwardSource?: any;
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
      // NEVER drop url/text_link entities — they are structural (clickable links)
      // Instead, drop the style entity that overlaps with the url entity
      if (e.type === 'url' || e.type === 'text_link') {
        // Find the overlapping style entity and remove it, keeping the url entity
        const overlappingIdx = valid.findIndex(v => doPartiallyOverlap(e, v));
        if (overlappingIdx >= 0 && !ATOMIC_ENTITY_TYPES.has(valid[overlappingIdx].type)) {
          logger.warn(`[EntityOverlap] removing style entity type=${valid[overlappingIdx].type} offset=${valid[overlappingIdx].offset} length=${valid[overlappingIdx].length} to preserve url entity at offset=${e.offset}`);
          valid.splice(overlappingIdx, 1);
        } else {
          // Both are atomic or the overlapping one is also atomic — keep the url
          logger.warn(`[EntityOverlap] keeping url/text_link entity type=${e.type} offset=${e.offset} length=${e.length}, dropping overlapping type=${valid.find(v => doPartiallyOverlap(e, v))?.type}`);
          // Remove any overlapping non-atomic entities
          for (let i = valid.length - 1; i >= 0; i--) {
            if (doPartiallyOverlap(e, valid[i]) && !ATOMIC_ENTITY_TYPES.has(valid[i].type)) {
              valid.splice(i, 1);
            }
          }
        }
        valid.push(e);
        continue;
      }
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

  const { entities: enriched } = normalizeTelegramEntities(source, entities as any);

  for (const entity of enriched) {
    if (!Number.isInteger(entity.offset) || !Number.isInteger(entity.length) || entity.offset < 0 || entity.length <= 0 || entity.offset + entity.length > len) {
      throw new Error(`[PostMessage] invalid entity messageId=${messageId ?? 'unknown'} offset=${entity.offset} length=${entity.length} textLength=${len}`);
    }
  }

  const normalized = normalizeEntities(source, enriched as any) as TelegramEntity[];
  const styleValidated = validateStyleEntities(normalized);
  const result: TelegramEntity[] = [];
  for (const e of styleValidated) {
    if (e.type === 'text_link' && (!e.url || typeof e.url !== 'string' || e.url.trim() === '')) {
      logger.warn(`[Sanitize] dropping text_link entity at offset=${e.offset} because url is missing`);
      continue;
    }
    result.push(e);
  }
  return result;
}

export function validateMessages(messages: any[], postId: number): any[] {
  const valid: any[] = [];
  for (const msg of messages) {
    const text = msg.text ?? '';
    const textLen = telegramLength(text);
    const rawEntities = Array.isArray(msg.entities) ? msg.entities : [];
    const validEntities = rawEntities.filter((e: any) => {
      const ok = (
        Number.isInteger(e.offset) &&
        Number.isInteger(e.length) &&
        e.offset >= 0 &&
        e.length > 0 &&
        e.offset + e.length <= textLen
      );
      if (!ok) {
        logger.warn(`[ValidateMessages] postId=${postId} order=${msg.order} dropping entity type=${e.type} offset=${e.offset} length=${e.length} textLen=${textLen}`);
        return false;
      }
      if (e.type === 'text_link' && (!e.url || typeof e.url !== 'string' || e.url.trim() === '')) {
        logger.warn(`[ValidateMessages] postId=${postId} order=${msg.order} dropping text_link entity at offset=${e.offset} length=${e.length} url=${e.url ?? 'MISSING'}`);
        return false;
      }
      return true;
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
    forwardSource: row.forwardSource ?? row.forward_source ?? null,
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
  let payload = sanitizeEntities(buildTelegramPayload(msg), msg.id);
  // ── FINAL ALIGNMENT: recalibrate entity offsets against the exact text being sent ──
  if (Array.isArray(payload.entities) && payload.entities.length > 0) {
    payload.entities = normalizeFinalEntities(payload.text ?? '', payload.entities);
  }
  if (Array.isArray(payload.caption_entities) && payload.caption_entities.length > 0) {
    payload.caption_entities = normalizeFinalEntities(payload.caption ?? '', payload.caption_entities);
  }
  // ── ENFORCE: never send parse_mode + entities together ──
  const hasEntities = (payload.entities?.length ?? 0) + (payload.caption_entities?.length ?? 0) > 0;
  if (hasEntities) delete payload.parse_mode;
  logger.info(`[PostSender] post=${msg.postId} messageId=${msg.id} order=${msg.order} method=${payload.method} entities=${payload.entities?.length ?? 0}`);
  try {
    switch (payload.method) {
      case 'sendMessage': return await telegram.sendMessage(chatId, payload.text, payload);
      case 'sendMediaGroup': return await telegram.sendMediaGroup(chatId, payload.media, payload);
      default: return await telegram[payload.method](chatId, payload.media, payload);
    }
  } catch (err: any) {
    logger.error(`[SendMessage] Telegram API error postId=${msg.postId} order=${msg.order} error=${err?.message || err}`);
    throw err;
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

export async function migrateSinglePost(postId: number): Promise<any[]> {
  const post = await postService.findById(postId);
  if (!post) {
    logger.warn(`[PostEditor][MessageCreate] post=${postId} not found — cannot migrate`);
    return [];
  }

  const content = post.content || post.contentText || '';
  const entities = Array.isArray(post.entities) ? post.entities : Array.isArray(post.contentEntities) ? post.contentEntities : [];
  const caption = post.caption ?? null;
  const captionEntities = Array.isArray(post.captionEntities) ? post.captionEntities : [];
  const buttons = post.buttons ?? null;
  const mediaFileId = post.mediaFileId ?? null;
  const mediaType = post.mediaType ?? null;

  if (!content && !caption && !mediaFileId) {
    logger.warn(`[PostEditor][MessageCreate] post=${postId} has no legacy content — creating empty message`);
    const empty = await prisma.postMessage.create({
      data: {
        postId, order: 0, messageType: 'text', text: '',
        entities: [], parseMode: PostMessageParseMode.None,
        caption: null, captionEntities: [],
        replyMarkup: null, delayMs: 0,
      },
    });
    logger.info(`[PostEditor][MessageCreate] post=${postId} messageId=${empty.id} order=0 (empty fallback)`);
    return [empty];
  }

  const messageType = mediaFileId && mediaType ? mediaType : mediaFileId ? 'document' : 'text';
  const msg = await prisma.postMessage.create({
    data: {
      postId, order: 0, messageType,
      text: content || null,
      entities: entities.length ? entities : [],
      parseMode: PostMessageParseMode.None,
      mediaFileId,
      caption,
      captionEntities,
      replyMarkup: buttons,
      delayMs: 0,
    },
  });
  logger.info(`[PostEditor][MessageCreate] post=${postId} messageId=${msg.id} order=0 type=${messageType} text=${(content || '').length}ch entities=${entities.length}`);
  return [msg];
}

export async function ensurePostMessages(postId: number): Promise<any[]> {
  const rows = await loadPostMessages(postId);
  if (rows.length > 0) return rows;
  logger.info(`[PostEditor][MessageCreate] post=${postId} has no post_messages — migrating on first access`);
  return migrateSinglePost(postId);
}

export async function sendPostToChat(ctx: any, postId: number, templateVars?: Record<string, string>, lastMessageOptions?: any): Promise<void> {
  let rows = await loadPostMessages(postId);
  if (rows.length === 0) {
    rows = await ensurePostMessages(postId);
  }

  const withVars = templateVars ? rows.map(r => applyVarsToRow(r, templateVars)) : rows;
  const validated = validateMessages(withVars, postId);
  logger.info(`[SendPost] postId=${postId} messageCount=${validated.length}`);
  const lastIndex = validated.length - 1;
  for (let i = 0; i < validated.length; i++) {
    const row = validated[i];
    const msg = normalizeSingleMessage(row);
    if (msg.delayMs > 0) await sleep(msg.delayMs);

    if (msg.messageType === 'forward' && (row as any).forwardSource) {
      const fs = (row as any).forwardSource;
      const srcChatId = Number(fs.chatId);
      const srcMsgId = Number(fs.messageId);
      try {
        await ctx.telegram.forwardMessage(ctx.chat.id, srcChatId, srcMsgId);
        logger.info(`[ForwardSuccess] postId=${postId} order=${msg.order} sourceChat=${srcChatId} sourceMsg=${srcMsgId}`);
      } catch (err: any) {
        logger.warn(`[ForwardFail] postId=${postId} order=${msg.order} sourceChat=${srcChatId} sourceMsg=${srcMsgId} error=${err?.message}`);
        try { await ctx.reply('⚠️ منبع پیام فوروارد در دسترس نیست'); } catch (_) {}
      }
      continue;
    }

    const payload = sanitizeEntities(buildTelegramPayload(msg), msg.id);
    // ── FINAL ALIGNMENT: recalibrate entity offsets against the exact text being sent ──
    if (Array.isArray((payload as any).entities) && (payload as any).entities.length > 0) {
      (payload as any).entities = normalizeFinalEntities((payload as any).text ?? '', (payload as any).entities);
    }
    if (Array.isArray((payload as any).caption_entities) && (payload as any).caption_entities.length > 0) {
      (payload as any).caption_entities = normalizeFinalEntities((payload as any).caption ?? '', (payload as any).caption_entities);
    }
    const { method, ...params } = payload as any;
    const isLast = i === lastIndex && lastMessageOptions;
    if (isLast) {
      params.reply_markup = { ...(params.reply_markup || {}), ...lastMessageOptions };
    }
    logger.debug(`[PreviewRender] postId=${msg.postId} order=${msg.order} textLength=${telegramLength(msg.text ?? '')} entityCount=${msg.entities.length} captionEntityCount=${msg.captionEntities.length}`);
    logger.info(`[SendSingleMessage] postId=${msg.postId} order=${msg.order} type=${msg.messageType} entities=${msg.entities.length} hasReplyMarkup=${!!params.reply_markup}`);
    if (params.reply_markup) {
      const kbRows = params.reply_markup.inline_keyboard?.length ?? 0;
      const kbBtns = params.reply_markup.inline_keyboard?.reduce((a: number, r: any[]) => a + r.length, 0) ?? 0;
      logger.info(`[KeyboardDebug] postId=${msg.postId} order=${msg.order} reply_markup: ${kbRows} rows, ${kbBtns} buttons`);
    }
    // ── FINAL DEBUG: log exact payload sent to Telegram ──
    const finalText = params.text || '';
    const finalEntities = params.entities || [];
    const finalCaptionEntities = params.caption_entities || [];
    logger.info(`[FINAL_TELEGRAM] postId=${msg.postId} order=${msg.order} text="${finalText.substring(0, 80)}${finalText.length > 80 ? '...' : ''}" entities=${JSON.stringify(finalEntities)}`);
    if (finalCaptionEntities.length > 0) {
      logger.info(`[FINAL_TELEGRAM_CAPTION] postId=${msg.postId} order=${msg.order} caption_entities=${JSON.stringify(finalCaptionEntities)}`);
    }
    // Validate entity bounds before send
    for (const ent of finalEntities) {
      if (!Number.isInteger(ent.offset) || !Number.isInteger(ent.length) || ent.offset < 0 || ent.length <= 0 || ent.offset + ent.length > telegramLength(finalText)) {
        logger.error(`[FINAL_TELEGRAM_INVALID] postId=${msg.postId} order=${msg.order} INVALID entity type=${ent.type} offset=${ent.offset} length=${ent.length} textLen=${telegramLength(finalText)}`);
      }
    }
    // ── ENFORCE: never send parse_mode + entities together ──
    if (finalEntities.length > 0 || finalCaptionEntities.length > 0) {
      delete params.parse_mode;
    }
    // Drop any text_link entities missing url — Telegram rejects them
    if (Array.isArray(params.entities)) {
      const beforeCount = params.entities.length;
      params.entities = params.entities.filter((e: any) => {
        if (e.type === 'text_link' && (!e.url || typeof e.url !== 'string' || e.url.trim() === '')) {
          logger.warn(`[SendPost] postId=${msg.postId} order=${msg.order} dropping text_link entity at offset=${e.offset} url=${e.url ?? 'MISSING'}`);
          return false;
        }
        return true;
      });
      if (params.entities.length !== beforeCount) {
        logger.warn(`[SendPost] postId=${msg.postId} order=${msg.order} dropped ${beforeCount - params.entities.length} entities with missing url`);
      }
    }
    if (Array.isArray(params.caption_entities)) {
      params.caption_entities = params.caption_entities.filter((e: any) => {
        if (e.type === 'text_link' && (!e.url || typeof e.url !== 'string' || e.url.trim() === '')) {
          logger.warn(`[SendPost] postId=${msg.postId} order=${msg.order} dropping caption text_link entity at offset=${e.offset} url=${e.url ?? 'MISSING'}`);
          return false;
        }
        return true;
      });
    }
    try {
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
    } catch (sendErr: any) {
      logger.error(`[SendMessage] Telegram API error postId=${msg.postId} order=${msg.order} error=${sendErr?.message || sendErr}`);
      throw sendErr;
    }
  }
}

export const postMessageService = {
  list(postId: number) { return prisma.postMessage.findMany({ where: { postId }, orderBy: { order: 'asc' } }); },
  get(id: number) { return prisma.postMessage.findUnique({ where: { id } }); },
  async create(postId: number, data: any) {
    return prisma.$transaction(async (tx) => {
      const last = await tx.postMessage.aggregate({ where: { postId }, _max: { order: true } });
      const order = (last._max.order ?? -1) + 1;
      const msg = await tx.postMessage.create({
        data: {
          postId, order,
          messageType: data.messageType ?? PostMessageType.text,
          text: data.text ?? null,
          entities: Array.isArray(data.entities) ? arrayJson(data.entities) : [],
          parseMode: PostMessageParseMode.None,
          mediaFileId: data.mediaFileId ?? null,
          mediaGroupId: data.mediaGroupId ?? null,
          caption: data.caption ?? null,
          captionEntities: Array.isArray(data.captionEntities) ? arrayJson(data.captionEntities) : [],
          replyMarkup: data.replyMarkup ?? null,
          delayMs: data.delayMs ?? 0,
          forwardSource: data.forwardSource ?? null,
        } as any,
      });
      logger.info(`[PostEditor][MessageCreate] post=${postId} messageId=${msg.id} order=${order}`);
      return msg;
    });
  },
  update(id: number, data: any) {
    return prisma.postMessage.update({
      where: { id },
      data: {
        ...data,
        entities: Array.isArray(data.entities) ? arrayJson(data.entities) : undefined,
        captionEntities: Array.isArray(data.captionEntities) ? arrayJson(data.captionEntities) : undefined,
      } as any,
    });
  },
    async delete(id: number) {
    logger.info(`[PostEditor][MessageDelete] messageId=${id}`);
    // ON DELETE CASCADE on post_keyboards.messageId handles keyboard cleanup
    await prisma.postMessage.delete({ where: { id } });
    logger.info(`[PostEditor][MessageDelete] messageId=${id} deleted (cascade handled by FK)`);
  },
  async reorder(postId: number, orderedIds: number[]) {
    const tx = orderedIds.map((id, order) => prisma.postMessage.update({ where: { id, postId } as any, data: { order } }));
    logger.info(`[PostEditor][MessageMove] post=${postId} reorder ${orderedIds.length} messages`);
    return prisma.$transaction(tx);
  },
  async swapOrder(idA: number, orderA: number, idB: number, orderB: number, postId: number) {
    const SENTINEL = -999999;
    logger.debug({ action: 'POST_MESSAGE_REORDER', postId, sourceOrder: orderA, targetOrder: orderB, messageId: idA });
    try {
      await prisma.$transaction([
        prisma.postMessage.update({ where: { id: idA }, data: { order: SENTINEL } }),
        prisma.postMessage.update({ where: { id: idB }, data: { order: orderA } }),
        prisma.postMessage.update({ where: { id: idA }, data: { order: orderB } }),
      ]);
    } catch (error: any) {
      logger.error({ action: 'POST_MESSAGE_REORDER_FAILED', error, stack: error?.stack });
      throw error;
    }
  },
};

export function normalizeWriteData(postId: number, data: any): Prisma.PostMessageUncheckedCreateInput {
  return {
    postId, order: data.order,
    messageType: data.messageType ?? PostMessageType.text,
    text: data.text ?? null,
    entities: Array.isArray(data.entities) ? arrayJson(data.entities) : [],
    parseMode: PostMessageParseMode.None,
    mediaFileId: data.mediaFileId ?? null,
    mediaGroupId: data.mediaGroupId ?? null,
    caption: data.caption ?? null,
    captionEntities: Array.isArray(data.captionEntities) ? arrayJson(data.captionEntities) : [],
    replyMarkup: data.replyMarkup ?? null,
    delayMs: data.delayMs ?? 0,
  } as any;
}

export async function sendStoredMessage(telegram: any, chatId: number | string, post: any): Promise<void> {
  const hasMedia = !!post.mediaType && !!post.mediaFileId;

  const replyTo: any = {};
  if (post.replyMessageText || post.replyMediaFileId) {
    replyTo.reply_parameters = {};
    if (post.replyMessageText) replyTo.reply_parameters.message_text = post.replyMessageText;
    if (post.replyMediaFileId) replyTo.reply_parameters.file_id = post.replyMediaFileId;
  }

  // Try forwardMessage for forwarded posts from channels/public chats
  if (post.isForwarded && post.forwardMeta) {
    const fm = typeof post.forwardMeta === 'string' ? JSON.parse(post.forwardMeta) : post.forwardMeta;
    if (fm.originChatId && fm.originMessageId) {
      try {
        await telegram.forwardMessage(chatId, Number(fm.originChatId), Number(fm.originMessageId));
        return;
      } catch (err: any) {
        logger.warn(`[ForwardFail] forwardMessage failed chatId=${chatId} origin=${fm.originChatId}:${fm.originMessageId} error=${err?.message}`);
        try { await telegram.sendMessage(chatId, '⚠️ منبع پیام فوروارد در دسترس نیست'); } catch (_) {}
        return;
      }
    }
  }

  const albumIds: string[] | undefined = Array.isArray(post.albumMediaIds) ? post.albumMediaIds : undefined;

  if (albumIds && albumIds.length > 1) {
    const caption = post.mediaCaption || post.caption || post.content || undefined;
    const items = albumIds.map((fid: string, i: number) => {
      const base: any = { type: post.mediaType || 'photo', media: fid };
      if (i === 0 && caption) { base.caption = caption; }
      return base;
    });
    await telegram.sendMediaGroup(chatId, items, replyTo);
    return;
  }

  if (hasMedia) {
    const method = MEDIA_SENDERS[post.mediaType]?.apiMethod;
    if (method && typeof telegram[method] === 'function') {
      const opts: any = { ...replyTo };
      const caption = post.mediaCaption || post.caption || undefined;
      if (caption && post.mediaType !== 'sticker' && post.mediaType !== 'video_note') {
        opts.caption = caption;
      }
      await telegram[method](chatId, post.mediaFileId, opts);
      return;
    }
  }

  const text = post.content || post.caption || '(پست خالی)';
  await telegram.sendMessage(chatId, text, replyTo);
}
