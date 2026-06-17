import { Markup } from 'telegraf';
import { logger } from '../utils/logger';
import { sanitizeTelegramText } from '../utils/unicode';

const ENTITY_TYPES = new Set([
  'mention', 'hashtag', 'cashtag', 'bot_command', 'url', 'email', 'phone_number', 'bold', 'italic',
  'underline', 'strikethrough', 'spoiler', 'blockquote', 'expandable_blockquote', 'code', 'pre',
  'text_link', 'text_mention', 'custom_emoji',
]);

const SNAPSHOT_FIELDS = [
  'message_id', 'text', 'caption', 'entities', 'caption_entities', 'media_group_id', 'reply_markup',
  'photo', 'video', 'animation', 'document', 'audio', 'voice', 'sticker', 'quote', 'forward_origin',
  'has_media_spoiler', 'show_caption_above_media',
];

const MEDIA_SENDERS: Record<string, { inputType: string; method: string; apiMethod: string }> = {
  photo: { inputType: 'photo', method: 'replyWithPhoto', apiMethod: 'sendPhoto' },
  video: { inputType: 'video', method: 'replyWithVideo', apiMethod: 'sendVideo' },
  animation: { inputType: 'animation', method: 'replyWithAnimation', apiMethod: 'sendAnimation' },
  document: { inputType: 'document', method: 'replyWithDocument', apiMethod: 'sendDocument' },
  audio: { inputType: 'audio', method: 'replyWithAudio', apiMethod: 'sendAudio' },
  voice: { inputType: 'voice', method: 'replyWithVoice', apiMethod: 'sendVoice' },
};

export function validateTelegramHtml(html?: string | null): string[] {
  if (!html) return [];
  const issues: string[] = [];
  const allowed = /^(b|strong|i|em|u|ins|s|strike|del|span|tg-spoiler|a|tg-emoji|code|pre|blockquote)$/i;
  const stack: string[] = [];
  const tagRe = /<\/?([a-z0-9-]+)(?:\s[^>]*)?>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html))) {
    const full = m[0];
    const tag = m[1].toLowerCase();
    if (!allowed.test(tag)) issues.push(`[PostEntity] unsupported HTML tag <${tag}>`);
    if (full.startsWith('</')) {
      const prev = stack.pop();
      if (prev && prev !== tag) issues.push(`[PostEntity] mismatched HTML tag </${tag}> expected </${prev}>`);
    } else if (!full.endsWith('/>') && !['br'].includes(tag)) stack.push(tag);
  }
  if (stack.length) issues.push(`[PostEntity] unclosed HTML tags: ${stack.join(', ')}`);
  return issues;
}

function telegramLength(text: string) {
  return Buffer.from(text || '', 'utf16le').length / 2;
}

export function validateTelegramEntities(text: string | null | undefined, entities: any[] | null | undefined): string[] {
  const issues: string[] = [];
  if (!entities) return issues;
  const length = telegramLength(text || '');
  entities.forEach((e, i) => {
    if (!ENTITY_TYPES.has(e.type)) issues.push(`[PostEntity] entity ${i} has unsupported type ${e.type}`);
    if (!Number.isInteger(e.offset) || !Number.isInteger(e.length) || e.offset < 0 || e.length < 1) issues.push(`[PostEntity] entity ${i} has invalid range`);
    if ((e.offset || 0) + (e.length || 0) > length) issues.push(`[PostEntity] entity ${i} exceeds text length`);
    if (e.type === 'text_link' && !e.url) issues.push(`[PostEntity] text_link entity ${i} requires url`);
    if (e.type === 'custom_emoji' && !e.custom_emoji_id) issues.push(`[PostEntity] custom_emoji entity ${i} requires custom_emoji_id`);
  });
  return issues;
}

