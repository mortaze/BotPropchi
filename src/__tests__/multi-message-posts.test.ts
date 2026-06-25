import { describe, expect, it } from 'vitest';
import { normalizeMessage, splitPostToMessages } from '../services/post-renderer.service';
import { renderMessage } from '../services/renderer';

describe('multi-message post isolation', () => {
  it('keeps bold quote, code, and normal message entities sandboxed per message', () => {
    const post = {
      id: 77,
      title: 'multi',
      telegramPayload: {
        messages: [
          {
            id: 'm1',
            text: 'پیام اول',
            entities: [
              { type: 'bold', offset: 0, length: 7 },
              { type: 'blockquote', offset: 0, length: 7 },
            ],
            style: { bold: true, italic: false, code: false, blockquote: true },
          },
          {
            id: 'm2',
            text: 'code دوم',
            entities: [{ type: 'code', offset: 0, length: 4 }],
            style: { bold: false, italic: false, code: true, blockquote: false },
          },
          {
            id: 'm3',
            text: 'normal سوم',
            entities: [],
            style: { bold: false, italic: false, code: false, blockquote: false },
          },
        ],
      },
    };

    const messages = splitPostToMessages(post);
    expect(messages).toHaveLength(3);
    expect(messages[0].entities.map((e) => e.type)).toEqual(['bold', 'blockquote']);
    expect(messages[1].entities.map((e) => e.type)).toEqual(['code']);
    expect(messages[2].entities).toEqual([]);

    messages[1].entities[0].type = 'pre';
    messages[1].style.bold = true;

    expect(messages[0].entities.map((e) => e.type)).toEqual(['bold', 'blockquote']);
    expect(messages[0].style).toMatchObject({ bold: true, code: false, blockquote: true });
    expect(post.telegramPayload.messages[1].entities[0].type).toBe('code');
  });

  it('deep clones legacy grouped entities for each split content message', () => {
    const post = {
      id: 88,
      content: 'پیام اول\n\n[[copy]]\nپیام دوم\n[[/copy]]\n\n[[copy]]\nپیام سوم\n[[/copy]]',
      entities: {
        messages: {
          '0': [{ type: 'bold', offset: 0, length: 7 }, { type: 'blockquote', offset: 0, length: 7 }],
          '1': [{ type: 'code', offset: 0, length: 7 }],
          '2': [],
        },
      },
    };

    const messages = splitPostToMessages(post);
    expect(messages.map((m) => m.entities.map((e) => e.type))).toEqual([
      ['bold', 'blockquote'],
      ['code'],
      [],
    ]);

    messages[0].entities[0].type = 'italic';
    expect((post.entities as any).messages['0'][0].type).toBe('bold');
    expect(messages[1].entities[0].type).toBe('code');
  });

  it('normalizes a message without preserving shared references into render payloads', () => {
    const entity = { type: 'code', offset: 0, length: 4 };
    const raw = { text: 'code', entities: [entity], style: { code: true } };
    const normalized = normalizeMessage(raw, 0);
    const payload = renderMessage(normalized.text, normalized.entities, [], undefined, 1);

    normalized.entities[0].type = 'bold';
    expect(raw.entities[0].type).toBe('code');
    expect(payload.entities?.[0].type).toBe('code');
  });
});
