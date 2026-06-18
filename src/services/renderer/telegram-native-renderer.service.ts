import { Markup } from 'telegraf';
import { logger } from '../../utils/logger';
import { sanitizeTelegramText } from '../../utils/unicode';

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

function cloneJson<T>(value: T): T {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function cleanEntities(entities: any[] | null | undefined) {
  if (!Array.isArray(entities)) return undefined;
  const result = cloneJson(entities).map((e: any) => {
    const out = { ...e, custom_emoji_id: e.custom_emoji_id ?? e.customEmojiId };
    if (out.custom_emoji_id === undefined) delete out.custom_emoji_id;
    return out;
  }).filter((e: any) => ENTITY_TYPES.has(e.type));
  return result.length > 0 ? result : undefined;
}

function nonEmptyEntities(entities: any[] | null | undefined) {
  const cleaned = cleanEntities(entities);
  return cleaned && cleaned.length ? cleaned : undefined;
}

function telegramLength(text: string) {
  return Buffer.from(text || '', 'utf16le').length / 2;
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

function buildTelegramKeyboard(buttons: any[] | null | undefined, postId?: number): any[][] {
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
  const result = cleanEntities(rows.filter((r: any) => !r.source || r.source === source).map((r: any) => r.payload || r));
  return result && result.length > 0 ? result : undefined;
}

export class TelegramNativeRenderer {
  render(post: any) {
    const snapshot = post.telegramMessageSnapshot || {};
    const payload = post.telegramPayload || {};
    const text = snapshot.text ?? payload.text ?? post.contentText ?? post.content ?? post.caption ?? post.title ?? '';
    const caption = snapshot.caption ?? payload.caption ?? post.caption ?? undefined;
    const textEntities = nonEmptyEntities(snapshot.entities) || nonEmptyEntities(payload.entities) || nonEmptyEntities(entitiesFromRows(post.postEntities || post.richEntities, 'text')) || nonEmptyEntities(cleanEntities(post.contentEntities)) || nonEmptyEntities(cleanEntities(post.entities));
    const captionEntities = nonEmptyEntities(snapshot.caption_entities) || nonEmptyEntities(payload.captionEntities) || nonEmptyEntities(entitiesFromRows(post.postEntities || post.richEntities, 'caption')) || (caption ? nonEmptyEntities(cleanEntities(post.contentEntities)) || nonEmptyEntities(cleanEntities(post.entities)) : undefined);
    const media = Array.isArray(payload.media) && payload.media.length ? cloneJson(payload.media) : extractTelegramSnapshot(snapshot).media;
    const keyboard = payload.keyboard || snapshot.reply_markup?.inline_keyboard || post.buttons || [];
    const buttons = buildTelegramKeyboard(keyboard, post.id);
    const markup = buttons.length ? Markup.inlineKeyboard(buttons) : {};

    let detectedRenderer = 'raw content';
    if (post.telegramMessageSnapshot) detectedRenderer = 'telegramMessageSnapshot';
    else if (post.telegramPayload) detectedRenderer = 'telegramPayload';
    else if (post.contentEntities) detectedRenderer = 'contentEntities';
    else if (post.contentFormat === 'telegram_entities') detectedRenderer = 'contentFormat=telegram_entities';
    else if (textEntities || captionEntities) detectedRenderer = 'entities table';

    if (textEntities && textEntities.length === 0) {
      logger.warn(`[Renderer] post=${post.id} textEntities is empty array — will be dropped before Telegram API call`);
    }
    if (Array.isArray(post.contentEntities) && post.contentEntities.length > 0 && (!textEntities || textEntities.length === 0)) {
      logger.warn(`[Renderer] post=${post.id} contentEntities has ${post.contentEntities.length} items but textEntities is empty — OR short-circuit bug`);
    }

    return { text, caption, textEntities, captionEntities, media, buttons, common: { link_preview_options: { is_disabled: true }, ...markup }, renderer: detectedRenderer };
  }

  buildRequest(post: any) {
    const p = this.render(post);
    if (p.media.length > 1) {
      return {
        method: 'sendMediaGroup',
        media: p.media.map((m: any, i: number) => ({
          type: MEDIA_SENDERS[m.type]?.inputType || m.type,
          media: m.fileId,
          caption: i === 0 ? (m.caption || p.caption || p.text || undefined) : undefined,
          caption_entities: i === 0 ? nonEmptyEntities(m.captionEntities) || nonEmptyEntities(p.captionEntities) || nonEmptyEntities(p.textEntities) : undefined,
        })),
      };
    }
    if (p.media.length === 1) {
      const m = p.media[0];
      const sender = MEDIA_SENDERS[m.type] || MEDIA_SENDERS.document;
      if (m.type === 'sticker') return { method: 'sendSticker', sticker: m.fileId, ...p.common };
      return {
        method: sender.apiMethod,
        media: m.fileId,
        ...p.common,
        caption: m.caption || p.caption || p.text || undefined,
        caption_entities: nonEmptyEntities(cleanEntities(m.captionEntities)) || nonEmptyEntities(p.captionEntities) || undefined,
      };
    }
    const request: any = { method: 'sendMessage', text: p.text || '(پست خالی)', ...p.common, entities: p.textEntities || undefined };
    return request;
  }
}

export { telegramLength, nonEmptyEntities, cleanEntities, cloneJson, buildTelegramKeyboard, MEDIA_SENDERS, ENTITY_TYPES };
