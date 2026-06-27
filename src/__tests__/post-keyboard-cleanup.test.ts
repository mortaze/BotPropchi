import { describe, expect, it, vi, beforeEach } from 'vitest';

// ─── Mock prisma ─────────────────────────────────────────────
const keyboards: any[] = [];
const messages: any[] = [];

vi.mock('../prisma/client', () => ({
  prisma: {
    postMessage: {
      findMany: vi.fn().mockImplementation(() => Promise.resolve(messages)),
      findUnique: vi.fn().mockImplementation(({ where }: any) => Promise.resolve(messages.find(m => m.id === where.id) || null)),
      create: vi.fn().mockImplementation(({ data }: any) => {
        const msg = { id: Date.now() + Math.random(), ...data };
        messages.push(msg);
        return Promise.resolve(msg);
      }),
      createMany: vi.fn(),
      delete: vi.fn().mockImplementation(({ where }: any) => {
        const idx = messages.findIndex(m => m.id === where.id);
        if (idx >= 0) messages.splice(idx, 1);
        return Promise.resolve({});
      }),
      deleteMany: vi.fn().mockImplementation(({ where }: any) => {
        if (where.postId !== undefined) {
          for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].postId === where.postId) messages.splice(i, 1);
          }
        }
        return Promise.resolve({});
      }),
      aggregate: vi.fn().mockResolvedValue({ _max: { order: null } }),
      update: vi.fn(),
    },
    postKeyboard: {
      findMany: vi.fn().mockImplementation(({ where }: any) => {
        return Promise.resolve(keyboards.filter(kb => {
          if (where.messageId !== undefined) return kb.messageId === where.messageId;
          if (where.postId !== undefined) return kb.postId === where.postId;
          return true;
        }));
      }),
      create: vi.fn().mockImplementation(({ data }: any) => {
        const kb = { id: Date.now() + Math.random(), ...data };
        keyboards.push(kb);
        return Promise.resolve(kb);
      }),
      createMany: vi.fn().mockImplementation(({ data }: any) => {
        for (const item of data) {
          keyboards.push({ id: Date.now() + Math.random(), ...item });
        }
        return Promise.resolve({});
      }),
      deleteMany: vi.fn().mockImplementation(({ where }: any) => {
        for (let i = keyboards.length - 1; i >= 0; i--) {
          const kb = keyboards[i];
          if (where.messageId !== undefined && kb.messageId === where.messageId) {
            keyboards.splice(i, 1);
          } else if (where.postId !== undefined && kb.postId === where.postId && where.messageId === null && kb.messageId == null) {
            keyboards.splice(i, 1);
          }
        }
        return Promise.resolve({});
      }),
    },
    $transaction: vi.fn().mockImplementation((ops: any[]) => Promise.all(ops)),
  },
}));

vi.mock('../services/post.service', () => ({
  postService: {
    findById: vi.fn(),
    invalidateCache: vi.fn(),
  },
}));

vi.mock('../utils/cache', () => ({
  cache: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    delByPrefix: vi.fn(),
  },
}));

vi.mock('../utils/logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  traceLogger: { info: vi.fn(), debug: vi.fn() },
}));

import { prisma } from '../prisma/client';
import { postService } from '../services/post.service';
import { postMessageService } from '../services/post-message.service';

// ─── Tests ───────────────────────────────────────────────────

