import { Telegraf } from 'telegraf';
import { logger } from '../utils/logger';
import { botAdminService } from '../services/bot-admin.service';
import { redisClient } from '../utils/redis';
import { ticketReplyKeyboard } from './keyboards/ticket.keyboards';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

let _ticketBotInstance: Telegraf | null = null;

export function setTicketBotInstance(bot: Telegraf) {
  _ticketBotInstance = bot;
}

async function sendTicketMessage(
  telegram: any,
  chatId: number,
  msg: { messageType: string; text?: string | null; fileId?: string | null }
): Promise<void> {
  const caption = msg.text || undefined;
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
  lastMessage: { messageType: string; text?: string | null; fileId?: string | null };
  createdAt: Date;
  isNew: boolean;
}): Promise<void> {
  if (!_ticketBotInstance) {
    logger.warn(`[TicketNotify] bot not set ticketId=${params.ticketId}`);
    return;
  }
  logger.info(`[TicketNotify] START ticketId=${params.ticketId} isNew=${params.isNew}`);
  const adminList = await botAdminService.list();
  const activeAdmins = adminList.filter((a: any) => a.status === 'ACTIVE' && a.receiveTickets !== false);
  logger.info(`[TicketNotify] total admins from list=${adminList.length} activeWithTicket=${activeAdmins.length}`);

  const header = params.isNew
    ? `\uD83C\uDFAB \u062A\u06CC\u06A9\u062A \u062C\u062F\u06CC\u062F #${params.ticketId}`
    : `\uD83D\uDCAC \u067E\u06CC\u0627\u0645 \u062C\u062F\u06CC\u062F \u062F\u0631 \u062A\u06CC\u06A9\u062A #${params.ticketId}`;
  const infoText = [
    header,
    ``,
    `\uD83D\uDC64 \u06A9\u0627\u0631\u0628\u0631: ${params.firstName}${params.username ? ` (@${params.username})` : ''}`,
    `\uD83C\uDD94 \u0622\u06CC\u062F\u06CC: ${params.userId}`,
    `\uD83D\uDCC2 \u0645\u0648\u0636\u0648\u0639: ${params.categoryTitle}`,
    `\uD83D\uDCC5 \u0632\u0645\u0627\u0646: ${params.createdAt.toLocaleString('fa-IR')}`,
    ``,
    `\u2B07\uFE0F \u0622\u062E\u0631\u06CC\u0646 \u067E\u06CC\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631:`,
  ].join('\n');
  const replyHintText = `\n\n\uD83D\uDCA1 \u0628\u0631\u0627\u06CC \u067E\u0627\u0633\u062E\u060C \u0631\u0648\u06CC \u0627\u06CC\u0646 \u067E\u06CC\u0627\u0645 Reply \u0628\u0632\u0646\u06CC\u062F \u0648 \u067E\u0627\u0633\u062E \u062E\u0648\u062F \u0631\u0627 \u0628\u0646\u0648\u06CC\u0633\u06CC\u062F`;
  const historyKeyboard = {
    inline_keyboard: [
      [
        { text: '\uD83D\uDCDC \u062A\u0627\u0631\u06CC\u062E\u0686\u0647 06AF\u062A\u06AF\u0648', callback_data: `ticket:admin:view:${params.ticketId}` },
        { text: '\uD83D\uDD12 \u0628\u0633\u062A\u0646 \u062A\u06CC\u06A9\u062A', callback_data: `ticket:close:${params.ticketId}` },
      ],
    ],
  };
  for (const admin of activeAdmins) {
    logger.info(`[TicketNotify] trying admin telegramId=${admin.telegramId} receiveTickets=${(admin as any).receiveTickets}`);
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await _ticketBotInstance.telegram.sendMessage(
          Number(admin.telegramId),
          infoText,
          { link_preview_options: { is_disabled: true } }
        );
        let sentMessage: any;
        const hasContent = params.lastMessage.text || params.lastMessage.fileId;
        if (!hasContent) {
          sentMessage = await _ticketBotInstance.telegram.sendMessage(
            Number(admin.telegramId),
            `[${params.lastMessage.messageType}] — برای پاسخ، روی این پیام Reply بزنید`,
            { reply_markup: historyKeyboard }
          );
        } else if (params.lastMessage.messageType === 'TEXT' && params.lastMessage.text) {
          sentMessage = await _ticketBotInstance.telegram.sendMessage(
            Number(admin.telegramId),
            params.lastMessage.text + replyHintText,
            { reply_markup: historyKeyboard }
          );
        } else if (params.lastMessage.fileId) {
          await sendTicketMessage(_ticketBotInstance.telegram, Number(admin.telegramId), params.lastMessage);
          sentMessage = await _ticketBotInstance.telegram.sendMessage(
            Number(admin.telegramId),
            replyHintText.trim(),
            { reply_markup: historyKeyboard }
          );
        }
        if (sentMessage?.message_id) {
          const mapKey = `ticket:msgmap:${admin.telegramId}:${sentMessage.message_id}`;
          await redisClient.set(mapKey, { ticketId: params.ticketId }, 604800);
        }
        logger.info(`[TicketNotify] sent admin=${admin.telegramId} attempt=${attempt} ticketId=${params.ticketId}`);
        lastError = null;
        break;
      } catch (err) {
        logger.error(`[TicketNotify] FAILED attempt=${attempt} admin=${admin.telegramId} error=${(err as any)?.message}`, err);
        lastError = err as Error;
        if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      }
    }
    if (lastError) {
      logger.error(`[TicketNotify] failed admin=${admin.telegramId} after ${MAX_RETRIES} attempts ticketId=${params.ticketId}`, lastError);
    }
  }
}

export async function notifyUserNewReply(params: {
  telegramId: bigint;
  ticketId: number;
  message: { messageType: string; text?: string | null; fileId?: string | null };
}): Promise<void> {
  if (!_ticketBotInstance) return;
  const userId = Number(params.telegramId);
  const replyViewKeyboard = {
    inline_keyboard: [[{ text: '\uD83D\uDCE8 \u0645\u0634\u0627\u0647\u062F\u0647 06AF\u062A\u06AF\u0648', callback_data: `ticket:view:${params.ticketId}` }]],
  };
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await _ticketBotInstance.telegram.sendMessage(
        userId,
        `💬 پاسخ جدید دریافت شد در تیکت #${params.ticketId}:`
      );
      if (params.message.messageType === 'TEXT' && params.message.text) {
        await _ticketBotInstance.telegram.sendMessage(userId, params.message.text, { reply_markup: replyViewKeyboard });
      } else if (params.message.fileId) {
        await sendTicketMessage(_ticketBotInstance.telegram, userId, params.message);
        await _ticketBotInstance.telegram.sendMessage(userId, '\uD83D\uDC46 \u067E\u06CC\u0627\u0645 \u062C\u062F\u06CC\u062F \u0627\u0632 \u067E\u0634\u062A\u06CC\u0628\u0627\u0646\u06CC', { reply_markup: replyViewKeyboard });
      }
      break;
    } catch (err) {
      if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    }
  }
}
