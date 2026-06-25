import { describe, expect, it, vi, beforeEach } from 'vitest';

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
import {
  validateEntityOverlap,
  validateEntityNesting,
  validateStyleEntities,
  createEntity,
  validateMessages,
  normalizeSingleMessage,
  buildTelegramPayload,
} from '../services/post-message.service';
import type { TelegramEntity } from '../services/post-message.service';

const mockFindMany = prisma.postMessage.findMany as ReturnType<typeof vi.fn>;

function makeMockCtx() {
  const calls: { method: string; args: any[] }[] = [];
  const push = (method: string, ...args: any[]) => {
    calls.push({ method, args });
    return Promise.resolve({ message_id: Date.now() });
  };
  return {
    ctx: {
      from: { id: 12345 },
      reply: vi.fn().mockImplementation((text: string, extra?: any) => push('sendMessage', text, extra)),
      replyWithPhoto: vi.fn().mockImplementation((media: string, extra?: any) => push('sendPhoto', media, extra)),
      replyWithMediaGroup: vi.fn().mockImplementation((media: any[]) => push('sendMediaGroup', media)),
      replyWithVideo: vi.fn().mockImplementation((media: string, extra?: any) => push('sendVideo', media, extra)),
      replyWithDocument: vi.fn().mockImplementation((media: string, extra?: any) => push('sendDocument', media, extra)),
      replyWithAudio: vi.fn().mockImplementation((media: string, extra?: any) => push('sendAudio', media, extra)),
      replyWithAnimation: vi.fn().mockImplementation((media: string, extra?: any) => push('sendAnimation', media, extra)),
      replyWithVoice: vi.fn().mockImplementation((media: string, extra?: any) => push('sendVoice', media, extra)),
    },
    calls,
  };
}

// ─── Entity Factory ────────────────────────────────────

describe('createEntity', () => {
  it('creates a simple entity', () => {
    const e = createEntity('bold', 0, 4);
    expect(e).toEqual({ type: 'bold', offset: 0, length: 4 });
  });

  it('throws on invalid offset', () => {
    expect(() => createEntity('bold', -1, 4)).toThrow();
    expect(() => createEntity('bold', 1.5, 4)).toThrow();
  });

  it('throws on invalid length', () => {
    expect(() => createEntity('bold', 0, 0)).toThrow();
    expect(() => createEntity('bold', 0, -1)).toThrow();
  });

  it('supports extra fields (url, user, language, custom_emoji_id)', () => {
    const e = createEntity('text_link', 0, 10, { url: 'https://example.com' });
    expect(e.type).toBe('text_link');
    expect(e.url).toBe('https://example.com');

    const e2 = createEntity('custom_emoji', 0, 1, { custom_emoji_id: '12345' });
    expect(e2.custom_emoji_id).toBe('12345');

    const e3 = createEntity('pre', 0, 5, { language: 'typescript' });
    expect(e3.language).toBe('typescript');
  });
});

// ─── Entity Validation ─────────────────────────────────

describe('validateEntityOverlap', () => {
  it('rejects partially overlapping entities of different types', () => {
    const entities: TelegramEntity[] = [
      { type: 'bold', offset: 0, length: 5 },
      { type: 'italic', offset: 3, length: 5 },
    ];
    const result = validateEntityOverlap(entities);
    expect(result.length).toBe(1);
    expect(result[0].type).toBe('bold');
  });

  it('allows non-overlapping entities', () => {
    const entities: TelegramEntity[] = [
      { type: 'bold', offset: 0, length: 3 },
      { type: 'italic', offset: 5, length: 3 },
    ];
    const result = validateEntityOverlap(entities);
    expect(result.length).toBe(2);
  });

  it('allows fully nested entities of different types', () => {
    const entities: TelegramEntity[] = [
      { type: 'bold', offset: 0, length: 10 },
      { type: 'italic', offset: 2, length: 4 },
    ];
    const result = validateEntityOverlap(entities);
    expect(result.length).toBe(2);
  });

  it('handles single entity', () => {
    const result = validateEntityOverlap([{ type: 'bold', offset: 0, length: 5 }]);
    expect(result.length).toBe(1);
  });

  it('handles empty array', () => {
    expect(validateEntityOverlap([])).toEqual([]);
  });

  it('rejects partial overlap with different lengths', () => {
    const entities: TelegramEntity[] = [
      { type: 'bold', offset: 0, length: 8 },
      { type: 'underline', offset: 4, length: 8 },
    ];
    const result = validateEntityOverlap(entities);
    expect(result.length).toBe(1);
  });
});