describe('Post keyboard cleanup on message delete', () => {
  beforeEach(() => {
    keyboards.length = 0;
    messages.length = 0;
    vi.clearAllMocks();
  });

  it('delete message removes all keyboards for that messageId', async () => {
    // Create a message
    const msg = await prisma.postMessage.create({ data: {
      postId: 1, order: 0, messageType: 'text', text: 'test',
      entities: [], parseMode: 'None', captionEntities: [], delayMs: 0,
    }});

    // Add keyboards for that message
    keyboards.push(
      { id: 1, postId: 1, messageId: msg.id, row: 0, col: 0, text: 'Btn1', type: 'URL', value: 'https://a.com' },
      { id: 2, postId: 1, messageId: msg.id, row: 0, col: 1, text: 'Btn2', type: 'CALLBACK', value: 'cb1' },
    );

    expect(keyboards.length).toBe(2);

    // Delete the message
    await postMessageService.delete(msg.id);

    // Keyboards must be gone
    const remaining = await prisma.postKeyboard.findMany({ where: { messageId: msg.id } });
    expect(remaining.length).toBe(0);
  });

  it('delete message does NOT remove keyboards belonging to other messages', async () => {
    const msg1 = await prisma.postMessage.create({ data: {
      postId: 1, order: 0, messageType: 'text', text: 'msg1',
      entities: [], parseMode: 'None', captionEntities: [], delayMs: 0,
    }});
    const msg2 = await prisma.postMessage.create({ data: {
      postId: 1, order: 1, messageType: 'text', text: 'msg2',
      entities: [], parseMode: 'None', captionEntities: [], delayMs: 0,
    }});

    keyboards.push(
      { id: 1, postId: 1, messageId: msg1.id, row: 0, col: 0, text: 'Btn1', type: 'URL', value: 'https://a.com' },
      { id: 2, postId: 1, messageId: msg2.id, row: 0, col: 0, text: 'Btn2', type: 'URL', value: 'https://b.com' },
    );

    // Delete msg1 only
    await postMessageService.delete(msg1.id);

    // msg1 keyboards gone
    const remaining1 = await prisma.postKeyboard.findMany({ where: { messageId: msg1.id } });
    expect(remaining1.length).toBe(0);

    // msg2 keyboards still exist
    const remaining2 = await prisma.postKeyboard.findMany({ where: { messageId: msg2.id } });
    expect(remaining2.length).toBe(1);
    expect(remaining2[0].text).toBe('Btn2');
  });

  it('new message starts with empty keyboards', async () => {
    const msg = await prisma.postMessage.create({ data: {
      postId: 1, order: 0, messageType: 'text', text: 'fresh',
      entities: [], parseMode: 'None', captionEntities: [], delayMs: 0,
    }});

    // No keyboards should exist for a newly created message
    const kbs = await prisma.postKeyboard.findMany({ where: { messageId: msg.id } });
    expect(kbs.length).toBe(0);
  });

  it('full cycle: create msg with buttons → delete → create new msg → editor shows empty', async () => {
    // Step 1: Create message with buttons
    const msg1 = await prisma.postMessage.create({ data: {
      postId: 1, order: 0, messageType: 'text', text: 'first',
      entities: [], parseMode: 'None', captionEntities: [], delayMs: 0,
    }});
    await prisma.postKeyboard.createMany({ data: [
      { postId: 1, messageId: msg1.id, row: 0, col: 0, text: 'OldBtn', type: 'URL', value: 'https://old.com' },
    ]});

    let kbs = await prisma.postKeyboard.findMany({ where: { messageId: msg1.id } });
    expect(kbs.length).toBe(1);
    expect(kbs[0].text).toBe('OldBtn');

    // Step 2: Delete the message
    await postMessageService.delete(msg1.id);

    // Step 3: Create new message
    const msg2 = await prisma.postMessage.create({ data: {
      postId: 1, order: 1, messageType: 'text', text: 'second',
      entities: [], parseMode: 'None', captionEntities: [], delayMs: 0,
    }});

    // Step 4: Editor for new message shows zero buttons
    kbs = await prisma.postKeyboard.findMany({ where: { messageId: msg2.id } });
    expect(kbs.length).toBe(0);

    // Step 5: Add button to new message — only that button exists
    await prisma.postKeyboard.createMany({ data: [
      { postId: 1, messageId: msg2.id, row: 0, col: 0, text: 'NewBtn', type: 'URL', value: 'https://new.com' },
    ]});

    kbs = await prisma.postKeyboard.findMany({ where: { messageId: msg2.id } });
    expect(kbs.length).toBe(1);
    expect(kbs[0].text).toBe('NewBtn');
  });
});
