import { Markup } from 'telegraf';
import { logger } from '../../utils/logger';
import { sanitizeTelegramText } from '../../utils/unicode';

const ENTITY_TYPES = new Set([
  'mention', 'hashtag', 'cashtag', 'bot_command', 'url', 'email', 'phone_number', 'bold', 'italic',
  'underline', 'strikethrough', 'spoiler', 'blockquote', 'expandable_blockquote', 'code', 'pre',
  'text_link', 'text_mention', 'custom_emoji',
]);

export interface TelegramPayload {
  method: string;
  text?: string;
  entities?: any[];
  caption?: string;
  caption_entities?: any[];
  media?: any;
  reply_markup?: any;
  link_preview_options?: any;
  [key: string]: any;
}

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
  video_note: { inputType: 'video_note', method: 'replyWithVideoNote', apiMethod: 'sendVideoNote' },
};

function cloneJson<T>(value: T): T {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v));
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

function buttonToTelegram(btn: any, postId?: number, row?: number, col?: number, entityPrefix?: string) {
  const text = sanitizeTelegramText(btn?.text || 'Link', 128);
  const value = btn?.value || btn?.url || btn?.callback_data || '';
  const btnType = btn?.type || 'UNKNOWN';
  const pfx = entityPrefix || 'post';
  let result: any;
  switch (btn?.type) {
    case 'URL': {
      if (!value) {
        result = Markup.button.callback(text, `${pfx}:user:click:${postId}:${row}:${col}`);
      } else {
        result = Markup.button.url(text, value);
      }
      break;
    }
    case 'CALLBACK': {
      const cbData = btn.callback_data
        || `${pfx}:user:click:${postId}:${row}:${col}`;
      result = Markup.button.callback(text, cbData);
      break;
    }
    case 'WEB_APP':
    case 'OPEN_MINI_APP': result = Markup.button.webApp(text, value); break;
    case 'LOGIN_URL': result = { text, login_url: btn.login_url || btn.payload?.login_url || { url: value } }; break;
    case 'COPY_TEXT': result = { text, copy_text: { text: value } }; break;
    case 'SWITCH_INLINE':
    case 'SEND_COMMAND': result = Markup.button.switchToChat(text, value); break;
    case 'SWITCH_INLINE_CURRENT_CHAT': result = Markup.button.switchToCurrentChat(text, value); break;
    case 'POPUP': result = Markup.button.callback(text, `${pfx}:user:popup:${postId}:${row}:${col}`); break;
    case 'COMMAND': result = Markup.button.callback(text, `${pfx}:user:cmd:${value}`); break;
    case 'INTERNAL_NAV': result = Markup.button.callback(text, `${pfx}:user:nav:${postId}:${row}:${col}`); break;
    default: result = value?.startsWith('http') ? Markup.button.url(text, value) : Markup.button.callback(text, `${pfx}:user:click:${postId}:${row}:${col}`); break;
  }
  const finalCb = result?.callback_data || result?.url || '(no callback)';
  logger.info(`[BTN_RENDER] entity=${pfx} id=${postId} row=${row} col=${col} type="${btnType}" text="${text}" value="${value}" → callback_data="${finalCb}"`);
  // Preserve all extra properties from original button (e.g. style)
  if (result && btn) {
    for (const key of Object.keys(btn)) {
      if (!(key in result) && key !== 'type' && key !== 'value' && key !== 'url') {
        (result as any)[key] = btn[key];
      }
    }
  }
  return result;
}

function buildTelegramKeyboard(buttons: any[] | null | undefined, postId?: number, entityPrefix?: string): any[][] {
  if (!Array.isArray(buttons)) return [];
  return buttons.map((row, r) => (Array.isArray(row) ? row : []).map((btn, c) => buttonToTelegram(btn, postId, r, c, entityPrefix)).filter(Boolean));
}

export function extractTelegramSnapshot(message: any) {
  const nativeSnapshot: any = {};
  for (const key of SNAPSHOT_FIELDS) if (message[key] !== undefined) nativeSnapshot[key] = cloneJson(message[key]);
  const textEntities = cleanEntities(message.entities) || [];
  const captionEntities = cleanEntities(message.caption_entities) || [];
  const type = ['photo','video','animation','voice','audio','document','sticker','video_note'].find(k => message[k]);
  const media: any[] = [];
  if (type) {
    const obj = type === 'photo' ? message.photo[message.photo.length - 1] : message[type];
    const base: any = { type, fileId: obj.file_id, fileUniqueId: obj.file_unique_id, mediaGroupId: message.media_group_id, caption: message.caption, captionEntities, hasMediaSpoiler: message.has_media_spoiler, showCaptionAboveMedia: message.show_caption_above_media, payload: cloneJson(obj) };
    if (type === 'video_note') {
      base.length = obj.length;
      base.fileSize = obj.file_size;
      base.thumbnailFileId = obj.thumbnail?.file_id;
    } else {
      base.width = obj.width;
      base.height = obj.height;
      base.duration = obj.duration;
      base.fileName = obj.file_name;
      base.mimeType = obj.mime_type;
      base.fileSize = obj.file_size;
    }
    media.push(base);
  }
  const keyboard = cloneJson(message.reply_markup?.inline_keyboard || []);
  return { text: message.text || '', caption: message.caption, entities: textEntities, captionEntities, media, keyboard, message: nativeSnapshot, rawMessage: cloneJson(message) };
}

