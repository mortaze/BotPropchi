import { describe, expect, it } from 'vitest';
import { normalizeEntities, recalculateOffsets, mergeEntities } from '../shared/message-format/normalizer';
import { parseMarkdown, parseMessageContent, prepareTelegramPayload, stripFormatting } from '../shared/message-format/parser';
import { validateFormatting, hasParseModeConflict } from '../shared/message-format/validator';
import { serializeMessage, serializeMediaGroup, serializeSingleMedia } from '../shared/message-format/serializer';
import { renderMessage, renderPreview } from '../shared/message-format/renderer';
import { telegramLength } from '../shared/message-format/types';

describe('normalizeEntities', () => {
  it('sorts entities by offset', () => {
    const result = normalizeEntities('bold italic', [
      { type: 'italic', offset: 5, length: 5 },
      { type: 'bold', offset: 0, length: 4 },
    ]);
    expect(result[0].type).toBe('bold');
    expect(result[1].type).toBe('italic');
  });

  it('filters out-of-bounds entities', () => {
    const result = normalizeEntities('abc', [
      { type: 'bold', offset: 0, length: 3 },
      { type: 'italic', offset: 0, length: 10 },
    ]);
    expect(result).toHaveLength(1);
  });

  it('deduplicates identical entities', () => {
    const result = normalizeEntities('test', [
      { type: 'bold', offset: 0, length: 4 },
      { type: 'bold', offset: 0, length: 4 },
    ]);
    expect(result).toHaveLength(1);
  });
});

describe('recalculateOffsets', () => {
  it('preserves entities when text unchanged', () => {
    const result = recalculateOffsets('hello world', [{ type: 'bold', offset: 0, length: 5 }], 'hello world');
    expect(result).toHaveLength(1);
    expect(result[0].offset).toBe(0);
  });

  it('finds new offset after text edit', () => {
    const result = recalculateOffsets('xyz hello world', [{ type: 'bold', offset: 0, length: 5 }], 'hello world');
    expect(result[0].offset).toBe(4);
  });
});

describe('mergeEntities', () => {
  it('merges and sorts text and caption entities', () => {
    const result = mergeEntities(
      [{ type: 'bold', offset: 0, length: 4 }],
      [{ type: 'italic', offset: 10, length: 5 }],
    );
    expect(result).toHaveLength(2);
    expect(result[0].offset).toBe(0);
    expect(result[1].offset).toBe(10);
  });
});

describe('parseMarkdown', () => {
  it('parses bold', () => {
    const result = parseMarkdown('**bold** text');
    expect(result.text).toBe('**bold** text');
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].type).toBe('bold');
  });

  it('parses italic', () => {
    const result = parseMarkdown('*italic* text');
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].type).toBe('italic');
  });

  it('parses underline', () => {
    const result = parseMarkdown('__underline__');
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].type).toBe('underline');
  });

  it('parses strikethrough', () => {
    const result = parseMarkdown('~strike~');
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].type).toBe('strikethrough');
  });

  it('parses spoiler', () => {
    const result = parseMarkdown('||spoiler||');
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].type).toBe('spoiler');
  });

  it('parses inline code', () => {
    const result = parseMarkdown('text `code` here');
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].type).toBe('code');
  });

  it('parses code block with language', () => {
    const result = parseMarkdown("```ts\nconst x = 1;\n```");
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].type).toBe('pre');
    expect(result.entities[0].language).toBe('ts');
  });

  it('parses link', () => {
    const result = parseMarkdown('[text](https://example.com)');
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].type).toBe('text_link');
    expect(result.entities[0].url).toBe('https://example.com');
  });
});

describe('parseMessageContent', () => {
  it('passes through entities directly', () => {
    const result = parseMessageContent('hello', 'entities', [{ type: 'bold', offset: 0, length: 5 }]);
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].type).toBe('bold');
  });

  it('parses markdown format', () => {
    const result = parseMessageContent('**bold**', 'markdown');
    expect(result.entities).toHaveLength(1);
  });

  it('returns empty for null text', () => {
    const result = parseMessageContent('', 'none');
    expect(result.text).toBe('');
    expect(result.entities).toEqual([]);
  });
});

describe('prepareTelegramPayload', () => {
  it('uses entities render mode directly', () => {
    const result = prepareTelegramPayload('hello', [{ type: 'bold', offset: 0, length: 5 }], 'telegram_entities');
    expect(result.renderMode).toBe('telegram_entities');
    expect(result.entities).toHaveLength(1);
  });

  it('falls back to none when no entities', () => {
    const result = prepareTelegramPayload('plain text', [], 'none');
    expect(result.renderMode).toBe('none');
  });
});

describe('stripFormatting', () => {
  it('strips markdown formatting', () => {
    expect(stripFormatting('**bold** *italic*', 'markdown')).toBe('bold italic');
  });

  it('strips HTML tags', () => {
    expect(stripFormatting('<b>bold</b> <i>italic</i>', 'html')).toBe('bold italic');
  });
});

