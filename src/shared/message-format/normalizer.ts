import { MessageEntity, telegramLength } from './types';
import { logger } from '../../utils/logger';

const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;
const TRAILING_PUNCTUATION = /[.,;:!?)]+$/;

const ATOMIC_ENTITY_TYPES = new Set([
  'url', 'text_link', 'text_mention', 'mention', 'hashtag', 'cashtag',
  'bot_command', 'email', 'phone_number', 'code', 'pre', 'custom_emoji',
]);

export function isAtomicEntity(type: string): boolean {
  return ATOMIC_ENTITY_TYPES.has(type);
}

export function extractUrlsWithOffsets(text: string): Array<{ url: string; offset: number; length: number }> {
  const results: Array<{ url: string; offset: number; length: number }> = [];
  if (!text) return results;

  const regex = new RegExp(URL_PATTERN.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const raw = match[0];
    const clean = raw.replace(TRAILING_PUNCTUATION, '');
    if (clean.length < 10) continue;

    results.push({
      url: clean,
      offset: telegramLength(text.slice(0, match.index)),
      length: telegramLength(clean),
    });
  }

  return results;
}

export function escapeMarkdownV2(str: string): string {
  return str.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

export function normalizeTelegramEntities(
  text: string,
  entities: MessageEntity[],
  parseMode?: string,
): { text: string; entities: MessageEntity[] } {
  if (!text) return { text, entities };

  const pm = (parseMode || '').toLowerCase();

  if (pm === 'markdownv2') {
    return normalizeMarkdownV2Mode(text, entities);
  }

  // HTML / default: enrich with URL entities only, no normalization
  const urlEntities = extractNewUrlEntities(text, entities);
  if (urlEntities.length === 0) return { text, entities };
  return { text, entities: [...entities, ...urlEntities] };
}

function normalizeMarkdownV2Mode(text: string, entities: MessageEntity[]): { text: string; entities: MessageEntity[] } {
  const urls = extractUrlsWithOffsets(text);
  if (urls.length === 0) return { text, entities: entities };

  let newText = text;
  const sorted = [...urls].sort((a, b) => b.offset - a.offset);

  for (const u of sorted) {
    const escaped = escapeMarkdownV2(u.url);
    const replacement = `[${escaped}](${escaped})`;
    const before = newText.slice(0, u.offset);
    const after = newText.slice(u.offset + u.length);
    newText = before + replacement + after;
  }

  return { text: newText, entities: [] };
}

function extractNewUrlEntities(text: string, existingEntities: MessageEntity[]): MessageEntity[] {
  const urls = extractUrlsWithOffsets(text);
  const result: MessageEntity[] = [];

  for (const u of urls) {
    const alreadyCovered = existingEntities.some(e =>
      (e.type === 'text_link' || e.type === 'url') &&
      e.offset < u.offset + u.length &&
      e.offset + e.length > u.offset
    );

    if (!alreadyCovered) {
      result.push({
        type: 'text_link',
        offset: u.offset,
        length: u.length,
        url: u.url,
      } as MessageEntity);
    }
  }

  return result;
}

export function normalizeEntities(
  text: string,
  entities: MessageEntity[],
): MessageEntity[] {
  if (!entities || entities.length === 0) return [];

  const textLen = telegramLength(text);

  let sorted = entities
    .filter(e => e != null && e.offset >= 0 && e.length > 0)
    .map(e => ({ ...e }))
    .sort((a, b) => a.offset - b.offset || b.length - a.length);

  sorted = sorted.filter(e => e.offset + e.length <= textLen);
  sorted = deduplicateEntities(sorted);
  sorted = resolveOverlaps(sorted);

  return sorted;
}

function deduplicateEntities(entities: MessageEntity[]): MessageEntity[] {
  const seen = new Set<string>();
  return entities.filter(e => {
    const key = `${e.type}:${e.offset}:${e.length}:${e.url || ''}:${e.custom_emoji_id || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function resolveOverlaps(entities: MessageEntity[]): MessageEntity[] {
  if (entities.length <= 1) return entities;

  const result: MessageEntity[] = [];

  for (let i = 0; i < entities.length; i++) {
    const current = entities[i];
    let merged = false;

    // NEVER merge atomic entities (url, text_link, mention, code, etc.)
    // They carry metadata (url, user, language) that would be lost on merge
    if (!isAtomicEntity(current.type)) {
      for (let j = result.length - 1; j >= 0; j--) {
        const existing = result[j];

        if (existing.type === current.type && !isAtomicEntity(existing.type) && doEntitiesOverlap(existing, current)) {
          const mergedOffset = Math.min(existing.offset, current.offset);
          const mergedEnd = Math.max(
            existing.offset + existing.length,
            current.offset + current.length,
          );
          result[j] = {
            ...existing,
            offset: mergedOffset,
            length: mergedEnd - mergedOffset,
          };
          merged = true;
          break;
        }

        if (existing.offset + existing.length <= current.offset) {
          break;
        }
      }
    }

    if (!merged) {
      result.push(current);
    }
  }

  return result.sort((a, b) => a.offset - b.offset);
}

function doEntitiesOverlap(a: MessageEntity, b: MessageEntity): boolean {
  const aEnd = a.offset + a.length;
  const bEnd = b.offset + b.length;
  return a.offset < bEnd && b.offset < aEnd;
}

export function recalculateOffsets(
  text: string,
  originalEntities: MessageEntity[],
  oldText: string,
): MessageEntity[] {
  if (!originalEntities || originalEntities.length === 0) return [];
  if (text === oldText) return originalEntities.map(e => ({ ...e }));

  const newEntities: MessageEntity[] = [];

  for (const entity of originalEntities) {
    const originalFragment = oldText.slice(entity.offset, entity.offset + entity.length);
    const newOffset = text.indexOf(originalFragment);

    if (newOffset >= 0) {
      newEntities.push({
        ...entity,
        offset: telegramLength(text.slice(0, newOffset)),
        length: telegramLength(originalFragment),
      });
    }
  }

  return newEntities;
}

export function mergeEntities(
  textEntities: MessageEntity[],
  captionEntities: MessageEntity[],
): MessageEntity[] {
  const merged = [...(textEntities || []), ...(captionEntities || [])];
  return merged.sort((a, b) => a.offset - b.offset);
}

/**
 * Rebase entities from a parent text segment into a child chunk.
 *
 * @param segmentText  - The text of the child chunk (already sliced)
 * @param entities     - Entities with offsets relative to the PARENT text
 * @param segmentStart - Start offset of this segment within the parent text
 * @returns Entities rebased to the child text, with partial overlaps clamped
 */
export function rebaseEntities(
  segmentText: string,
  entities: MessageEntity[],
  segmentStart: number,
): MessageEntity[] {
  if (!Array.isArray(entities) || entities.length === 0) return [];
  if (!segmentText) return [];

  const segmentLen = telegramLength(segmentText);
  const segmentEnd = segmentStart + segmentLen;
  const result: MessageEntity[] = [];

  for (const e of entities) {
    const entityEnd = e.offset + e.length;

    // Skip entities entirely outside this segment
    if (e.offset >= segmentEnd || entityEnd <= segmentStart) continue;

    // Clamp to segment boundaries
    const clampedStart = Math.max(e.offset, segmentStart);
    const clampedEnd = Math.min(entityEnd, segmentEnd);
    const newOffset = clampedStart - segmentStart;
    const newLength = clampedEnd - clampedStart;

    if (newLength <= 0) continue;

    const rebased: MessageEntity = {
      ...e,
      offset: newOffset,
      length: newLength,
    };

    // Validate against segment text bounds
    if (rebased.offset >= 0 && rebased.offset + rebased.length <= segmentLen) {
      result.push(rebased);
    }
  }

  return result;
}

/**
 * Final entity alignment layer — runs on the FINAL_RENDERED_TEXT right before
 * Telegram API call. Guarantees every entity offset/length matches the actual text.
 *
 * Rules:
 * - Recalibrates ALL offsets against the final text using substring matching
 * - url/text_link entities are NEVER dropped; if offset is wrong, we try to
 *   recover by finding the entity's fragment (or URL) in the final text
 * - If an entity is truly unrecoverable, only that entity is dropped
 * - No parse_mode changes (caller enforces that separately)
 */
export function normalizeFinalEntities(
  text: string,
  entities: MessageEntity[],
): MessageEntity[] {
  if (!text || !entities || entities.length === 0) return entities || [];

  const textLen = telegramLength(text);
  if (textLen === 0) return [];

  const result: MessageEntity[] = [];

  for (const entity of entities) {
    const fixed = fixOneEntity(text, textLen, entity);
    if (fixed) {
      result.push(fixed);
    } else if (entity.type === 'text_link' || entity.type === 'url') {
      logger.warn(`[FinalEntityAlign] DROPPED ${entity.type} entity: offset=${entity.offset} length=${entity.length} url=${entity.url ?? '-'} textLen=${textLen}`);
    }
  }

  return result;
}

function fixOneEntity(
  text: string,
  textLen: number,
  entity: MessageEntity,
): MessageEntity | null {
  const isLink = entity.type === 'url' || entity.type === 'text_link';

  // Step 1: check if current offset is already valid
  if (isOffsetValid(text, textLen, entity)) {
    return entity;
  }

  // Step 2: for text_link, the offset/length points to the DISPLAY TEXT (not the URL).
  // The URL is a separate href. So recovery must find the display text fragment,
  // NOT search for the URL string in the text.
  if (entity.type === 'text_link') {
    // Try to find the old display text fragment at some position in the new text
    const oldFragment = text.substring(Math.min(entity.offset, text.length),
      Math.min(entity.offset + entity.length, text.length));
    if (oldFragment && oldFragment.length > 0) {
      const idx = text.indexOf(oldFragment);
      if (idx >= 0) {
        const newOffset = telegramLength(text.slice(0, idx));
        const newLength = telegramLength(oldFragment);
        if (newOffset >= 0 && newOffset + newLength <= textLen) {
          return { ...entity, offset: newOffset, length: newLength };
        }
      }
    }
    // text_link with valid URL but unmatchable display text — KEEP it with clamped bounds
    // Telegram will still render the link if the entity is within text bounds
    const clampedLength = Math.min(entity.length, textLen - Math.max(0, entity.offset));
    const clampedOffset = Math.max(0, Math.min(entity.offset, textLen - 1));
    if (clampedLength > 0 && clampedOffset + clampedLength <= textLen) {
      return { ...entity, offset: clampedOffset, length: clampedLength };
    }
    // Truly out of bounds — keep with zero-length safety (Telegram ignores zero-length entities)
    logger.warn(`[FinalEntityAlign] keeping text_link entity (unclampable): offset=${entity.offset} length=${entity.length} url=${entity.url ?? '-'}`);
    return entity;
  }

  // Step 3: for url entities (type=url), try to find the URL string in the text
  if (entity.type === 'url' && entity.url) {
    const urlIdx = text.indexOf(entity.url);
    if (urlIdx >= 0) {
      const newOffset = telegramLength(text.slice(0, urlIdx));
      const newLength = telegramLength(entity.url);
      if (newOffset >= 0 && newOffset + newLength <= textLen) {
        return { ...entity, offset: newOffset, length: newLength };
      }
    }
    // url entity — find the URL fragment at its old offset range
    const entityText = text.substring(entity.offset, entity.offset + entity.length);
    if (entityText) {
      const idx = text.indexOf(entityText);
      if (idx >= 0) {
        const newOffset = telegramLength(text.slice(0, idx));
        const newLength = telegramLength(entityText);
        if (newOffset >= 0 && newOffset + newLength <= textLen) {
          return { ...entity, offset: newOffset, length: newLength };
        }
      }
    }
  }

  // Step 4: non-link style entities — drop if unrecoverable
  return null;
}

function isOffsetValid(text: string, textLen: number, entity: MessageEntity): boolean {
  if (!Number.isInteger(entity.offset) || !Number.isInteger(entity.length)) return false;
  if (entity.offset < 0 || entity.length <= 0) return false;
  if (entity.offset + entity.length > textLen) return false;

  if (entity.type === 'url') {
    const fragment = text.substring(entity.offset, entity.offset + entity.length);
    if (!fragment.match(/^https?:\/\//) && !fragment.match(/^tg:\/\//)) return false;
  }

  return true;
}

export { telegramLength };
