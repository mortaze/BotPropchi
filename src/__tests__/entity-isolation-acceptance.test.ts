import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../prisma/client', () => ({
  prisma: {
    postMessage: {
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
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
import { normalizeSingleMessage, validateMessages, buildTelegramPayload, normalizeWriteData } from '../services/post-message.service';

const mockFindMany = prisma.postMessage.findMany as ReturnType<typeof vi.fn>;
const mockFindById = postService.findById as ReturnType<typeof vi.fn>;

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
      replyWithVideo: vi.fn().mockImplementation((media: string, extra?: any) => push('sendVideo', media, extra)),
      replyWithDocument: vi.fn().mockImplementation((media: string, extra?: any) => push('sendDocument', media, extra)),
      replyWithAudio: vi.fn().mockImplementation((media: string, extra?: any) => push('sendAudio', media, extra)),
      replyWithAnimation: vi.fn().mockImplementation((media: string, extra?: any) => push('sendAnimation', media, extra)),
      replyWithVoice: vi.fn().mockImplementation((media: string, extra?: any) => push('sendVoice', media, extra)),
      replyWithMediaGroup: vi.fn().mockImplementation((media: any[]) => push('sendMediaGroup', media)),
    },
    calls,
  };
}

function makeRow(order: number, text: string, entities: any[], caption?: string, captionEntities?: any[]): any {
  return {
    id: order + 1, postId: 1, order, messageType: 'text',
    text, entities, parseMode: 'None',
    mediaFileId: null, mediaGroupId: null,
    caption: caption ?? null, captionEntities: captionEntities ?? [],
    replyMarkup: null, delayMs: 0,
  };
}

describe('ENTITY ISOLATION — Acceptance Case 1: تست بولد', () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockFindById.mockReset();
  });

  it('متن 1: پیام "تست بولد" با entity bold روی بولد — انباشته می‌شود', async () => {
    mockFindMany.mockResolvedValue([
      makeRow(0, 'تست بولد', [{ type: 'bold', offset: 4, length: 4 }]),
    ]);
    mockFindById.mockResolvedValue(null);

    const { ctx, calls } = makeMockCtx();
    await sendPostToUser(ctx, { id: 1 });

    expect(calls.length).toBe(1);
    expect(calls[0].method).toBe('sendMessage');
    const sentEntities = calls[0].args[1].entities;
    expect(sentEntities).toHaveLength(1);
    expect(sentEntities[0].type).toBe('bold');
    expect(sentEntities[0].offset).toBe(4);
    expect(sentEntities[0].length).toBe(4);
  });
});

describe('ENTITY ISOLATION — Acceptance Case 2: نقل قول + متن بولد در دو پیام', () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockFindById.mockReset();
  });

  it('دو پیام مجزا: پیام1 نقل‌قول، پیام2 بولد — استایل‌ها جابه‌جا نشود', async () => {
    mockFindMany.mockResolvedValue([
      makeRow(0, 'نقل قول', [{ type: 'blockquote', offset: 0, length: 7 }]),
      makeRow(1, 'متن بولد', [{ type: 'bold', offset: 0, length: 4 }]),
    ]);
    mockFindById.mockResolvedValue(null);

    const { ctx, calls } = makeMockCtx();
    await sendPostToUser(ctx, { id: 1 });

    expect(calls.length).toBe(2);
    // Message 1: blockquote
    expect(calls[0].method).toBe('sendMessage');
    expect(calls[0].args[0]).toBe('نقل قول');
    const msg1Entities = calls[0].args[1].entities;
    expect(msg1Entities).toHaveLength(1);
    expect(msg1Entities[0].type).toBe('blockquote');
    expect(msg1Entities[0].offset).toBe(0);
    expect(msg1Entities[0].length).toBe(7);

    // Message 2: bold (MUST NOT inherit blockquote)
    expect(calls[1].method).toBe('sendMessage');
    expect(calls[1].args[0]).toBe('متن بولد');
    const msg2Entities = calls[1].args[1].entities;
    expect(msg2Entities).toHaveLength(1);
    expect(msg2Entities[0].type).toBe('bold');
    expect(msg2Entities[0].offset).toBe(0);
    expect(msg2Entities[0].length).toBe(4);
  });

  it('سه پیام با entity‌های مختلف: bold, italic, underline — هیچکدام به دیگری نشت نمی‌کند', async () => {
    mockFindMany.mockResolvedValue([
      makeRow(0, 'bold text', [{ type: 'bold', offset: 0, length: 4 }]),
      makeRow(1, 'italic text', [{ type: 'italic', offset: 0, length: 6 }]),
      makeRow(2, 'underline text', [{ type: 'underline', offset: 0, length: 9 }]),
    ]);
    mockFindById.mockResolvedValue(null);

    const { ctx, calls } = makeMockCtx();
    await sendPostToUser(ctx, { id: 1 });

    expect(calls).toHaveLength(3);
    expect(calls[0].args[1].entities[0].type).toBe('bold');
    expect(calls[1].args[1].entities[0].type).toBe('italic');
    expect(calls[2].args[1].entities[0].type).toBe('underline');

    // Verify isolation: no message has entities from another
    for (let i = 0; i < 3; i++) {
      const types = calls[i].args[1].entities.map((e: any) => e.type);
      const expected = [['bold'], ['italic'], ['underline']][i];
      expect(types).toEqual(expected);
    }
  });
});

