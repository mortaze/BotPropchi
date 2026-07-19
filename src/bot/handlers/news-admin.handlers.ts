import { Telegraf } from 'telegraf';
import { newsService } from '../../services/news.service';
import { newsState } from '../../services/news-state.service';
import { scheduledMessageState } from '../../services/scheduled-message-state.service';
import { botAdminService } from '../../services/bot-admin.service';
import { isValidDateKey, getTodayDateKey, addMonths } from '../../utils/news-date';
import { getYesterdayTodayTomorrow } from '../../utils/news-date';
import { logger } from '../../utils/logger';
import { BotAdminRole } from '@prisma/client';
import {
  newsCalendarKeyboard,
  newsDayContentKeyboard,
  newsDayEmptyKeyboard,
  newsDeleteConfirmKeyboard,
  newsCancelKeyboard,
} from '../keyboards/news-keyboards';
import { buildBotAdminPanelKeyboard } from '../keyboards/index';

async function safeEdit(ctx: any, text: string, extra?: any) {
  try {
    await ctx.editMessageText(text, extra);
  } catch (err: any) {
    if (err?.response?.description === 'Bad Request: message is not modified') return;
    throw err;
  }
}

async function safeAnswerCbQuery(ctx: any, text?: string, extra?: any) {
  try { await ctx.answerCbQuery(text, extra); } catch {}
}

