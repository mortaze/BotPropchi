import { Markup } from 'telegraf';
import { sanitizeTelegramText } from '../../utils/unicode';
import { graphemeTruncate } from '../../utils/grapheme';

// ─── Main Menu ────────────────────────────────────────────

export function scheduledMessageMainMenuKeyboard() {
  return Markup.keyboard([
    ['➕ ایجاد پست جدید'],
    ['📋 لیست پست‌ها'],
    ['📊 گزارش ارسال'],
    ['🔙 بازگشت به پنل ادمین'],
  ]).resize().persistent();
}

// ─── Post List (Inline — after clicking 📋 لیست پست‌ها) ────

export function scheduledMessageListInlineKeyboard(messages: any[], page: number, totalPages: number) {
  const rows: any[][] = messages.map((p: any) => [
    Markup.button.callback(
      `${p.isPublished ? '✅' : '📝'} ${graphemeTruncate(sanitizeTelegramText(p.title) || 'بدون عنوان', 28)}`,
      `sched:view:${p.id}`,
    ),
  ]);
  const nav: any[] = [];
  if (page > 1) nav.push(Markup.button.callback('◀️ قبلی', `sched:list:${page - 1}`));
  nav.push(Markup.button.callback(`${page}/${totalPages}`, 'noop'));
  if (page < totalPages) nav.push(Markup.button.callback('بعدی ▶️', `sched:list:${page + 1}`));
  if (nav.length > 1) rows.push(nav);
  rows.push([Markup.button.callback('« بازگشت به منوی پست', 'sched:menu')]);
  return Markup.inlineKeyboard(rows);
}

// ─── New Post Manager Reply Keyboard (after creating post) ─

export function scheduledMessageNewPostManagerReplyKeyboard() {
  return Markup.keyboard([
    ['➕ افزودن پیام', '⏰ تنظیم زمان‌بندی'],
    ['📖 دستور', '👥 انتخاب گروه'],
    ['✅ انتشار'],
    ['🗑 حذف پست'],
    ['🔙 بازگشت'],
  ]).resize().persistent();
}

// ─── Post Editor Reply Keyboard (after selecting a post) ───

export function scheduledMessageEditorReplyKeyboard(isPublished: boolean) {
  return Markup.keyboard([
    ['➕ افزودن پیام'],
    ['👥 انتخاب گروه', '⏰ تنظیم زمان‌بندی'],
    ['📖 دستور'],
    ['✅ انتشار', '📊 آمار'],
    ['🗑 حذف پست'],
    ['🔙 بازگشت به لیست'],
  ]).resize().persistent();
}

// ─── Cancel Only ──────────────────────────────────────────

export function scheduledMessageCancelOnlyKeyboard() {
  return Markup.keyboard([['❌ لغو']]).resize().persistent();
}

// ─── Add Message Prompt ───────────────────────────────────

export function scheduledMessageAddMessageKeyboard() {
  return Markup.keyboard([['❌ لغو']]).resize().persistent();
}

// ─── Message Edit Reply Keyboard ──────────────────────────

export function scheduledMessageEditMessageReplyKeyboard() {
  return Markup.keyboard([
    ['✏️ ویرایش محتوا', '📝 ویرایش عنوان'],
    ['🔘 ویرایش دکمه‌ها'],
    ['🔙 بازگشت'],
  ]).resize().persistent();
}

// ─── Single Message Inline Keyboard ───────────────────────
// Per-message: edit/delete/move/add — mirrors postSingleMessageInlineKeyboard

export function scheduledMessageSingleMessageInlineKeyboard(
  scheduledMessageId: number,
  msg: any,
  msgIndex: number,
  totalMsgs: number,
) {
  const msgId = msg.id;
  const rows: any[][] = [
    [
      Markup.button.callback('✏️ ویرایش پیام', `sched:msg:edit:${msgId}`),
      Markup.button.callback('🗑 حذف پیام', `sched:msg:delete:${msgId}`),
    ],
  ];
  const moveRow: any[] = [];
  if (msgIndex > 0) moveRow.push(Markup.button.callback('⬆️ بالا', `sched:msg:up:${scheduledMessageId}:${msgId}`));
  if (msgIndex < totalMsgs - 1) moveRow.push(Markup.button.callback('⬇️ پایین', `sched:msg:down:${scheduledMessageId}:${msgId}`));
  if (moveRow.length > 0) rows.push(moveRow);
  rows.push([Markup.button.callback('➕ افزودن پیام', `sched:msg:add:${scheduledMessageId}:${msgId}`)]);
  return Markup.inlineKeyboard(rows);
}

// ─── Schedule Interval Selection ──────────────────────────

export function scheduleIntervalKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('⏰ هر ۳ ساعت', 'sched:interval:3')],
    [Markup.button.callback('⏰ هر ۶ ساعت', 'sched:interval:6')],
    [Markup.button.callback('⏰ هر ۹ ساعت', 'sched:interval:9')],
    [Markup.button.callback('⏰ هر ۱۲ ساعت', 'sched:interval:12')],
    [Markup.button.callback('⏰ هر ۲۴ ساعت', 'sched:interval:24')],
    [Markup.button.callback('⏰ هر هفته', 'sched:interval:168')],
    [Markup.button.callback('⏰ زمان سفارشی', 'sched:interval:custom')],
    [Markup.button.callback('↩️ بازگشت', 'sched:menu')],
  ]);
}

// ─── Group Selection ──────────────────────────────────────

export function scheduleGroupKeyboard(groups: any[]) {
  const rows: any[][] = groups.map((g) => [
    Markup.button.callback(`${g.title}`, `sched:group:${g.chatId}`),
  ]);
  rows.push([Markup.button.callback('↩️ بازگشت', 'sched:menu')]);
  return Markup.inlineKeyboard(rows);
}

// ─── Topic Selection ──────────────────────────────────────

export function scheduleTopicKeyboard(topics: any[]) {
  const rows: any[][] = [];
  rows.push([Markup.button.callback('📌 همه تاپیک‌ها', 'sched:topic:all')]);
  for (const t of topics) {
    rows.push([Markup.button.callback(`${t.name}`, `sched:topic:${t.id}`)]);
  }
  rows.push([Markup.button.callback('↩️ بازگشت', 'sched:menu')]);
  return Markup.inlineKeyboard(rows);
}

// ─── Publish Validation Keyboard ──────────────────────────

export function scheduledMessagePublishValidationKeyboard(missingFields: { key: string; label: string }[]) {
  const rows: any[][] = missingFields.map((f) => [
    Markup.button.callback(f.label, `sched:goto:${f.key}`),
  ]);
  return Markup.inlineKeyboard(rows);
}

// ─── Delete Confirmation ──────────────────────────────────

export function scheduledMessageDeleteConfirmKeyboard(id: number) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✅ تایید حذف', `sched:delete:confirm:${id}`)],
    [Markup.button.callback('❌ انصراف', `sched:view:${id}`)],
  ]);
}

// ─── Dashboard ────────────────────────────────────────────

export function scheduledMessageDashboardKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔄 تازه‌سازی', 'sched:dashboard:refresh')],
    [Markup.button.callback('↩️ بازگشت', 'sched:menu')],
  ]);
}
