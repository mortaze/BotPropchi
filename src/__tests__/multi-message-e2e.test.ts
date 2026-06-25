import { describe, expect, it, vi, afterEach } from 'vitest';
import { sendPostToUser } from '../bot/shared';

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

// Mock the post service incrementViews to no-op
vi.mock('../services/post.service', () => ({
  postService: {
    incrementViews: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('sendPostToUser e2e — multi-message pipeline', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('sends 2 separate messages via post_messages pipeline with correct entity isolation', async () => {
    const { ctx, calls } = makeMockCtx();

    const postWithMessages = {
      id: 4,
      title: 'Test Post',
      status: 'PUBLISHED',
      isPublished: true,
      messages: [
        {
          id: 10,
          postId: 4,
          order: 0,
          messageType: 'text',
          text: 'این یک متن با بولد و بلاک‌کوت است',
          entities: [
            { type: 'blockquote', offset: 0, length: 4 },
            { type: 'bold', offset: 5, length: 4 },
          ],
          parseMode: 'None',
          mediaFileId: null,
          mediaGroupId: null,
          caption: null,
          captionEntities: [],
          replyMarkup: [],
          delayMs: 0,
        },
        {
          id: 11,
          postId: 4,
          order: 1,
          messageType: 'text',
          text: 'این یک متن ساده و بدون هیچ فرمت خاصی است',
          entities: [],
          parseMode: 'None',
          mediaFileId: null,
          mediaGroupId: null,
          caption: null,
          captionEntities: [],
          replyMarkup: [],
          delayMs: 0,
        },
      ],
    };

    await sendPostToUser(ctx, postWithMessages);

    // Exactly 2 calls
    expect(calls.length).toBe(2);
    expect(calls[0].method).toBe('sendMessage');
    expect(calls[1].method).toBe('sendMessage');

    // First message: has entities
    const firstExtra = calls[0].args[1];
    expect(firstExtra.entities).toEqual([
      { type: 'blockquote', offset: 0, length: 4 },
      { type: 'bold', offset: 5, length: 4 },
    ]);

    // Second message: no entities, plain text
    const secondExtra = calls[1].args[1];
    expect(secondExtra.entities).toBeUndefined();

    // Second message text is untouched
    expect(calls[1].args[0]).toBe('این یک متن ساده و بدون هیچ فرمت خاصی است');

    // First message text is untouched
    expect(calls[0].args[0]).toBe('این یک متن با بولد و بلاک‌کوت است');
  });

  it('falls back to renderPostToTelegram when post has no messages (empty array)', async () => {
    const { ctx, calls } = makeMockCtx();

    // Mock renderPostToTelegram dependency
    const renderer = await import('../services/post-renderer.service');
    const renderSpy = vi.spyOn(renderer, 'renderPostToTelegram').mockResolvedValue(true as never);

    const postWithoutMessages = {
      id: 5,
      title: 'Legacy Post',
      status: 'PUBLISHED',
      isPublished: true,
      content: 'Old content without messages',
      entities: [{ type: 'bold', offset: 0, length: 3 }],
      messages: [],
    };

    await sendPostToUser(ctx, postWithoutMessages);

    expect(renderSpy).toHaveBeenCalledTimes(1);
    expect(renderSpy).toHaveBeenCalledWith(ctx, postWithoutMessages);

    renderSpy.mockRestore();
  });
});
