import { sanitizeTelegramText, sanitizeTelegramExtra } from '../utils/unicode';
import { logger } from '../utils/logger';
import { postService } from '../services/post.service';
import { sendPostToChat } from '../services/post-message.service';
import { cache } from '../utils/cache';

const EDIT_NAV_KEY = 'post:editNav:';
function editNavCache(userId: number, postId: number) { return `${EDIT_NAV_KEY}${userId}:${postId}`; }

export function storeEditNavMessage(userId: number, postId: number, messageId: number) {
  cache.setPermanent(editNavCache(userId, postId), messageId);
}
export function getEditNavMessage(userId: number, postId: number): number | undefined {
  return cache.get<number>(editNavCache(userId, postId));
}

export async function safeEdit(ctx: any, text: string, extra?: any): Promise<void> {
  const safeText = sanitizeTelegramText(text, 4096);
  const safeExtra = sanitizeTelegramExtra(extra);
  if (ctx.callbackQuery?.message) {
    try {
      await ctx.editMessageText(safeText, safeExtra);
      return;
    } catch (e: any) {
      logger.debug('[safeEdit] Fallback to reply:', e.description || e.message);
    }
  }
  await ctx.reply(safeText, safeExtra).catch(() => {});
}

export async function sendPostToUser(ctx: any, rawPost: any, templateVars?: Record<string, string>, lastMessageOptions?: any) {
  const postId = rawPost.id;
  await postService.incrementViews(postId, undefined, BigInt(ctx.from.id));
  await sendPostToChat(ctx, postId, templateVars, lastMessageOptions);
}

export async function sendOrEditPostToUser(ctx: any, rawPost: any, templateVars?: Record<string, string>): Promise<void> {
  const postId = rawPost.id;
  const userId = ctx.from?.id;
  await postService.incrementViews(postId, undefined, BigInt(userId));

  if (!(rawPost as any).editNavigation) {
    await sendPostToChat(ctx, postId, templateVars);
    return;
  }

  const storedMsgId = getEditNavMessage(userId, postId);
  const cbMsgId = ctx.callbackQuery?.message?.message_id;
  const targetMsgId = storedMsgId || cbMsgId;

  if (targetMsgId) {
    try {
      const rows = await (await import('../services/post-message.service')).loadPostMessages(postId);
      if (rows.length > 0) {
        const first = rows[0];
        const text = (first.text || '').substring(0, 4096);
        const entities = first.entities || [];
        const keyboard = (first as any).reply_markup || undefined;

        const extra: any = {};
        if (entities.length > 0) extra.entities = entities;
        if (keyboard) extra.reply_markup = keyboard;

        await ctx.telegram.editMessageText(ctx.chat.id, targetMsgId, undefined, text, extra);
        if (!storedMsgId) storeEditNavMessage(userId, postId, targetMsgId);
        return;
      }
    } catch (editErr: any) {
      logger.debug(`[EditNav] edit failed for msg ${targetMsgId}: ${editErr?.message}`);
    }
  }

  await sendPostToChat(ctx, postId, templateVars);
  const sentMsgId = ctx.callbackQuery?.message?.message_id;
  if (sentMsgId) storeEditNavMessage(userId, postId, sentMsgId);
}