function cloneJson<T>(value: T): T {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function cleanEntities(entities: any[] | null | undefined) {
  if (!Array.isArray(entities)) return undefined;
  return cloneJson(entities).map((e: any) => {
    const out = { ...e, custom_emoji_id: e.custom_emoji_id ?? e.customEmojiId };
    if (out.custom_emoji_id === undefined) delete out.custom_emoji_id;
    return out;
  }).filter((e: any) => ENTITY_TYPES.has(e.type));
}

function nonEmptyEntities(entities: any[] | null | undefined) {
  const cleaned = cleanEntities(entities);
  return cleaned && cleaned.length ? cleaned : undefined;
}

function buttonToTelegram(btn: any, postId?: number) {
  const text = sanitizeTelegramText(btn?.text || 'Link', 128);
  const value = btn?.value || btn?.url || btn?.callback_data || '';
  switch (btn?.type) {
    case 'URL': return Markup.button.url(text, value);
    case 'CALLBACK': return Markup.button.callback(text, btn.callback_data || value || `post:user:click:${JSON.stringify({ postId, text, type: btn.type })}`);
    case 'WEB_APP':
    case 'OPEN_MINI_APP': return Markup.button.webApp(text, value);
    case 'LOGIN_URL': return { text, login_url: btn.login_url || btn.payload?.login_url || { url: value } };
    case 'COPY_TEXT': return { text, copy_text: { text: value } };
    case 'SWITCH_INLINE':
    case 'SEND_COMMAND': return Markup.button.switchToChat(text, value);
    case 'SWITCH_INLINE_CURRENT_CHAT': return Markup.button.switchToCurrentChat(text, value);
    case 'INTERNAL_NAV': return Markup.button.callback(text, `post:user:nav:${sanitizeTelegramText(value || 'noop', 64)}`);
    default: return value?.startsWith('http') ? Markup.button.url(text, value) : Markup.button.callback(text, value || 'noop');
  }
}

export function buildTelegramKeyboard(buttons: any[] | null | undefined, postId?: number): any[][] {
  if (!Array.isArray(buttons)) return [];
  return buttons.map(row => (Array.isArray(row) ? row : []).map(btn => buttonToTelegram(btn, postId)).filter(Boolean));
}

export function extractTelegramSnapshot(message: any) {
  const nativeSnapshot: any = {};
  for (const key of SNAPSHOT_FIELDS) if (message[key] !== undefined) nativeSnapshot[key] = cloneJson(message[key]);
  const textEntities = cleanEntities(message.entities) || [];
  const captionEntities = cleanEntities(message.caption_entities) || [];
  const type = ['photo','video','animation','voice','audio','document','sticker'].find(k => message[k]);
  const media: any[] = [];
  if (type) {
    const obj = type === 'photo' ? message.photo[message.photo.length - 1] : message[type];
    media.push({ type, fileId: obj.file_id, fileUniqueId: obj.file_unique_id, width: obj.width, height: obj.height, duration: obj.duration, fileName: obj.file_name, mimeType: obj.mime_type, fileSize: obj.file_size, mediaGroupId: message.media_group_id, caption: message.caption, captionEntities, hasMediaSpoiler: message.has_media_spoiler, showCaptionAboveMedia: message.show_caption_above_media, payload: cloneJson(obj) });
  }
  const keyboard = cloneJson(message.reply_markup?.inline_keyboard || []);
  return { text: message.text || '', caption: message.caption, entities: textEntities, captionEntities, media, keyboard, message: nativeSnapshot, rawMessage: cloneJson(message) };
}

function entitiesFromRows(rows: any[] | undefined, source: 'text' | 'caption') {
  if (!Array.isArray(rows)) return undefined;
  return cleanEntities(rows.filter((r: any) => !r.source || r.source === source).map((r: any) => r.payload || r));
}

export class TelegramNativeRenderer {
  render(post: any) {
    const snapshot = post.telegramMessageSnapshot || {};
    const payload = post.telegramPayload || {};
    const text = snapshot.text ?? payload.text ?? post.content ?? post.caption ?? post.title ?? '';
    const caption = snapshot.caption ?? payload.caption ?? post.caption ?? undefined;
    const textEntities = nonEmptyEntities(snapshot.entities) || nonEmptyEntities(payload.entities) || entitiesFromRows(post.postEntities || post.entities, 'text') || cleanEntities(post.entities);
    const captionEntities = nonEmptyEntities(snapshot.caption_entities) || nonEmptyEntities(payload.captionEntities) || entitiesFromRows(post.postEntities || post.entities, 'caption') || (caption ? cleanEntities(post.entities) : undefined);
    const media = Array.isArray(payload.media) && payload.media.length ? cloneJson(payload.media) : extractTelegramSnapshot(snapshot).media;
    const keyboard = payload.keyboard || snapshot.reply_markup?.inline_keyboard || post.buttons || [];
    const buttons = buildTelegramKeyboard(keyboard, post.id);
    const markup = buttons.length ? Markup.inlineKeyboard(buttons) : {};
    return { text, caption, textEntities, captionEntities, media, buttons, common: { link_preview_options: { is_disabled: true }, ...markup }, renderer: (post.telegramMessageSnapshot && 'telegramMessageSnapshot') || (post.telegramPayload && 'telegramPayload') || (textEntities || captionEntities ? 'entities table' : 'raw content') };
  }

  buildRequest(post: any) {
    const p = this.render(post);
    if (p.media.length > 1) return { method: 'sendMediaGroup', media: p.media.map((m: any, i: number) => ({ type: MEDIA_SENDERS[m.type]?.inputType || m.type, media: m.fileId, caption: i === 0 ? (m.caption || p.caption || p.text || undefined) : undefined, caption_entities: i === 0 ? nonEmptyEntities(m.captionEntities) || p.captionEntities || p.textEntities : undefined })) };
    if (p.media.length === 1) {
      const m = p.media[0];
      const sender = MEDIA_SENDERS[m.type] || MEDIA_SENDERS.document;
      if (m.type === 'sticker') return { method: 'sendSticker', sticker: m.fileId, ...p.common };
      return { method: sender.apiMethod, media: m.fileId, ...p.common, caption: m.caption || p.caption || p.text || undefined, caption_entities: cleanEntities(m.captionEntities) || p.captionEntities || undefined };
    }
    const request: any = { method: 'sendMessage', text: p.text || '(پست خالی)', ...p.common, entities: p.textEntities || undefined };
    return request;
  }
}

function assertNoParseModeWithEntities(request: any) {
  const entityCount = (request.entities?.length || 0) + (request.caption_entities?.length || 0) + (Array.isArray(request.media) ? request.media.reduce((n: number, m: any) => n + (m.caption_entities?.length || 0), 0) : 0);
  if (entityCount > 0 && request.parse_mode !== undefined) throw new Error('[TelegramSend] entities present but parse_mode is set');
}

function logRequest(method: string, request: any) {
  assertNoParseModeWithEntities(request);
  logger.info(`[TelegramSend] ${method} ${JSON.stringify(request, (_, v) => typeof v === 'bigint' ? v.toString() : v)}`);
}

export function buildPostDebugSnapshot(post: any) {
  const renderer = new TelegramNativeRenderer();
  const rendered = renderer.render(post);
  const finalTelegramApiRequest = renderer.buildRequest(post);
  const textValidation = validateTelegramEntities(rendered.text, rendered.textEntities);
  const captionValidation = validateTelegramEntities(rendered.caption, rendered.captionEntities);
  return {
    dbContent: { title: post.title, content: post.content, caption: post.caption, rawContent: post.rawContent, renderedContent: post.renderedContent, contentFormat: post.contentFormat },
    entities: { post: post.entities, textEntities: rendered.textEntities, captionEntities: rendered.captionEntities },
    captionEntities: rendered.captionEntities,
    parseMode: post.parseMode,
    telegramPayload: post.telegramPayload,
    telegramMessageSnapshot: post.telegramMessageSnapshot,
    finalTelegramApiRequest,
    detectedRenderer: rendered.renderer,
    entityValidationResult: { valid: textValidation.length + captionValidation.length === 0, issues: [...textValidation, ...captionValidation] },
  };
}

export function comparePostNativeRoundtrip(post: any) {
  const debug = buildPostDebugSnapshot(post);
  const original = post.telegramMessageSnapshot || post.telegramPayload || {};
  const finalRequest = debug.finalTelegramApiRequest;
  const originalText = original.text ?? original.caption ?? post.telegramPayload?.text;
  const finalText = finalRequest.text ?? finalRequest.caption ?? finalRequest.media?.[0]?.caption;
  const originalEntities = cleanEntities(original.entities ?? post.telegramPayload?.entities) || [];
  const originalCaptionEntities = cleanEntities(original.caption_entities ?? post.telegramPayload?.captionEntities) || [];
  const sentEntities = cleanEntities(finalRequest.entities) || [];
  const sentCaptionEntities = cleanEntities(finalRequest.caption_entities ?? finalRequest.media?.[0]?.caption_entities) || [];
  const diff = {
    modifiedText: originalText !== undefined && originalText !== finalText,
    lostEntities: originalEntities.filter((e: any) => !sentEntities.some((s: any) => JSON.stringify(s) === JSON.stringify(e))),
    lostCaptionEntities: originalCaptionEntities.filter((e: any) => !sentCaptionEntities.some((s: any) => JSON.stringify(s) === JSON.stringify(e))),
    offsetMismatch: [...sentEntities, ...sentCaptionEntities].some((e: any) => validateTelegramEntities(finalText || '', [e]).length > 0),
    missingQuote: [...originalEntities, ...originalCaptionEntities].some((e: any) => e.type === 'blockquote' || e.type === 'expandable_blockquote') && ![...sentEntities, ...sentCaptionEntities].some((e: any) => e.type === 'blockquote' || e.type === 'expandable_blockquote'),
  };
  return { originalTelegramSnapshot: original, renderedOutput: finalRequest, differences: diff };
}

export async function renderPostToTelegram(ctx: any, post: any) {
  const renderer = new TelegramNativeRenderer();
  const payload = renderer.render(post);
  const finalRequest = renderer.buildRequest(post);
  logger.info(`[PostRender] post=${post.id} renderer=${payload.renderer} media=${payload.media.length} type=${finalRequest.method} textLength=${telegramLength(payload.text)} captionLength=${telegramLength(payload.caption || '')}`);
  logger.info(`[TelegramSnapshot] post=${post.id} ${JSON.stringify(post.telegramMessageSnapshot || {})}`);
  logger.info(`[TelegramPayload] post=${post.id} ${JSON.stringify(post.telegramPayload || {})}`);
  logger.info(`[TelegramEntities] post=${post.id} text=${payload.textEntities?.length || 0} caption=${payload.captionEntities?.length || 0} types=${[...(payload.textEntities || []), ...(payload.captionEntities || [])].map((e: any) => e.type).join(',')}`);

  if (payload.media.length > 1) {
    logRequest('sendMediaGroup', finalRequest);
    await ctx.replyWithMediaGroup(finalRequest.media);
    if (payload.buttons.length) await ctx.reply('عملیات:', Markup.inlineKeyboard(payload.buttons));
    return;
  }
  if (payload.media.length === 1) {
    const m = payload.media[0];
    if (m.type === 'sticker') {
      logRequest('sendSticker', finalRequest);
      return ctx.replyWithSticker(m.fileId, payload.buttons.length ? Markup.inlineKeyboard(payload.buttons) : undefined);
    }
    const sender = MEDIA_SENDERS[m.type] || MEDIA_SENDERS.document;
    const { method, media, ...extra } = finalRequest;
    logRequest(sender.apiMethod, finalRequest);
    return ctx[sender.method](media, extra);
  }
  const { method, text, ...request } = finalRequest;
  logRequest('sendMessage', finalRequest);
  return ctx.reply(text, request);
}
