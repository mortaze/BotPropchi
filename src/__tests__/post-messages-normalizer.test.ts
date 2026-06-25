import { describe, expect, it } from 'vitest';
import { buildTelegramPayload, normalizeSingleMessage, sanitizeEntities } from '../services/post-message.service';

describe('post_messages isolated normalization', () => {
  it('normalizes 3 messages with independent bold, italic, and blockquote entities', () => {
    const rows = [
      { id: 1, postId: 10, order: 0, messageType: 'text', text: 'bold one', entities: [{ type: 'bold', offset: 0, length: 4 }], parseMode: 'None', captionEntities: [] },
      { id: 2, postId: 10, order: 1, messageType: 'text', text: 'italic two', entities: [{ type: 'italic', offset: 0, length: 6 }], parseMode: 'None', captionEntities: [] },
      { id: 3, postId: 10, order: 2, messageType: 'text', text: 'quote three', entities: [{ type: 'blockquote', offset: 0, length: 5 }], parseMode: 'None', captionEntities: [] },
    ];
    const messages = rows.map(normalizeSingleMessage);
    expect(messages.map(m => m.entities[0]?.type)).toEqual(['bold', 'italic', 'blockquote']);
    expect(messages.every(m => m.entities[0].offset === 0)).toBe(true);
    expect(messages[0].entities).not.toBe(messages[1].entities);
  });

  it('keeps a plain message between two formatted messages unpolluted', () => {
    const messages = [
      normalizeSingleMessage({ id: 1, postId: 10, order: 0, messageType: 'text', text: 'A', entities: [{ type: 'bold', offset: 0, length: 1 }], parseMode: 'None', captionEntities: [] }),
      normalizeSingleMessage({ id: 2, postId: 10, order: 1, messageType: 'text', text: 'plain', entities: [], parseMode: 'None', captionEntities: [] }),
      normalizeSingleMessage({ id: 3, postId: 10, order: 2, messageType: 'text', text: 'C', entities: [{ type: 'italic', offset: 0, length: 1 }], parseMode: 'None', captionEntities: [] }),
    ];
    expect(messages[1].entities).toEqual([]);
    expect(buildTelegramPayload(messages[1]).entities).toBeUndefined();
  });

  it('validates Persian RTL text and emoji offsets by UTF-16 code units', () => {
    const text = 'سلام 😊 بولد';
    const offset = 'سلام 😊 '.length; // JS length is UTF-16 code units, Telegram-compatible.
    expect(offset).toBe(8);
    const msg = normalizeSingleMessage({ id: 1, postId: 10, order: 0, messageType: 'text', text, entities: [{ type: 'bold', offset, length: 4 }], parseMode: 'None', captionEntities: [] });
    const payload = sanitizeEntities(buildTelegramPayload(msg), msg.id);
    expect(payload.entities).toEqual([{ type: 'bold', offset: 8, length: 4 }]);
    expect(() => normalizeSingleMessage({ id: 2, postId: 10, order: 0, messageType: 'text', text, entities: [{ type: 'bold', offset: 9, length: 99 }], parseMode: 'None', captionEntities: [] })).toThrow(/invalid entity/);
  });
});