export class TelegramNativeRenderer {
  render(post: any) {
    const snapshot = post.telegramMessageSnapshot || {};
    const payload = post.telegramPayload || {};
    const text = snapshot.text ?? payload.text ?? post.title ?? '';
    const caption = snapshot.caption ?? payload.caption ?? undefined;
    const textEntities = nonEmptyEntities(snapshot.entities) || nonEmptyEntities(payload.entities) || undefined;
    const captionEntities = nonEmptyEntities(snapshot.caption_entities) || nonEmptyEntities(payload.captionEntities) || undefined;
    const media = Array.isArray(payload.media) && payload.media.length ? cloneJson(payload.media) : extractTelegramSnapshot(snapshot).media;
    const keyboard = payload.keyboard || snapshot.reply_markup?.inline_keyboard || [];
    const buttons = buildTelegramKeyboard(keyboard, post.id);
    const markup = buttons.length ? Markup.inlineKeyboard(buttons) : {};

    let detectedRenderer = 'snapshot';
    if (post.telegramMessageSnapshot) detectedRenderer = 'telegramMessageSnapshot';
    else if (post.telegramPayload) detectedRenderer = 'telegramPayload';
    else if (textEntities || captionEntities) detectedRenderer = 'inline entities';

    if (textEntities && textEntities.length === 0) {
      logger.warn(`[Renderer] post=${post.id} textEntities is empty array — will be dropped before Telegram API call`);
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

// ─── HARD ISOLATION BEFORE SEND ────────────────────────────────────

export function sanitizeForSend(payload: TelegramPayload): TelegramPayload {
  const safe: TelegramPayload = {
    ...payload,
    entities: payload.entities ? structuredClone(payload.entities) : undefined,
    reply_markup: payload.reply_markup ? structuredClone(payload.reply_markup) : undefined,
    caption_entities: payload.caption_entities ? structuredClone(payload.caption_entities) : undefined,
  };
  if (payload.media) {
    safe.media = structuredClone(payload.media);
  }
  logger.info(`[Sanitize] method=${payload.method} entities=${Array.isArray(payload.entities) ? payload.entities.length : 'none'} refCheck=${payload.entities !== safe.entities}`);
  return safe;
}

// ─── PURE RENDER MESSAGE (no cascade, no shared state) ────────────

export function ensureNoSharedRefs(ctx: any): void {
  if (ctx.__sharedReference === true) {
    throw new Error('[RENDER] RENDER PIPELINE LEAK DETECTED — shared reference flag is set');
  }
  if (ctx.message && ctx.message.__sharedReference === true) {
    throw new Error('[RENDER] RENDER PIPELINE LEAK DETECTED — message has shared reference flag');
  }
}

export function renderMessage(
  content: string,
  entities: any[],
  buttons: any[][],
  media: any[] | undefined,
  postId: number,
): TelegramPayload {
  const text = content || '';
  const textEntities = nonEmptyEntities(entities && entities.length ? cloneJson(entities) : undefined);
  const btnKeyboard = buttons && buttons.length > 0 ? buildTelegramKeyboard(cloneJson(buttons), postId) : [];
  const markup = btnKeyboard.length ? Markup.inlineKeyboard(btnKeyboard) : undefined;
  const mediaList = media && media.length > 0 ? cloneJson(media) : [];

  if (mediaList.length > 1) {
    return {
      method: 'sendMediaGroup',
      media: mediaList.map((m: any, i: number) => ({
        type: MEDIA_SENDERS[m.type]?.inputType || m.type,
        media: m.fileId,
        caption: i === 0 ? (m.caption || text || undefined) : undefined,
        caption_entities: i === 0 ? (nonEmptyEntities(cloneJson(m.captionEntities)) || textEntities) : undefined,
      })),
    };
  }

  if (mediaList.length === 1) {
    const m = mediaList[0];
    if (m.type === 'sticker') {
      return { method: 'sendSticker', sticker: m.fileId, reply_markup: markup, link_preview_options: { is_disabled: true } };
    }
    const sender = MEDIA_SENDERS[m.type] || MEDIA_SENDERS.document;
    return {
      method: sender.apiMethod,
      media: m.fileId,
      caption: m.caption || text || undefined,
      caption_entities: nonEmptyEntities(cloneJson(m.captionEntities)) || textEntities,
      reply_markup: markup,
      link_preview_options: { is_disabled: true },
    };
  }

  return {
    method: 'sendMessage',
    text: text || '(پست خالی)',
    entities: textEntities,
    reply_markup: markup,
    link_preview_options: { is_disabled: true },
  };
}

export { telegramLength, nonEmptyEntities, cleanEntities, cloneJson, buildTelegramKeyboard, MEDIA_SENDERS, ENTITY_TYPES };
