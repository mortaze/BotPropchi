import { Telegraf } from 'telegraf';
import { newsService } from '../../services/news.service';
import { getTodayDateKey, isValidDateKey, getYesterdayTodayTomorrow } from '../../utils/news-date';
import { newsUserKeyboard } from '../keyboards/news-keyboards';
import { logger } from '../../utils/logger';

export function registerNewsUserHandlers(bot: Telegraf) {

  // ─── Entry: 📰 اخبار فارکس (section 7.1) ─────────────
  bot.hears('📰 اخبار فارکس', async (ctx: any) => {
    logger.info(`[NewsUser] handler reached, userId=${ctx.from?.id}`);
    try {
      const { yesterday, today, tomorrow } = getYesterdayTodayTomorrow();
      const entry = await newsService.getEntry(today);
      const kb = newsUserKeyboard(yesterday, today, tomorrow, today);

      if (entry) {
        await ctx.reply(entry.text as string, {
          entities: entry.entities as any,
          ...kb,
        });
      } else {
        await ctx.reply(
          `🈳 هنوز خبری برای امروز (${today}) ثبت نشده است.\n\nبعداً دوباره سر بزنید یا تاریخ دیگری را بررسی کنید.`,
          kb,
        );
      }
    } catch (err) {
      logger.error('[NewsUser] threw:', err);
      await ctx.reply('خطایی رخ داد، دوباره تلاش کنید.').catch(() => {});
    }
  });

  // ─── Navigate: news:user:{YYYY-MM-DD} (section 7.2) ──
  bot.action(/^news:user:(\d{4}-\d{2}-\d{2})$/, async (ctx: any) => {
    const dateKey = ctx.match[1];
    if (!isValidDateKey(dateKey)) {
      try { await ctx.answerCbQuery('تاریخ نامعتبر', { show_alert: true }); } catch {}
      return;
    }

    const entry = await newsService.getEntry(dateKey);
    const { yesterday, today, tomorrow } = getYesterdayTodayTomorrow();
    const kb = newsUserKeyboard(yesterday, today, tomorrow, dateKey);

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
