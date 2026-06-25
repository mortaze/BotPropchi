import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../prisma/client', () => ({
  prisma: {
    postMessage: {
      findMany: vi.fn(),
      create: vi.fn().mockImplementation((data: any) => Promise.resolve({ id: Date.now(), ...data.data })),
      update: vi.fn().mockImplementation(({ where, data }: any) => Promise.resolve({ id: where.id, ...data })),
      delete: vi.fn().mockResolvedValue({ id: 1 }),
      deleteMany: vi.fn(),
      aggregate: vi.fn().mockResolvedValue({ _max: { order: null } }),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../services/post.service', () => ({
  postService: {
    incrementViews: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn(),
  },
}));

import { prisma } from '../prisma/client';
import { postService } from '../services/post.service';
import { sendPostToUser } from '../bot/shared';
import {
  validateMessages, normalizeSingleMessage, buildTelegramPayload,
  loadPostMessages, sendPostToChat,
  postMessageService, migrateSinglePost, ensurePostMessages,
} from '../services/post-message.service';
import { normalizePost } from '../services/post-normalizer.service';

const mockFindMany = prisma.postMessage.findMany as ReturnType<typeof vi.fn>;
const mockFindById = postService.findById as ReturnType<typeof vi.fn>;
const mockCreate = prisma.postMessage.create as ReturnType<typeof vi.fn>;

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
    replyWithVideo: vi.fn().mockImplementation((media: string, extra?: any) => {
      calls.push({ method: 'sendVideo', args: [media, extra] });
      return Promise.resolve({ message_id: 3 });
    }),
    replyWithDocument: vi.fn(),
    replyWithAudio: vi.fn(),
    replyWithAnimation: vi.fn(),
    replyWithVoice: vi.fn(),
    replyWithMediaGroup: vi.fn(),
  };
  return { ctx, calls };
}

function makeMsg(overrides: any = {}): any {
  return {
    id: overrides.id ?? 1, postId: 1, order: 0,
    messageType: 'text', text: 'test', entities: [],
    parseMode: 'None', captionEntities: [],
    mediaFileId: null, mediaGroupId: null,
    caption: null, replyMarkup: null, delayMs: 0,
    ...overrides,
  };
}

