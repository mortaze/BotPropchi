import { sanitizeTelegramText } from '../utils/unicode';
import { cache } from '../utils/cache';
import { logger } from '../utils/logger';
import { Markup } from 'telegraf';
import { settingsService } from './settings.service';

export function buildReplyKeyboardFromMessages(messages: any[]): { text: string; style?: string }[][] {
  const rows: { text: string; style?: string }[][] = [];
  const sorted = (messages || []).slice().sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
  for (const msg of sorted) {
    const grid: any[][] = Array.isArray(msg.replyMarkup) ? msg.replyMarkup : (msg.replyMarkup?.inline_keyboard || []);
    for (const gridRow of grid) {
      if (!Array.isArray(gridRow)) continue;
      const flagged = gridRow.filter((b: any) => b?.isReplyKeyboard);
      if (flagged.length > 0) {
        rows.push(flagged.map((b: any) => ({
          text: sanitizeTelegramText(b.text || '', 128),
          style: (b.style && b.style !== 'default') ? b.style : undefined,
        })));
      }
    }
  }
  return rows;
}

export function findReplyKeyboardButtonByText(messages: any[], text: string): any | null {
  const sorted = (messages || []).slice().sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
  for (const msg of sorted) {
    const grid: any[][] = Array.isArray(msg.replyMarkup) ? msg.replyMarkup : (msg.replyMarkup?.inline_keyboard || []);
    for (const gridRow of grid) {
      if (!Array.isArray(gridRow)) continue;
      const found = gridRow.find((b: any) => b?.isReplyKeyboard && b?.text === text);
      if (found) return found;
    }
  }
  return null;
}

export async function syncPostReplyKeyboard(ctx: any, postId: number, messages: any[]): Promise<void> {
  const userId = ctx.from.id;
  const stateKey = `postReplyKb:lastState:${userId}`;
  const postKey = `postReplyKb:lastPostId:${userId}`;
  const rows = buildReplyKeyboardFromMessages(messages);
  const hasCustom = rows.length > 0;
  const newState = hasCustom ? JSON.stringify(rows) : 'MAIN_MENU';
  const prevState = cache.get<string>(stateKey) ?? 'MAIN_MENU';
  logger.info(`[ReplyKbSync][DIAG] userId=${userId} postId=${postId} hasCustom=${hasCustom} newState=${newState} prevState=${prevState} willSend=${newState !== prevState}`);
  if (newState === prevState) return;

  if (hasCustom) {
    await ctx.reply('⌨️ منوی این بخش:', Markup.keyboard(rows).resize().persistent());
  } else {
    const mainMenuKb = await settingsService.getResolvedMainMenuKeyboard(userId);
    await ctx.reply('↩️ بازگشت به منوی اصلی:', mainMenuKb);
  }
  cache.setPermanent(stateKey, newState);
  cache.setPermanent(postKey, String(postId));
}
