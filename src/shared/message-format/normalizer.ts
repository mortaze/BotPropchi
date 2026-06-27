import { MessageEntity, telegramLength } from './types';

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

export { telegramLength };
