import { Markup } from 'telegraf';
import { sanitizeTelegramText } from '../../utils/unicode';
import { graphemeTruncate } from '../../utils/grapheme';

// ─── Automation Menu ───────────────────────────────────────

export function autoReplyAutomationKeyboard() {
  return Markup.keyboard([
    ['📨 پیام‌های خودکار'],
    ['💬 پاسخ‌های خودکار'],
    ['🔙 بازگشت به پنل ادمین'],
  ]).resize().persistent();
}

// ─── Main Menu ────────────────────────────────────────────

export function autoReplyMainMenuKeyboard(posts: any[] = []) {
  const rows: string[][] = [['➕ ایجاد پست جدید']];
  for (const post of posts) {
    const label = graphemeTruncate(sanitizeTelegramText(post.title || 'بدون عنوان'), 30);
    rows.push([label]);
  }
  rows.push(['🔙 بازگشت']);
  return Markup.keyboard(rows).resize().persistent();
}

// ─── Post List (Inline) ───────────────────────────────────

export function autoReplyListInlineKeyboard(messages: any[], page: number, totalPages: number) {
  const rows: any[][] = messages.map((p: any) => [
    Markup.button.callback(
      `${p.isPublished ? '✅' : '📝'} ${graphemeTruncate(sanitizeTelegramText(p.title) || 'بدون عنوان', 28)}`,
      `ar:view:${p.id}`,
    ),
  ]);
  const nav: any[] = [];
  if (page > 1) nav.push(Markup.button.callback('◀️ قبلی', `ar:list:${page - 1}`));
  nav.push(Markup.button.callback(`${page}/${totalPages}`, 'noop'));
  if (page < totalPages) nav.push(Markup.button.callback('بعدی ▶️', `ar:list:${page + 1}`));
  if (nav.length > 1) rows.push(nav);
  rows.push([Markup.button.callback('« بازگشت به منوی پست', 'ar:menu')]);
  return Markup.inlineKeyboard(rows);
}

// ─── New Post Manager Reply Keyboard ──────────────────────

export function autoReplyNewPostManagerReplyKeyboard() {
  return Markup.keyboard([
    ['➕ افزودن پیام', '⏰ تنظیم زمان‌بندی'],
    ['📖 دستور', '👥 انتخاب گروه'],
    ['✅ انتشار'],
    ['🗑 حذف پست'],
    ['🔙 بازگشت'],
  ]).resize().persistent();
}

// ─── Post Editor Reply Keyboard ───────────────────────────

export function autoReplyEditorReplyKeyboard(isPublished: boolean) {
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

export function autoReplyCancelOnlyKeyboard() {
  return Markup.keyboard([['❌ لغو']]).resize().persistent();
}

// ─── Add Message Prompt ───────────────────────────────────

export function autoReplyAddMessageKeyboard() {
  return Markup.keyboard([['❌ لغو']]).resize().persistent();
}

// ─── Message Edit Reply Keyboard ──────────────────────────

export function autoReplyEditMessageReplyKeyboard() {
  return Markup.keyboard([
    ['✏️ ویرایش محتوا', '📝 ویرایش عنوان'],
    ['🔘 مدیریت دکمه‌ها'],
    ['🔙 بازگشت'],
  ]).resize().persistent();
}

// ─── Single Message Inline Keyboard ───────────────────────

export function autoReplySingleMessageInlineKeyboard(
  autoReplyId: number,
  msg: any,
  msgIndex: number,
  totalMsgs: number,
) {
  const msgId = msg.id;
  const actionRow: any[] = [
    Markup.button.callback('✏️ ویرایش پیام', `ar:msg:edit:${msgId}`),
    Markup.button.callback('🗑 حذف پیام', `ar:msg:delete:${msgId}`),
  ];
  const rows: any[][] = [actionRow];
  const moveRow: any[] = [];
  if (msgIndex > 0) moveRow.push(Markup.button.callback('⬆️ بالا', `ar:msg:up:${autoReplyId}:${msgId}`));
  if (msgIndex < totalMsgs - 1) moveRow.push(Markup.button.callback('⬇️ پایین', `ar:msg:down:${autoReplyId}:${msgId}`));
  if (moveRow.length > 0) rows.push(moveRow);
  rows.push([Markup.button.callback('➕ افزودن پیام', `ar:msg:add:${autoReplyId}:${msgId}`)]);
  return Markup.inlineKeyboard(rows);
}

// ─── Schedule Interval Selection ──────────────────────────

export function autoReplyIntervalKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('⏱ هر ۲ دقیقه (تست)', 'ar:interval:2')],
    [Markup.button.callback('⏰ هر ۳ ساعت', 'ar:interval:180')],
    [Markup.button.callback('⏰ هر ۶ ساعت', 'ar:interval:360')],
    [Markup.button.callback('⏰ هر ۹ ساعت', 'ar:interval:540')],
    [Markup.button.callback('⏰ هر ۱۲ ساعت', 'ar:interval:720')],
    [Markup.button.callback('⏰ هر ۲۴ ساعت', 'ar:interval:1440')],
    [Markup.button.callback('⏰ هر هفته', 'ar:interval:10080')],
    [Markup.button.callback('⏰ زمان سفارشی', 'ar:interval:custom')],
    [Markup.button.callback('↩️ بازگشت', 'ar:menu')],
  ]);
}