describe('validateEntityNesting', () => {
  it('rejects same-type nesting', () => {
    const entities: TelegramEntity[] = [
      { type: 'bold', offset: 0, length: 10 },
      { type: 'bold', offset: 2, length: 4 },
    ];
    const result = validateEntityNesting(entities);
    expect(result.length).toBe(1);
    expect(result[0]).toEqual({ type: 'bold', offset: 0, length: 10 });
  });

  it('allows different-type nesting', () => {
    const entities: TelegramEntity[] = [
      { type: 'bold', offset: 0, length: 10 },
      { type: 'italic', offset: 2, length: 4 },
    ];
    const result = validateEntityNesting(entities);
    expect(result.length).toBe(2);
  });

  it('rejects same-type partial overlap', () => {
    const entities: TelegramEntity[] = [
      { type: 'bold', offset: 0, length: 5 },
      { type: 'bold', offset: 3, length: 5 },
    ];
    const result = validateEntityNesting(entities);
    expect(result.length).toBe(1);
  });

  it('handles empty array', () => {
    expect(validateEntityNesting([])).toEqual([]);
  });
});

describe('validateStyleEntities', () => {
  it('runs overlap then nesting validation', () => {
    const entities: TelegramEntity[] = [
      { type: 'bold', offset: 0, length: 10 },
      { type: 'italic', offset: 3, length: 4 },
      { type: 'bold', offset: 5, length: 3 },
    ];
    const result = validateStyleEntities(entities);
    expect(result.length).toBe(2);
    expect(result[0].type).toBe('bold');
    expect(result[1].type).toBe('italic');
  });

  it('returns all valid entities', () => {
    const entities: TelegramEntity[] = [
      { type: 'bold', offset: 0, length: 5 },
      { type: 'italic', offset: 6, length: 4 },
      { type: 'underline', offset: 11, length: 3 },
    ];
    expect(validateStyleEntities(entities).length).toBe(3);
  });
});

// ─── Style Types in Send Pipeline ──────────────────────

describe('style types in send pipeline', () => {
  beforeEach(() => {
    mockFindMany.mockReset();
  });

  const STYLE_TYPES = [
    'bold', 'italic', 'underline', 'strikethrough', 'spoiler',
    'blockquote', 'expandable_blockquote', 'code', 'pre',
  ];

  for (const style of STYLE_TYPES) {
    it(`sends ${style} entity in payload`, async () => {
      mockFindMany.mockResolvedValue([
        { id: 1, postId: 10, order: 0, messageType: 'text', text: 'styled text', entities: [{ type: style, offset: 0, length: 6 }], parseMode: 'None', captionEntities: [], mediaFileId: null, mediaGroupId: null, caption: null, replyMarkup: [], delayMs: 0 },
      ]);

      const { ctx, calls } = makeMockCtx();
      await sendPostToUser(ctx, { id: 10 });

      expect(calls.length).toBe(1);
      expect(calls[0].method).toBe('sendMessage');
      expect(calls[0].args[1].entities).toBeDefined();
      expect(calls[0].args[1].entities[0].type).toBe(style);
    });
  }

  it('sends text_link entity with url', async () => {
    mockFindMany.mockResolvedValue([
      { id: 1, postId: 20, order: 0, messageType: 'text', text: 'click here', entities: [{ type: 'text_link', offset: 0, length: 5, url: 'https://example.com' }], parseMode: 'None', captionEntities: [], mediaFileId: null, mediaGroupId: null, caption: null, replyMarkup: [], delayMs: 0 },
    ]);

    const { ctx, calls } = makeMockCtx();
    await sendPostToUser(ctx, { id: 20 });

    expect(calls[0].args[1].entities[0].type).toBe('text_link');
    expect(calls[0].args[1].entities[0].url).toBe('https://example.com');
  });

  it('sends custom_emoji entity', async () => {
    mockFindMany.mockResolvedValue([
      { id: 1, postId: 30, order: 0, messageType: 'text', text: '🔥', entities: [{ type: 'custom_emoji', offset: 0, length: 1, custom_emoji_id: '543210' }], parseMode: 'None', captionEntities: [], mediaFileId: null, mediaGroupId: null, caption: null, replyMarkup: [], delayMs: 0 },
    ]);

    const { ctx, calls } = makeMockCtx();
    await sendPostToUser(ctx, { id: 30 });

    expect(calls[0].args[1].entities[0].type).toBe('custom_emoji');
    expect(calls[0].args[1].entities[0].custom_emoji_id).toBe('543210');
  });

  it('sends pre entity with language', async () => {
    mockFindMany.mockResolvedValue([
      { id: 1, postId: 40, order: 0, messageType: 'text', text: 'const x = 1;', entities: [{ type: 'pre', offset: 0, length: 12, language: 'javascript' }], parseMode: 'None', captionEntities: [], mediaFileId: null, mediaGroupId: null, caption: null, replyMarkup: [], delayMs: 0 },
    ]);

    const { ctx, calls } = makeMockCtx();
    await sendPostToUser(ctx, { id: 40 });

    expect(calls[0].args[1].entities[0].language).toBe('javascript');
  });
});

