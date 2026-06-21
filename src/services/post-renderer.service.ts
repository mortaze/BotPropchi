import { Markup } from 'telegraf';
import { logger } from '../utils/logger';
import {
  TelegramNativeRenderer,
  telegramRequestValidator,
  telegramSnapshotComparator,
  deliveryDebugService,
  extractTelegramSnapshot,
  telegramLength,
  nonEmptyEntities,
  cleanEntities,
  cloneJson,
  buildTelegramKeyboard,
  MEDIA_SENDERS,
} from './renderer';
import { sendFormattedMessage } from '../shared/message-format';
import { normalizePost } from './post-normalizer.service';

export function validateTelegramHtml(html?: string | null): string[] {
  return telegramRequestValidator.validateHtml(html);
}

export function validateTelegramEntities(text: string | null | undefined, entities: any[] | null | undefined): string[] {
  return telegramRequestValidator.validateEntities(text, entities);
}

export { TelegramNativeRenderer, extractTelegramSnapshot };

export function buildPostDebugSnapshot(post: any) {
  const debug = deliveryDebugService.getFullPipelineDebug(post);
  return {
    dbContent: debug.dbContent,
    entities: debug.entities,
    captionEntities: debug.captionEntities,
    parseMode: debug.parseMode,
    telegramPayload: debug.telegramPayload,
    telegramMessageSnapshot: debug.telegramMessageSnapshot,
    finalTelegramApiRequest: debug.finalTelegramApiRequest,
    detectedRenderer: debug.detectedRenderer,
    entityValidationResult: debug.validationResult,
  };
}

export function comparePostNativeRoundtrip(post: any) {
  return telegramSnapshotComparator.compare(post);
}

function splitContentMessages(content: string): string[] {
  if (!content || !content.trim()) return [];
  const messages: string[] = [];
  const regex = /\[\[copy\]\](.*?)\[\[\/copy\]\]/gs;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const before = content.slice(lastIndex, match.index).trim();
      if (before) messages.push(before);
    }
    messages.push(match[1].trim());
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    const remaining = content.slice(lastIndex).trim();
    if (remaining) messages.push(remaining);
  }
  if (messages.length === 0 && content.trim()) messages.push(content.trim());
  return messages;
}

function getMessageButtonsFromPost(post: any, messageIdx: number): any[][] {
  const raw = post.buttons;
  if (!raw) return [];
  if (Array.isArray(raw)) return messageIdx === 0 ? raw : [];
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && raw.messages) {
    return raw.messages[String(messageIdx)] || raw.messages['_shared'] || [];
  }
  return [];
}

export async function renderPostToTelegram(ctx: any, post: any) {
  const messages = splitContentMessages(post.content || '');
  if (messages.length > 1) {
    let lastResult = false;
    for (let i = 0; i < messages.length; i++) {
      const msgButtons = getMessageButtonsFromPost(post, i);
      const msgPost = { ...post, content: messages[i], buttons: msgButtons };
      if (i === 0) {
        lastResult = await renderSinglePost(ctx, msgPost);
      } else {
        try {
          await sendFormattedMessage(ctx, { text: messages[i] }, {
            buttons: buildTelegramKeyboard(msgButtons, post.id),
          });
          lastResult = true;
        } catch (e) {
          logger.warn(`[Pipeline] post=${post.id} extra message ${i + 1} failed: ${e}`);
        }
      }
    }
    return lastResult;
  }
  const msgButtons = getMessageButtonsFromPost(post, 0);
  return renderSinglePost(ctx, { ...post, buttons: msgButtons });
}

async function renderSinglePost(ctx: any, post: any) {
  deliveryDebugService.logFullPipeline(post);

  const nativeRenderer = new TelegramNativeRenderer();
  const rendered = nativeRenderer.render(post);
  const finalRequest = nativeRenderer.buildRequest(post);

  const validationIssues = telegramRequestValidator.validate(finalRequest);
  if (validationIssues.length > 0) {
    logger.error(`[Pipeline] post=${post.id} validation FAILED: ${validationIssues.join('; ')}`);
    return false;
  }

  const comparator = telegramSnapshotComparator.compare(post);
  if (comparator.differences.modifiedText || comparator.differences.lostEntities.length > 0 || comparator.differences.lostCaptionEntities.length > 0) {
    logger.warn(`[Pipeline] post=${post.id} snapshot comparison found differences`);
    telegramSnapshotComparator.logDifferences(post.id, comparator);
  }

  const buttons = rendered.buttons;

  if (rendered.media.length > 1) {
    logger.info(`[TelegramSend] post=${post.id} sendMediaGroup items=${rendered.media.length}`);
    await ctx.replyWithMediaGroup(finalRequest.media);
    if (buttons.length) {
      const markup = Markup.inlineKeyboard(buttons);
      logger.info('[TELEGRAM_REPLY_MARKUP] ' + JSON.stringify(markup, null, 2));
      logger.info('[TELEGRAM_PAYLOAD] ' + JSON.stringify({ method: 'sendMessage', text: 'عملیات:', reply_markup: markup }, null, 2));
      const sent = await ctx.reply('عملیات:', markup);
      logger.info('[TELEGRAM_RESPONSE] ' + JSON.stringify({ message_id: sent?.message_id, chat: sent?.chat }, null, 2));
    }
    return true;
  }

  if (rendered.media.length === 1) {
    const m = rendered.media[0];
    if (m.type === 'sticker') {
      logger.info(`[TelegramSend] post=${post.id} sendSticker`);
      const stickerExtra = buttons.length ? Markup.inlineKeyboard(buttons) : undefined;
      if (stickerExtra) logger.info('[TELEGRAM_REPLY_MARKUP] ' + JSON.stringify(stickerExtra, null, 2));
      await ctx.replyWithSticker(m.fileId, stickerExtra);
      return true;
    }
    const sender = MEDIA_SENDERS[m.type] || MEDIA_SENDERS.document;
    const { method, media, ...extra } = finalRequest;
    logger.info(`[TelegramSend] post=${post.id} ${sender.apiMethod}`);
    if (extra.reply_markup) {
      logger.info('[TELEGRAM_REPLY_MARKUP] ' + JSON.stringify(extra.reply_markup, null, 2));
    }
    logger.info('[TELEGRAM_PAYLOAD] ' + JSON.stringify({ method, media, ...extra }, null, 2));
    const sent = await ctx[sender.method](media, extra);
    logger.info('[TELEGRAM_RESPONSE] ' + JSON.stringify({ message_id: sent?.message_id, chat: sent?.chat }, null, 2));
    return true;
  }

  const { method, text, ...request } = finalRequest;
  const entityTypes = (request.entities || []).map((e: any) => `${e.type}@${e.offset}:${e.length}`).join(',');
  logger.info(`[TelegramSend] post=${post.id} sendMessage textLength=${telegramLength(text || '')} entities=${(request.entities || []).length} entityTypes=[${entityTypes}]`);

  await sendFormattedMessage(ctx, {
    text: text || '',
    entities: request.entities,
  }, {
    buttons,
  });
  return true;
}
