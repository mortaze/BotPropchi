import { logger } from '../utils/logger';

export interface MessageEntry {
  id: string;
  content: string;
  entities?: any[];
}

function cloneJson<T>(value: T): T {
  return value == null
    ? value
    : JSON.parse(
        JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? v.toString() : v)),
      );
}

function isNewMessageFormat(content: string): boolean {
  const trimmed = (content || '').trim();
  if (!trimmed) return false;
  // JSON array format starts with [
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0]?.id;
    } catch { return false; }
  }
  return false;
}

function parseOldFormatMessages(content: string): MessageEntry[] {
  const segments: string[] = [];
  const regex = /\[\[copy\]\](.*?)\[\[\/copy\]\]/gs;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const before = content.slice(lastIndex, match.index).trim();
      if (before) segments.push(before);
    }
    segments.push(match[1].trim());
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    const remaining = content.slice(lastIndex).trim();
    if (remaining) segments.push(remaining);
  }
  if (segments.length === 0 && content.trim()) segments.push(content.trim());
  return segments.map(s => ({ id: crypto.randomUUID(), content: s }));
}

/**
 * Parse post content into MessageEntry[].
 * Handles both new JSON array format and legacy [[copy]] format.
 * For legacy format, generates stable UUIDs for each segment.
 */
export function parseMessageEntries(content: string | null | undefined): MessageEntry[] {
  const raw = (content || '').trim();
  if (!raw) return [];
  if (isNewMessageFormat(raw)) {
    try {
      return JSON.parse(raw);
    } catch { return parseOldFormatMessages(raw); }
  }
  return parseOldFormatMessages(raw);
}

/**
 * Serialize MessageEntry[] back to JSON array string.
 */
export function serializeMessageEntries(entries: MessageEntry[]): string {
  if (!entries || entries.length === 0) return '';
  return JSON.stringify(entries);
}

/**
 * Extract just the text content strings from MessageEntry[].
 */
export function extractMessageTexts(content: string | null | undefined): string[] {
  return parseMessageEntries(content).map(e => e.content);
}

/**
 * Check if buttons use the new UUID-keyed format (vs legacy index-keyed or shared array format).
 */
function isNewButtonsFormat(raw: any): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  // New format: keys are UUIDs (36 chars with hyphens) or '_shared'
  const keys = Object.keys(raw);
  if (keys.length === 0) return false;
  // If ANY key looks like a UUID, it's the new format
  return keys.some(k => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k));
}

/**
 * Migrate buttons from old format (index-based messages) to new format (UUID-based).
 * Returns the migrated buttons object. If already new format, returns as-is.
 */
export function migrateButtonsFormat(buttons: any, messageEntries: MessageEntry[]): any {
  if (!buttons) return {};
  // Already new format
  if (!Array.isArray(buttons) && typeof buttons === 'object' && buttons.messages) {
    // Old messages format — convert to UUID keys
    const result: any = {};
    const msgKeys = Object.keys(buttons.messages);
    for (let i = 0; i < msgKeys.length; i++) {
      const key = msgKeys[i];
      const uuid = messageEntries[i]?.id;
      if (uuid) {
        result[uuid] = buttons.messages[key];
      } else {
        result['_shared'] = buttons.messages[key];
      }
    }
    if (buttons.messages['_shared']) result['_shared'] = buttons.messages['_shared'];
    logger.debug(`[MessageBinding] Migrated old buttons format (${msgKeys.length} message keys) to UUID-keyed format`);
    return result;
  }
  // Plain array format — shared buttons
  if (Array.isArray(buttons) && buttons.length > 0) {
    return { _shared: buttons };
  }
  return buttons || {};
}

/**
 * Get buttons for a specific message by UUID.
 * Supports all formats: new (UUID-keyed), old (index-keyed), shared array.
 */
export function getMessageButtonsFromPostNew(post: any, messageId?: string): any[][] {
  const raw = post?.buttons;
  if (!raw) return [];
  // Plain array — shared buttons
  if (Array.isArray(raw)) return raw;
  // Object format
  if (typeof raw === 'object') {
    // New UUID-keyed format
    if (messageId && raw[messageId]) return raw[messageId];
    // Old index-keyed messages format
    if (raw.messages) {
      if (messageId && raw.messages[messageId]) return raw.messages[messageId];
      // Try numeric index fallback
      if (messageId && raw.messages[String(parseInt(messageId))]) return raw.messages[String(parseInt(messageId))];
      return raw.messages['_shared'] || [];
    }
    // Direct object — try messageId lookup, then _shared
    return raw[messageId || '_shared'] || raw['_shared'] || [];
  }
  return [];
}

function extractEntities(post: any): any[] | undefined {
  const sources = [
    post.contentEntities,
    post.entities,
    post.richEntities,
    post.postEntities,
    post.telegramPayload?.entities,
    post.telegramMessageSnapshot?.entities,
  ];
  for (const source of sources) {
    if (Array.isArray(source) && source.length > 0) return cloneJson(source);
  }
  return undefined;
}

/**
 * Find a button by its stable buttonId across the entire buttons structure.
 * Supports all formats: new UUID-keyed object, old messages format, shared array.
 */
