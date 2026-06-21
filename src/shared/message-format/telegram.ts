import { Context, Telegraf } from 'telegraf';
import { Markup } from 'telegraf';
import { logger } from '../../utils/logger';
import {
  FormattedMessage,
  MediaItem,
  MessageEntity,
  MessagePayload,
  telegramLength,
} from './types';
import { normalizeEntities } from './normalizer';
import { validateFormatting, hasParseModeConflict } from './validator';
import { renderMessage } from './renderer';
import { serializeMessage, serializeMediaGroup, serializeSingleMedia, requestToTelegramApi, TelegramApiRequest } from './serializer';

export interface SendOptions {
  chatId?: number | string;
  buttons?: any[][];
  link_preview?: boolean;
  protect_content?: boolean;
  parse_mode?: string;
}

function buildKeyboard(buttons?: any[][]): any {
  if (!buttons || buttons.length === 0) return {};
  return Markup.inlineKeyboard(
    buttons.map(row =>
      row.map((btn: any) => {
        if (!btn) return null;
        const text = btn.text || 'Link';
        const value = btn.value || btn.url || btn.callback_data || '';
        let result: any;
        switch (btn.type) {
          case 'URL': result = Markup.button.url(text, value); break;
          case 'CALLBACK': result = Markup.button.callback(text, value); break;
          case 'WEB_APP':
          case 'OPEN_MINI_APP': result = Markup.button.webApp(text, value); break;
          case 'LOGIN_URL': result = { text, login_url: btn.login_url || btn.payload?.login_url || { url: value } } as any; break;
          case 'COPY_TEXT': result = { text, copy_text: { text: value } } as any; break;
          case 'SWITCH_INLINE':
          case 'SEND_COMMAND': result = Markup.button.switchToChat(text, value); break;
          case 'SWITCH_INLINE_CURRENT_CHAT': result = Markup.button.switchToCurrentChat(text, value); break;
          case 'COMMAND': result = Markup.button.callback(text, `post:user:cmd:${value}`); break;
          default: result = value?.startsWith('http') ? Markup.button.url(text, value) : Markup.button.callback(text, value || 'noop'); break;
        }
        // Preserve all extra properties from original button (e.g. style)
        if (result && btn) {
          for (const key of Object.keys(btn)) {
            if (!(key in result) && key !== 'type' && key !== 'value' && key !== 'url') {
              (result as any)[key] = btn[key];
            }
          }
        }
        return result;
      }).filter(Boolean),
    ),
  ) as any;
}

export function buildTelegramRequests(
  msg: FormattedMessage,
  options?: SendOptions,
): TelegramApiRequest[] {
  const rendered = renderMessage(msg);
  const validationIssues = [
    ...validateFormatting(rendered.text || '', rendered.entities),
    ...validateFormatting(rendered.caption || '', rendered.caption_entities),
  ];

  if (validationIssues.length > 0) {
    logger.warn(`[Format] validation: ${validationIssues.join('; ')}`);
  }

  const common: any = {
    link_preview_options: options?.link_preview !== false ? { is_disabled: true } : undefined,
    ...buildKeyboard(options?.buttons),
  };

  const requests = serializeMessage({
    text: rendered.text,
    entities: rendered.entities,
    caption: rendered.caption,
    caption_entities: rendered.caption_entities,
  });

  return requests.map(req => ({
    ...req,
    ...common,
  }));
}