// ─── Nested Entities ───────────────────────────────────

describe('nested entities', () => {
  beforeEach(() => {
    mockFindMany.mockReset();
  });

  it('sends bold inside italic (different-type nesting)', async () => {
    mockFindMany.mockResolvedValue([
      { id: 1, postId: 50, order: 0, messageType: 'text', text: 'bold inside italic text', entities: [{ type: 'italic', offset: 0, length: 22 }, { type: 'bold', offset: 0, length: 4 }], parseMode: 'None', captionEntities: [], mediaFileId: null, mediaGroupId: null, caption: null, replyMarkup: [], delayMs: 0 },
    ]);

    const { ctx, calls } = makeMockCtx();
    await sendPostToUser(ctx, { id: 50 });

    expect(calls[0].args[1].entities).toBeDefined();
    const types = calls[0].args[1].entities.map((e: any) => e.type);
    expect(types).toContain('italic');
    expect(types).toContain('bold');
  });

  it('sends multiple style nesting: bold + italic + underline', async () => {
    mockFindMany.mockResolvedValue([
      { id: 1, postId: 55, order: 0, messageType: 'text', text: 'all three styled', entities: [
        { type: 'bold', offset: 0, length: 16 },
        { type: 'italic', offset: 4, length: 6 },
        { type: 'underline', offset: 10, length: 6 },
      ], parseMode: 'None', captionEntities: [], mediaFileId: null, mediaGroupId: null, caption: null, replyMarkup: [], delayMs: 0 },
    ]);

    const { ctx, calls } = makeMockCtx();
    await sendPostToUser(ctx, { id: 55 });

    expect(calls[0].args[1].entities.length).toBe(3);
  });
});

// ─── Overlap Rejection ─────────────────────────────────

describe('overlap rejection', () => {
  it('drops overlapping entities via send pipeline', async () => {
    mockFindMany.mockResolvedValue([
      { id: 1, postId: 60, order: 0, messageType: 'text', text: 'overlap text here', entities: [
        { type: 'bold', offset: 0, length: 8 },
        { type: 'italic', offset: 5, length: 8 },
      ], parseMode: 'None', captionEntities: [], mediaFileId: null, mediaGroupId: null, caption: null, replyMarkup: [], delayMs: 0 },
    ]);

    const { ctx, calls } = makeMockCtx();
    await sendPostToUser(ctx, { id: 60 });

    expect(calls[0].args[1].entities.length).toBe(1);
    expect(calls[0].args[1].entities[0].type).toBe('bold');
  });

  it('drops same-type overlapping via validateMessages', () => {
    const messages = [
      { order: 0, text: 'overlap', entities: [
        { type: 'bold', offset: 0, length: 5 },
        { type: 'bold', offset: 3, length: 4 },
      ]},
    ];
    const result = validateMessages(messages, 60);
    expect(result[0].entities.length).toBe(1);
  });
});

// ─── Multi-Message Isolation ───────────────────────────

