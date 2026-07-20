import { Telegraf } from 'telegraf';
import { newsService } from '../../services/news.service';
import { newsState } from '../../services/news-state.service';
import { getTodayDateKey, isValidDateKey } from '../../utils/news-date';
import { newsUserKeyboard } from '../keyboards/news-keyboards';
import { logger } from '../../utils/logger';

function relativeDates(dateKey: string) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const prev = new Date(dt); prev.setUTCDate(dt.getUTCDate() - 1);
  const next = new Date(dt); next.setUTCDate(dt.getUTCDate() + 1);
  const fmt = (dt: Date) => `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
  return { yesterday: fmt(prev), tomorrow: fmt(next) };
}

function buildKeyboard(viewedDate: string) {
  const { yesterday, tomorrow } = relativeDates(viewedDate);
  return newsUserKeyboard(yesterday, getTodayDateKey(), tomorrow, viewedDate);
}

export function registerNewsUserHandlers(bot: Telegraf) {

  bot.hears('📰 اخبار فارکس', async (ctx: any) => {
    logger.info(`[NewsUser] handler reached, userId=${ctx.from?.id}`);
    try {
      const userId = ctx.from?.id;
      const today = getTodayDateKey();
      newsState.setCurrentViewedDate(userId, today);

      const entry = await newsService.getEntry(today);
      const kb = buildKeyboard(today);

      if (entry) {
        await ctx.reply(entry.text as string, { entities: entry.entities as any, ...kb });
      } else {
        await ctx.reply(`🈳 هنوز خبری برای امروز (${today}) ثبت نشده است.\n\nبعداً دوباره سر بزنید یا تاریخ دیگری را بررسی کنید.`, kb);
      }
    } catch (err) {
      logger.error('[NewsUser] threw:', err);
      await ctx.reply('خطایی رخ داد، دوباره تلاش کنید.').catch(() => {});
    }
  });

  bot.action(/^news:user:(\d{4}-\d{2}-\d{2})$/, async (ctx: any) => {
    const dateKey = ctx.match[1];
    if (!isValidDateKey(dateKey)) {
      try { await ctx.answerCbQuery('تاریخ نامعتبر', { show_alert: true }); } catch {}
      return;
    }

    const userId = ctx.from?.id;
    newsState.setCurrentViewedDate(userId, dateKey);

    const entry = await newsService.getEntry(dateKey);
    const kb = buildKeyboard(dateKey);

    const text = entry
      ? (entry.text as string)
      : `🈳 هنوز خبری برای این تاریخ (${dateKey}) ثبت نشده است.\n\nبعداً دوباره سر بزنید یا تاریخ دیگری را بررسی کنید.`;

    const extra: any = { reply_markup: kb.reply_markup };
    if (entry) extra.entities = entry.entities as any;

    try {
      await ctx.editMessageText(text, extra);
    } catch (err: any) {
      if (err?.response?.description === 'Bad Request: message is not modified') {
        // silently ignore — user tapped same date
      } else {
        logger.error('[NewsUser] editMessageText failed:', err);
        throw err;
      }
    }

    try { await ctx.answerCbQuery(); } catch {}
  });
}