// ─── Group Selection ──────────────────────────────────────

export function autoReplyGroupKeyboard(groups: any[]) {
  const rows: any[][] = groups.map((g) => [
    Markup.button.callback(`${g.title}`, `ar:group:${g.chatId}`),
  ]);
  rows.push([Markup.button.callback('↩️ بازگشت', 'ar:menu')]);
  return Markup.inlineKeyboard(rows);
}

// ─── Topic Selection ──────────────────────────────────────

export function autoReplyTopicKeyboard(topics: any[]) {
  const rows: any[][] = [];
  rows.push([Markup.button.callback('📌 همه تاپیک‌ها', 'ar:topic:all')]);
  for (const t of topics) {
    rows.push([Markup.button.callback(`${t.name}`, `ar:topic:${t.id}`)]);
  }
  rows.push([Markup.button.callback('↩️ بازگشت', 'ar:menu')]);
  return Markup.inlineKeyboard(rows);
}

// ─── Group Selection (Reply Keyboard) ─────────────────────

export function autoReplyGroupReplyKeyboard(groups: any[]) {
  const rows: string[][] = groups.map((g) => [g.title]);
  rows.push(['🔙 بازگشت']);
  return Markup.keyboard(rows).resize().persistent();
}

// ─── Topic Selection (Reply Keyboard) ─────────────────────

export function autoReplyTopicReplyKeyboard(topics: any[]) {
  const rows: string[][] = [['📌 همه تاپیک‌ها']];
  for (const t of topics) {
    rows.push([t.name]);
  }
  rows.push(['🔙 بازگشت']);
  return Markup.keyboard(rows).resize().persistent();
}

// ─── Publish Validation Keyboard ──────────────────────────

export function autoReplyPublishValidationKeyboard(missingFields: { key: string; label: string }[]) {
  const rows: any[][] = missingFields.map((f) => [
    Markup.button.callback(f.label, `ar:goto:${f.key}`),
  ]);
  return Markup.inlineKeyboard(rows);
}

// ─── Delete Confirmation ──────────────────────────────────

export function autoReplyDeleteConfirmKeyboard(id: number) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✅ تایید حذف', `ar:delete:confirm:${id}`)],
    [Markup.button.callback('❌ انصراف', `ar:view:${id}`)],
  ]);
}

// ─── Dashboard ────────────────────────────────────────────

export function autoReplyDashboardKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔄 تازه‌سازی', 'ar:dashboard:refresh')],
    [Markup.button.callback('↩️ بازگشت', 'ar:menu')],
  ]);
}

// ─── Button Editor ────────────────────────────────────────

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
          Markup.button.callback(`${colorIndicator(btn.style)}${icon} ${label}`, `arbtn:click:${messageId}:${r}:${c}`),
        );
      }
      if (rowButtons.length > 0) rows.push(rowButtons);
    }
  } else if (mode === 'create') {
    rows.push([Markup.button.callback('＋', `arbtn:click:${messageId}:0:0`)]);
  }

  if (mode !== 'move') {
    rows.push([
      Markup.button.callback('➕ ایجاد', `arbtn:mode:create:${messageId}`),
      Markup.button.callback('✏️ ویرایش', `arbtn:mode:edit:${messageId}`),
      Markup.button.callback('🗑 حذف', `arbtn:mode:delete:${messageId}`),
      Markup.button.callback('🔀 جابجایی', `arbtn:mode:move:${messageId}`),
    ]);
  }

  return rows;
}

export function renderAutoReplyButtonEditor(
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

export function buildArbtnEditTypeKeyboard(messageId: number, row: number, col: number, currentColor?: string) {
  const colorLabel = currentColor ? `🎨 رنگ (${colorIndicator(currentColor)})` : '🎨 رنگ';
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔗 لینک یا اشتراک', `arbtn:type:url:${messageId}:${row}:${col}`)],
    [Markup.button.callback('🪟 POP-UP', `arbtn:type:popup:${messageId}:${row}:${col}`)],
    [Markup.button.callback('⌨️ دستور', `arbtn:type:command:${messageId}:${row}:${col}`)],
    [Markup.button.callback(colorLabel, `arbtn:color:${messageId}:${row}:${col}`)],
    [Markup.button.callback('❌ لغو', `arbtn:type:cancel:${messageId}`)],
  ]);
}

export function buildArbtnMoveKeyboard() {
  return Markup.keyboard([
    ['⬆️ بالا', '⬇️ پایین'],
    ['⬅️ چپ', '➡️ راست'],
    ['✅ تایید جابه‌جایی و بازگشت', '❌ لغو جابجایی'],
  ]).resize().persistent();
}

export function buildArbtnColorKeyboard(messageId: number, row: number, col: number) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔵 Primary (آبی)', `arbtn:color:set:${messageId}:${row}:${col}:primary`)],
    [Markup.button.callback('🟢 Success (سبز)', `arbtn:color:set:${messageId}:${row}:${col}:success`)],
    [Markup.button.callback('🔴 Danger (قرمز)', `arbtn:color:set:${messageId}:${row}:${col}:danger`)],
    [Markup.button.callback('⚪ بدون رنگ', `arbtn:color:set:${messageId}:${row}:${col}:default`)],
    [Markup.button.callback('❌ لغو', `arbtn:type:cancel:${messageId}`)],
  ]);
}