describe('multi-message isolation', () => {
  beforeEach(() => {
    mockFindMany.mockReset();
  });

  it('entities from message 1 do not leak to message 2', async () => {
    mockFindMany.mockResolvedValue([
      { id: 1, postId: 70, order: 0, messageType: 'text', text: 'styled message', entities: [{ type: 'bold', offset: 0, length: 6 }], parseMode: 'None', captionEntities: [], mediaFileId: null, mediaGroupId: null, caption: null, replyMarkup: [], delayMs: 0 },
      { id: 2, postId: 70, order: 1, messageType: 'text', text: 'plain message', entities: [], parseMode: 'None', captionEntities: [], mediaFileId: null, mediaGroupId: null, caption: null, replyMarkup: [], delayMs: 0 },
    ]);

    const { ctx, calls } = makeMockCtx();
    await sendPostToUser(ctx, { id: 70 });

    expect(calls.length).toBe(2);
    expect(calls[0].args[1].entities.length).toBe(1);
    expect(calls[1].args[1].entities).toBeUndefined();
    expect(calls[1].args[0]).toBe('plain message');
  });

  it('different entity sets per message are independent', async () => {
    mockFindMany.mockResolvedValue([
      { id: 1, postId: 71, order: 0, messageType: 'text', text: 'hello world', entities: [{ type: 'bold', offset: 0, length: 5 }], parseMode: 'None', captionEntities: [], mediaFileId: null, mediaGroupId: null, caption: null, replyMarkup: [], delayMs: 0 },
      { id: 2, postId: 71, order: 1, messageType: 'text', text: 'foo bar baz', entities: [{ type: 'italic', offset: 4, length: 3 }], parseMode: 'None', captionEntities: [], mediaFileId: null, mediaGroupId: null, caption: null, replyMarkup: [], delayMs: 0 },
      { id: 3, postId: 71, order: 2, messageType: 'text', text: 'plain text', entities: [], parseMode: 'None', captionEntities: [], mediaFileId: null, mediaGroupId: null, caption: null, replyMarkup: [], delayMs: 0 },
    ]);

    const { ctx, calls } = makeMockCtx();
    await sendPostToUser(ctx, { id: 71 });

    expect(calls[0].args[1].entities[0].type).toBe('bold');
    expect(calls[1].args[1].entities[0].type).toBe('italic');
    expect(calls[2].args[1].entities).toBeUndefined();
  });
});

// ─── Caption Entities (Media) ──────────────────────────

describe('caption entities on media', () => {
  beforeEach(() => {
    mockFindMany.mockReset();
  });

  it('sends caption entities with photo', async () => {
    mockFindMany.mockResolvedValue([
      { id: 1, postId: 80, order: 0, messageType: 'photo', text: 'photo caption with style', entities: [], parseMode: 'None', captionEntities: [{ type: 'bold', offset: 0, length: 5 }], mediaFileId: 'AgAAAfake', mediaGroupId: null, caption: 'photo caption with style', replyMarkup: [], delayMs: 0 },
    ]);

    const { ctx, calls } = makeMockCtx();
    await sendPostToUser(ctx, { id: 80 });

    expect(calls[0].method).toBe('sendPhoto');
    expect(calls[0].args[1].caption_entities).toBeDefined();
    expect(calls[0].args[1].caption_entities[0].type).toBe('bold');
  });

  it('caption entities are isolated from text entities', async () => {
    mockFindMany.mockResolvedValue([
      { id: 1, postId: 81, order: 0, messageType: 'photo', text: 'photo caption', entities: [], parseMode: 'None', captionEntities: [{ type: 'italic', offset: 0, length: 5 }], mediaFileId: 'AgAAAfake2', mediaGroupId: null, caption: 'photo caption', replyMarkup: [], delayMs: 0 },
    ]);

    const { ctx, calls } = makeMockCtx();
    await sendPostToUser(ctx, { id: 81 });

    const params = calls[0].args[1];
    expect(params).not.toHaveProperty('entities');
    expect(params.caption_entities).toBeDefined();
    expect(params.caption_entities[0].type).toBe('italic');
  });

  it('multiple caption entity types on media', async () => {
    mockFindMany.mockResolvedValue([
      { id: 1, postId: 82, order: 0, messageType: 'video', text: 'video with bold and italic caption', entities: [], parseMode: 'None', captionEntities: [
        { type: 'bold', offset: 0, length: 5 },
        { type: 'italic', offset: 10, length: 6 },
      ], mediaFileId: 'Videofake', mediaGroupId: null, caption: 'video with bold and italic caption', replyMarkup: [], delayMs: 0 },
    ]);

    const { ctx, calls } = makeMockCtx();
    await sendPostToUser(ctx, { id: 82 });

    expect(calls[0].method).toBe('sendVideo');
    expect(calls[0].args[1].caption_entities.length).toBe(2);
  });
});

