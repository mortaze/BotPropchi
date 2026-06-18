import { MessageEntity, MessageEntityType, ENTITY_TYPE_SET, telegramLength } from './types';

export function validateFormatting(text: string, entities?: MessageEntity[] | null): string[] {
  const issues: string[] = [];
  if (!entities) return issues;

  const length = telegramLength(text || '');

  entities.forEach((e, i) => {
    if (!ENTITY_TYPE_SET.has(e.type as MessageEntityType)) {
      issues.push(`entity ${i}: unsupported type "${e.type}"`);
    }

    if (!Number.isInteger(e.offset) || e.offset < 0) {
      issues.push(`entity ${i}: invalid offset ${e.offset}`);
    }

    if (!Number.isInteger(e.length) || e.length < 1) {
      issues.push(`entity ${i}: invalid length ${e.length}`);
    }

    if (e.offset + e.length > length) {
      issues.push(`entity ${i}: exceeds text length (offset=${e.offset} len=${e.length} textLen=${length})`);
    }

    if (e.type === 'text_link' && !e.url) {
      issues.push(`entity ${i}: text_link requires url`);
    }

    if (e.type === 'custom_emoji' && !e.custom_emoji_id) {
      issues.push(`entity ${i}: custom_emoji requires custom_emoji_id`);
    }

    if (e.type === 'text_mention' && !e.user) {
      issues.push(`entity ${i}: text_mention requires user`);
    }
  });

  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      if (entities[i].offset === entities[j].offset &&
          entities[i].length === entities[j].length &&
          entities[i].type === entities[j].type) {
        issues.push(`duplicate entity at offset=${entities[i].offset} type=${entities[i].type}`);
      }
    }
  }

  return issues;
}

export function assertFormattingValid(text: string, entities?: MessageEntity[] | null): void {
  const issues = validateFormatting(text, entities);
  if (issues.length > 0) {
    throw new Error(`[FormatValidator] ${issues.join('; ')}`);
  }
}

export function hasParseModeConflict(request: any): boolean {
  const hasEntities = (
    (request.entities?.length || 0) +
    (request.caption_entities?.length || 0) +
    (request.media?.reduce((n: number, m: any) => n + (m.caption_entities?.length || 0), 0) || 0)
  ) > 0;
  return hasEntities && request.parse_mode !== undefined;
}