describe('validateFormatting', () => {
  it('returns no issues for valid entities', () => {
    const issues = validateFormatting('hello', [{ type: 'bold', offset: 0, length: 5 }]);
    expect(issues).toEqual([]);
  });

  it('detects out-of-bounds entity', () => {
    const issues = validateFormatting('abc', [{ type: 'bold', offset: 0, length: 10 }]);
    expect(issues.length).toBeGreaterThan(0);
  });

  it('detects missing url on text_link', () => {
    const issues = validateFormatting('link', [{ type: 'text_link', offset: 0, length: 4 }]);
    expect(issues.length).toBeGreaterThan(0);
  });

  it('detects missing custom_emoji_id', () => {
    const issues = validateFormatting('emoji', [{ type: 'custom_emoji', offset: 0, length: 5 }]);
    expect(issues.length).toBeGreaterThan(0);
  });

  it('detects duplicates', () => {
    const issues = validateFormatting('test', [
      { type: 'bold', offset: 0, length: 4 },
      { type: 'bold', offset: 0, length: 4 },
    ]);
    expect(issues.length).toBeGreaterThan(0);
  });
});

describe('hasParseModeConflict', () => {
  it('rejects entities + parse_mode', () => {
    expect(hasParseModeConflict({ entities: [{ type: 'bold', offset: 0, length: 1 }], parse_mode: 'Markdown' })).toBe(true);
  });

  it('passes entities without parse_mode', () => {
    expect(hasParseModeConflict({ entities: [{ type: 'bold', offset: 0, length: 1 }] })).toBe(false);
  });
});

describe('serializeMessage', () => {
  it('produces sendMessage with entities', () => {
    const requests = serializeMessage({
      text: 'bold text',
      entities: [{ type: 'bold', offset: 0, length: 4 }],
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe('sendMessage');
    expect(requests[0].entities).toBeDefined();
  });

  it('includes caption and caption_entities', () => {
    const requests = serializeMessage({
      text: 'caption',
      caption: 'caption',
      caption_entities: [{ type: 'bold', offset: 0, length: 7 }],
    });
    expect(requests[0].caption).toBe('caption');
    expect(requests[0].caption_entities).toBeDefined();
  });
});

describe('serializeMediaGroup', () => {
  it('creates sendMediaGroup request', () => {
    const req = serializeMediaGroup([
      { type: 'photo', fileId: 'id1' },
      { type: 'photo', fileId: 'id2' },
    ]);
    expect(req.method).toBe('sendMediaGroup');
    expect(req.media).toHaveLength(2);
  });

  it('sets caption only on first item', () => {
    const req = serializeMediaGroup([
      { type: 'photo', fileId: 'id1', caption: 'group caption' },
      { type: 'photo', fileId: 'id2' },
    ]);
    expect(req.media[0].caption).toBe('group caption');
    expect(req.media[1].caption).toBeUndefined();
  });
});

describe('serializeSingleMedia', () => {
  it('creates sendPhoto request', () => {
    const req = serializeSingleMedia({ type: 'photo', fileId: 'abc' });
    expect(req.method).toBe('sendPhoto');
    expect(req.media).toBe('abc');
  });

  it('includes caption entities', () => {
    const req = serializeSingleMedia(
      { type: 'photo', fileId: 'abc' },
      'caption',
      [{ type: 'bold', offset: 0, length: 7 }],
    );
    expect(req.caption_entities).toBeDefined();
  });
});

describe('renderMessage', () => {
  it('normalizes text entities', () => {
    const result = renderMessage({
      text: 'bold italic',
      entities: [
        { type: 'italic', offset: 5, length: 6 },
        { type: 'bold', offset: 0, length: 4 },
      ],
    });
    expect(result.entities).toHaveLength(2);
    expect(result.entities![0].type).toBe('bold');
  });

  it('handles caption separately', () => {
    const result = renderMessage({
      text: 'text',
      caption: 'caption',
    });
    expect(result.text).toBe('text');
    expect(result.caption).toBe('caption');
  });
});

describe('renderPreview', () => {
  it('returns text up to maxLength', () => {
    const preview = renderPreview({ text: 'a'.repeat(300) }, 200);
    expect(preview.length).toBe(203);
    expect(preview.endsWith('...')).toBe(true);
  });

  it('prefers caption over text', () => {
    const preview = renderPreview({ text: 'text', caption: 'caption' }, 200);
    expect(preview).toBe('caption');
  });
});

describe('telegramLength', () => {
  it('counts ASCII correctly', () => {
    expect(telegramLength('hello')).toBe(5);
  });

  it('counts emoji as 2 units', () => {
    expect(telegramLength('😀')).toBe(2);
  });
});