export function registerNewsAdminHandlers(bot: Telegraf) {

  // ─── Entry: 📰 اخبار (section 6.1) ───────────────────
  bot.hears('📰 اخبار', async (ctx: any) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const admin = await botAdminService.getActive(userId);
    if (!admin) return;

    const { clearAllPostStates } = require('./post-handlers');
    clearAllPostStates(userId);
    scheduledMessageState.clearAll(userId);
    const { autoReplyState } = await import('../../services/auto-reply-state.service');
    autoReplyState.clearAll(userId);
    autoReplyState.clearBindingScene(userId);
    newsState.clearAll(userId);

    const todayKey = getTodayDateKey();
    const [y, m] = todayKey.split('-').map(Number);
    newsState.setCurrentMonth(userId, `${y}-${String(m).padStart(2, '0')}`);

    const contentDates = await newsService.getDatesWithContentInMonth(y, m);
    const kb = newsCalendarKeyboard(y, m, todayKey, contentDates);

    const text = [
      '📰 مدیریت اخبار فارکس',
      '',
      `🗓 امروز: ${todayKey}`,
      '',
      `در حال نمایش: ${newsState.getState(userId).currentMonth}`,
      '',
      'روی هر روز بزنید تا محتوای آن تاریخ را مدیریت کنید.',
      '🟢 = این روز محتوا دارد   ⚪️ = این روز خالی است',
    ].join('\n');

    await ctx.reply(text, kb);
  });

  // ─── Calendar navigation: news:cal:{YYYY-MM} ─────────
  bot.action(/^news:cal:(\d{4}-\d{2})$/, async (ctx: any) => {
    const userId = ctx.from?.id;
    const ym = ctx.match[1];
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) {
      return safeAnswerCbQuery(ctx, 'تاریخ نامعتبر', { show_alert: true });
    }

    const [y, m] = ym.split('-').map(Number);
    newsState.setCurrentMonth(userId, ym);
    const todayKey = getTodayDateKey();
    const contentDates = await newsService.getDatesWithContentInMonth(y, m);
    const kb = newsCalendarKeyboard(y, m, todayKey, contentDates);

    const text = [
      '📰 مدیریت اخبار فارکس',
      '',
      `🗓 امروز: ${todayKey}`,
      '',
      `در حال نمایش: ${ym}`,
      '',
      'روی هر روز بزنید تا محتوای آن تاریخ را مدیریت کنید.',
      '🟢 = این روز محتوا دارد   ⚪️ = این روز خالی است',
    ].join('\n');

    await safeEdit(ctx, text, { reply_markup: kb.reply_markup });
    await safeAnswerCbQuery(ctx);
  });

  // ─── Calendar: news:cal:current ───────────────────────
  bot.action('news:cal:current', async (ctx: any) => {
    const userId = ctx.from?.id;
    const todayKey = getTodayDateKey();
    const [y, m] = todayKey.split('-').map(Number);
    newsState.setCurrentMonth(userId, `${y}-${String(m).padStart(2, '0')}`);
    const contentDates = await newsService.getDatesWithContentInMonth(y, m);
    const kb = newsCalendarKeyboard(y, m, todayKey, contentDates);

    const text = [
      '📰 مدیریت اخبار فارکس',
      '',
      `🗓 امروز: ${todayKey}`,
      '',
      `در حال نمایش: ${y}-${String(m).padStart(2, '0')}`,
      '',
      'روی هر روز بزنید تا محتوای آن تاریخ را مدیریت کنید.',
      '🟢 = این روز محتوا دارد   ⚪️ = این روز خالی است',
    ].join('\n');

    await safeEdit(ctx, text, { reply_markup: kb.reply_markup });
    await safeAnswerCbQuery(ctx);
  });

  // ─── Day page: news:day:{YYYY-MM-DD} (section 6.2) ──
  bot.action(/^news:day:(\d{4}-\d{2}-\d{2})$/, async (ctx: any) => {
    const dateKey = ctx.match[1];
    if (!isValidDateKey(dateKey)) {
      return safeAnswerCbQuery(ctx, 'تاریخ نامعتبر', { show_alert: true });
    }

    const entry = await newsService.getEntry(dateKey);
    if (entry) {
      const kb = newsDayContentKeyboard(dateKey);
      await ctx.editMessageText(entry.text as string, {
        entities: entry.entities as any,
        reply_markup: kb.reply_markup,
      }).catch((err: any) => {
        if (err?.response?.description !== 'Bad Request: message is not modified') throw err;
      });
    } else {
      const kb = newsDayEmptyKeyboard(dateKey);
      const text = `�️ برای این تاریخ (${dateKey}) هنوز محتوایی ثبت نشده است.\n\nبرای افزودن محتوا از دکمهٔ زیر استفاده کنید.`;
      await ctx.editMessageText(text, { reply_markup: kb.reply_markup }).catch((err: any) => {
        if (err?.response?.description !== 'Bad Request: message is not modified') throw err;
      });
    }
    await safeAnswerCbQuery(ctx);
  });

  // ─── Edit/add text: news:edit:{YYYY-MM-DD} (section 6.3) ──
  bot.action(/^news:edit:(\d{4}-\d{2}-\d{2})$/, async (ctx: any) => {
    const userId = ctx.from?.id;
    const dateKey = ctx.match[1];
    if (!isValidDateKey(dateKey)) {
      return safeAnswerCbQuery(ctx, 'تاریخ نامعتبر', { show_alert: true });
    }

    newsState.setEditing(userId, dateKey);
    newsState.setAwaitingText(userId, true);
    newsState.setMessageId(userId, ctx.callbackQuery.message?.message_id ?? 0);

    await safeEdit(ctx, '✍️ متن جدید را با هر فرمتی که می‌خواهید (بولد، ایتالیک، لینک، اسپویلر و ...) ارسال کنید.\n\nبرای انصراف، دکمهٔ «❌ لغو» را بزنید.');
    await ctx.reply('', newsCancelKeyboard());
    await safeAnswerCbQuery(ctx);
  });

  // ─── Clear confirmation: news:clear:confirm:{dateKey} (BEFORE general clear) ──
  bot.action(/^news:clear:confirm:(\d{4}-\d{2}-\d{2})$/, async (ctx: any) => {
    const dateKey = ctx.match[1];
    if (!isValidDateKey(dateKey)) {
      return safeAnswerCbQuery(ctx, 'تاریخ نامعتبر', { show_alert: true });
    }

    await newsService.clearEntry(dateKey);
    const kb = newsDayEmptyKeyboard(dateKey);
    const text = `�️ برای این تاریخ (${dateKey}) هنوز محتوایی ثبت نشده است.\n\nبرای افزودن محتوا از دکمهٔ زیر استفاده کنید.`;
    await safeEdit(ctx, text, { reply_markup: kb.reply_markup });
    await safeAnswerCbQuery(ctx, '✅ محتوا حذف شد');
  });

  // ─── Clear cancel: news:clear:cancel:{dateKey} (BEFORE general clear) ──
  bot.action(/^news:clear:cancel:(\d{4}-\d{2}-\d{2})$/, async (ctx: any) => {
    const dateKey = ctx.match[1];
    if (!isValidDateKey(dateKey)) {
      return safeAnswerCbQuery(ctx, 'تاریخ نامعتبر', { show_alert: true });
    }

    const kb = newsDayContentKeyboard(dateKey);
    await safeEdit(ctx, ctx.callbackQuery.message?.text ?? '', { reply_markup: kb.reply_markup });
    await safeAnswerCbQuery(ctx);
  });

  // ─── Clear entry: news:clear:{dateKey} (section 6.4) ──
  bot.action(/^news:clear:(\d{4}-\d{2}-\d{2})$/, async (ctx: any) => {
    const dateKey = ctx.match[1];
    if (!isValidDateKey(dateKey)) {
      return safeAnswerCbQuery(ctx, 'تاریخ نامعتبر', { show_alert: true });
    }

    const kb = newsDeleteConfirmKeyboard(dateKey);
    await safeEdit(ctx, ctx.callbackQuery.message?.text ?? '', { reply_markup: kb.reply_markup });
    await safeAnswerCbQuery(ctx);
  });

  // ─── Back to admin panel: news:back:admin (section 6.5) ──
  bot.action('news:back:admin', async (ctx: any) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    newsState.clearAll(userId);
    await safeAnswerCbQuery(ctx);

    try { await ctx.editMessageReplyMarkup(undefined); } catch {}

    const admin = await botAdminService.getActive(userId);
    const canBroadcast = admin && (admin.role === BotAdminRole.OWNER || admin.role === BotAdminRole.ADMIN);
    await ctx.reply('⚙️ پنل مدیریت ربات', buildBotAdminPanelKeyboard(canBroadcast));
  });

  // ─── Text input handler (section 6.3 continuation) ──
  bot.on('text', async (ctx: any, next) => {
    const userId = ctx.from?.id;
    if (!userId) return next();

    const state = newsState.getState(userId);
    if (state.awaitingText !== true) return next();

    const text = ctx.message.text;

    if (text === '❌ لغو') {
      newsState.setAwaitingText(userId, false);
      newsState.setEditing(userId, '');
      const admin = await botAdminService.getActive(userId);
      const canBroadcast = admin && (admin.role === BotAdminRole.OWNER || admin.role === BotAdminRole.ADMIN);
      await ctx.reply('⚙️ پنل مدیریت ربات', buildBotAdminPanelKeyboard(canBroadcast));
      return;
    }

    if (text.length > 4096) {
      await ctx.reply('❌ متن شما بیشتر از ۴۰۹۶ کاراکتر است. لطفاً کوتاه‌تر ارسال کنید.');
      return;
    }

    const entities = ctx.message.entities?.map((e: any) => ({
      type: e.type, offset: e.offset, length: e.length,
      url: e.url, user: e.user, language: e.language, custom_emoji_id: e.custom_emoji_id,
    })) || [];

    try {
      const dateKey = state.editingDate!;
      await newsService.upsertEntry(dateKey, text, entities, BigInt(userId));

      newsState.setAwaitingText(userId, false);
      newsState.setEditing(userId, '');

      const entry = await newsService.getEntry(dateKey);
      if (entry && state.messageId) {
        const kb = newsDayContentKeyboard(dateKey);
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          state.messageId,
          undefined,
          entry.text as string,
          { entities: entry.entities as any, reply_markup: kb.reply_markup },
        ).catch((err: any) => {
          if (err?.response?.description !== 'Bad Request: message is not modified') throw err;
        });
      }

      const admin = await botAdminService.getActive(userId);
      const canBroadcast = admin && (admin.role === BotAdminRole.OWNER || admin.role === BotAdminRole.ADMIN);
      await ctx.reply('✅ متن ذخیره شد.', buildBotAdminPanelKeyboard(canBroadcast));
    } catch (err: any) {
      if (err?.message?.startsWith('TEXT_TOO_LONG')) {
        await ctx.reply('❌ متن شما بیشتر از ۴۰۹۶ کاراکتر است. لطفاً کوتاه‌تر ارسال کنید.');
      } else {
        logger.error('[NewsAdmin] Error saving text:', err);
        await ctx.reply('❌ خطایی رخ داد. لطفاً دوباره تلاش کنید.');
      }
    }
  });
}