describe('ENTITY ISOLATION — Acceptance Case 3: Roundtrip serialization', () => {
  it('normalizeWriteData preserves entities with correct offset=0 for each message', () => {
    const data = {
      order: 0, messageType: 'text', text: 'hello world',
      entities: [{ type: 'bold', offset: 0, length: 5 }],
      captionEntities: [],
      parseMode: 'None',
    };
    const result = normalizeWriteData(1, data);
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].offset).toBe(0);
    expect(result.entities[0].length).toBe(5);
  });

  it('normalizeWriteData validates captionEntities independently from text entities', () => {
    const data = {
      order: 0, messageType: 'photo', text: 'caption text',
      entities: [],
      caption: 'caption text',
      captionEntities: [{ type: 'bold', offset: 0, length: 7 }],
    };
    const result = normalizeWriteData(1, data);
    expect(result.captionEntities).toHaveLength(1);
    // text entities remain empty
    expect(result.entities).toHaveLength(0);
  });

  it('validateMessages processes each message independently', () => {
    const messages = [
      makeRow(0, 'bold only', [{ type: 'bold', offset: 0, length: 4 }]),
      makeRow(1, 'italic only', [{ type: 'italic', offset: 0, length: 6 }]),
    ];
    const result = validateMessages(messages, 1);
    expect(result).toHaveLength(2);
    expect(result[0].entities[0].type).toBe('bold');
    expect(result[1].entities[0].type).toBe('italic');
  });

  it('validateMessages drops out-of-range entities per message independently', () => {
    const messages = [
      makeRow(0, 'hi', [{ type: 'bold', offset: 0, length: 2 }]),
      makeRow(1, 'hello', [{ type: 'bold', offset: 0, length: 10 }]),
    ];
    const result = validateMessages(messages, 1);
    expect(result[0].entities).toHaveLength(1); // valid
    expect(result[1].entities).toHaveLength(0); // OOB dropped
  });

  it('buildTelegramPayload produces per-message entities with snapshots matching send output', () => {
    const msg1 = normalizeSingleMessage(makeRow(0, 'bold', [{ type: 'bold', offset: 0, length: 4 }]));
    const payload1 = buildTelegramPayload(msg1);
    expect(payload1.method).toBe('sendMessage');
    expect((payload1 as any).entities).toHaveLength(1);
    expect((payload1 as any).entities[0]).toEqual({ type: 'bold', offset: 0, length: 4 });

    const msg2 = normalizeSingleMessage(makeRow(1, 'italic', [{ type: 'italic', offset: 0, length: 6 }]));
    const payload2 = buildTelegramPayload(msg2);
    expect(payload2.method).toBe('sendMessage');
    expect((payload2 as any).entities).toHaveLength(1);
    expect((payload2 as any).entities[0]).toEqual({ type: 'italic', offset: 0, length: 6 });
  });

  it('no parse_mode in any payload even with entities', () => {
    const msg = normalizeSingleMessage(makeRow(0, 'test', [{ type: 'bold', offset: 0, length: 4 }]));
    const payload = buildTelegramPayload(msg);
    expect((payload as any).parse_mode).toBeUndefined();
  });
});

