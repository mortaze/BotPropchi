import { describe, expect, it } from 'vitest';
import { normalizePost, sanitizePost } from '../services/post-normalizer.service';

describe('normalizePost — message-first output', () => {
  it('returns messages array from post.messages', () => {
    const raw = {
      id: 1, title: 'Test', slug: 'test',
      messages: [
        { id: 1, postId: 1, order: 0, messageType: 'text', text: 'msg1', entities: [{ type: 'bold', offset: 0, length: 4 }], parseMode: 'None', mediaFileId: null, mediaGroupId: null, caption: null, captionEntities: [], replyMarkup: null, delayMs: 0 },
        { id: 2, postId: 1, order: 1, messageType: 'text', text: 'msg2', entities: [], parseMode: 'None', mediaFileId: null, mediaGroupId: null, caption: null, captionEntities: [], replyMarkup: null, delayMs: 500 },
      ],
    };
    const normalized = normalizePost(raw);
    expect(normalized.messages).toHaveLength(2);
    expect(normalized.messages[0].text).toBe('msg1');
    expect(normalized.messages[1].entities).toHaveLength(0);
  });

  it('does NOT generate content field from messages', () => {
    const raw = {
      id: 2, title: 'No Content', slug: 'no-content',
      messages: [
        { id: 1, postId: 2, order: 0, messageType: 'text', text: 'hello', entities: [], parseMode: 'None', mediaFileId: null, mediaGroupId: null, caption: null, captionEntities: [], replyMarkup: null, delayMs: 0 },
      ],
    };
    const normalized = normalizePost(raw);
    expect(normalized.messages).toHaveLength(1);
    expect(normalized.content).toBeUndefined();
  });

  it('does NOT generate entities field from messages', () => {
    const raw = {
      id: 3, title: 'Test', slug: 'test',
      messages: [
        { id: 1, postId: 3, order: 0, messageType: 'text', text: 'bold text', entities: [{ type: 'bold', offset: 0, length: 4 }], parseMode: 'None', mediaFileId: null, mediaGroupId: null, caption: null, captionEntities: [], replyMarkup: null, delayMs: 0 },
      ],
    };
    const normalized = normalizePost(raw);
    expect(normalized.entities).toBeUndefined();
    expect(normalized.messages[0].entities).toHaveLength(1);
  });

  it('handles empty messages array', () => {
    const raw = { id: 4, title: 'Empty', slug: 'empty', messages: [] };
    const normalized = normalizePost(raw);
    expect(normalized.messages).toEqual([]);
    expect(normalized.content).toBeUndefined();
  });

  it('legacy fields from raw post pass through as raw but are not generated', () => {
    const raw = { id: 5, title: 'Legacy', slug: 'legacy', content: 'old content', entities: [{ type: 'bold', offset: 0, length: 3 }], parseMode: 'HTML', messages: [] };
    const normalized = normalizePost(raw);
    expect(normalized.messages).toEqual([]);
    expect(normalized.id).toBe(5);
  });

  it('normalizePost output includes only message-first fields', () => {
    const raw = { id: 6, title: 'Clean', slug: 'clean', status: 'PUBLISHED', command: '/test', messages: [] };
    const normalized = normalizePost(raw);
    expect(normalized.id).toBe(6);
    expect(normalized.title).toBe('Clean');
    expect(normalized.slug).toBe('clean');
    expect(normalized.status).toBe('PUBLISHED');
    expect(normalized.command).toBe('/test');
    expect(normalized.messages).toEqual([]);
  });
});

describe('sanitizePost — preserves messages', () => {
  it('includes messages in output', () => {
    const raw = { id: 1, messages: [{ id: 1, text: 'hi' }] };
    const sanitized = sanitizePost(raw);
    expect(sanitized.messages).toHaveLength(1);
  });
});