export function findButtonById(buttons: any, buttonId: string): any | null {
  if (!buttons || !buttonId) return null;
  if (Array.isArray(buttons)) {
    for (const row of buttons) {
      if (!Array.isArray(row)) continue;
      for (const btn of row) {
        if (btn && (btn.buttonId === buttonId || btn.id === buttonId)) return btn;
      }
    }
  } else if (typeof buttons === 'object' && !Array.isArray(buttons)) {
    // Check all values in the object (UUID keys, _shared, or messages sub-object)
    const searchables: any[][] = [];
    if (buttons.messages) {
      for (const msgKey of Object.keys(buttons.messages)) {
        if (Array.isArray(buttons.messages[msgKey])) searchables.push(buttons.messages[msgKey]);
      }
    } else {
      for (const key of Object.keys(buttons)) {
        if (Array.isArray(buttons[key])) searchables.push(buttons[key]);
      }
    }
    for (const msgButtons of searchables) {
      for (const row of msgButtons) {
        if (!Array.isArray(row)) continue;
        for (const btn of row) {
          if (btn && (btn.buttonId === buttonId || btn.id === buttonId)) return btn;
        }
      }
    }
  }
  return null;
}

function extractButtons(post: any): any {
  if (Array.isArray(post.buttons) && post.buttons.length > 0) return cloneJson(post.buttons);
  if (post.buttons && typeof post.buttons === 'object' && !Array.isArray(post.buttons) && post.buttons.messages) {
    return cloneJson(post.buttons);
  }
  if (post.buttons && typeof post.buttons === 'object' && !Array.isArray(post.buttons)) {
    return cloneJson(post.buttons);
  }
  if (post.keyboards && Array.isArray(post.keyboards) && post.keyboards.length > 0) {
    const rows: any[][] = [];
    for (const kb of post.keyboards) {
      if (!rows[kb.row]) rows[kb.row] = [];
      rows[kb.row][kb.col] = { text: kb.text, type: kb.type || 'URL', value: kb.value || '' };
    }
    return rows;
  }
  if (post.telegramPayload?.keyboard && Array.isArray(post.telegramPayload.keyboard)) {
    return cloneJson(post.telegramPayload.keyboard);
  }
  if (post.telegramMessageSnapshot?.reply_markup?.inline_keyboard) {
    return cloneJson(post.telegramMessageSnapshot.reply_markup.inline_keyboard);
  }
  return [];
}

function extractMedia(post: any): any[] {
  if (post.telegramPayload?.media && Array.isArray(post.telegramPayload.media)) {
    return cloneJson(post.telegramPayload.media);
  }
  if (post.richMedia && Array.isArray(post.richMedia) && post.richMedia.length > 0) {
    return post.richMedia.map((m: any) => ({
      type: m.type,
      fileId: m.fileId,
      caption: m.caption,
      captionEntities: m.captionEntities,
      width: m.width,
      height: m.height,
      duration: m.duration,
      fileName: m.fileName,
      mimeType: m.mimeType,
      fileSize: m.fileSize,
      mediaGroupId: m.mediaGroupId,
    }));
  }
  if (post.mediaFileId && post.mediaType) {
    const items: any[] = [];
    if (post.albumMediaIds && Array.isArray(post.albumMediaIds)) {
      for (const fileId of post.albumMediaIds) {
        items.push({ type: post.mediaType, fileId });
      }
    } else {
      items.push({ type: post.mediaType, fileId: post.mediaFileId, caption: post.caption });
    }
    return items;
  }
  return [];
}

export function normalizePost(post: any): any {
  if (!post) return post;

  const normalized = cloneJson(post);

  // ─── Normalize content ──────────────────────────
  if (normalized.contentText && !normalized.content) {
    normalized.content = normalized.contentText;
  } else if (!normalized.content && !normalized.contentText) {
    normalized.content = normalized.caption || '';
  }
  normalized.contentText = undefined;

  // ─── Normalize entities ─────────────────────────
  const entities = extractEntities(normalized);
  if (entities) {
    normalized.entities = entities;
  }
  normalized.contentEntities = undefined;
  normalized.richEntities = undefined;
  normalized.postEntities = undefined;

  // ─── Normalize buttons ──────────────────────────
  normalized.buttons = extractButtons(normalized);
  normalized.keyboards = undefined;

  // ─── Normalize media ────────────────────────────
  normalized.media = extractMedia(normalized);

  // ─── Always set render mode for unified pipeline ──
  normalized.renderMode = 'telegram_entities';
  normalized.contentFormat = 'telegram_entities';

  // ─── Clean telegram raw snapshot/payload ────────
  // Keep telegramMessageSnapshot as the canonical source for roundtrip.
  // telegramPayload is redundant after normalization.
  if (normalized.telegramPayload) {
    normalized.telegramPayload = undefined;
  }

  logger.debug(`[PostNormalizer] normalized post=${normalized.id} title="${normalized.title}" content=${(normalized.content || '').length}ch entities=${(normalized.entities || []).length} media=${normalized.media.length} buttons=${normalized.buttons.length}`);

  return normalized;
}
