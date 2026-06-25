import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../prisma/client', () => ({
  prisma: {
    postMessage: {
      findMany: vi.fn(),
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
import { legacyBuildVirtualMessages } from '../services/post-message.service';

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

// ─── Legacy Post Types ────────────────────────────────

function legacyTextPost(id: number, text: string, entities?: any[]): any {
  return {
    id, title: `Post ${id}`, slug: `post-${id}`,
    content: text, contentText: text, contentFormat: 'telegram_entities',
    entities: entities ?? [],
    contentEntities: entities ?? [],
    parseMode: 'None',
    caption: null, captionEntities: [],
    mediaFileId: null, mediaGroupId: null, mediaType: null,
    buttons: null, telegramPayload: null, telegramMessageSnapshot: null,
    command: null, status: 'DRAFT',
    isPublished: false, sortOrder: 0,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

describe('legacyBuildVirtualMessages', () => {
  it('builds single message from legacy content with entities', async () => {
    const post = legacyTextPost(1, 'bold and italic text', [
      { type: 'bold', offset: 0, length: 4 },
      { type: 'italic', offset: 9, length: 6 },
    ]);
    const messages = await legacyBuildVirtualMessages(post);
    expect(messages).toHaveLength(1);
    expect(messages[0].text).toBe('bold and italic text');
    expect(messages[0].entities).toHaveLength(2);
    expect(messages[0].entities[0].type).toBe('bold');
    expect(messages[0].entities[1].type).toBe('italic');
  });

  it('builds single message from legacy contentText + entities', async () => {
    const post = legacyTextPost(2, 'hello world', [{ type: 'bold', offset: 0, length: 5 }]);
    const messages = await legacyBuildVirtualMessages(post);
    expect(messages).toHaveLength(1);
    expect(messages[0].text).toBe('hello world');
    expect(messages[0].entities[0].type).toBe('bold');
  });

  it('handles empty content gracefully', async () => {
    const post = legacyTextPost(3, '');
    const messages = await legacyBuildVirtualMessages(post);
    expect(messages).toHaveLength(0);
  });

  it('extracts message from telegramMessageSnapshot', async () => {
    const post = {
      ...legacyTextPost(4, 'fallback text'),
      telegramMessageSnapshot: {
        text: 'snapshot text', entities: [{ type: 'bold', offset: 0, length: 8 }],
      },
    };
    const messages = await legacyBuildVirtualMessages(post);
    expect(messages).toHaveLength(1);
    expect(messages[0].text).toBe('snapshot text');
    expect(messages[0].entities[0].type).toBe('bold');
  });

  it('extracts messages from telegramPayload.messages', async () => {
    const post = {
      ...legacyTextPost(5, ''),
      telegramPayload: {
        messages: [
          { text: 'msg one', entities: [{ type: 'bold', offset: 0, length: 3 }] },
          { text: 'msg two', entities: [{ type: 'italic', offset: 0, length: 3 }] },
        ],
      },
    };
    const messages = await legacyBuildVirtualMessages(post);
    expect(messages).toHaveLength(2);
    expect(messages[0].text).toBe('msg one');
    expect(messages[0].entities[0].type).toBe('bold');
    expect(messages[1].text).toBe('msg two');
    expect(messages[1].entities[0].type).toBe('italic');
  });

  it('splits [[copy]] markers into multiple messages', async () => {
    const post = legacyTextPost(6, 'first message[[copy]]second message[[/copy]]third message');
    const messages = await legacyBuildVirtualMessages(post);
    expect(messages).toHaveLength(3);
    expect(messages[0].text).toBe('first message');
    expect(messages[1].text).toBe('second message');
    expect(messages[2].text).toBe('third message');
  });

  it('resolves absolute entities per [[copy]] segment', async () => {
    const post = legacyTextPost(7, 'bold first[[copy]]italic second[[/copy]]plain third', [
      { type: 'bold', offset: 0, length: 10 },
      { type: 'italic', offset: 13, length: 12 },
    ]);
    const messages = await legacyBuildVirtualMessages(post);
    expect(messages).toHaveLength(3);
    expect(messages[0].entities).toHaveLength(1);
    expect(messages[0].entities[0].type).toBe('bold');
    expect(messages[0].entities[0].offset).toBe(0);
    expect(messages[1].entities).toHaveLength(1);
    expect(messages[1].entities[0].type).toBe('italic');
    expect(messages[1].entities[0].offset).toBe(0);
    expect(messages[2].entities).toHaveLength(0);
  });

  it('preserves bold entity in legacy post', async () => {
    const post = legacyTextPost(8, 'important announcement', [
      { type: 'bold', offset: 0, length: 9 },
    ]);
    const messages = await legacyBuildVirtualMessages(post);
    expect(messages[0].entities[0].type).toBe('bold');
    expect(messages[0].entities[0].offset).toBe(0);
    expect(messages[0].entities[0].length).toBe(9);
  });

  it('preserves italic entity in legacy post', async () => {
    const post = legacyTextPost(9, 'emphasized word here', [
      { type: 'italic', offset: 0, length: 10 },
    ]);
    const messages = await legacyBuildVirtualMessages(post);
    expect(messages[0].entities[0].type).toBe('italic');
  });

  it('preserves blockquote entity', async () => {
    const post = legacyTextPost(10, '> quoted text', [
      { type: 'blockquote', offset: 0, length: 12 },
    ]);
    const messages = await legacyBuildVirtualMessages(post);
    expect(messages[0].entities[0].type).toBe('blockquote');
  });

  it('preserves code entity', async () => {
    const post = legacyTextPost(11, 'inline code here', [
      { type: 'code', offset: 0, length: 11 },
    ]);
    const messages = await legacyBuildVirtualMessages(post);
    expect(messages[0].entities[0].type).toBe('code');
  });

  it('preserves spoiler entity', async () => {
    const post = legacyTextPost(12, 'secret spoiler text', [
      { type: 'spoiler', offset: 0, length: 6 },
    ]);
    const messages = await legacyBuildVirtualMessages(post);
    expect(messages[0].entities[0].type).toBe('spoiler');
  });

  it('preserves text_link with url', async () => {
    const post = legacyTextPost(13, 'click here', [
      { type: 'text_link', offset: 0, length: 5, url: 'https://example.com' },
    ]);
    const messages = await legacyBuildVirtualMessages(post);
    expect(messages[0].entities[0].type).toBe('text_link');
    expect(messages[0].entities[0].url).toBe('https://example.com');
  });

  it('preserves pre with language', async () => {
    const post = legacyTextPost(14, 'const x = 1;', [
      { type: 'pre', offset: 0, length: 12, language: 'javascript' },
    ]);
    const messages = await legacyBuildVirtualMessages(post);
    expect(messages[0].entities[0].language).toBe('javascript');
  });

  it('preserves underline + strikethrough together', async () => {
    const post = legacyTextPost(15, 'underlined and struck', [
      { type: 'underline', offset: 0, length: 20 },
      { type: 'strikethrough', offset: 0, length: 20 },
    ]);
    const messages = await legacyBuildVirtualMessages(post);
    expect(messages[0].entities).toHaveLength(2);
    const types = messages[0].entities.map((e: any) => e.type);
    expect(types).toContain('underline');
    expect(types).toContain('strikethrough');
  });

  it('preserves custom_emoji', async () => {
    const post = legacyTextPost(16, '🔥', [
      { type: 'custom_emoji', offset: 0, length: 1, custom_emoji_id: '543210' },
    ]);
    const messages = await legacyBuildVirtualMessages(post);
    expect(messages[0].entities[0].custom_emoji_id).toBe('543210');
  });

  it('preserves caption + captionEntities for media posts', async () => {
    const post = {
      ...legacyTextPost(17, 'photo caption', []),
      caption: 'photo caption',
      captionEntities: [{ type: 'bold', offset: 0, length: 5 }],
      mediaFileId: 'AgAAAfake',
      mediaType: 'photo',
    };
    const messages = await legacyBuildVirtualMessages(post);
    expect(messages).toHaveLength(1);
    expect(messages[0].caption).toBe('photo caption');
    expect(messages[0].captionEntities[0].type).toBe('bold');
    expect(messages[0].mediaFileId).toBe('AgAAAfake');
  });
});

describe('sendPostToUser — backward compatibility', () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockFindById.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('falls back to legacy post when post_messages is empty', async () => {
    mockFindMany.mockResolvedValue([]);
    mockFindById.mockResolvedValue(legacyTextPost(100, 'hello world from legacy', [
      { type: 'bold', offset: 0, length: 5 },
    ]));

    const { ctx, calls } = makeMockCtx();
    await sendPostToUser(ctx, { id: 100 });

    expect(calls.length).toBe(1);
    expect(calls[0].method).toBe('sendMessage');
    expect(calls[0].args[0]).toBe('hello world from legacy');
    expect(calls[0].args[1].entities[0].type).toBe('bold');
  });

  it('sends legacy post with bold entity via fallback', async () => {
    mockFindMany.mockResolvedValue([]);
    mockFindById.mockResolvedValue(legacyTextPost(101, 'important text', [
      { type: 'bold', offset: 0, length: 9 },
    ]));

    const { ctx, calls } = makeMockCtx();
    await sendPostToUser(ctx, { id: 101 });

    expect(calls[0].args[1].entities[0]).toEqual({ type: 'bold', offset: 0, length: 9 });
  });

  it('sends legacy post with italic entity via fallback', async () => {
    mockFindMany.mockResolvedValue([]);
    mockFindById.mockResolvedValue(legacyTextPost(102, 'italic text', [
      { type: 'italic', offset: 0, length: 6 },
    ]));

    const { ctx, calls } = makeMockCtx();
    await sendPostToUser(ctx, { id: 102 });

    expect(calls[0].args[1].entities[0].type).toBe('italic');
  });

  it('sends legacy post with quote + code entities', async () => {
    mockFindMany.mockResolvedValue([]);
    mockFindById.mockResolvedValue(legacyTextPost(103, 'quote then code', [
      { type: 'blockquote', offset: 0, length: 5 },
      { type: 'code', offset: 11, length: 4 },
    ]));

    const { ctx, calls } = makeMockCtx();
    await sendPostToUser(ctx, { id: 103 });

    expect(calls[0].args[1].entities).toHaveLength(2);
    const types = calls[0].args[1].entities.map((e: any) => e.type);
    expect(types).toContain('blockquote');
    expect(types).toContain('code');
  });

  it('sends media post with caption entities via fallback', async () => {
    mockFindMany.mockResolvedValue([]);
    mockFindById.mockResolvedValue({
      ...legacyTextPost(104, 'photo caption', []),
      caption: 'photo caption',
      captionEntities: [{ type: 'bold', offset: 0, length: 5 }],
      mediaFileId: 'AgAAAfake',
      mediaType: 'photo',
    });

    const { ctx, calls } = makeMockCtx();
    await sendPostToUser(ctx, { id: 104 });

    expect(calls[0].method).toBe('sendPhoto');
    expect(calls[0].args[1].caption_entities).toBeDefined();
    expect(calls[0].args[1].caption_entities[0].type).toBe('bold');
  });

  it('shows error when legacy post not found in DB', async () => {
    mockFindMany.mockResolvedValue([]);
    mockFindById.mockResolvedValue(null);

    const { ctx, calls } = makeMockCtx();
    await sendPostToUser(ctx, { id: 999 });

    expect(calls.length).toBe(1);
    expect(calls[0].args[0]).toContain('❌');
  });

  it('shows error when legacy post has no content at all', async () => {
    mockFindMany.mockResolvedValue([]);
    mockFindById.mockResolvedValue(legacyTextPost(200, ''));

    const { ctx, calls } = makeMockCtx();
    await sendPostToUser(ctx, { id: 200 });

    expect(calls.length).toBe(1);
    expect(calls[0].args[0]).toContain('❌');
  });

  it('uses post_messages when they exist (no fallback)', async () => {
    mockFindMany.mockResolvedValue([
      { id: 1, postId: 300, order: 0, messageType: 'text', text: 'from messages', entities: [], parseMode: 'None', captionEntities: [], mediaFileId: null, mediaGroupId: null, caption: null, replyMarkup: [], delayMs: 0 },
    ]);
    mockFindById.mockResolvedValue(legacyTextPost(300, 'from legacy (should be ignored)'));

    const { ctx, calls } = makeMockCtx();
    await sendPostToUser(ctx, { id: 300 });

    expect(calls[0].args[0]).toBe('from messages');
    expect(mockFindById).not.toHaveBeenCalled();
  });

  it('handles template vars with legacy fallback', async () => {
    mockFindMany.mockResolvedValue([]);
    mockFindById.mockResolvedValue(legacyTextPost(400, 'Hello {first_name}', [
      { type: 'bold', offset: 0, length: 5 },
    ]));

    const { ctx, calls } = makeMockCtx();
    await sendPostToUser(ctx, { id: 400 }, { first_name: 'Ali' });

    expect(calls[0].args[0]).toBe('Hello Ali');
    expect(calls[0].args[1].entities[0].type).toBe('bold');
  });

  it('splits [[copy]] in legacy fallback with correct entities per segment', async () => {
    mockFindMany.mockResolvedValue([]);
    mockFindById.mockResolvedValue(legacyTextPost(500, 'bold first[[copy]]italic second[[/copy]]plain', [
      { type: 'bold', offset: 0, length: 10 },
      { type: 'italic', offset: 13, length: 12 },
    ]));

    const { ctx, calls } = makeMockCtx();
    await sendPostToUser(ctx, { id: 500 });

    expect(calls).toHaveLength(3);
    expect(calls[0].args[0]).toBe('bold first');
    expect(calls[0].args[1].entities[0].type).toBe('bold');
    expect(calls[1].args[0]).toBe('italic second');
    expect(calls[1].args[1].entities[0].type).toBe('italic');
    expect(calls[2].args[0]).toBe('plain');
    expect(calls[2].args[1].entities).toBeUndefined();
  });

  it('legacy post with media + caption + buttons preserves all', async () => {
    mockFindMany.mockResolvedValue([]);
    mockFindById.mockResolvedValue({
      ...legacyTextPost(600, 'media caption', []),
      caption: 'media caption',
      captionEntities: [{ type: 'italic', offset: 0, length: 5 }],
      mediaFileId: 'Videofake',
      mediaType: 'video',
      buttons: [[{ text: 'Click', url: 'https://example.com' }]],
    });

    const { ctx, calls } = makeMockCtx();
    await sendPostToUser(ctx, { id: 600 });

    expect(calls[0].method).toBe('sendVideo');
    expect(calls[0].args[1].caption_entities[0].type).toBe('italic');
    expect(calls[0].args[1].reply_markup).toBeDefined();
  });
});
