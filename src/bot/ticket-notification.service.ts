import { Telegraf } from 'telegraf';
import { logger } from '../utils/logger';
import { botAdminService } from '../services/bot-admin.service';
import { ticketActionKeyboard, ticketReplyKeyboard } from './keyboards/ticket.keyboards';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

let _ticketBotInstance: Telegraf | null = null;

export function setTicketBotInstance(bot: Telegraf) {
  _ticketBotInstance = bot;
}

async function sendTicketMessage(
  telegram: any,
  chatId: number,
  msg: { messageType: string; text?: string | null; fileId?: string | null; caption?: string | null },
): Promise<void> {
  const caption = msg.text || msg.caption || undefined;
  switch (msg.messageType) {
    case 'TEXT':
      if (msg.text) await telegram.sendMessage(chatId, msg.text);
      break;
    case 'PHOTO':
      if (msg.fileId) await telegram.sendPhoto(chatId, msg.fileId, caption ? { caption } : {});
      break;
    case 'VIDEO':
      if (msg.fileId) await telegram.sendVideo(chatId, msg.fileId, caption ? { caption } : {});
      break;
    case 'VOICE':
      if (msg.fileId) await telegram.sendVoice(chatId, msg.fileId);
      break;
    case 'AUDIO':
      if (msg.fileId) await telegram.sendAudio(chatId, msg.fileId, caption ? { caption } : {});
      break;
    case 'DOCUMENT':
      if (msg.fileId) await telegram.sendDocument(chatId, msg.fileId, caption ? { caption } : {});
      break;
    case 'STICKER':
      if (msg.fileId) await telegram.sendSticker(chatId, msg.fileId);
      break;
    default:
      if (msg.text) await telegram.sendMessage(chatId, msg.text);
  }
}

export async function notifyAdminsNewTicket(params: {
  ticketId: number;
  userId: number;
  telegramId: number;
  firstName: string;
  username?: string;
  categoryTitle: string;
  messagePreview: string;
  createdAt: Date;
  firstMessage?: { messageType: string; text?: string | null; fileId?: string | null };
}): Promise<void> {
  if (!_ticketBotInstance) {
    logger.warn(`[TicketNotify] bot not set, cannot send notification ticketId=${params.ticketId}`);
    return;
  }

  const adminList = await botAdminService.list();
  const activeAdmins = adminList.filter(a => a.status === 'ACTIVE');
  logger.info(`[TicketNotify] admins=${activeAdmins.length} ticketId=${params.ticketId}`);

  const now = params.createdAt.toLocaleString('fa-IR');
  const preview = params.messagePreview.length > 200
    ? params.messagePreview.substring(0, 200) + '...'
    : params.messagePreview;

  const message = [
    '🎫 تیکت جدید',
    '',
    `🆔 شناسه: #${params.ticketId}`,
    `👤 کاربر: ${params.firstName}${params.username ? ` (@${params.username})` : ''}`,
    `🏷 دسته: ${params.categoryTitle}`,
    `💬 پیام: ${preview}`,
    `📅 زمان: ${now}`,
  ].join('\n');

  for (const admin of activeAdmins) {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await _ticketBotInstance.telegram.sendMessage(
          Number(admin.telegramId),
          message,
          {
            parse_mode: 'HTML',
            link_preview_options: { is_disabled: true },
            ...ticketActionKeyboard(params.ticketId),
          },
        );
        logger.info(`[TicketNotify] sent admin=${admin.telegramId.toString()} attempt=${attempt} ticketId=${params.ticketId}`);
        lastError = null;
        break;
      } catch (err) {
        lastError = err as Error;
        logger.warn(`[TicketNotify] failed admin=${admin.telegramId.toString()} attempt=${attempt} ticketId=${params.ticketId} error=${err}`);
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        }
      }
    }
    if (lastError) {
      logger.error(`[TicketNotify] failed admin=${admin.telegramId.toString()} after ${MAX_RETRIES} attempts ticketId=${params.ticketId}`, lastError);
    }

    if (params.firstMessage && params.firstMessage.messageType !== 'TEXT' && params.firstMessage.fileId) {
      try {
        await sendTicketMessage(
          _ticketBotInstance!.telegram,
          Number(admin.telegramId),
          params.firstMessage
        );
      } catch (err) {
        logger.warn(`[TicketNotify] failed to send file to admin ticketId=${params.ticketId}`, err);
      }
    }
  }

  logger.info(`[TicketNotify] completed ticketId=${params.ticketId}`);
}

export async function notifyUserNewReply(telegramId: bigint, ticketId: number, preview: string): Promise<void> {
  if (!_ticketBotInstance) {
    logger.warn(`[TicketNotify] bot not set, cannot send reply notification ticketId=${ticketId}`);
    return;
  }

  const userId = Number(telegramId);
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await _ticketBotInstance.telegram.sendMessage(
        userId,
        `💬 پاسخ جدید دریافت شد در تیکت #${ticketId}`,
        {
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
          ...ticketReplyKeyboard(),
        },
      );
      logger.info(`[TicketNotify] reply sent userId=${userId} attempt=${attempt} ticketId=${ticketId}`);
      lastError = null;
      break;
    } catch (err) {
      lastError = err as Error;
      logger.warn(`[TicketNotify] reply failed userId=${userId} attempt=${attempt} ticketId=${ticketId} error=${err}`);
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }
  if (lastError) {
    logger.error(`[TicketNotify] reply failed userId=${userId} after ${MAX_RETRIES} attempts ticketId=${ticketId}`, lastError);
  }
}
