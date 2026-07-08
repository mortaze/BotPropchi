import { Markup } from 'telegraf';
import { sanitizeTelegramText } from '../../utils/unicode';
import { graphemeTruncate } from '../../utils/grapheme';

// ─── Main Menu ────────────────────────────────────────────

export function autoReplyMainMenuKeyboard(posts: any[] = []) {
  const rows: string[][] = [['➕ ایجاد پاسخ جدید']];
  for (const post of posts) {
    const label = graphemeTruncate(sanitizeTelegramText(post.title || 'بدون عنوان'), 30);
    rows.push([label]);
  }
  rows.push(['🔙 بازگشت به اتوماسیون']);
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
  rows.push([Markup.button.callback('« بازگشت به لیست پاسخ‌ها', 'ar:menu')]);
  return Markup.inlineKeyboard(rows);
}

// ─── New Post Manager Reply Keyboard ──────────────────────

export function autoReplyNewPostManagerReplyKeyboard() {
  return Markup.keyboard([
    ['➕ افزودن پیام'],
    ['👥 انتخاب گروه', '🏷 کلمات کلیدی پاسخ'],
    ['✅ انتشار'],
    ['🗑 حذف پاسخ'],
    ['🔙 بازگشت'],
  ]).resize().persistent();
}

// ─── Post Editor Reply Keyboard ───────────────────────────

export function autoReplyEditorReplyKeyboard(isPublished: boolean) {
  return Markup.keyboard([
    ['➕ افزودن پیام'],
    ['👥 انتخاب گروه', '🏷 کلمات کلیدی پاسخ'],
    ['✅ انتشار', '📊 آمار'],
    ['🗑 حذف پاسخ'],
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

// ─── Destination: Group Reply Keyboard ────────────────────

export function buildDestinationGroupKeyboard(groups: any[]) {
  const rows: string[][] = groups.map((g) => [g.title]);
  rows.push(['❌ لغو']);
  return Markup.keyboard(rows).resize().persistent();
}

// ─── Destination: Topic Reply Keyboard ────────────────────

export function buildDestinationTopicKeyboard(topics: any[]) {
  const rows: string[][] = [];
  for (const t of topics) {
    rows.push([t.name]);
  }
  rows.push(['⬅️ بازگشت']);
  return Markup.keyboard(rows).resize().persistent();
}

// ─── Destination: Status Message Inline Keyboard ──────────
// Shows selected topics as ❌ remove buttons + ✅ confirm

export function buildTopicStatusInlineKeyboard(topics: { topicId: number; topicName: string }[]) {
  const rows: any[][] = [];
  for (const t of topics) {
    rows.push([Markup.button.callback(`❌ ${t.topicName}`, `ar:dest:remove_topic:${t.topicId}`)]);
  }
  rows.push([Markup.button.callback('✅ تایید نهایی', 'ar:dest:final_confirm')]);
  return Markup.inlineKeyboard(rows);
}

// ─── Destination: Non-Forum Confirm Inline Keyboard ───────

export function buildNonForumConfirmKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✅ تایید نهایی', 'ar:dest:final_confirm')],
  ]);
}

// ─── Legacy keyboards (kept for backward compat) ──────────

export function autoReplyGroupReplyKeyboard(groups: any[]) {
  const rows: string[][] = groups.map((g) => [g.title]);
  rows.push(['🔙 بازگشت']);
  return Markup.keyboard(rows).resize().persistent();
}

export function autoReplyTopicReplyKeyboard(topics: any[]) {
  const rows: string[][] = [['📌 همه تاپیک‌ها']];
  for (const t of topics) {
    rows.push([t.name]);
  }
  rows.push(['🔙 بازگشت']);
  return Markup.keyboard(rows).resize().persistent();
}

export function buildGroupSelectKeyboard(groups: any[]) {
  const rows: any[][] = groups.map((g: any) => [
    Markup.button.callback(g.title, `ar:bind:group:${g.chatId}`),
  ]);
  rows.push([Markup.button.callback('❌ لغو', 'ar:bind:cancel')]);
  return Markup.inlineKeyboard(rows);
}

