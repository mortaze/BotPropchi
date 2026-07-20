import { Telegraf } from 'telegraf';
import { newsService } from '../../services/news.service';
import { newsState } from '../../services/news-state.service';
import { scheduledMessageState } from '../../services/scheduled-message-state.service';
import { botAdminService } from '../../services/bot-admin.service';
import { isValidDateKey, getTodayDateKey } from '../../utils/news-date';
import { logger } from '../../utils/logger';
import { BotAdminRole } from '@prisma/client';
import {
  newsCalendarKeyboard,
  newsDayContentKeyboard,
  newsDayEmptyKeyboard,
  newsDeleteConfirmKeyboard,
  newsCancelKeyboard,
  newsCalendarReplyKeyboard,
  newsDayEditorReplyKeyboard,
  newsClearConfirmReplyKeyboard,
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

async function safeEditById(ctx: any, messageId: number, text: string, extra?: any) {
  try {
    await ctx.telegram.editMessageText(ctx.chat.id, messageId, undefined, text, extra);
  } catch (err: any) {
    if (err?.response?.description === 'Bad Request: message is not modified') return;
    throw err;
  }
}

const KB_LABELS = {
  calendar: '🗓 کنترل‌های تقویم',
  dayEditor: '📋 کنترل‌های این تاریخ',
  awaitingText: 'برای انصراف، «❌ لغو» را در پایین صفحه بزنید.',
  confirmClear: '⚠️ تأیید یا انصراف را در پایین صفحه بزنید.',
};

function calendarText(todayKey: string, displayMonth: string) {
  return [
    '📰 مدیریت اخبار فارکس',
    '',
    `🗓 امروز: ${todayKey}`,
    '',
    `در حال نمایش: ${displayMonth}`,
    '',
    'روی هر روز بزنید تا محتوای آن تاریخ را مدیریت کنید.',
  ].join('\n');
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
    const ym = `${y}-${String(m).padStart(2, '0')}`;
    newsState.setCurrentMonth(userId, ym);

    const contentDates = await newsService.getDatesWithContentInMonth(y, m);
    const kb = newsCalendarKeyboard(y, m, todayKey, contentDates);
    const text = calendarText(todayKey, ym);
    const sentMessage = await ctx.reply(text, kb);
    newsState.setMessageId(userId, sentMessage.message_id);
    await ctx.reply(KB_LABELS.calendar, newsCalendarReplyKeyboard());
  });

  // ─── Reply keyboard: ماه قبل ──────────────────────────
  bot.hears('◀️ ماه قبل', async (ctx: any) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const state = newsState.getState(userId);
    if (!state.currentMonth) return;

    const [y, m] = state.currentMonth.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 2, 1));
    const prevYm = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
    newsState.setCurrentMonth(userId, prevYm);

    const [py, pm] = prevYm.split('-').map(Number);
    const todayK = getTodayDateKey();
    const contentDates = await newsService.getDatesWithContentInMonth(py, pm);
    const kb = newsCalendarKeyboard(py, pm, todayK, contentDates);
    const text = calendarText(todayK, prevYm);

    const sentMessage = await ctx.reply(text, kb);
    newsState.setMessageId(userId, sentMessage.message_id);
  });

  // ─── Reply keyboard: ماه بعد ──────────────────────────
  bot.hears('ماه بعد ▶️', async (ctx: any) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const state = newsState.getState(userId);
    if (!state.currentMonth) return;

    const [y, m] = state.currentMonth.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m, 1));
    const nextYm = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
    newsState.setCurrentMonth(userId, nextYm);

    const [ny, nm] = nextYm.split('-').map(Number);
    const todayK = getTodayDateKey();
    const contentDates = await newsService.getDatesWithContentInMonth(ny, nm);
    const kb = newsCalendarKeyboard(ny, nm, todayK, contentDates);
    const text = calendarText(todayK, nextYm);

    const sentMessage = await ctx.reply(text, kb);
    newsState.setMessageId(userId, sentMessage.message_id);
  });

  // ─── Reply keyboard: ماه جاری ─────────────────────────
  bot.hears('📍 ماه جاری', async (ctx: any) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const todayK = getTodayDateKey();
    const [y, m] = todayK.split('-').map(Number);
    const ym = `${y}-${String(m).padStart(2, '0')}`;
    newsState.setCurrentMonth(userId, ym);

    const contentDates = await newsService.getDatesWithContentInMonth(y, m);
    const kb = newsCalendarKeyboard(y, m, todayK, contentDates);
    const text = calendarText(todayK, ym);

    const sentMessage = await ctx.reply(text, kb);
    newsState.setMessageId(userId, sentMessage.message_id);
  });

  // ─── Reply keyboard: بازگشت به تقویم (from day editor) ──
  bot.hears('◀️ بازگشت به تقویم', async (ctx: any) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const state = newsState.getState(userId);
    if (!state.currentMonth) return;

    newsState.setEditing(userId, '');

    const [y, m] = state.currentMonth.split('-').map(Number);
    const todayK = getTodayDateKey();
    const contentDates = await newsService.getDatesWithContentInMonth(y, m);
    const kb = newsCalendarKeyboard(y, m, todayK, contentDates);
    const text = calendarText(todayK, state.currentMonth);

    const sentMessage = await ctx.reply(text, kb);
    newsState.setMessageId(userId, sentMessage.message_id);
    await ctx.reply(KB_LABELS.calendar, newsCalendarReplyKeyboard());
  });

  // ─── Reply keyboard: افزودن متن (from day editor) ─────
  bot.hears('➕ افزودن متن', async (ctx: any) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const state = newsState.getState(userId);
    if (!state.editingDate) return;

    newsState.setAwaitingText(userId, true);
    await ctx.reply(
      '✍️ متن جدید را با هر فرمتی که می‌خواهید (بولد، ایتالیک، لینک، اسپویلر و ...) ارسال کنید.\n\nبرای انصراف، دکمهٔ «❌ لغو» را بزنید.',
      newsCancelKeyboard(),
    );
  });

  // ─── Reply keyboard: حذف متن (from day editor) ────────
  bot.hears('🗑 حذف متن', async (ctx: any) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const state = newsState.getState(userId);
    if (!state.editingDate) return;

    const dateKey = state.editingDate;
    const entry = await newsService.getEntry(dateKey);
    if (!entry) {
      await ctx.reply('🈳 برای این تاریخ محتوایی وجود ندارد.');
      return;
    }

    if (state.messageId) {
      await safeEditById(ctx, state.messageId, `آیا از حذف محتوای تاریخ ${dateKey} اطمینان دارید؟`);
    }
    await ctx.reply(KB_LABELS.confirmClear, newsClearConfirmReplyKeyboard());
  });

  // ─── Reply keyboard: تایید حذف ──────────────────────────
  bot.hears('✅ تایید حذف', async (ctx: any) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const state = newsState.getState(userId);
    if (!state.editingDate) return;

    const dateKey = state.editingDate;
    await newsService.clearEntry(dateKey);

    if (state.messageId) {
      const text = `🈳 برای این تاریخ (${dateKey}) هنوز محتوایی ثبت نشده است.\n\nبرای افزودن محتوا از دکمهٔ زیر استفاده کنید.`;
      await safeEditById(ctx, state.messageId, text);
    }
    await ctx.reply(KB_LABELS.dayEditor, newsDayEditorReplyKeyboard(false, dateKey));
  });

  // ─── Reply keyboard: انصراف از حذف ──────────────────────
  bot.hears('❌ انصراف', async (ctx: any) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const state = newsState.getState(userId);
    if (!state.editingDate) return;

    const dateKey = state.editingDate;
    const entry = await newsService.getEntry(dateKey);

    if (state.messageId) {
      if (entry) {
        const kb = newsDayContentKeyboard(dateKey);
        await safeEditById(ctx, state.messageId, entry.text as string, {
          entities: entry.entities as any,
          reply_markup: kb.reply_markup,
        });
      } else {
        const kb = newsDayEmptyKeyboard(dateKey);
        const text = `🈳 برای این تاریخ (${dateKey}) هنوز محتوایی ثبت نشده است.\n\nبرای افزودن محتوا از دکمهٔ زیر استفاده کنید.`;
        await safeEditById(ctx, state.messageId, text, { reply_markup: kb.reply_markup });
      }
    }

    const hasContent = !!entry;
    await ctx.reply(KB_LABELS.dayEditor, newsDayEditorReplyKeyboard(hasContent, dateKey));
  });

  // ─── Calendar navigation: news:cal:{YYYY-MM} ─────────
  bot.action(/^news:cal:(\d{4}-\d{2})$/, async (ctx: any) => {
    await safeAnswerCbQuery(ctx);
    const userId = ctx.from?.id;
    const ym = ctx.match[1];
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) return;

    newsState.setCurrentMonth(userId, ym);
    const [y, m] = ym.split('-').map(Number);
    const todayK = getTodayDateKey();
    const contentDates = await newsService.getDatesWithContentInMonth(y, m);
    const inlineKb = newsCalendarKeyboard(y, m, todayK, contentDates);
    const text = calendarText(todayK, ym);
    await safeEdit(ctx, text, { reply_markup: inlineKb.reply_markup });
  });

  // ─── Calendar: news:cal:current ───────────────────────
  bot.action('news:cal:current', async (ctx: any) => {
    await safeAnswerCbQuery(ctx);
    const userId = ctx.from?.id;
    const todayK = getTodayDateKey();
    const [y, m] = todayK.split('-').map(Number);
    const ym = `${y}-${String(m).padStart(2, '0')}`;
    newsState.setCurrentMonth(userId, ym);

    const contentDates = await newsService.getDatesWithContentInMonth(y, m);
    const inlineKb = newsCalendarKeyboard(y, m, todayK, contentDates);
    const text = calendarText(todayK, ym);
    await safeEdit(ctx, text, { reply_markup: inlineKb.reply_markup });
  });

  // ─── Day page: news:day:{YYYY-MM-DD} (section 6.2) ──
  bot.action(/^news:day:(\d{4}-\d{2}-\d{2})$/, async (ctx: any) => {
    await safeAnswerCbQuery(ctx);
    const userId = ctx.from?.id;
    const dateKey = ctx.match[1];
    if (!isValidDateKey(dateKey)) return;

    newsState.setEditing(userId, dateKey);
    newsState.setMessageId(userId, ctx.callbackQuery.message?.message_id ?? 0);

    const entry = await newsService.getEntry(dateKey);
    if (entry) {
      const kb = newsDayContentKeyboard(dateKey);
      await safeEdit(ctx, entry.text as string, {
        entities: entry.entities as any,
        reply_markup: kb.reply_markup,
      });
      await ctx.reply(KB_LABELS.dayEditor, newsDayEditorReplyKeyboard(true, dateKey));
    } else {
      const kb = newsDayEmptyKeyboard(dateKey);
      const text = `🈳 برای این تاریخ (${dateKey}) هنوز محتوایی ثبت نشده است.\n\nبرای افزودن محتوا از دکمهٔ زیر استفاده کنید.`;
      await safeEdit(ctx, text, { reply_markup: kb.reply_markup });
      await ctx.reply(KB_LABELS.dayEditor, newsDayEditorReplyKeyboard(false, dateKey));
    }
  });

  // ─── Edit/add text: news:edit:{YYYY-MM-DD} (section 6.3) ──
  bot.action(/^news:edit:(\d{4}-\d{2}-\d{2})$/, async (ctx: any) => {
    await safeAnswerCbQuery(ctx);
    const userId = ctx.from?.id;
    const dateKey = ctx.match[1];
    if (!isValidDateKey(dateKey)) return;

    newsState.setEditing(userId, dateKey);
    newsState.setAwaitingText(userId, true);
    newsState.setMessageId(userId, ctx.callbackQuery.message?.message_id ?? 0);

    await safeEdit(ctx, '✍️ متن جدید را با هر فرمتی که می‌خواهید (بولد، ایتالیک، لینک، اسپویلر و ...) ارسال کنید.\n\nبرای انصراف، دکمهٔ «❌ لغو» را بزنید.');
    await ctx.reply(KB_LABELS.awaitingText, newsCancelKeyboard());
  });

  // ─── Clear confirmation: news:clear:confirm:{dateKey} ──
  bot.action(/^news:clear:confirm:(\d{4}-\d{2}-\d{2})$/, async (ctx: any) => {
    await safeAnswerCbQuery(ctx, '✅ محتوا حذف شد');
    const userId = ctx.from?.id;
    const dateKey = ctx.match[1];
    if (!isValidDateKey(dateKey)) return;

    await newsService.clearEntry(dateKey);
    const kb = newsDayEmptyKeyboard(dateKey);
    const text = `🈳 برای این تاریخ (${dateKey}) هنوز محتوایی ثبت نشده است.\n\nبرای افزودن محتوا از دکمهٔ زیر استفاده کنید.`;
    await safeEdit(ctx, text, { reply_markup: kb.reply_markup });
  });

  // ─── Clear cancel: news:clear:cancel:{dateKey} ──────────
  bot.action(/^news:clear:cancel:(\d{4}-\d{2}-\d{2})$/, async (ctx: any) => {
    await safeAnswerCbQuery(ctx);
    const dateKey = ctx.match[1];
    if (!isValidDateKey(dateKey)) return;

    const kb = newsDayContentKeyboard(dateKey);
    await safeEdit(ctx, ctx.callbackQuery.message?.text ?? '', { reply_markup: kb.reply_markup });
  });

  // ─── Clear entry: news:clear:{dateKey} (section 6.4) ──
  bot.action(/^news:clear:(\d{4}-\d{2}-\d{2})$/, async (ctx: any) => {
    await safeAnswerCbQuery(ctx);
    const dateKey = ctx.match[1];
    if (!isValidDateKey(dateKey)) return;

    const kb = newsDeleteConfirmKeyboard(dateKey);
    await safeEdit(ctx, ctx.callbackQuery.message?.text ?? '', { reply_markup: kb.reply_markup });
  });

  // ─── Back to admin panel: news:back:admin (section 6.5) ──
  bot.action('news:back:admin', async (ctx: any) => {
    await safeAnswerCbQuery(ctx);
    const userId = ctx.from?.id;
    if (!userId) return;

    newsState.clearAll(userId);
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
      const dateKey = state.editingDate;
      if (dateKey) {
        const entry = await newsService.getEntry(dateKey);
        if (entry && state.messageId) {
          const kb = newsDayContentKeyboard(dateKey);
          await safeEditById(ctx, state.messageId, entry.text as string, {
            entities: entry.entities as any,
            reply_markup: kb.reply_markup,
          });
          await ctx.reply(KB_LABELS.dayEditor, newsDayEditorReplyKeyboard(true, dateKey));
        } else if (state.messageId) {
          const kb = newsDayEmptyKeyboard(dateKey);
          const emptyText = `🈳 برای این تاریخ (${dateKey}) هنوز محتوایی ثبت نشده است.\n\nبرای افزودن محتوا از دکمهٔ زیر استفاده کنید.`;
          await safeEditById(ctx, state.messageId, emptyText, { reply_markup: kb.reply_markup });
          await ctx.reply(KB_LABELS.dayEditor, newsDayEditorReplyKeyboard(false, dateKey));
        }
      } else {
        const admin = await botAdminService.getActive(userId);
        const canBroadcast = admin && (admin.role === BotAdminRole.OWNER || admin.role === BotAdminRole.ADMIN);
        await ctx.reply('⚙️ پنل مدیریت ربات', buildBotAdminPanelKeyboard(canBroadcast));
      }
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

      const entry = await newsService.getEntry(dateKey);
      if (entry && state.messageId) {
        const kb = newsDayContentKeyboard(dateKey);
        await safeEditById(ctx, state.messageId, entry.text as string, {
          entities: entry.entities as any,
          reply_markup: kb.reply_markup,
        });
        await ctx.reply(KB_LABELS.dayEditor, newsDayEditorReplyKeyboard(true, dateKey));
      } else if (state.messageId) {
        const kb = newsDayEmptyKeyboard(dateKey);
        const emptyText = `🈳 برای این تاریخ (${dateKey}) هنوز محتوایی ثبت نشده است.\n\nبرای افزودن محتوا از دکمهٔ زیر استفاده کنید.`;
        await safeEditById(ctx, state.messageId, emptyText, { reply_markup: kb.reply_markup });
        await ctx.reply(KB_LABELS.dayEditor, newsDayEditorReplyKeyboard(false, dateKey));
      } else {
        if (entry) {
          await ctx.reply(entry.text as string, {
            entities: entry.entities as any,
            ...newsDayContentKeyboard(dateKey),
          });
          await ctx.reply(KB_LABELS.dayEditor, newsDayEditorReplyKeyboard(true, dateKey));
        } else {
          const kb = newsDayEmptyKeyboard(dateKey);
          const emptyText = `🈳 برای این تاریخ (${dateKey}) هنوز محتوایی ثبت نشده است.\n\nبرای افزودن محتوا از دکمهٔ زیر استفاده کنید.`;
          await ctx.reply(emptyText, kb);
          await ctx.reply(KB_LABELS.dayEditor, newsDayEditorReplyKeyboard(false, dateKey));
        }
      }
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
