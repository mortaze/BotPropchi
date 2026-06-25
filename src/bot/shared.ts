import { sanitizeTelegramText, sanitizeTelegramExtra } from '../utils/unicode';
import { logger } from '../utils/logger';
import { postService } from '../services/post.service';
import { renderPostToTelegram } from '../services/post-renderer.service';
import { buildTelegramPayload, normalizeSingleMessage, sanitizeEntities } from '../services/post-message.service';

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

export async function sendPostToUser(ctx: any, rawPost: any) {
  await postService.incrementViews(rawPost.id, undefined, BigInt(ctx.from.id));

  const messages = (rawPost as any).messages;
  if (Array.isArray(messages) && messages.length > 0) {
    logger.info(`[PostMessages] postId=${rawPost.id} messageCount=${messages.length}`);
    for (const row of messages) {
      const msg = normalizeSingleMessage(row);
      if (msg.delayMs > 0) await new Promise(resolve => setTimeout(resolve, msg.delayMs));
      const payload = sanitizeEntities(buildTelegramPayload(msg), msg.id);
      const { method, ...params } = payload as any;
      logger.info(`[SendSingleMessage] postId=${msg.postId} order=${msg.order} type=${msg.messageType} entities=${msg.entities.length}`);
      if (method === 'sendMessage') await ctx.reply(params.text, params);
      else if (method === 'sendMediaGroup') await ctx.replyWithMediaGroup(params.media);
      else {
        const media = params.media;
        delete params.media;
        const methodMap: Record<string, string> = { sendPhoto: 'replyWithPhoto', sendVideo: 'replyWithVideo', sendDocument: 'replyWithDocument', sendAudio: 'replyWithAudio', sendAnimation: 'replyWithAnimation', sendVoice: 'replyWithVoice' };
        await ctx[methodMap[method] || 'replyWithDocument'](media, params);
      }
    }
    return;
  }

  logger.warn(`[LegacyFallback] post=${rawPost.id} has no post_messages rows, using deprecated single-content path — RUN MIGRATION`);
  await renderPostToTelegram(ctx, rawPost);
}