export function buildTopicSelectKeyboard(topics: any[], selectedIds: number[]) {
  const rows: any[][] = [];
  for (const t of topics) {
    const check = selectedIds.includes(t.topicId) ? '✅' : '☐';
    rows.push([Markup.button.callback(`${check} ${t.name}`, `ar:bind:topic:${t.topicId}`)]);
  }
  if (topics.length > 0) {
    rows.push([Markup.button.callback('📌 همه تاپیک‌ها', 'ar:bind:topic:all')]);
  }
  rows.push([
    Markup.button.callback('✅ ذخیره', 'ar:bind:save'),
    Markup.button.callback('❌ لغو', 'ar:bind:cancel'),
  ]);
  return Markup.inlineKeyboard(rows);
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

// ─── Keyword Management ──────────────────────────────────

export function renderKeywordPage(keywords: any[], mode: 'list' | 'edit' | 'delete') {
  const rows: any[][] = [];
  if (keywords.length === 0) {
    rows.push([Markup.button.callback('(هنوز هیچ کلمه‌ای ثبت نشده است)', 'noop')]);
  } else if (mode === 'edit') {
    for (const kw of keywords) {
      rows.push([Markup.button.callback(`✏️ ${kw.keyword}`, `ar:kw:edit:${kw.id}`)]);
    }
  } else if (mode === 'delete') {
    for (const kw of keywords) {
      rows.push([Markup.button.callback(`❌ ${kw.keyword}`, `ar:kw:delete:${kw.id}`)]);
    }
  } else {
    for (const kw of keywords) {
      rows.push([Markup.button.callback(kw.keyword, `ar:kw:noop:${kw.id}`)]);
    }
  }
  rows.push([
    Markup.button.callback('➕ ایجاد کلمه جدید', 'ar:kw:create'),
    Markup.button.callback('✏️ ویرایش', 'ar:kw:enter_edit'),
    Markup.button.callback('🗑 حذف', 'ar:kw:enter_delete'),
  ]);
  const countLine = `تعداد کلمات کلیدی: ${keywords.length}`;
  const modeLabel = mode === 'edit' ? ' (حالت ویرایش)' : mode === 'delete' ? ' (حالت حذف)' : '';
  const text = `🏷 مدیریت کلمات کلیدی${modeLabel}\n\nهر زمان یکی از کاربران یکی از کلمات زیر را داخل گروه ارسال کند، این پاسخ خودکار برای او ارسال خواهد شد.\n\n${countLine}`;
  return { text, reply_markup: { inline_keyboard: rows } };
}

export function autoReplyKeywordCancelKeyboard() {
  return Markup.keyboard([['❌ لغو']]).resize().persistent();
}

// ─── Button Editor ────────────────────────────────────────

const colorIndicator = (style?: string) => {
  if (style === 'primary') return '🔵';
  if (style === 'success') return '🟢';
  if (style === 'danger') return '🔴';
  return '';
};

export function buildButtonEditorInlineKeyboard(
  messageId: number,
  buttons: any[][],
  mode: 'create' | 'edit' | 'delete' | 'move',
  selectedPos?: { row: number; col: number },
  prefix: string = 'arbtn',
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
        const color = colorIndicator(btn.style);
        const icon = isSelected ? '✅' : mode === 'edit' ? '✏️' : mode === 'delete' ? '❌' : mode === 'move' ? '↕️' : '+';
        rowButtons.push(Markup.button.callback(`${color}{${icon}} ${label}`, `${prefix}:click:${messageId}:${r}:${c}`));
      }
      if (rowButtons.length > 0) rows.push(rowButtons);
    }
  } else if (mode === 'create') {
    rows.push([Markup.button.callback('＋', `${prefix}:click:${messageId}:0:0`)]);
  }
  if (mode !== 'move') {
    rows.push([
      Markup.button.callback('➕ ایجاد', `${prefix}:mode:create:${messageId}`),
      Markup.button.callback('✏️ ویرایش', `${prefix}:mode:edit:${messageId}`),
      Markup.button.callback('🗑 حذف', `${prefix}:mode:delete:${messageId}`),
      Markup.button.callback('🔀 جابجایی', `${prefix}:mode:move:${messageId}`),
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
  const rows = buildButtonEditorInlineKeyboard(messageId, buttons, effectiveMode, selectedPos, 'arbtn');
  return { text: '⌨️ ویرایشگر دکمه‌ها', reply_markup: { inline_keyboard: rows } };
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
    ['✅ تایید جابه‌جایی', '❌ لغو جابجایی'],
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

export function buildArbtnEditReplyKeyboard() {
  return Markup.keyboard([
    ['🔗 لینک یا اشتراک'],
    ['🪟 POP-UP'],
    ['⌨️ دستور'],
    ['🎨 رنگ'],
    ['❌ لغو'],
  ]).resize().persistent();
}

export function buildArbtnEditWaitingKeyboard() {
  return Markup.keyboard([['❌ لغو']]).resize().persistent();
}

export function buildArbtnColorReplyKeyboard() {
  return Markup.keyboard([
    ['🔵 Primary (آبی)'],
    ['🟢 Success (سبز)'],
    ['🔴 Danger (قرمز)'],
    ['⚪ Default'],
    ['❌ لغو'],
  ]).resize().persistent();
}
