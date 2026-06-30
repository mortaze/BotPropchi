import { Markup } from 'telegraf';
import { logger } from '../utils/logger';
import {
  TelegramNativeRenderer,
  telegramRequestValidator,
  telegramSnapshotComparator,
  deliveryDebugService,
  extractTelegramSnapshot,
} from './renderer';

export function validateTelegramHtml(html?: string | null): string[] {
  return telegramRequestValidator.validateHtml(html);
}

export function validateTelegramEntities(text: string | null | undefined, entities: any[] | null | undefined): string[] {
  return telegramRequestValidator.validateEntities(text, entities);
}

export { TelegramNativeRenderer, extractTelegramSnapshot };

export function buildPostDebugSnapshot(post: any) {
  const debug = deliveryDebugService.getFullPipelineDebug(post);
  return {
    dbContent: debug.dbContent,
    entities: debug.entities,
    captionEntities: debug.captionEntities,
    parseMode: debug.parseMode,
    telegramPayload: debug.telegramPayload,
    telegramMessageSnapshot: debug.telegramMessageSnapshot,
    finalTelegramApiRequest: debug.finalTelegramApiRequest,
    detectedRenderer: debug.detectedRenderer,
    entityValidationResult: debug.validationResult,
  };
}

export function comparePostNativeRoundtrip(post: any) {
  return telegramSnapshotComparator.compare(post);
}

// ─── Data Model ────────────────────────────────────────────────────

export type MessageStyle = {
  bold: boolean;
  italic: boolean;
  code: boolean;
  blockquote: boolean;
};

export interface PostMessage {
  id: string;
  index: number;
  text: string;
  content: string;
  entities: any[];
  parseMode?: 'HTML' | 'Markdown' | null;
  style: MessageStyle;
  buttons: any[][];
  media: any[] | undefined;
  snapshot: any | undefined;
}

export interface MultiMessagePost {
  id: string | number;
  title: string;
  messages: PostMessage[];
}

const DEFAULT_STYLE: MessageStyle = {
  bold: false,
  italic: false,
  code: false,
  blockquote: false,
};

function deepClone<T>(value: T): T {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v));
}

export function normalizeMessage(msg: any, index = 0): PostMessage {
  const cloned = deepClone(msg || {});
  const text = cloned.text ?? cloned.content ?? '';
  return {
    id: String(cloned.id ?? `message-${index}`),
    index: Number.isFinite(Number(cloned.index)) ? Number(cloned.index) : index,
    text,
    content: text,
    entities: Array.isArray(cloned.entities) ? deepClone(cloned.entities) : [],
    parseMode: cloned.parseMode ?? null,
    style: { ...DEFAULT_STYLE, ...(cloned.style ? deepClone(cloned.style) : {}) },
    buttons: Array.isArray(cloned.buttons) ? deepClone(cloned.buttons) : [],
    media: Array.isArray(cloned.media) ? deepClone(cloned.media) : undefined,
    snapshot: cloned.snapshot ? deepClone(cloned.snapshot) : undefined,
  };
}

export function normalizePostMessages(messages: any[] | null | undefined): PostMessage[] {
  if (!Array.isArray(messages)) return [];
  return messages.map((message, index) => normalizeMessage(message, index));
}

export interface MessageRenderContext {
  message: PostMessage;
  postId: number;
}

// ─── Core: splitPostToMessages (message-first only) ────────────────

export function splitPostToMessages(post: any): PostMessage[] {
  if (!post) return [];
  return normalizePostMessages(post.messages || post.telegramPayload?.messages);
}

// ─── Core: buildMessageContext ─────────────────────────────────────

export function buildMessageContext(post: any, messageIndex: number): MessageRenderContext {
  const messages = splitPostToMessages(post);
  const message = messages[messageIndex];
  if (!message) {
    throw new Error(`[MessageCtx] post=${post.id} message index ${messageIndex} not found (total ${messages.length})`);
  }
  return { message, postId: post.id };
}
