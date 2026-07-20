import { sanitizeTelegramText, sanitizeTelegramExtra } from '../utils/unicode';
import { logger } from '../utils/logger';
import { postService } from '../services/post.service';
import { sendPostToChat, loadPostMessages, ensurePostMessages, validateMessages, normalizeSingleMessage } from '../services/post-message.service';
import { cache } from '../utils/cache';
import { normalizeFinalEntities, telegramLength } from '../shared/message-format/normalizer';

const EDIT_NAV_KEY = 'post:editNav:';
function editNavUserKey(userId: number) { return `${EDIT_NAV_KEY}${userId}`; }

export function storeEditNavMessage(userId: number, messageId: number) {
  cache.setPermanent(editNavUserKey(userId), messageId);
}
export function getEditNavMessage(userId: number): number | undefined {
  return cache.get<number>(editNavUserKey(userId));
}
export function clearEditNavMessage(userId: number) {
  cache.del(editNavUserKey(userId));
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

function buildEditPayloadFromMessages(messages: any[]): { method: 'text' | 'media'; text?: string; entities?: any[]; mediaType?: string; mediaFileId?: string; caption?: string; captionEntities?: any[]; replyMarkup?: any } {
  const first = messages[0];
  const firstMsg = normalizeSingleMessage(first);

  if (firstMsg.messageType === 'forward') {
    throw new Error('Cannot edit forward messages');
  }
  if (firstMsg.messageType === 'album') {
    throw new Error('Cannot edit album messages');
  }

  const isMedia = firstMsg.messageType !== 'text' && firstMsg.mediaFileId;

  if (isMedia) {
    let caption = firstMsg.caption || firstMsg.text || '';
    let captionEntities = firstMsg.captionEntities.length ? [...firstMsg.captionEntities] : [];

    for (let i = 1; i < messages.length; i++) {
      const m = normalizeSingleMessage(messages[i]);
      if (m.messageType === 'text' && m.text) {
        caption += '\n\n' + m.text;
        const shift = telegramLength(caption) - telegramLength(m.text);
        const shifted = m.entities.map(e => ({ ...e, offset: e.offset + shift }));
        captionEntities.push(...shifted);
      } else if (m.messageType !== 'text' && m.caption) {
        caption += '\n\n' + m.caption;
        const shift = telegramLength(caption) - telegramLength(m.caption);
        const shifted = m.captionEntities.map(e => ({ ...e, offset: e.offset + shift }));
        captionEntities.push(...shifted);
      }
    }

    return {
      method: 'media',
      mediaType: firstMsg.messageType,
      mediaFileId: firstMsg.mediaFileId!,
      caption: caption || undefined,
      captionEntities,
      replyMarkup: firstMsg.replyMarkup || null,
    };
  }

  let combinedText = firstMsg.text || '';
  let combinedEntities = firstMsg.entities.length ? [...firstMsg.entities] : [];

  for (let i = 1; i < messages.length; i++) {
    const m = normalizeSingleMessage(messages[i]);
    if (m.messageType === 'text' && m.text) {
      const separator = combinedText && m.text ? '\n\n' : '';
      combinedText += separator + m.text;
      if (m.entities.length) {
        const shift = telegramLength(combinedText) - telegramLength(m.text);
        const shifted = m.entities.map(e => ({ ...e, offset: e.offset + shift }));
        combinedEntities.push(...shifted);
      }
    }
  }

  return {
    method: 'text',
    text: combinedText || '(پست خالی)',
    entities: combinedEntities,
    replyMarkup: firstMsg.replyMarkup || null,
  };
}

async function buildEditPayload(postId: number): Promise<ReturnType<typeof buildEditPayloadFromMessages>> {
  let rows = await loadPostMessages(postId);
  if (rows.length === 0) {
    rows = await ensurePostMessages(postId);
  }

  const validated = validateMessages(rows, postId);
  return buildEditPayloadFromMessages(validated);
}

export async function sendOrEditPostToUser(ctx: any, rawPost: any, templateVars?: Record<string, string>): Promise<void> {
  const postId = rawPost.id;
  const userId = ctx.from?.id;
  await postService.incrementViews(postId, undefined, BigInt(userId));

  if (!(rawPost as any).editNavigation) {
    await sendPostToChat(ctx, postId, templateVars);
    return;
  }

  const storedMsgId = getEditNavMessage(userId);
  const cbMsgId = ctx.callbackQuery?.message?.message_id;
  const targetMsgId = storedMsgId || cbMsgId;

  if (targetMsgId) {
    try {
      const payload = await buildEditPayload(postId);
      const chatId = ctx.chat.id;

      if (payload.method === 'media') {
        const inputMedia: any = {
          type: payload.mediaType,
          media: payload.mediaFileId,
        };
        if (payload.caption) inputMedia.caption = payload.caption;
        if (payload.captionEntities?.length) {
          inputMedia.caption_entities = normalizeFinalEntities(
            payload.caption || '',
            payload.captionEntities,
          );
        }

        const extra: any = {};
        if (payload.replyMarkup) {
          extra.reply_markup = payload.replyMarkup;
        }

        await ctx.telegram.editMessageMedia(chatId, targetMsgId, undefined, inputMedia, extra);
      } else {
        const text = (payload.text || '').substring(0, 4096);
        let entities = payload.entities || [];

        if (entities.length > 0) {
          entities = normalizeFinalEntities(text, entities);
        }

        const extra: any = {};
        if (entities.length > 0) extra.entities = entities;
        if (payload.replyMarkup) extra.reply_markup = payload.replyMarkup;

        await ctx.telegram.editMessageText(chatId, targetMsgId, undefined, text, extra);
      }

      storeEditNavMessage(userId, targetMsgId);
      return;
    } catch (editErr: any) {
      logger.debug(`[EditNav] edit failed for msg ${targetMsgId} postId=${postId}: ${editErr?.message}`);
      clearEditNavMessage(userId);
    }
  }

  await sendPostToChat(ctx, postId, templateVars);
}
