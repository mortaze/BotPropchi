import { sanitizeTelegramText, sanitizeTelegramExtra } from '../utils/unicode';
import { logger } from '../utils/logger';
import { postService } from '../services/post.service';
import { sendPostToChat } from '../services/post-message.service';

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

export async function showPopup(ctx: any, value: string | undefined | null): Promise<void> {
  const text = value || '✅';
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery(text, { show_alert: true });
  } else {
    await ctx.reply(text);
  }
}

export async function sendPostToUser(
  ctx: any,
  rawPost: any,
  templateVars?: Record<string, string>,
  lastMessageOptions?: any,
  editTarget?: { chatId: number; messageId: number },
) {
  const postId = rawPost.id;
  await postService.incrementViews(postId, undefined, BigInt(ctx.from.id));
  await sendPostToChat(ctx, postId, templateVars, lastMessageOptions, editTarget);
}
