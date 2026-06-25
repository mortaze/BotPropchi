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
  sanitizeForSend,
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
  const segEnd = segmentOffset + segmentLength;
  const adjusted: any[] = [];
  for (const e of entities) {
    const entityEnd = e.offset + e.length;
    // Entity overlaps this segment if it starts before segment ends AND ends after segment starts
    if (e.offset < segEnd && entityEnd > segmentOffset) {
      // Clamp to segment boundaries
      const clampedStart = Math.max(e.offset, segmentOffset);
      const clampedEnd = Math.min(entityEnd, segEnd);
      const newOffset = clampedStart - segmentOffset;
      const newLength = clampedEnd - clampedStart;
      if (newLength > 0) {
        adjusted.push({ ...e, offset: newOffset, length: newLength });
      }
    }
  }
  if (adjusted.length > 0) {
    logger.debug(`[EntityExtract] segment=[${segmentOffset},${segEnd}) entities=${adjusted.length} types=${adjusted.map(e => `${e.type}@${e.offset}:${e.length}`).join(',')}`);
  }
  return adjusted;
}

function extractSnapshotEntitiesForSegment(
  snapshotText: string | undefined,
  snapshotEntities: any[] | null | undefined,
  segmentText: string,
  occurrenceIndex?: number,
): any[] {
  if (!snapshotText || !Array.isArray(snapshotEntities) || snapshotEntities.length === 0) {
    return [];
  }
  // Find the nth occurrence to handle duplicate text across messages.
  // Without occurrenceIndex, falls back to first occurrence (original behavior).
  let pos = -1;
  const targetOccurrence = occurrenceIndex ?? 0;
  for (let i = 0; i <= targetOccurrence; i++) {
    pos = snapshotText.indexOf(segmentText, pos + 1);
    if (pos < 0) return [];
  }
  const end = pos + segmentText.length;
  const adjusted: any[] = [];
  for (const e of snapshotEntities) {
    const entityEnd = e.offset + e.length;
    // Entity overlaps this segment if it starts before segment ends AND ends after segment starts
    if (e.offset < end && entityEnd > pos) {
      const clampedStart = Math.max(e.offset, pos);
      const clampedEnd = Math.min(entityEnd, end);
      const newOffset = clampedStart - pos;
      const newLength = clampedEnd - clampedStart;
      if (newLength > 0) {
        adjusted.push({ ...e, offset: newOffset, length: newLength });
      }
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

/**
 * For each segment, compute its original position in the pre-[[copy]] text.
 * This allows mapping entity offsets (stored w.r.t. original text) to
 * positions in the current content (with markers).
 */
function computeSegmentOrigins(
  content: string,
  segments: ContentSegment[],
): { segIndex: number; origStart: number; curStart: number }[] {
  const result: { segIndex: number; origStart: number; curStart: number }[] = [];
  let origPos = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const curStart = seg.offset;
    result.push({ segIndex: i, origStart: origPos, curStart });

    origPos += seg.text.length;

    // Compute original separator between this and the next segment
    if (i + 1 < segments.length) {
      const curEnd = curStart + seg.text.length;
      const nextSeg = segments[i + 1];
      const gap = content.slice(curEnd, nextSeg.offset);
      const copyIdx = gap.indexOf('[[copy]]');
      const sepLen = copyIdx >= 0 ? copyIdx : gap.length;
      origPos += sepLen;
    }
  }

  return result;
}

// ─── Helper: get numeric message index from entity ────────────────
// Only returns a value when source is a numeric string (PostEntity messageIndex
// convention) or messageIndex is set.  Non-numeric source values like 'text'
// (the default PostEntity source) are treated as "no message affinity".
function getEntityMsgIdx(e: any): number | null | undefined {
  if (e.messageIndex != null) return e.messageIndex;
  if (e.source != null && !isNaN(Number(e.source))) return Number(e.source);
  return null;
}

// ─── Core: resolve entities for a message (two-tier) ──────────────

function resolveEntitiesForMessage(
  post: any,
  segment: ContentSegment,
  allSegments?: ContentSegment[],
  segmentIndex?: number,
): any[] {
  const totalMessages = allSegments?.length || 1;
  const idx = segmentIndex ?? 0;

  // ── Mode 1: Single message ─────────────────────────────────────────
  if (totalMessages === 1) {
    const fromContent = extractContentEntitiesForSegment(post.entities, segment.offset, segment.text.length);
    if (fromContent.length > 0) {
      logger.debug(`[EntityResolve] post=${post.id} singleMessage segment=[${segment.offset},${segment.offset + segment.text.length}) entities=${fromContent.length} types=${fromContent.map(e => `${e.type}@${e.offset}:${e.length}`).join(',')}`);
      return fromContent;
    }
    return [];
  }

  // ── Mode 2: Multi-message — filter by messageIndex/source ───────
  // When any entity has message affinity, treat offsets as LOCAL to each
  // message and return only entities tagged for the current message. This is
  // the canonical post_entities flow; do not subtract segment offsets here.
  if (totalMessages > 1 && Array.isArray(post.entities) && post.entities.length > 0) {
    const hasMessageAffinity = post.entities.some((e: any) => getEntityMsgIdx(e) != null);
    if (hasMessageAffinity) {
      const byMessageIndex = post.entities.filter((e: any) => {
        const msgIdx = getEntityMsgIdx(e);
        return msgIdx != null && Number(msgIdx) === idx;
      });
      const cloned = byMessageIndex.map((e: any) => ({ ...e, source: undefined, messageIndex: undefined }));
      logger.debug(`[EntityResolve] post=${post.id} messageIndexMatch idx=${idx} entities=${cloned.length} types=${cloned.map(e => `${e.type}@${e.offset}:${e.length}`).join(',') || '(none)'}`);
      return cloned;
    }
  }

  // ── Mode 3: Absolute offset overlap ─────────────────────────────
  // Handles post.entities with absolute offsets (relative to full content
  // including markers).  Entities with messageIndex/source that doesn't
  // match the current segment are filtered out to prevent contamination.
  // Snapshot-derived entities (_snapshot: true) are skipped — their offsets
  // are in the snapshot text frame, not the content frame.
  if (totalMessages > 1 && Array.isArray(post.entities) && post.entities.length > 0) {
    const absEntities = extractContentEntitiesForSegment(
      post.entities.filter((e: any) => {
        if (e._snapshot) return false;
        const msgIdx = getEntityMsgIdx(e);
        return msgIdx == null || String(msgIdx) === String(idx);
      }),
      segment.offset,
      segment.text.length,
    );
    if (absEntities.length > 0) {
      logger.debug(`[EntityResolve] post=${post.id} absOverlap idx=${idx} chunkStart=${segment.offset} entities=${absEntities.length} types=${absEntities.map(e => `${e.type}@${e.offset}:${e.length}`).join(',')}`);
      return absEntities;
    }
  }

  // ── Mode 4: Snapshot text-matching ───────────────────────────────
  // When a snapshot exists, its text and entity offsets are from the
  // ORIGINAL imported message.  Text-matching (finding each segment's
  // text within the snapshot) correctly assigns entities to segments
  // regardless of [[copy]]-induced content shifts.
  if (post.telegramMessageSnapshot) {
    let occurrenceIndex = 0;
    if (allSegments) {
      for (const s of allSegments) {
        if (s.offset >= segment.offset) break;
        if (s.text === segment.text) occurrenceIndex++;
      }
    }
    const snapshotEntities = extractSnapshotEntitiesForSegment(
      post.telegramMessageSnapshot.text,
      post.telegramMessageSnapshot.entities,
      segment.text,
      occurrenceIndex,
    );
    if (snapshotEntities.length > 0) {
      logger.debug(`[EntityResolve] post=${post.id} snapshotMatch idx=${idx} entities=${snapshotEntities.length} types=${snapshotEntities.map(e => `${e.type}@${e.offset}:${e.length}`).join(',')}`);
      return snapshotEntities;
    }
  }

  // ── Mode 5: Original-frame remapping (Mode 4b) ──────────────────
  // Handles entities whose offsets are in the pre-[[copy]] text frame.
  // Uses segment origin reconstruction to map original offsets to current
  // content positions.
  if (totalMessages > 1 && Array.isArray(post.entities) && post.entities.length > 0) {
    const segText = segment.text;
    const segLen = segText.length;

    const origins = post.content && allSegments
      ? computeSegmentOrigins(post.content, allSegments)
      : [];

    if (origins.length > 0) {
      let chunkStart = segment.offset;
      {
        let occIdx = 0;
        for (let i = 0; i < idx; i++) {
          if (allSegments![i].text === segText) occIdx++;
        }
        let found = -1;
        for (let i = 0; i <= occIdx; i++) {
          found = post.content!.indexOf(segText, found + 1);
        }
        if (found >= 0) chunkStart = found;
      }

      const mode5Entities = post.entities.filter((e: any) => {
        const msgIdx = getEntityMsgIdx(e);
        return msgIdx == null || String(msgIdx) === String(idx);
      });

      const remapped = mode5Entities.map((e: any) => {
        const eEnd = e.offset + e.length;
        for (const o of origins) {
          const oEnd = o.origStart + allSegments![o.segIndex].text.length;
          if (e.offset < oEnd && eEnd > o.origStart) {
            const clampedStart = Math.max(e.offset, o.origStart);
            const clampedEnd = Math.min(eEnd, oEnd);
            return {
              ...e,
              offset: o.curStart + (clampedStart - o.origStart),
              length: clampedEnd - clampedStart,
              _segIdx: o.segIndex,
            };
          }
        }
        return { ...e, _segIdx: -1 };
      });

      const adjusted = remapped
        .filter((e: any) => e._segIdx === idx && e.length > 0)
        .map((e: any) => ({ ...e, offset: e.offset - chunkStart, _segIdx: undefined }));

      if (adjusted.length > 0) {
        logger.debug(`[EntityResolve] post=${post.id} origFrame idx=${idx} chunkStart=${chunkStart} entities=${adjusted.length} types=${adjusted.map(e => `${e.type}@${e.offset}:${e.length}`).join(',')}`);
        return adjusted;
      }
    }
  }

  // ── Mode 6: Final fallback ───────────────────────────────────────
  const fallbackEntities = post.entities.filter((e: any) => {
    const msgIdx = getEntityMsgIdx(e);
    return msgIdx == null || String(msgIdx) === String(idx);
  });
  const fromContent = extractContentEntitiesForSegment(fallbackEntities, segment.offset, segment.text.length);
  if (fromContent.length > 0) {
    logger.debug(`[EntityResolve] post=${post.id} fallback segment=[${segment.offset},${segment.offset + segment.text.length}) entities=${fromContent.length} types=${fromContent.map(e => `${e.type}@${e.offset}:${e.length}`).join(',')}`);
    return fromContent;
  }

  return [];
}

// ─── Core: splitPostToMessages ─────────────────────────────────────

export function splitPostToMessages(post: any): PostMessage[] {
  if (!post) return [];
  const segments = splitContentMessagesWithOffsets(post.content || '');
  if (segments.length === 0) return [];

  const totalLen = segments.reduce((s, seg) => s + seg.text.length, 0);

  return segments.map((seg, i) => {
    const rawEntities = Array.isArray(post.entities) ? post.entities : [];
    const entities = resolveEntitiesForMessage(post, seg, segments, i);

    const chunkStart = seg.offset;
    logger.debug(`[ChunkEntities] post=${post.id} chunk=${i} chunkStart=${chunkStart} chunkText="${seg.text.slice(0, 30)}" rawEntities=${rawEntities.length} filteredEntities=${entities.length} adjustedEntities=${entities.map(e => `${e.type}@${e.offset}:${e.length}`).join(',') || '(none)'}`);

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
    const sendEntities = params.entities ? structuredClone(params.entities) : undefined;
    await sendFormattedMessage(ctx, {
      text: params.text || '',
      entities: sendEntities,
    }, {
      buttons: payload.reply_markup?.inline_keyboard ? structuredClone(payload.reply_markup.inline_keyboard) : undefined,
      link_preview: !params.link_preview_options?.is_disabled,
      protect_content: params.protect_content,
    });
    return true;
  }

  if (method === 'sendMediaGroup') {
    const clonedMedia = params.media ? structuredClone(params.media) : [];
    logger.info(`[TelegramSend] post=${postId} sendMediaGroup items=${clonedMedia.length}`);
    await ctx.replyWithMediaGroup(clonedMedia);
    if (payload.reply_markup?.inline_keyboard?.length) {
      await ctx.reply('عملیات:', Markup.inlineKeyboard(structuredClone(payload.reply_markup.inline_keyboard)));
    }
    return true;
  }

  await sendFormattedMessage(ctx, {
    text: params.text || '',
    caption: params.caption ? structuredClone(params.caption) : undefined,
    entities: params.entities ? structuredClone(params.entities) : undefined,
    caption_entities: params.caption_entities ? structuredClone(params.caption_entities) : undefined,
  }, {
    buttons: payload.reply_markup?.inline_keyboard ? structuredClone(payload.reply_markup.inline_keyboard) : undefined,
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
        const safePayload = sanitizeForSend(payload);
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
