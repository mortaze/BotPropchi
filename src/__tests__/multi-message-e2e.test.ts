import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('../prisma/client', () => ({
  prisma: {
    postMessage: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../services/post.service', () => ({
  postService: {
    incrementViews: vi.fn().mockResolvedValue(undefined),
  },
}));

import { prisma } from '../prisma/client';
import { sendPostToUser } from '../bot/shared';
import { validateMessages, loadPostMessages } from '../services/post-message.service';

// ─── Helpers ────────────────────────────────────────────────────────

function makeMockCtx() {
  const calls: { method: string; args: any[] }[] = [];
  const ctx = {
    from: { id: 12345 },
    reply: vi.fn().mockImplementation((text: string, extra?: any) => {
      calls.push({ method: 'sendMessage', args: [text, extra] });
      return Promise.resolve({ message_id: 1 });
    }),
    replyWithPhoto: vi.fn().mockImplementation((media: string, extra?: any) => {
      calls.push({ method: 'sendPhoto', args: [media, extra] });
      return Promise.resolve({ message_id: 2 });
    }),
    replyWithMediaGroup: vi.fn().mockImplementation((media: any[]) => {
      calls.push({ method: 'sendMediaGroup', args: [media] });
      return Promise.resolve([{ message_id: 3 }]);
    }),
    replyWithVideo: vi.fn(),
    replyWithDocument: vi.fn(),
    replyWithAudio: vi.fn(),
    replyWithAnimation: vi.fn(),
    replyWithVoice: vi.fn(),
  };
  return { ctx, calls };
}

const mockFindMany = prisma.postMessage.findMany as ReturnType<typeof vi.fn>;

// ─── Tests ──────────────────────────────────────────────────────────

describe('sendPostToUser — message-first architecture', () => {
  beforeEach(() => {
    mockFindMany.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('sends a single plain message', async () => {
    mockFindMany.mockResolvedValue([
      { id: 1, postId: 10, order: 0, messageType: 'text', text: 'Hello', entities: [], parseMode: 'None', captionEntities: [], mediaFileId: null, mediaGroupId: null, caption: null, replyMarkup: [], delayMs: 0 },
    ]);

    const { ctx, calls } = makeMockCtx();
    await sendPostToUser(ctx, { id: 10 });

    expect(calls.length).toBe(1);
    expect(calls[0].method).toBe('sendMessage');
    expect(calls[0].args[0]).toBe('Hello');
  });

  it('sends 2 separate messages with entity isolation', async () => {
    mockFindMany.mockResolvedValue([
      { id: 1, postId: 4, order: 0, messageType: 'text', text: 'bold one', entities: [{ type: 'bold', offset: 0, length: 4 }], parseMode: 'None', captionEntities: [], mediaFileId: null, mediaGroupId: null, caption: null, replyMarkup: [], delayMs: 0 },
      { id: 2, postId: 4, order: 1, messageType: 'text', text: 'plain two', entities: [], parseMode: 'None', captionEntities: [], mediaFileId: null, mediaGroupId: null, caption: null, replyMarkup: [], delayMs: 0 },
    ]);

    const { ctx, calls } = makeMockCtx();
    await sendPostToUser(ctx, { id: 4 });

    expect(calls.length).toBe(2);
    expect(calls[0].method).toBe('sendMessage');
    expect(calls[1].method).toBe('sendMessage');

    const firstExtra = calls[0].args[1];
    expect(firstExtra.entities).toEqual([{ type: 'bold', offset: 0, length: 4 }]);

    const secondExtra = calls[1].args[1];
    expect(secondExtra.entities).toBeUndefined();
    expect(calls[1].args[0]).toBe('plain two');
  });

  it('handles media message type', async () => {
    mockFindMany.mockResolvedValue([
      { id: 1, postId: 5, order: 0, messageType: 'photo', text: 'photo caption', entities: [], parseMode: 'None', captionEntities: [], mediaFileId: 'AgAAAfake', mediaGroupId: null, caption: 'photo caption', replyMarkup: [], delayMs: 0 },
    ]);

    const { ctx, calls } = makeMockCtx();
    await sendPostToUser(ctx, { id: 5 });

    expect(calls.length).toBe(1);
    expect(calls[0].method).toBe('sendPhoto');
  });

  it('handles buttons in reply_markup', async () => {
    const buttons = [{ text: 'Click', url: 'https://example.com' }];
    mockFindMany.mockResolvedValue([
      { id: 1, postId: 6, order: 0, messageType: 'text', text: 'with button', entities: [], parseMode: 'None', captionEntities: [], mediaFileId: null, mediaGroupId: null, caption: null, replyMarkup: buttons, delayMs: 0 },
    ]);

    const { ctx, calls } = makeMockCtx();
    await sendPostToUser(ctx, { id: 6 });

    expect(calls.length).toBe(1);
    const params = calls[0].args[1];
    expect(params.reply_markup).toBeDefined();
  });

  it('drops invalid entities via validateMessages', async () => {
    const messages = [
      { id: 1, postId: 7, order: 0, messageType: 'text', text: 'hi', entities: [{ type: 'bold', offset: 0, length: 2 }, { type: 'italic', offset: 5, length: 3 }], parseMode: 'None', captionEntities: [], mediaFileId: null, mediaGroupId: null, caption: null, replyMarkup: [], delayMs: 0 },
    ];
    const validated = validateMessages(messages, 7);
    expect(validated[0].entities.length).toBe(1);
    expect(validated[0].entities[0].type).toBe('bold');
  });

  it('shows error when post has no messages', async () => {
    mockFindMany.mockResolvedValue([]);

    const { ctx, calls } = makeMockCtx();
    await sendPostToUser(ctx, { id: 99 });

    expect(calls.length).toBe(1);
    expect(calls[0].args[0]).toContain('مشکل ساختاری');
  });

  it('loads messages from DB (not from rawPost)', async () => {
    const dbMessages = [
      { id: 1, postId: 10, order: 0, messageType: 'text', text: 'from DB', entities: [], parseMode: 'None', captionEntities: [], mediaFileId: null, mediaGroupId: null, caption: null, replyMarkup: [], delayMs: 0 },
    ];
    mockFindMany.mockResolvedValue(dbMessages);

    const rawPostWithMessages = {
      id: 10,
      messages: [
        { id: 999, postId: 10, order: 0, messageType: 'text', text: 'from rawPost (should be ignored)', entities: [], parseMode: 'None', captionEntities: [], mediaFileId: null, mediaGroupId: null, caption: null, replyMarkup: [], delayMs: 0 },
      ],
    };

    const { ctx, calls } = makeMockCtx();
    await sendPostToUser(ctx, rawPostWithMessages);

    expect(calls[0].args[0]).toBe('from DB');
    expect(calls[0].args[0]).not.toBe('from rawPost (should be ignored)');
  });

  it('handles template variable substitution with offset adjustment', async () => {
    mockFindMany.mockResolvedValue([
      { id: 1, postId: 10, order: 0, messageType: 'text', text: 'Hello {first_name}', entities: [{ type: 'bold', offset: 0, length: 5 }], parseMode: 'None', captionEntities: [], mediaFileId: null, mediaGroupId: null, caption: null, replyMarkup: [], delayMs: 0 },
    ]);

    const { ctx, calls } = makeMockCtx();
    await sendPostToUser(ctx, { id: 10 }, { first_name: 'Ali' });

    expect(calls[0].args[0]).toBe('Hello Ali');
    const params = calls[0].args[1];
    expect(params.entities).toBeDefined();
    expect(params.entities[0].type).toBe('bold');
    expect(params.entities[0].offset).toBe(0);
    expect(params.entities[0].length).toBe(5);
  });
});

describe('validateMessages — isolated', () => {
  it('filters out-of-range entities', () => {
    const messages = [
      { order: 0, text: 'abc', entities: [{ type: 'bold', offset: 0, length: 3 }, { type: 'italic', offset: 10, length: 2 }] },
    ];
    const result = validateMessages(messages, 1);
    expect(result[0].entities).toEqual([{ type: 'bold', offset: 0, length: 3 }]);
  });

  it('filters negative offset entities', () => {
    const messages = [
      { order: 0, text: 'abc', entities: [{ type: 'bold', offset: -1, length: 2 }] },
    ];
    const result = validateMessages(messages, 1);
    expect(result[0].entities).toEqual([]);
  });

  it('keeps valid entities unchanged', () => {
    const messages = [
      { order: 0, text: 'hello world', entities: [{ type: 'bold', offset: 0, length: 5 }, { type: 'italic', offset: 6, length: 5 }] },
    ];
    const result = validateMessages(messages, 1);
    expect(result[0].entities.length).toBe(2);
  });

  it('handles empty text with no entities', () => {
    const messages = [{ order: 0, text: '', entities: [] }];
    const result = validateMessages(messages, 1);
    expect(result[0].entities).toEqual([]);
  });
});
