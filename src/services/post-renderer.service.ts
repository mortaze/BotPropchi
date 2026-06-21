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
import { normalizePost, parseMessageEntries } from './post-normalizer.service';

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
  // Try new JSON format first
  const trimmed = content.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object') {
        return parsed.map((m: any) => m.content || '');
      }
    } catch { /* fall through to old format */ }
  }
  // Legacy [[copy]] format
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

function getMessageButtonsFromPost(post: any, messageIdx: number, messageId?: string): any[][] {
  const raw = post.buttons;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  // New UUID-keyed format — use messageId
  if (messageId && typeof raw === 'object' && raw[messageId]) return raw[messageId];
  if (messageId && typeof raw === 'object' && raw.messages?.[messageId]) return raw.messages[messageId];
  // Old index-keyed format
  if (raw.messages) return raw.messages[String(messageIdx)] || raw.messages['_shared'] || [];
  // Direct object with UUID keys — fallback
  if (typeof raw === 'object') return raw['_shared'] || [];
  return [];
}

export async function renderPostToTelegram(ctx: any, post: any) {
  // Parse messages with their UUIDs for button lookup
  const entries = parseMessageEntries(post.content || '');
  const texts = entries.map(e => e.content);
  if (texts.length > 1) {
    let lastResult = false;
    for (let i = 0; i < texts.length; i++) {
      const messageId = entries[i]?.id;
      const msgButtons = getMessageButtonsFromPost(post, i, messageId);
      const msgEntities = entries[i]?.entities || [];
      const msgPost = { ...post, content: texts[i], buttons: msgButtons, entities: msgEntities, contentEntities: msgEntities };
      if (i === 0) {
        lastResult = await renderSinglePost(ctx, msgPost);
      } else {
        try {
          await sendFormattedMessage(ctx, { text: texts[i] }, {
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
  const msgContent = texts[0] || '';
  if (!msgContent) {
    logger.error(`[SystemPost] render failed — post=${post.id} no content after parsing message entries`);
    return false;
  }
  const firstId = entries[0]?.id;
  const msgButtons = getMessageButtonsFromPost(post, 0, firstId);
  const msgEntities = entries[0]?.entities || [];
  return renderSinglePost(ctx, { ...post, content: msgContent, buttons: msgButtons, entities: msgEntities, contentEntities: msgEntities });
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
    if (buttons.length) await ctx.reply('عملیات:', Markup.inlineKeyboard(buttons));
    return true;
  }

  if (rendered.media.length === 1) {
    const m = rendered.media[0];
    if (m.type === 'sticker') {
      logger.info(`[TelegramSend] post=${post.id} sendSticker`);
      await ctx.replyWithSticker(m.fileId, buttons.length ? Markup.inlineKeyboard(buttons) : undefined);
      return true;
    }
    const sender = MEDIA_SENDERS[m.type] || MEDIA_SENDERS.document;
    const { method, media, ...extra } = finalRequest;
    logger.info(`[TelegramSend] post=${post.id} ${sender.apiMethod}`);
    await ctx[sender.method](media, extra);
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
