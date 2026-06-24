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

type ContentSegment = {
  text: string;
  offset: number;
};

function splitContentMessagesWithOffsets(content: string): ContentSegment[] {
  if (!content || !content.trim()) return [];
  const segments: ContentSegment[] = [];
  const regex = /\[\[copy\]\](.*?)\[\[\/copy\]\]/gs;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const raw = content.slice(lastIndex, match.index);
      const trimmed = raw.trim();
      if (trimmed) {
        const leadingWs = raw.length - raw.trimStart().length;
        segments.push({ text: trimmed, offset: lastIndex + leadingWs });
      }
    }
    const innerRaw = match[1];
    const trimmed = innerRaw.trim();
    if (trimmed) {
      const innerOffset = match.index + match[0].indexOf(match[1]);
      const leadingWs = innerRaw.length - innerRaw.trimStart().length;
      segments.push({ text: trimmed, offset: innerOffset + leadingWs });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    const raw = content.slice(lastIndex);
    const trimmed = raw.trim();
    if (trimmed) {
      const leadingWs = raw.length - raw.trimStart().length;
      segments.push({ text: trimmed, offset: lastIndex + leadingWs });
    }
  }

  if (segments.length === 0 && content.trim()) {
    const trimmed = content.trim();
    const leadingWs = content.length - content.trimStart().length;
    segments.push({ text: trimmed, offset: leadingWs });
  }

  return segments;
}

function splitContentMessages(content: string): string[] {
  return splitContentMessagesWithOffsets(content).map(s => s.text);
}

function adjustEntitiesForMessage(
  entities: any[] | null | undefined,
  segmentOffset: number,
  segmentLength: number,
): any[] | undefined {
  if (!Array.isArray(entities) || entities.length === 0) return undefined;
  const adjusted: any[] = [];
  for (const e of entities) {
    if (e.offset >= segmentOffset && e.offset + e.length <= segmentOffset + segmentLength) {
      adjusted.push({ ...e, offset: e.offset - segmentOffset });
    }
  }
  return adjusted.length > 0 ? adjusted : undefined;
}

function extractSnapshotEntitiesForSegment(
  snapshotText: string | undefined,
  snapshotEntities: any[] | null | undefined,
  segmentText: string,
): any[] | undefined {
  if (!snapshotText || !Array.isArray(snapshotEntities) || snapshotEntities.length === 0) {
    return undefined;
  }
  const pos = snapshotText.indexOf(segmentText);
  if (pos < 0) return undefined;
  const end = pos + segmentText.length;
  const adjusted: any[] = [];
  for (const e of snapshotEntities) {
    if (e.offset >= pos && e.offset + e.length <= end) {
      adjusted.push({ ...e, offset: e.offset - pos });
    }
  }
  return adjusted.length > 0 ? adjusted : undefined;
}

function resolveEntitiesForSegment(
  post: any,
  segmentText: string,
  segmentOffset: number,
): any[] | undefined {
  const fromContent = adjustEntitiesForMessage(post.entities, segmentOffset, segmentText.length);
  if (fromContent) return fromContent;
  if (post.telegramMessageSnapshot) {
    const fromSnapshot = extractSnapshotEntitiesForSegment(
      post.telegramMessageSnapshot.text,
      post.telegramMessageSnapshot.entities,
      segmentText,
    );
    if (fromSnapshot) return fromSnapshot;
  }
  return undefined;
}

function getMessageButtonsFromPost(post: any, messageIdx: number): any[][] {
  const raw = post.buttons;
  if (!raw) return [];
  if (typeof raw === 'object' && !Array.isArray(raw) && raw.messages) {
    return raw.messages[String(messageIdx)] || [];
  }
  if (Array.isArray(raw)) return messageIdx === 0 ? raw : [];
  return [];
}

export async function renderPostToTelegram(ctx: any, post: any) {
  const segments = splitContentMessagesWithOffsets(post.content || '');
  if (segments.length > 1) {
    logger.info(`[Pipeline] post=${post.id} multiMessage segments=${segments.length}`);
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const msgButtons = getMessageButtonsFromPost(post, i);
      const msgEntities = resolveEntitiesForSegment(post, seg.text, seg.offset);
      const msgPost: any = {
        id: post.id,
        title: post.title,
        content: seg.text,
        buttons: Array.isArray(msgButtons) ? cloneJson(msgButtons) : msgButtons,
        entities: msgEntities,
        media: i === 0 ? (Array.isArray(post.media) ? cloneJson(post.media) : undefined) : undefined,
        renderMode: post.renderMode,
        contentFormat: post.contentFormat,
      };
      logger.info(`[PerMessage] post=${post.id} msg=${i} text="${seg.text.slice(0, 30)}" entities=${msgEntities ? msgEntities.length : 0} buttons=${Array.isArray(msgButtons) ? msgButtons.length : 0}`);
      try {
        if (i === 0) {
          await renderSinglePost(ctx, msgPost);
        } else {
          await sendFormattedMessage(ctx, { text: seg.text, entities: msgEntities }, {
            buttons: buildTelegramKeyboard(msgButtons, post.id),
          });
        }
      } catch (e) {
        logger.error(`[Pipeline] post=${post.id} message ${i + 1}/${segments.length} FAILED — aborting: ${e}`);
        throw e;
      }
    }
    return true;
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
