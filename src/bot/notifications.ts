import { Markup, Telegraf } from 'telegraf';
import { logger } from '../utils/logger';
import { botAdminService } from '../services/bot-admin.service';
import { prisma } from '../prisma/client';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

let _botInstance: Telegraf | null = null;

export function setBotInstance(bot: Telegraf) {
  _botInstance = bot;
}

export async function sendNewUserNotification(
  bot: Telegraf,
  telegramId: bigint,
  info: { first_name?: string; last_name?: string; username?: string },
): Promise<void> {
  const userId = Number(telegramId);
  logger.info(`[NewUser] start userId=${userId}`);

  const adminList = await botAdminService.list();
  const activeAdmins = adminList.filter(a => a.status === 'ACTIVE');
  logger.info(`[NewUser] admins=${activeAdmins.length} userId=${userId}`);

  const totalUsers = await prisma.user.count();
  const now = new Date().toLocaleString('fa-IR');

  for (const admin of activeAdmins) {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await bot.telegram.sendMessage(
          Number(admin.telegramId),
          [
            '🎉 کاربر جدید وارد شد',
            '',
            `👤 نام: ${info.first_name || 'نامشخص'} ${info.last_name || ''}`,
            `🆔 آیدی عددی: ${userId}`,
            `📛 یوزرنیم: @${info.username || 'ندارد'}`,
            `📈 تعداد کل کاربران: ${totalUsers}`,
            `📅 زمان: ${now}`,
          ].join('\n'),
          {
            link_preview_options: { is_disabled: true },
            ...Markup.inlineKeyboard([
              [Markup.button.callback('📊 آمار', `admin:stats:${userId}`)],
            ]),
          },
        );
        logger.info(`[NewUser] sent admin=${admin.telegramId.toString()} attempt=${attempt} userId=${userId}`);
        lastError = null;
        break;
      } catch (err) {
        lastError = err as Error;
        logger.warn(`[NewUser] failed admin=${admin.telegramId.toString()} attempt=${attempt} userId=${userId} error=${err}`);
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        }
      }
    }
    if (lastError) {
      logger.error(`[NewUser] failed admin=${admin.telegramId.toString()} after ${MAX_RETRIES} attempts userId=${userId}`, lastError);
    }
  }

  logger.info(`[NewUser] completed userId=${userId}`);
}

export async function notifyNewUserFromService(
  telegramId: bigint,
  info: { first_name?: string; last_name?: string; username?: string },
): Promise<void> {
  if (!_botInstance) {
    logger.warn(`[NewUser] bot not set, cannot send notification userId=${Number(telegramId)}`);
    return;
  }
  return sendNewUserNotification(_botInstance, telegramId, info);
}
