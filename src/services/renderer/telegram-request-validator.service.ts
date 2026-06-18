import { logger } from '../../utils/logger';

const ENTITY_TYPES = new Set([
  'mention', 'hashtag', 'cashtag', 'bot_command', 'url', 'email', 'phone_number', 'bold', 'italic',
  'underline', 'strikethrough', 'spoiler', 'blockquote', 'expandable_blockquote', 'code', 'pre',
  'text_link', 'text_mention', 'custom_emoji',
]);

function telegramLength(text: string) {
  return Buffer.from(text || '', 'utf16le').length / 2;
}

export class TelegramRequestValidator {
  validateEntities(text: string | null | undefined, entities: any[] | null | undefined): string[] {
    const issues: string[] = [];
    if (!entities) return issues;
    const length = telegramLength(text || '');
    entities.forEach((e, i) => {
      if (!ENTITY_TYPES.has(e.type)) issues.push(`[PostEntity] entity ${i} has unsupported type ${e.type}`);
      if (!Number.isInteger(e.offset) || !Number.isInteger(e.length) || e.offset < 0 || e.length < 1) issues.push(`[PostEntity] entity ${i} has invalid range`);
      if ((e.offset || 0) + (e.length || 0) > length) issues.push(`[PostEntity] entity ${i} exceeds text length`);
      if (e.type === 'text_link' && !e.url) issues.push(`[PostEntity] text_link entity ${i} requires url`);
      if (e.type === 'custom_emoji' && !e.custom_emoji_id) issues.push(`[PostEntity] custom_emoji entity ${i} requires custom_emoji_id`);
    });
    return issues;
  }

  validateHtml(html?: string | null): string[] {
    if (!html) return [];
    const issues: string[] = [];
    const allowed = /^(b|strong|i|em|u|ins|s|strike|del|span|tg-spoiler|a|tg-emoji|code|pre|blockquote)$/i;
    const stack: string[] = [];
    const tagRe = /<\/?([a-z0-9-]+)(?:\s[^>]*)?>/gi;
    let m: RegExpExecArray | null;
    while ((m = tagRe.exec(html))) {
      const full = m[0];
      const tag = m[1].toLowerCase();
      if (!allowed.test(tag)) issues.push(`[PostEntity] unsupported HTML tag <${tag}>`);
      if (full.startsWith('</')) {
        const prev = stack.pop();
        if (prev && prev !== tag) issues.push(`[PostEntity] mismatched HTML tag </${tag}> expected </${prev}>`);
      } else if (!full.endsWith('/>') && !['br'].includes(tag)) stack.push(tag);
    }
    if (stack.length) issues.push(`[PostEntity] unclosed HTML tags: ${stack.join(', ')}`);
    return issues;
  }

  validateNoParseModeWithEntities(request: any): void {
    const entityCount = (request.entities?.length || 0) +
      (request.caption_entities?.length || 0) +
      (Array.isArray(request.media)
        ? request.media.reduce((n: number, m: any) => n + (m.caption_entities?.length || 0), 0)
        : 0);
    if (entityCount > 0 && request.parse_mode !== undefined) {
      throw new Error('[TelegramSend] entities present but parse_mode is set');
    }
  }

  validate(request: any): string[] {
    const issues: string[] = [];
    if (!request) {
      issues.push('[TelegramValidator] request is null/undefined');
      return issues;
    }

    const textEntities = request.entities || [];
    const captionEntities = request.caption_entities || [];
    const allMedia = request.media || [];

    if (request.text !== undefined) {
      issues.push(...this.validateEntities(request.text, textEntities));
    }

    if (request.caption !== undefined) {
      issues.push(...this.validateEntities(request.caption, captionEntities));
    }

    if (allMedia.length > 1) {
      if (allMedia.length > 10) issues.push('[TelegramValidator] media group exceeds 10 items');
      allMedia.forEach((m: any, i: number) => {
        if (!m.media) issues.push(`[TelegramValidator] media ${i} has no media field`);
        if (m.caption_entities) {
          issues.push(...this.validateEntities(m.caption, m.caption_entities));
        }
      });
    }

    try {
      this.validateNoParseModeWithEntities(request);
    } catch (e: any) {
      issues.push(e.message);
    }

    return issues;
  }

  assertValid(request: any): void {
    const issues = this.validate(request);
    if (issues.length > 0) {
      issues.forEach(issue => logger.error(`[TelegramValidator] ${issue}`));
      throw new Error(`[TelegramValidator] validation failed: ${issues[0]}`);
    }
  }
}

export const telegramRequestValidator = new TelegramRequestValidator();