// ─── Telegram Payload Snapshot Matching ─────────────────

describe('telegram payload snapshots', () => {
  it('bold produces correct payload shape', () => {
    const row = {
      id: 1, postId: 90, order: 0, messageType: 'text',
      text: 'important announcement',
      entities: [{ type: 'bold', offset: 0, length: 9 }],
      parseMode: 'None', captionEntities: [], mediaFileId: null, mediaGroupId: null,
      caption: null, replyMarkup: null, delayMs: 0,
    };
    const msg = normalizeSingleMessage(row);
    const payload = buildTelegramPayload(msg);
    expect(payload.method).toBe('sendMessage');
    expect(payload.entities).toHaveLength(1);
    expect(payload.entities![0]).toEqual({ type: 'bold', offset: 0, length: 9 });
    expect((payload as any).parse_mode).toBeUndefined();
  });

  it('blockquote produces correct payload', () => {
    const row = {
      id: 2, postId: 90, order: 1, messageType: 'text',
      text: 'quoted text',
      entities: [{ type: 'blockquote', offset: 0, length: 11 }],
      parseMode: 'None', captionEntities: [], mediaFileId: null, mediaGroupId: null,
      caption: null, replyMarkup: null, delayMs: 0,
    };
    const msg = normalizeSingleMessage(row);
    const payload = buildTelegramPayload(msg);
    expect(payload.entities![0].type).toBe('blockquote');
    expect((payload as any).parse_mode).toBeUndefined();
  });

  it('code entity payload', () => {
    const row = {
      id: 3, postId: 90, order: 2, messageType: 'text',
      text: 'inline code here',
      entities: [{ type: 'code', offset: 0, length: 11 }],
      parseMode: 'None', captionEntities: [], mediaFileId: null, mediaGroupId: null,
      caption: null, replyMarkup: null, delayMs: 0,
    };
    const msg = normalizeSingleMessage(row);
    const payload = buildTelegramPayload(msg);
    expect(payload.entities![0].type).toBe('code');
    expect(payload.text).toBe('inline code here');
  });

  it('pre with language payload', () => {
    const row = {
      id: 4, postId: 90, order: 3, messageType: 'text',
      text: 'console.log("hello")',
      entities: [{ type: 'pre', offset: 0, length: 19, language: 'javascript' }],
      parseMode: 'None', captionEntities: [], mediaFileId: null, mediaGroupId: null,
      caption: null, replyMarkup: null, delayMs: 0,
    };
    const msg = normalizeSingleMessage(row);
    const payload = buildTelegramPayload(msg);
    expect(payload.entities![0].language).toBe('javascript');
  });

  it('no parse_mode in payload', () => {
    const row = {
      id: 5, postId: 90, order: 4, messageType: 'text',
      text: 'plain',
      entities: [],
      parseMode: 'None', captionEntities: [], mediaFileId: null, mediaGroupId: null,
      caption: null, replyMarkup: null, delayMs: 0,
    };
    const msg = normalizeSingleMessage(row);
    const payload = buildTelegramPayload(msg);
    expect((payload as any).parse_mode).toBeUndefined();
  });

  it('photo caption with entities payload', () => {
    const row = {
      id: 6, postId: 90, order: 5, messageType: 'photo',
      text: 'caption with bold',
      entities: [], parseMode: 'None',
      captionEntities: [{ type: 'bold', offset: 0, length: 7 }],
      mediaFileId: 'fakeid', mediaGroupId: null,
      caption: 'caption with bold',
      replyMarkup: null, delayMs: 0,
    };
    const msg = normalizeSingleMessage(row);
    const payload = buildTelegramPayload(msg);
    const p = payload as any;
    expect(p.caption_entities).toHaveLength(1);
    expect(p.caption_entities[0].type).toBe('bold');
    expect(p.parse_mode).toBeUndefined();
  });

  it('photo produces sendPhoto payload with caption entities', () => {
    const row = {
      id: 8, postId: 90, order: 7, messageType: 'photo',
      text: 'photo caption text',
      entities: [], parseMode: 'None',
      captionEntities: [{ type: 'bold', offset: 0, length: 5 }],
      mediaFileId: 'realphoto', mediaGroupId: null,
      caption: 'photo caption text',
      replyMarkup: null, delayMs: 0,
    };
    const msg = normalizeSingleMessage(row);
    const payload = buildTelegramPayload(msg);
    const p = payload as any;
    expect(p.caption).toBe('photo caption text');
    expect(p.caption_entities).toBeDefined();
    expect(p.parse_mode).toBeUndefined();
  });

  it('strikethrough and spoiler together (nested, same scope)', () => {
    const row = {
      id: 7, postId: 90, order: 6, messageType: 'text',
      text: 'secret strike',
      entities: [
        { type: 'strikethrough', offset: 0, length: 12 },
        { type: 'spoiler', offset: 0, length: 12 },
      ],
      parseMode: 'None', captionEntities: [], mediaFileId: null, mediaGroupId: null,
      caption: null, replyMarkup: null, delayMs: 0,
    };
    const msg = normalizeSingleMessage(row);
    const payload = buildTelegramPayload(msg);
    expect(payload.entities!.length).toBe(2);
    const types = payload.entities!.map(e => e.type);
    expect(types).toContain('strikethrough');
    expect(types).toContain('spoiler');
  });
});

