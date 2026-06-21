import { sanitizeTelegramText, sanitizeTelegramExtra } from '../utils/unicode';
import { logger } from '../utils/logger';
import { normalizePost } from '../services/post-normalizer.service';
import { postService } from '../services/post.service';
import { renderPostToTelegram } from '../services/post-renderer.service';

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

export async function sendPostToUser(ctx: any, rawPost: any): Promise<boolean> {
  const post = normalizePost(rawPost);
  await postService.incrementViews(post.id, undefined, BigInt(ctx.from.id));
  return await renderPostToTelegram(ctx, post);
}
