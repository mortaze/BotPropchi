import { cache } from '../../utils/cache';
import { logger } from '../../utils/logger';

interface InlineKeyboardSession {
  chatId: number;
  messageId: number;
  postId: number;
  state: string;
  createdAt: number;
}

const SESSION_PREFIX = 'iks:';

function sessionKey(chatId: number, messageId: number): string {
  return `${SESSION_PREFIX}${chatId}:${messageId}`;
}

function chatSessionsKey(chatId: number): string {
  return `${SESSION_PREFIX}chat:${chatId}`;
}

class InlineKeyboardSessionManager {
  register(chatId: number, messageId: number, postId: number, state: string): void {
    const session: InlineKeyboardSession = {
      chatId,
      messageId,
      postId,
      state,
      createdAt: Date.now(),
    };
    cache.set(sessionKey(chatId, messageId), session, 600);

    const existing = cache.get<number[]>(chatSessionsKey(chatId)) || [];
    if (!existing.includes(messageId)) {
      existing.push(messageId);
      cache.set(chatSessionsKey(chatId), existing, 600);
    }
  }

  get(chatId: number, messageId: number): InlineKeyboardSession | undefined {
    return cache.get<InlineKeyboardSession>(sessionKey(chatId, messageId));
  }

  findByPostId(chatId: number, postId: number): InlineKeyboardSession[] {
    const ids = cache.get<number[]>(chatSessionsKey(chatId)) || [];
    const results: InlineKeyboardSession[] = [];
    for (const mid of ids) {
      const s = cache.get<InlineKeyboardSession>(sessionKey(chatId, mid));
      if (s && s.postId === postId) results.push(s);
    }
    return results;
  }

  remove(chatId: number, messageId: number): void {
    cache.del(sessionKey(chatId, messageId));
    const existing = cache.get<number[]>(chatSessionsKey(chatId)) || [];
    const idx = existing.indexOf(messageId);
    if (idx >= 0) {
      existing.splice(idx, 1);
      if (existing.length > 0) {
        cache.set(chatSessionsKey(chatId), existing, 600);
      } else {
        cache.del(chatSessionsKey(chatId));
      }
    }
  }

  removeAllForChat(chatId: number): void {
    const ids = cache.get<number[]>(chatSessionsKey(chatId)) || [];
    for (const mid of ids) {
      cache.del(sessionKey(chatId, mid));
    }
    cache.del(chatSessionsKey(chatId));
  }

  removeAllForPost(chatId: number, postId: number): void {
    const ids = cache.get<number[]>(chatSessionsKey(chatId)) || [];
    for (const mid of ids) {
      const s = cache.get<InlineKeyboardSession>(sessionKey(chatId, mid));
      if (s && s.postId === postId) {
        cache.del(sessionKey(chatId, mid));
      }
    }
    const remaining = (cache.get<number[]>(chatSessionsKey(chatId)) || []).filter((mid) => {
      const s = cache.get<InlineKeyboardSession>(sessionKey(chatId, mid));
      return s && s.postId !== postId;
    });
    if (remaining.length > 0) {
      cache.set(chatSessionsKey(chatId), remaining, 600);
    } else {
      cache.del(chatSessionsKey(chatId));
    }
  }

  async deleteMessage(ctx: any, chatId: number, messageId: number): Promise<boolean> {
    try {
      await ctx.deleteMessage(messageId);
      this.remove(chatId, messageId);
      return true;
    } catch (e: any) {
      this.remove(chatId, messageId);
      return false;
    }
  }

  async safeEditWithValidation(ctx: any, chatId: number, messageId: number, text: string, extra?: any): Promise<boolean> {
    const session = this.get(chatId, messageId);
    if (!session) {
      logger.warn(`[IKS] No session for chat=${chatId} msg=${messageId} — cannot edit`);
      return false;
    }
    try {
      await ctx.editMessageText(text, extra);
      return true;
    } catch (e: any) {
      logger.debug(`[IKS] safeEdit failed for chat=${chatId} msg=${messageId}: ${e.message}`);
      this.remove(chatId, messageId);
      return false;
    }
  }
}

export const iksManager = new InlineKeyboardSessionManager();