export async function sendFormattedMessage(
  ctx: Context | any,
  msg: FormattedMessage,
  options?: SendOptions,
): Promise<boolean> {
  const senderId = ctx?.from?.id || ctx?.chat?.id || 'unknown';
  logger.info(`[sendFormattedMessage] chat=${senderId} textLen=${telegramLength(msg.text || msg.caption || '')}`);

  const requests = buildTelegramRequests(msg, options);

  for (const req of requests) {
    const { method, ...params } = req;

    if (hasParseModeConflict(params)) {
      logger.error(`[sendFormattedMessage] parse_mode conflict detected`);
      delete params.parse_mode;
    }

    logger.info(`[sendFormattedMessage] method=${method} entities=${(params.entities || []).length} caption_entities=${(params.caption_entities || []).length}`);

    try {
      if (method === 'sendMessage') {
        if (params.reply_markup) {
          logger.info('[TELEGRAM_REPLY_MARKUP] ' + JSON.stringify(params.reply_markup, null, 2));
        }
        logger.info('[TELEGRAM_PAYLOAD] ' + JSON.stringify({ method, ...params }, null, 2));
        const sent = await ctx.reply(params.text || '(empty)', params);
        logger.info('[TELEGRAM_RESPONSE] ' + JSON.stringify({ message_id: sent?.message_id, chat: sent?.chat }, null, 2));
      } else if (method === 'sendMediaGroup') {
        await ctx.replyWithMediaGroup(params.media);
      } else if (method === 'sendPhoto') {
        await ctx.replyWithPhoto(params.media, params);
      } else if (method === 'sendVideo') {
        await ctx.replyWithVideo(params.media, params);
      } else if (method === 'sendAnimation') {
        await ctx.replyWithAnimation(params.media, params);
      } else if (method === 'sendDocument') {
        await ctx.replyWithDocument(params.media, params);
      } else if (method === 'sendAudio') {
        await ctx.replyWithAudio(params.media, params);
      } else if (method === 'sendVoice') {
        await ctx.replyWithVoice(params.media, params);
      } else if (method === 'sendSticker') {
        await ctx.replyWithSticker(params.sticker, buildKeyboard(options?.buttons));
      } else {
        await ctx.reply(params.text || params.caption || '(empty)', params);
      }
    } catch (err: any) {
      logger.error(`[sendFormattedMessage] failed: ${err.message}`);
      return false;
    }
  }

  return true;
}

export async function sendFormattedMessageToChat(
  bot: Telegraf<Context> | any,
  chatId: number | string,
  msg: FormattedMessage,
  options?: SendOptions,
): Promise<boolean> {
  logger.info(`[sendFormattedMessageToChat] chatId=${chatId} textLen=${telegramLength(msg.text || msg.caption || '')}`);

  const requests = buildTelegramRequests(msg, options);

  for (const req of requests) {
    const { method, ...params } = req;

    if (hasParseModeConflict(params)) {
      logger.error(`[sendFormattedMessageToChat] parse_mode conflict detected`);
      delete params.parse_mode;
    }

    logger.info(`[sendFormattedMessageToChat] method=${method} entities=${(params.entities || []).length}`);

    try {
      const api = bot.telegram;

      if (method === 'sendMessage') {
        if (params.reply_markup) {
          logger.info('[TELEGRAM_REPLY_MARKUP] ' + JSON.stringify(params.reply_markup, null, 2));
        }
        logger.info('[TELEGRAM_PAYLOAD] ' + JSON.stringify({ method, chat_id: chatId, ...params }, null, 2));
        const sent = await api.sendMessage(chatId, params.text || '(empty)', params);
        logger.info('[TELEGRAM_RESPONSE] ' + JSON.stringify({ message_id: sent?.message_id, chat: sent?.chat }, null, 2));
      } else if (method === 'sendMediaGroup') {
        await api.sendMediaGroup(chatId, params.media);
      } else if (method === 'sendPhoto') {
        await api.sendPhoto(chatId, params.media, params);
      } else if (method === 'sendVideo') {
        await api.sendVideo(chatId, params.media, params);
      } else if (method === 'sendAnimation') {
        await api.sendAnimation(chatId, params.media, params);
      } else if (method === 'sendDocument') {
        await api.sendDocument(chatId, params.media, params);
      } else if (method === 'sendAudio') {
        await api.sendAudio(chatId, params.media, params);
      } else if (method === 'sendVoice') {
        await api.sendVoice(chatId, params.media, params);
      } else {
        await api.sendMessage(chatId, params.text || params.caption || '(empty)', params);
      }
    } catch (err: any) {
      logger.error(`[sendFormattedMessageToChat] failed: ${err.message}`);
      return false;
    }
  }

  return true;
}
