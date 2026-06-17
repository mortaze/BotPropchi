import { Markup } from 'telegraf';
import { logger } from '../utils/logger';
import { sanitizeTelegramText } from '../utils/unicode';

const ENTITY_TYPES = new Set([
  'mention', 'hashtag', 'cashtag', 'bot_command', 'url', 'email', 'phone_number', 'bold', 'italic',
  'underline', 'strikethrough', 'spoiler', 'blockquote', 'expandable_blockquote', 'code', 'pre',
  'text_link', 'text_mention', 'custom_emoji',
]);

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

export function validateTelegramEntities(text: string | null | undefined, entities: any[] | null | undefined): string[] {
  const issues: string[] = [];
  if (!entities) return issues;
  const length = [...(text || '')].length;
  entities.forEach((e, i) => {
    if (!ENTITY_TYPES.has(e.type)) issues.push(`[PostEntity] entity ${i} has unsupported type ${e.type}`);
    if (!Number.isInteger(e.offset) || !Number.isInteger(e.length) || e.offset < 0 || e.length < 1) issues.push(`[PostEntity] entity ${i} has invalid range`);
    if ((e.offset || 0) + (e.length || 0) > length) issues.push(`[PostEntity] entity ${i} exceeds text length`);
    if (e.type === 'text_link' && !e.url) issues.push(`[PostEntity] text_link entity ${i} requires url`);
    if (e.type === 'custom_emoji' && !e.custom_emoji_id) issues.push(`[PostEntity] custom_emoji entity ${i} requires custom_emoji_id`);
  });
  return issues;
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

export async function renderPostToTelegram(ctx: any, post: any) {
  logger.info(`[PostRender] Rendering post ${post.id} native=${!!post.telegramPayload}`);
  const payload = post.telegramPayload as any;
  const buttons = buildTelegramKeyboard(payload?.keyboard || post.buttons || [], post.id);
  const markup = buttons.length ? Markup.inlineKeyboard(buttons) : {};
  const text = payload?.text ?? post.content ?? post.caption ?? post.title;
  const entities = payload?.entities ?? post.entities;
  const media = payload?.media || [];
  const common: any = { link_preview_options: { is_disabled: true }, ...markup };
  if (post.telegramPayload) {
    if (media.length > 1) {
      await ctx.replyWithMediaGroup(media.map((m: any, i: number) => ({ type: m.type === 'animation' ? 'document' : m.type, media: m.fileId, caption: i === 0 ? (m.caption || text) : undefined, caption_entities: i === 0 ? (m.captionEntities || entities) : undefined })));
      if (buttons.length) await ctx.reply('عملیات:', markup);
      return;
    }
    if (media.length === 1) {
      const m = media[0];
      const extra = { ...common, caption: m.caption || text || undefined, caption_entities: m.captionEntities || entities || undefined };
      if (m.type === 'photo') return ctx.replyWithPhoto(m.fileId, extra);
      if (m.type === 'video') return ctx.replyWithVideo(m.fileId, extra);
      if (m.type === 'animation') return ctx.replyWithAnimation(m.fileId, extra);
      if (m.type === 'document') return ctx.replyWithDocument(m.fileId, extra);
      if (m.type === 'audio') return ctx.replyWithAudio(m.fileId, extra);
      if (m.type === 'voice') return ctx.replyWithVoice(m.fileId, extra);
      if (m.type === 'sticker') return ctx.replyWithSticker(m.fileId, markup as any);
    }
    return ctx.reply(text || '(پست خالی)', { ...common, entities: entities || undefined });
  }
  const parseMode = post.parseMode || 'Markdown';
  return ctx.reply(text || '(پست خالی)', { ...common, parse_mode: parseMode });
}
