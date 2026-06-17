import { Markup } from 'telegraf';
import { logger } from '../utils/logger';
import { sanitizeTelegramText } from '../utils/unicode';

const ENTITY_TYPES = new Set([
  'mention', 'hashtag', 'cashtag', 'bot_command', 'url', 'email', 'phone_number', 'bold', 'italic',
  'underline', 'strikethrough', 'spoiler', 'blockquote', 'expandable_blockquote', 'code', 'pre',
  'text_link', 'text_mention', 'custom_emoji',
]);

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

function cleanEntities(entities: any[] | null | undefined) {
  if (!Array.isArray(entities)) return undefined;
  return entities.map(e => ({ ...e, custom_emoji_id: e.custom_emoji_id ?? e.customEmojiId })).filter(e => ENTITY_TYPES.has(e.type));
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
  const text = message.text || message.caption || '';
  const entities = message.entities || message.caption_entities || [];
  const type = ['photo','video','animation','voice','audio','document','sticker'].find(k => message[k]);
  const media: any[] = [];
  if (type) {
    const obj = type === 'photo' ? message.photo[message.photo.length - 1] : message[type];
    media.push({ type, fileId: obj.file_id, fileUniqueId: obj.file_unique_id, width: obj.width, height: obj.height, duration: obj.duration, fileName: obj.file_name, mimeType: obj.mime_type, fileSize: obj.file_size, mediaGroupId: message.media_group_id, caption: message.caption, captionEntities: message.caption_entities, payload: obj });
  }
  const keyboard = message.reply_markup?.inline_keyboard || [];
  return { text, caption: message.caption, entities, media, keyboard, message };
}

function buildPayload(post: any) {
  const snapshot = post.telegramMessageSnapshot || {};
  const payload = post.telegramPayload || {};
  const text = snapshot.text ?? payload.text ?? post.content ?? post.caption ?? post.title ?? '';
  const caption = snapshot.caption ?? payload.caption ?? post.caption ?? undefined;
  const textEntities = cleanEntities(snapshot.entities ?? payload.entities ?? post.entities);
  const captionEntities = cleanEntities(snapshot.caption_entities ?? payload.captionEntities ?? payload.entities ?? post.entities);
  const media = Array.isArray(payload.media) && payload.media.length ? payload.media : extractTelegramSnapshot(snapshot).media;
  const keyboard = payload.keyboard || snapshot.reply_markup?.inline_keyboard || post.buttons || [];
  const buttons = buildTelegramKeyboard(keyboard, post.id);
  const markup = buttons.length ? Markup.inlineKeyboard(buttons) : {};
  return { text, caption, textEntities, captionEntities, media, buttons, common: { link_preview_options: { is_disabled: true }, ...markup } };
}

function logRequest(method: string, request: any) {
  logger.info(`[TelegramSend] ${method} ${JSON.stringify(request, (_, v) => typeof v === 'bigint' ? v.toString() : v)}`);
}

export function buildPostDebugSnapshot(post: any) {
  const rendered = buildPayload(post);
  const hasMedia = rendered.media.length > 0;
  return {
    storedContent: { content: post.content, caption: post.caption, contentFormat: post.contentFormat },
    entities: { post: post.entities, finalTextEntities: rendered.textEntities, finalCaptionEntities: rendered.captionEntities },
    parseMode: post.parseMode,
    telegramPayload: post.telegramPayload,
    telegramMessageSnapshot: post.telegramMessageSnapshot,
    finalTelegramApiRequest: hasMedia
      ? { method: rendered.media.length > 1 ? 'sendMediaGroup' : MEDIA_SENDERS[rendered.media[0].type]?.apiMethod, media: rendered.media, caption: rendered.caption || rendered.text || undefined, caption_entities: rendered.captionEntities }
      : { method: 'sendMessage', text: rendered.text || '(پست خالی)', entities: rendered.textEntities, parse_mode: (post.telegramPayload || post.telegramMessageSnapshot) ? undefined : post.parseMode },
  };
}

export async function renderPostToTelegram(ctx: any, post: any) {
  const payload = buildPayload(post);
  logger.info(`[PostRender] post=${post.id} native=${!!post.telegramPayload} snapshot=${!!post.telegramMessageSnapshot} media=${payload.media.length}`);
  logger.info(`[TelegramPayload] post=${post.id} ${JSON.stringify({ textLength: telegramLength(payload.text), captionLength: telegramLength(payload.caption || ''), media: payload.media.map((m: any) => m.type) })}`);
  logger.info(`[TelegramEntities] post=${post.id} text=${payload.textEntities?.length || 0} caption=${payload.captionEntities?.length || 0}`);

  if (post.telegramPayload || post.telegramMessageSnapshot) {
    if (payload.media.length > 1) {
      const mediaGroup = payload.media.map((m: any, i: number) => ({ type: MEDIA_SENDERS[m.type]?.inputType || m.type, media: m.fileId, caption: i === 0 ? (m.caption || payload.caption || payload.text || undefined) : undefined, caption_entities: i === 0 ? cleanEntities(m.captionEntities) || payload.captionEntities : undefined }));
      logRequest('sendMediaGroup', { media: mediaGroup });
      await ctx.replyWithMediaGroup(mediaGroup);
      if (payload.buttons.length) await ctx.reply('عملیات:', Markup.inlineKeyboard(payload.buttons));
      return;
    }
    if (payload.media.length === 1) {
      const m = payload.media[0];
      if (m.type === 'sticker') {
        logRequest('sendSticker', { sticker: m.fileId });
        return ctx.replyWithSticker(m.fileId, payload.buttons.length ? Markup.inlineKeyboard(payload.buttons) : undefined);
      }
      const sender = MEDIA_SENDERS[m.type] || MEDIA_SENDERS.document;
      const extra = { ...payload.common, caption: m.caption || payload.caption || payload.text || undefined, caption_entities: cleanEntities(m.captionEntities) || payload.captionEntities || undefined };
      logRequest(sender.apiMethod, { media: m.fileId, ...extra });
      return ctx[sender.method](m.fileId, extra);
    }
    const request = { ...payload.common, entities: payload.textEntities || undefined };
    logRequest('sendMessage', { text: payload.text || '(پست خالی)', ...request });
    return ctx.reply(payload.text || '(پست خالی)', request);
  }

  const parseMode = post.parseMode || 'Markdown';
  logRequest('sendMessage', { text: payload.text || '(پست خالی)', parse_mode: parseMode });
  return ctx.reply(payload.text || '(پست خالی)', { ...payload.common, parse_mode: parseMode });
}
