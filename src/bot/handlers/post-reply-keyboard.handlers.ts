import { Telegraf } from 'telegraf';
import { postService } from '../../services/post.service';
import { sendPostToUser } from '../shared';
import { cache } from '../../utils/cache';
import { findReplyKeyboardButtonByText } from '../../services/post-reply-keyboard.service';

export function registerPostReplyKeyboardHandlers(bot: Telegraf) {
  bot.on('text', async (ctx: any, next) => {
    const userId = ctx.from.id;
    const activePostId = cache.get<string>(`postReplyKb:lastPostId:${userId}`);
    if (!activePostId || activePostId === 'MAIN_MENU') return next();

    const post = await postService.findById(Number(activePostId));
    if (!post) return next();
    const original = findReplyKeyboardButtonByText(post.messages || [], ctx.message.text);
    if (!original) return next();

    if (original.type === 'COMMAND') {
      const target = await postService.resolveCommand(original.value);
      if (!target) return ctx.reply('❌ این بخش دیگر در دسترس نیست.');
      await postService.incrementViews(target.id, undefined, BigInt(userId));
      await sendPostToUser(ctx, target);
      return;
    }
    if (original.type === 'POPUP') {
      await ctx.reply(original.value || '✅');
      return;
    }
    return next();
  });
}