describe('MULTI-MESSAGE E2E — Full message-first flow', () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockFindById.mockReset();
    vi.clearAllMocks();
  });

  // ─── Requirement 1: Each message is fully independent ─────────────
  describe('Requirement 1: Per-message entity isolation', () => {
    it('Message 0 bold + blockquote, Message 1 italic — no leakage', async () => {
      mockFindMany.mockResolvedValue([
        makeMsg({ id: 1, order: 0, text: 'bold quote', entities: [{ type: 'bold', offset: 0, length: 4 }, { type: 'blockquote', offset: 0, length: 10 }] }),
        makeMsg({ id: 2, order: 1, text: 'italic only', entities: [{ type: 'italic', offset: 0, length: 6 }] }),
      ]);

      const { ctx, calls } = makeMockCtx();
      await sendPostToUser(ctx, { id: 1 });

      expect(calls).toHaveLength(2);
      expect(calls[0].args[1].entities).toEqual([
        { type: 'blockquote', offset: 0, length: 10 },
        { type: 'bold', offset: 0, length: 4 },
      ]);
      expect(calls[1].args[1].entities).toEqual([{ type: 'italic', offset: 0, length: 6 }]);
    });

    it('Message 0 photo+caption, Message 1 text+buttons — independent', async () => {
      mockFindMany.mockResolvedValue([
        makeMsg({ id: 1, order: 0, messageType: 'photo', text: 'photo caption', caption: 'photo caption', entities: [], captionEntities: [{ type: 'bold', offset: 0, length: 5 }], mediaFileId: 'AgAAAfake' }),
        makeMsg({ id: 2, order: 1, text: 'click here', entities: [], replyMarkup: [{ text: 'Go', url: 'https://x.com' }] }),
      ]);

      const { ctx, calls } = makeMockCtx();
      await sendPostToUser(ctx, { id: 1 });

      expect(calls).toHaveLength(2);
      expect(calls[0].method).toBe('sendPhoto');
      expect(calls[0].args[1].caption_entities).toEqual([{ type: 'bold', offset: 0, length: 5 }]);
      expect(calls[1].method).toBe('sendMessage');
      expect(calls[1].args[1].reply_markup).toBeDefined();
    });
  });

  // ─── Requirement 2: Adding a message creates empty row ────────────
  describe('Requirement 2: Add message creates empty row', () => {
    it('postMessageService.create creates message with order=last+1', async () => {
      mockCreate.mockImplementation((data: any) =>
        Promise.resolve({ id: 999, ...data.data, createdAt: new Date(), updatedAt: new Date() })
      );

      const msg = await postMessageService.create(1, { messageType: 'text' });
      expect(msg.order).toBe(0);
      expect(msg.text).toBeNull();
      expect(msg.entities).toEqual([]);
    });
  });

  // ─── Requirement 3: SendPost sends each message separately ────────
  describe('Requirement 3: SendPost sends per message', () => {
    it('3 messages → 3 separate sendMessage calls', async () => {
      mockFindMany.mockResolvedValue([
        makeMsg({ id: 1, order: 0, text: 'msg0' }),
        makeMsg({ id: 2, order: 1, text: 'msg1' }),
        makeMsg({ id: 3, order: 2, text: 'msg2' }),
      ]);

      const { ctx, calls } = makeMockCtx();
      await sendPostToUser(ctx, { id: 1 });

      expect(calls).toHaveLength(3);
      expect(calls[0].args[0]).toBe('msg0');
      expect(calls[1].args[0]).toBe('msg1');
      expect(calls[2].args[0]).toBe('msg2');
    });

    it('empty post_messages triggers migration and sends', async () => {
      mockFindMany.mockResolvedValue([]);
      mockFindById.mockResolvedValue({
        id: 50, title: 'Legacy', slug: 'legacy',
        content: 'hello from legacy', contentText: 'hello from legacy',
        entities: [{ type: 'bold', offset: 0, length: 5 }],
        caption: null, captionEntities: [], mediaFileId: null, mediaType: null,
        buttons: null, telegramPayload: null, telegramMessageSnapshot: null,
        parseMode: 'None',
      });

      const { ctx, calls } = makeMockCtx();
      await sendPostToUser(ctx, { id: 50 });

      expect(calls).toHaveLength(1);
      expect(calls[0].args[0]).toBe('hello from legacy');
      expect(calls[0].args[1].entities).toHaveLength(1);
    });
  });

  // ─── Requirement 4: normalizePost includes messages ───────────────
  describe('Requirement 4: normalizePost includes messages', () => {
    it('returns messages array from raw post with messages relation', async () => {
      const raw = {
        id: 1, title: 'Test', messages: [
          { id: 1, postId: 1, order: 0, messageType: 'text', text: 'msg1', entities: [], parseMode: 'None', mediaFileId: null, mediaGroupId: null, caption: null, captionEntities: [], replyMarkup: null, delayMs: 0 },
          { id: 2, postId: 1, order: 1, messageType: 'text', text: 'msg2', entities: [{ type: 'bold', offset: 0, length: 4 }], parseMode: 'None', mediaFileId: null, mediaGroupId: null, caption: null, captionEntities: [], replyMarkup: null, delayMs: 500 },
        ],
      };
      const normalized = normalizePost(raw);
      expect(normalized.messages).toHaveLength(2);
      expect(normalized.messages[0].text).toBe('msg1');
      expect(normalized.messages[1].entities[0].type).toBe('bold');
    });
  });

  // ─── Requirement 5: Editing one message doesn't affect others ─────
  describe('Requirement 5: Edit isolation', () => {
    it('validateMessages validates each message independently', async () => {
      const messages = [
        { order: 0, text: 'valid', entities: [{ type: 'bold', offset: 0, length: 5 }] },
        { order: 1, text: 'xx', entities: [{ type: 'italic', offset: 10, length: 2 }] },
        { order: 2, text: 'ok', entities: [] },
      ];
      const result = validateMessages(messages, 1);
      expect(result[0].entities).toHaveLength(1); // valid
      expect(result[1].entities).toHaveLength(0); // dropped OOB
      expect(result[2].entities).toHaveLength(0); // empty
    });

    it('buildTelegramPayload produces correct payload per message type', () => {
      const textMsg = normalizeSingleMessage(makeMsg({ id: 1, order: 0, text: 'hello', entities: [{ type: 'bold', offset: 0, length: 5 }] }));
      const payload = buildTelegramPayload(textMsg);
      expect(payload.method).toBe('sendMessage');
      expect((payload as any).entities).toHaveLength(1);

      const photoMsg = normalizeSingleMessage(makeMsg({ id: 2, order: 1, messageType: 'photo', text: 'caption', caption: 'caption', mediaFileId: 'abc', captionEntities: [{ type: 'italic', offset: 0, length: 3 }] }));
      const photoPayload = buildTelegramPayload(photoMsg);
      expect(photoPayload.method).toBe('sendPhoto');
      expect((photoPayload as any).caption_entities).toHaveLength(1);
    });
  });

  // ─── Requirement 6: Migration is idempotent ────────────────────────
  describe('Requirement 6: Migration idempotency', () => {
    it('ensurePostMessages returns existing rows if present', async () => {
      const existing = [makeMsg({ id: 1, text: 'already here' })];
      mockFindMany.mockResolvedValue(existing);
      const rows = await ensurePostMessages(1);
      expect(rows).toEqual(existing);
      expect(mockFindById).not.toHaveBeenCalled();
    });

    it('migrateSinglePost creates message from legacy content', async () => {
      mockFindById.mockResolvedValue({
        id: 99, title: 'Legacy Post', slug: 'legacy',
        content: 'legacy content',
        entities: [{ type: 'bold', offset: 0, length: 7 }],
        caption: null, captionEntities: [], mediaFileId: null, mediaType: null,
        buttons: null, telegramPayload: null, telegramMessageSnapshot: null,
      });

      mockCreate.mockResolvedValue({
        id: 555, postId: 99, order: 0, messageType: 'text',
        text: 'legacy content', entities: [{ type: 'bold', offset: 0, length: 7 }],
        parseMode: 'None', mediaFileId: null, caption: null, captionEntities: [],
        replyMarkup: null, delayMs: 0,
      });

      const rows = await migrateSinglePost(99);
      expect(rows).toHaveLength(1);
      expect(rows[0].text).toBe('legacy content');
    });
  });
});