describe('ENTITY ISOLATION — [[copy]] split with entities', () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockFindById.mockReset();
  });

  it('splits [[copy]] content and never leaks entities between segments', async () => {
    mockFindMany.mockResolvedValue([]);
    mockFindById.mockResolvedValue({
      id: 1, title: 'Test', slug: 'test',
      content: 'bold text[[copy]]italic text[[/copy]]plain',
      contentText: 'bold text[[copy]]italic text[[/copy]]plain',
      entities: [
        { type: 'bold', offset: 0, length: 4 },
        { type: 'italic', offset: 17, length: 6 },
      ],
      caption: null, captionEntities: [], mediaFileId: null, mediaType: null,
      buttons: null, telegramPayload: null, telegramMessageSnapshot: null,
      parseMode: 'None',
      command: null, status: 'DRAFT',
      isPublished: false, sortOrder: 0,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });

    const { ctx, calls } = makeMockCtx();
    await sendPostToUser(ctx, { id: 1 });

    expect(calls).toHaveLength(3);
    // Segment 0: "bold text" — has bold entity
    expect(calls[0].args[0]).toBe('bold text');
    expect(calls[0].args[1].entities).toHaveLength(1);
    expect(calls[0].args[1].entities[0].type).toBe('bold');

    // Segment 1: "italic text" — has italic entity
    expect(calls[1].args[0]).toBe('italic text');
    expect(calls[1].args[1].entities).toHaveLength(1);
    expect(calls[1].args[1].entities[0].type).toBe('italic');

    // Segment 2: "plain" — no entities
    expect(calls[2].args[0]).toBe('plain');
    expect(calls[2].args[1].entities).toBeUndefined();
  });
});

describe('ENTITY ISOLATION — Post_messages with mixed entity types', () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockFindById.mockReset();
  });

  function legacyPost(overrides: any = {}): any {
    return {
      id: 1, title: 'Mixed', slug: 'mixed',
      content: 'a b c d e f g h',
      contentText: 'a b c d e f g h',
      entities: [
        { type: 'bold', offset: 0, length: 1 },
        { type: 'italic', offset: 2, length: 1 },
        { type: 'underline', offset: 4, length: 1 },
        { type: 'strikethrough', offset: 6, length: 1 },
        { type: 'spoiler', offset: 8, length: 1 },
        { type: 'code', offset: 10, length: 1 },
        { type: 'blockquote', offset: 12, length: 1 },
        { type: 'bold', offset: 14, length: 1 },
      ],
      caption: null, captionEntities: [],
      mediaFileId: null, mediaType: null,
      buttons: null,
      telegramPayload: null, telegramMessageSnapshot: null,
      parseMode: 'None',
      command: null, status: 'DRAFT',
      isPublished: false, sortOrder: 0,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      ...overrides,
    };
  }

  it('sends 8 different entity types on a single message', async () => {
    mockFindMany.mockResolvedValue([]);
    mockFindById.mockResolvedValue(legacyPost());

    const { ctx, calls } = makeMockCtx();
    await sendPostToUser(ctx, { id: 1 });

    expect(calls[0].args[1].entities).toHaveLength(8);
    // The [[copy]] split is NOT triggered because content has no [[copy]] markers
    expect(calls[0].args[0]).toBe('a b c d e f g h');
  });

  it('nested bold inside italic isolated in a single message', async () => {
    mockFindMany.mockResolvedValue([
      makeRow(0, 'bold **bold**', [
        { type: 'italic', offset: 0, length: 12 },
        { type: 'bold', offset: 5, length: 6 },
      ]),
    ]);
    mockFindById.mockResolvedValue(null);

    const { ctx, calls } = makeMockCtx();
    await sendPostToUser(ctx, { id: 1 });

    expect(calls[0].args[1].entities).toHaveLength(2);
    expect(calls[0].args[1].entities[0].type).toBe('italic');
    expect(calls[0].args[1].entities[1].type).toBe('bold');
  });
});
