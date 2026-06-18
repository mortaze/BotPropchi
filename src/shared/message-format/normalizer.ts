import { MessageEntity, telegramLength } from './types';

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

    for (let j = result.length - 1; j >= 0; j--) {
      const existing = result[j];

      if (existing.type === current.type && doEntitiesOverlap(existing, current)) {
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

export { telegramLength };
