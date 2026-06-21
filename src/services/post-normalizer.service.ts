import { logger } from '../utils/logger';

function cloneJson<T>(value: T): T {
  return value == null
    ? value
    : JSON.parse(
        JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? v.toString() : v)),
      );
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
 * Supports both old array format (shared) and new object format (per-message).
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
  } else if (typeof buttons === 'object' && !Array.isArray(buttons) && buttons.messages) {
    for (const msgKey of Object.keys(buttons.messages)) {
      const msgButtons: any[][] = buttons.messages[msgKey];
      if (!Array.isArray(msgButtons)) continue;
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
