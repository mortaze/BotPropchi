import { describe, it, expect } from 'vitest';
import { splitPostToMessages, buildMessageContext, normalizeMessage } from '../services/post-renderer.service';

describe('splitPostToMessages (message-first)', () => {
  it('returns empty array for null/undefined post', () => {
    expect(splitPostToMessages(null)).toEqual([]);
    expect(splitPostToMessages(undefined)).toEqual([]);
  });

  it('returns empty array for empty messages array', () => {
    expect(splitPostToMessages({})).toEqual([]);
    expect(splitPostToMessages({ messages: [] })).toEqual([]);
    expect(splitPostToMessages({ telegramPayload: { messages: [] } })).toEqual([]);
  });

  it('returns messages from post.messages as-is', () => {
    const post = {
      id: 1,
      messages: [
        { text: 'first message', entities: [{ type: 'bold', offset: 0, length: 5 }] },
        { text: 'second message', entities: [] },
      ],
    };
    const result = splitPostToMessages(post);
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe('first message');
    expect(result[0].entities).toHaveLength(1);
    expect(result[0].entities[0].type).toBe('bold');
    expect(result[1].text).toBe('second message');
    expect(result[1].entities).toEqual([]);
  });

  it('returns messages from post.telegramPayload?.messages as fallback', () => {
    const post = {
      id: 2,
      telegramPayload: {
        messages: [
          { text: 'from payload', entities: [{ type: 'italic', offset: 0, length: 11 }] },
        ],
      },
    };
    const result = splitPostToMessages(post);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('from payload');
    expect(result[0].entities[0].type).toBe('italic');
  });

  it('throws appropriate error from buildMessageContext for out-of-range index', () => {
    const post = { id: 42, messages: [{ text: 'only one' }] };
    expect(() => buildMessageContext(post, 5)).toThrow(
      '[MessageCtx] post=42 message index 5 not found (total 1)',
    );
  });

  it('returns correct message from buildMessageContext for valid index', () => {
    const post = {
      id: 99,
      messages: [
        { text: 'first' },
        { text: 'second' },
      ],
    };
    const ctx = buildMessageContext(post, 1);
    expect(ctx.postId).toBe(99);
    expect(ctx.message.text).toBe('second');
    expect(ctx.message.index).toBe(1);
  });

  it('messages are deep-cloned (modifying result does not affect source)', () => {
    const entity = { type: 'bold', offset: 0, length: 4 };
    const msg = { text: 'test', entities: [entity] };
    const post = { messages: [msg] };
    const result = splitPostToMessages(post);

    result[0].entities[0].type = 'italic';
    result[0].text = 'changed';

    expect(entity.type).toBe('bold');
    expect(msg.text).toBe('test');

    const normalized = normalizeMessage(msg, 0);
    normalized.entities[0].type = 'underline';
    expect(entity.type).toBe('bold');
  });
});
