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
    ['🧪 ارسال تستی'],
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
    ['🔘 مدیریت دکمه‌ها'],
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
  const actionRow: any[] = [
    Markup.button.callback('✏️ ویرایش پیام', `sched:msg:edit:${msgId}`),
    Markup.button.callback('🗑 حذف پیام', `sched:msg:delete:${msgId}`),
  ];
  const rows: any[][] = [actionRow];
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
    [Markup.button.callback('⏱ هر ۲ دقیقه (تست)', 'sched:interval:2')],
    [Markup.button.callback('⏰ هر ۳ ساعت', 'sched:interval:180')],
    [Markup.button.callback('⏰ هر ۶ ساعت', 'sched:interval:360')],
    [Markup.button.callback('⏰ هر ۹ ساعت', 'sched:interval:540')],
    [Markup.button.callback('⏰ هر ۱۲ ساعت', 'sched:interval:720')],
    [Markup.button.callback('⏰ هر ۲۴ ساعت', 'sched:interval:1440')],
    [Markup.button.callback('⏰ هر هفته', 'sched:interval:10080')],
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

// ─── Group Selection (Reply Keyboard — Bug #4) ───────────

export function scheduleGroupReplyKeyboard(groups: any[]) {
  const rows: string[][] = groups.map((g) => [g.title]);
  rows.push(['🔙 بازگشت']);
  return Markup.keyboard(rows).resize().persistent();
}

// ─── Topic Selection (Reply Keyboard — Bug #5) ───────────

export function scheduleTopicReplyKeyboard(topics: any[]) {
  const rows: string[][] = [['📌 همه تاپیک‌ها']];
  for (const t of topics) {
    rows.push([t.name]);
  }
  rows.push(['🔙 بازگشت']);
  return Markup.keyboard(rows).resize().persistent();
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

// ─── Button Editor (mirrors Post system renderButtonEditor) ──

const colorIndicator = (style?: string) => {
  if (style === 'primary') return '🔵';
  if (style === 'success') return '🟢';
  if (style === 'danger') return '🔴';
  return '';
};

function buildButtonEditorInlineKeyboard(
  messageId: number,
  buttons: any[][],
  mode: 'create' | 'edit' | 'delete' | 'move',
  selectedPos?: { row: number; col: number },
): any[][] {
  const rows: any[][] = [];
  const hasButtons = buttons && buttons.length > 0 && buttons.some(r => Array.isArray(r) && r.length > 0);

  if (hasButtons) {
    for (let r = 0; r < buttons.length; r++) {
      const row = buttons[r];
      if (!Array.isArray(row)) continue;
      const rowButtons: any[] = [];
      for (let c = 0; c < row.length; c++) {
        const btn = row[c];
        if (!btn) continue;
        const label = (btn.text || 'بدون عنوان').substring(0, 13);
        const isSelected = mode === 'move' && selectedPos && selectedPos.row === r && selectedPos.col === c;
        const icon = isSelected ? '[✅]' : mode === 'edit' ? '[✏️]' : mode === 'delete' ? '[✖]' : mode === 'move' ? '[🔀]' : '[＋]';
        rowButtons.push(
          Markup.button.callback(`${colorIndicator(btn.style)}${icon} ${label}`, `smbtn:click:${messageId}:${r}:${c}`),
        );
      }
      if (rowButtons.length > 0) rows.push(rowButtons);
    }
  } else if (mode === 'create') {
    rows.push([Markup.button.callback('＋', `smbtn:click:${messageId}:0:0`)]);
  }

  if (mode !== 'move') {
    rows.push([
      Markup.button.callback('➕ ایجاد', `smbtn:mode:create:${messageId}`),
      Markup.button.callback('✏️ ویرایش', `smbtn:mode:edit:${messageId}`),
      Markup.button.callback('🗑 حذف', `smbtn:mode:delete:${messageId}`),
      Markup.button.callback('🔀 جابجایی', `smbtn:mode:move:${messageId}`),
    ]);
  }

  return rows;
}

export function renderScheduledButtonEditor(
  messageId: number,
  buttons: any[][],
  mode?: 'create' | 'edit' | 'delete' | 'move',
  selectedPos?: { row: number; col: number },
): { text: string; reply_markup: any } {
  const effectiveMode = mode || 'create';
  const rows = buildButtonEditorInlineKeyboard(messageId, buttons, effectiveMode, selectedPos);
  return {
    text: '⌨️ ویرایشگر دکمه‌ها',
    reply_markup: { inline_keyboard: rows },
  };
}

export function buildSmbtnEditTypeKeyboard(messageId: number, row: number, col: number, currentColor?: string) {
  const colorLabel = currentColor ? `🎨 رنگ (${colorIndicator(currentColor)})` : '🎨 رنگ';
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔗 لینک یا اشتراک', `smbtn:type:url:${messageId}:${row}:${col}`)],
    [Markup.button.callback('🪟 POP-UP', `smbtn:type:popup:${messageId}:${row}:${col}`)],
    [Markup.button.callback('⌨️ دستور', `smbtn:type:command:${messageId}:${row}:${col}`)],
    [Markup.button.callback(colorLabel, `smbtn:color:${messageId}:${row}:${col}`)],
    [Markup.button.callback('❌ لغو', `smbtn:type:cancel:${messageId}`)],
  ]);
}

export function buildSmbtnMoveKeyboard() {
  return Markup.keyboard([
    ['⬆️ بالا', '⬇️ پایین'],
    ['⬅️ چپ', '➡️ راست'],
    ['✅ تایید جابه‌جایی و بازگشت', '❌ لغو جابجایی'],
  ]).resize().persistent();
}

export function buildSmbtnColorKeyboard(messageId: number, row: number, col: number) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔵 Primary (آبی)', `smbtn:color:set:${messageId}:${row}:${col}:primary`)],
    [Markup.button.callback('🟢 Success (سبز)', `smbtn:color:set:${messageId}:${row}:${col}:success`)],
    [Markup.button.callback('🔴 Danger (قرمز)', `smbtn:color:set:${messageId}:${row}:${col}:danger`)],
    [Markup.button.callback('⚪ بدون رنگ', `smbtn:color:set:${messageId}:${row}:${col}:default`)],
    [Markup.button.callback('❌ لغو', `smbtn:type:cancel:${messageId}`)],
  ]);
}