// ─── Invalid Entity Handling ───────────────────────────

describe('invalid entity handling', () => {
  it('drops entities exceeding text length', () => {
    const messages = [
      { order: 0, text: 'abc', entities: [{ type: 'bold', offset: 0, length: 10 }] },
    ];
    const result = validateMessages(messages, 1);
    expect(result[0].entities).toEqual([]);
  });

  it('drops entities with negative offset', () => {
    const messages = [
      { order: 0, text: 'abc', entities: [{ type: 'bold', offset: -1, length: 2 }] },
    ];
    const result = validateMessages(messages, 1);
    expect(result[0].entities).toEqual([]);
  });

  it('drops entities with zero length', () => {
    const messages = [
      { order: 0, text: 'abc', entities: [{ type: 'bold', offset: 0, length: 0 }] },
    ];
    const result = validateMessages(messages, 1);
    expect(result[0].entities).toEqual([]);
  });
});

// ─── All 22 Entity Types Support ───────────────────────

describe('all 22 entity types accepted by normalizeSingleMessage', () => {
  const ALL_ENTITY_TYPES = [
    'mention', 'hashtag', 'cashtag', 'bot_command',
    'url', 'email', 'phone_number',
    'bold', 'italic', 'underline', 'strikethrough', 'spoiler',
    'blockquote', 'expandable_blockquote',
    'code', 'pre',
    'text_link', 'text_mention', 'custom_emoji',
  ];
  const extra = [
    { type: 'text_link', extra: { url: 'https://t.me' } },
    { type: 'custom_emoji', extra: { custom_emoji_id: '123' } },
    { type: 'pre', extra: { language: 'python' } },
  ];

  for (const type of ALL_ENTITY_TYPES) {
    it(`accepts entity type: ${type}`, () => {
      const text = 'test text for entity type';
      const offset = 0;
      const length = type === 'bot_command' ? 5 : 4;
      const e: any = { type, offset, length: length > text.length ? text.length : length };
      const extraField = extra.find(x => x.type === type);
      if (extraField) Object.assign(e, extraField.extra);

      const row = {
        id: 1, postId: 1, order: 0, messageType: 'text',
        text,
        entities: [e],
        parseMode: 'None', captionEntities: [], mediaFileId: null, mediaGroupId: null,
        caption: null, replyMarkup: null, delayMs: 0,
      };
      const msg = normalizeSingleMessage(row);
      expect(msg.entities.length).toBe(1);
      expect(msg.entities[0].type).toBe(type);
    });
  }
});
