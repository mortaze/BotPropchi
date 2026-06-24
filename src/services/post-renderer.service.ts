import { Markup } from 'telegraf';
import { logger } from '../utils/logger';
import {
  TelegramNativeRenderer,
  TelegramPayload,
  telegramRequestValidator,
  telegramSnapshotComparator,
  deliveryDebugService,
  extractTelegramSnapshot,
  telegramLength,
  nonEmptyEntities,
  cleanEntities,
  cloneJson,
  buildTelegramKeyboard,
  renderMessage,
  ensureNoSharedRefs,
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

// ─── New Data Model ────────────────────────────────────────────────

export interface PostMessage {
  index: number;
  content: string;
  entities: any[];
  buttons: any[][];
  media: any[] | undefined;
  snapshot: any | undefined;
}

export interface MessageRenderContext {
  message: PostMessage;
  postId: number;
}

// ─── Internal: content splitting ───────────────────────────────────

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

function extractContentEntitiesForSegment(
  entities: any[] | null | undefined,
  segmentOffset: number,
  segmentLength: number,
): any[] {
  if (!Array.isArray(entities) || entities.length === 0) return [];
  const adjusted: any[] = [];
  for (const e of entities) {
    if (e.offset >= segmentOffset && e.offset + e.length <= segmentOffset + segmentLength) {
      adjusted.push({ ...e, offset: e.offset - segmentOffset });
    }
  }
  return adjusted;
}

function extractSnapshotEntitiesForSegment(
  snapshotText: string | undefined,
  snapshotEntities: any[] | null | undefined,
  segmentText: string,
): any[] {
  if (!snapshotText || !Array.isArray(snapshotEntities) || snapshotEntities.length === 0) {
    return [];
  }
  const pos = snapshotText.indexOf(segmentText);
  if (pos < 0) return [];
  const end = pos + segmentText.length;
  const adjusted: any[] = [];
  for (const e of snapshotEntities) {
    if (e.offset >= pos && e.offset + e.length <= end) {
      adjusted.push({ ...e, offset: e.offset - pos });
    }
  }
  return adjusted;
}

function extractButtonsForMessage(raw: any, messageIndex: number): any[][] {
  if (!raw) return [];
  if (typeof raw === 'object' && !Array.isArray(raw) && raw.messages) {
    return Array.isArray(raw.messages[String(messageIndex)]) ? raw.messages[String(messageIndex)] : [];
  }
  if (Array.isArray(raw)) return messageIndex === 0 ? raw : [];
  return [];
}

function splitTelegramSnapshotForMessage(
  snapshot: any,
  segmentText: string,
): any {
  if (!snapshot) return undefined;
  const scopedEntities = snapshot.text
    ? extractSnapshotEntitiesForSegment(snapshot.text, snapshot.entities, segmentText)
    : [];
  return {
    text: segmentText,
    entities: scopedEntities,
    caption: snapshot.caption,
    caption_entities: snapshot.caption_entities,
  };
}

// ─── Core: resolve entities for a message (two-tier) ──────────────

function resolveEntitiesForMessage(
  post: any,
  segment: ContentSegment,
): any[] {
  const fromContent = extractContentEntitiesForSegment(post.entities, segment.offset, segment.text.length);
  if (fromContent.length > 0) return fromContent;

  if (post.telegramMessageSnapshot) {
    return extractSnapshotEntitiesForSegment(
      post.telegramMessageSnapshot.text,
      post.telegramMessageSnapshot.entities,
      segment.text,
    );
  }
  return [];
}

// ─── Core: splitPostToMessages ─────────────────────────────────────

export function splitPostToMessages(post: any): PostMessage[] {
  if (!post) return [];
  const segments = splitContentMessagesWithOffsets(post.content || '');
  if (segments.length === 0) return [];

  return segments.map((seg, i) => {
    const entities = resolveEntitiesForMessage(post, seg);
    const rawButtons = extractButtonsForMessage(post.buttons, i);
    const buttons = rawButtons.length > 0 ? cloneJson(rawButtons) : [];

    const media = i === 0 && Array.isArray(post.media) && post.media.length > 0
      ? cloneJson(post.media)
      : undefined;

    const snapshot = splitTelegramSnapshotForMessage(post.telegramMessageSnapshot, seg.text);

    return {
      index: i,
      content: seg.text,
      entities,
      buttons,
      media,
      snapshot,
    };
  });
}

// ─── Core: buildMessageContext ─────────────────────────────────────

export function buildMessageContext(post: any, messageIndex: number): MessageRenderContext {
  const messages = splitPostToMessages(post);
  const message = messages[messageIndex];
  if (!message) {
    throw new Error(`[MessageCtx] post=${post.id} message index ${messageIndex} not found (total ${messages.length})`);
  }
  return { message, postId: post.id };
}

// ─── Internal: build post-like object for native renderer ─────────

function buildMessagePostForRender(
  post: any,
  msg: PostMessage,
): any {
  return {
    id: post.id,
    title: post.title,
    content: msg.content,
    entities: msg.entities,
    buttons: msg.buttons,
    media: msg.media,
    renderMode: post.renderMode,
    contentFormat: post.contentFormat,
    telegramMessageSnapshot: msg.snapshot,
    telegramPayload: undefined,
  };
}

// ─── Internal: send a pure TelegramPayload ────────────────────────

async function sendPayload(ctx: any, payload: TelegramPayload, postId: number): Promise<boolean> {
  const { method, ...params } = payload;

  logger.info(`[TelegramSend] post=${postId} method=${method}`);

  if (method === 'sendMessage') {
    await sendFormattedMessage(ctx, {
      text: params.text || '',
      entities: params.entities,
    }, {
      buttons: (payload.reply_markup?.inline_keyboard) || undefined,
      link_preview: !params.link_preview_options?.is_disabled,
      protect_content: params.protect_content,
    });
    return true;
  }

  if (method === 'sendMediaGroup') {
    logger.info(`[TelegramSend] post=${postId} sendMediaGroup items=${(params.media || []).length}`);
    await ctx.replyWithMediaGroup(params.media);
    if (payload.reply_markup?.inline_keyboard?.length) {
      await ctx.reply('عملیات:', Markup.inlineKeyboard(payload.reply_markup.inline_keyboard));
    }
    return true;
  }

  await sendFormattedMessage(ctx, { text: params.text || '', caption: params.caption, entities: params.entities, caption_entities: params.caption_entities }, {
    buttons: (payload.reply_markup?.inline_keyboard) || undefined,
  });
  return true;
}

// ─── Main entry: renderPostToTelegram ──────────────────────────────

export async function renderPostToTelegram(ctx: any, post: any) {
  const messages = splitPostToMessages(post);
  if (messages.length > 1) {
    logger.info(`[Pipeline] post=${post.id} multiMessage count=${messages.length}`);
    for (const msg of messages) {
      try {
        ensureNoSharedRefs(msg);
        const payload = renderMessage(
          msg.content,
          msg.entities,
          msg.buttons,
          msg.media,
          post.id,
        );
        const safePayload = cloneJson(payload);
        await sendPayload(ctx, safePayload, post.id);
      } catch (e) {
        logger.error(`[Pipeline] post=${post.id} message ${msg.index + 1}/${messages.length} FAILED — aborting: ${e}`);
        throw e;
      }
    }
    return true;
  }

  // Single message path
  const msg = messages[0];
  if (!msg) return false;
  const msgPost = buildMessagePostForRender(post, msg);
  return renderSinglePost(ctx, msgPost);
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
