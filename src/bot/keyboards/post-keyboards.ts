import { Markup } from 'telegraf';
import { sanitizeTelegramText, buildSafeTelegramButton } from '../../utils/unicode';
import { graphemeTruncate } from '../../utils/grapheme';
import { logger } from '../../utils/logger';

function buttonDisplayText(btn: any, fallback: string): string {
  if (!btn) return fallback;
  const text = btn.text || btn.label || btn.title || btn.ref || fallback;
  return typeof text === 'string' && text.trim() ? text : fallback;
}

export const postMainMenuKeyboard = () =>
  Markup.keyboard([
    ['➕ ایجاد پست'],
    ['📋 مدیریت پست‌ها', '📦 پیش‌نویس‌ها'],
    ['👻 پست‌های مخفی'],
    ['👁 پیش‌نمایش', '📤 انتشار'],
    ['🔎 جستجو', '📊 آمار پست'],
    ['↩️ بازگشت به پنل ادمین'],
  ]).resize().persistent();

export const postEditorKeyboard = (postId: number, hasContent: boolean) => {
  const rows: any[][] = [
    [
      Markup.button.callback('✏ ویرایش عنوان', `post:edit:${postId}:title`),
      Markup.button.callback('📝 ویرایش محتوا', `post:edit:${postId}:content`),
    ],
    [
      Markup.button.callback('🖼 تغییر رسانه', `post:edit:${postId}:media`),
      Markup.button.callback('⌨ ویرایش دکمه‌ها', `post:edit:${postId}:buttons`),
    ],
    [
      Markup.button.callback('🧪 پیش‌نمایش', `post:preview:${postId}`),
      Markup.button.callback('📤 انتشار', `post:publish:${postId}`),
    ],
    [
      Markup.button.callback('🔗 افزودن دستور', `post:cmd:add:${postId}`),
    ],
    [
      Markup.button.callback('📜 تاریخچه نسخه‌ها', `post:version:list:${postId}`),
      Markup.button.callback('📊 آمار', `post:analytics:${postId}`),
    ],
    [
      Markup.button.callback('📦 بایگانی', `post:archive:${postId}`),
      Markup.button.callback('👻 مخفی‌سازی', `post:hide:${postId}`),
    ],
    [
      Markup.button.callback('🗑 حذف', `post:delete:${postId}`),
      Markup.button.callback('« بازگشت', `post:list:1`),
    ],
  ];
  return Markup.inlineKeyboard(rows);
};

export const postListKeyboard = (posts: any[], page: number, totalPages: number) => {
  const rows: any[][] = posts.map((p: any) => [
    Markup.button.callback(
      `${p.status === 'PUBLISHED' ? '✅' : p.status === 'DRAFT' ? '📝' : p.status === 'SCHEDULED' ? '⏰' : p.status === 'HIDDEN' ? '👻' : '📦'} ${graphemeTruncate(sanitizeTelegramText(p.title) || 'بدون عنوان', 28)}`,
      `post:view:${p.id}`
    ),
  ]);
  const nav: any[] = [];
  if (page > 1) nav.push(Markup.button.callback('◀️ قبلی', `post:list:${page - 1}`));
  nav.push(Markup.button.callback(`${page}/${totalPages}`, 'noop'));
  if (page < totalPages) nav.push(Markup.button.callback('بعدی ▶️', `post:list:${page + 1}`));
  if (nav.length > 1) rows.push(nav);
  rows.push([Markup.button.callback('« بازگشت به منوی پست', 'post:menu')]);
  return Markup.inlineKeyboard(rows);
};

export const postViewKeyboard = (post: any) => {
  const rows: any[][] = [
    [Markup.button.callback('✏ ویرایش', `post:edit:${post.id}:full`)],
    [
      Markup.button.callback(post.isPublished ? '📥 لغو انتشار' : '📤 انتشار', `post:publish:${post.id}`),
    ],
    [
      Markup.button.callback('📊 آمار', `post:analytics:${post.id}`),
    ],
    [
      Markup.button.callback('📦 بایگانی', `post:archive:${post.id}`),
      Markup.button.callback(post.status === 'HIDDEN' ? '👻 نمایش' : '👻 مخفی', `post:hide:${post.id}`),
    ],
    [
      Markup.button.callback('🗑 حذف', `post:delete:${post.id}`),
      Markup.button.callback('« بازگشت', `post:list:1`),
    ],
  ];
  return Markup.inlineKeyboard(rows);
};

// ─── Reply Keyboard: Post Edit Mode ──────────────────────────
export const postEditModeReplyKeyboard = () =>
  Markup.keyboard([
    ['📝 ویرایش محتوا', '🏷 ویرایش عنوان'],
    ['🔘 ویرایش دکمه‌ها', '🖼 ویرایش رسانه'],
    ['🚀 تغییر وضعیت انتشار'],
    ['➕ افزودن دستور'],
    ['🗑 حذف پست'],
    ['🔙 بازگشت'],
  ]).resize().persistent();

// ─── Reply Keyboard: Post Title List (with back button) ──
export const postTitleOnlyListKeyboard = (posts: any[]) => {
  const rows: string[][] = posts.map(p => [graphemeTruncate(sanitizeTelegramText(p.title) || 'بدون عنوان', 40)]);
  rows.push(['🔙 بازگشت به منوی پست']);
  return Markup.keyboard(rows).resize().persistent();
};

// ─── Reply Keyboard: Post List from Menu Layout ──
// Builds the post selection keyboard directly from the menu layout.
// Only post-ref buttons are included, preserving the exact row/column structure.
// The back button is always appended as the last row.
export const buildPostListFromMenuLayout = (layout: any[][]) => {
  const rows: string[][] = layout
    .filter(row => Array.isArray(row))
    .map(row =>
      row
        .filter((btn: any) => btn && btn.ref && btn.ref.startsWith('post:'))
        .map((btn: any) => {
          const text = btn.text || btn.label || btn.title || btn.ref || 'بدون عنوان';
          return sanitizeTelegramText(text, 128);
        })
    )
    .filter((row: string[]) => row.length > 0);
  rows.push(['🔙 بازگشت به منوی پست‌ها']);
  return Markup.keyboard(rows).resize().persistent();
};

// ─── Inline Keyboard: Post Info Actions ───────────────────────
// Displayed ON the post info message itself.
// Row 1: Edit, Publish/Unpublish, Stats
// Row 2: Hide/Show, Archive, Delete Post
// Row 3: Permanent Delete (separated as clearly destructive)
// Row 4: Back to List
// Row 5: Add, Remove, Replace (content actions)
export const postInfoActionKeyboard = (post: any) => {
  const postId = post.id;
  const isHidden = post.status === 'HIDDEN';
  const isPublished = post.isPublished && post.status === 'PUBLISHED';
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✏️ ویرایش', `post:manager:edit:${postId}`),
      Markup.button.callback(isPublished ? '🚫 لغو انتشار' : '✅ انتشار', `post:manager:unpublish:${postId}`),
      Markup.button.callback('📊 آمار', `post:manager:stats:${postId}`),
    ],
    [
      Markup.button.callback(isHidden ? '👁 نمایش' : '🙈 مخفی', `post:manager:hide:${postId}`),
      Markup.button.callback('📦 بایگانی', `post:manager:archive:${postId}`),
      Markup.button.callback('🗑 حذف پست', `post:manager:delete:${postId}`),
    ],
    [
      Markup.button.callback('🔥 حذف دائمی', `post:manager:harddelete:${postId}`),
    ],
    [
      Markup.button.callback('🔙 بازگشت به لیست', `post:manager:back:${postId}`),
    ],
    [
      Markup.button.callback('➕ افزودن', `post:action:add:${postId}`),
      Markup.button.callback('➖ حذف محتوا', `post:action:remove:${postId}`),
      Markup.button.callback('🔁 جایگزینی', `post:action:replace:${postId}`),
    ],
  ]);
};

// ─── Inline Keyboard: Post Edit Mode (operation buttons on post info) ──
export const postEditModeKeyboard = (postId: number) =>
  Markup.inlineKeyboard([
    [
      Markup.button.callback('➕ افزودن', `post:action:add:${postId}`),
      Markup.button.callback('➖ حذف', `post:action:remove:${postId}`),
      Markup.button.callback('🔁 جایگزینی', `post:action:replace:${postId}`),
    ],
    [
      Markup.button.callback('⬅️ بازگشت به جزئیات', `post:manager:backtomain:${postId}`),
    ],
  ]);

export const postPublishOptionsKeyboard = (postId: number) => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📤 انتشار الآن', `post:publish:now:${postId}`)],
    [Markup.button.callback('📅 زمان‌بندی انتشار', `post:publish:schedule:${postId}`)],
    [Markup.button.callback('⏰ زمان‌بندی لغو انتشار', `post:unpublish:schedule:${postId}`)],
    [Markup.button.callback('📝 ذخیره به عنوان پیش‌نویس', `post:draft:${postId}`)],
    [Markup.button.callback('« بازگشت', `post:view:${postId}`)],
  ]);
};

export const postAnalyticsKeyboard = (postId: number) => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔄 تازه‌سازی', `post:analytics:${postId}`)],
    [Markup.button.callback('« بازگشت به پست', `post:view:${postId}`)],
  ]);
};

// ─── Analytics Keyboard for Post Manager Flow ────────────
// Uses the new inline keyboard navigation (backtomain) instead of old post:view.
export const postManagerAnalyticsKeyboard = (postId: number) =>
  Markup.inlineKeyboard([
    [Markup.button.callback('🔄 تازه‌سازی', `post:manager:stats:${postId}`)],
    [Markup.button.callback('« بازگشت به عملیات', `post:manager:backtomain:${postId}`)],
  ]);

export const postScheduleKeyboard = (postId: number) => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📅 زمان‌بندی انتشار', `post:publish:schedule:${postId}`)],
    [Markup.button.callback('⏰ زمان‌بندی لغو انتشار', `post:unpublish:schedule:${postId}`)],
    [Markup.button.callback('« بازگشت', `post:view:${postId}`)],
  ]);
};

export const postCommandListKeyboard = (postId: number, commands: any[]) => {
  const rows: any[][] = commands.map((cmd: any) => [
    Markup.button.callback(`/${cmd.command}${cmd.aliases?.length ? ` (+${cmd.aliases.length} نام مستعار)` : ''}`, `post:cmd:view:${postId}:${cmd.id}`),
  ]);
  rows.push([Markup.button.callback('➕ افزودن دستور', `post:cmd:add:${postId}`)]);
  rows.push([Markup.button.callback('« بازگشت به ویرایشگر', `post:edit:${postId}:full`)]);
  return Markup.inlineKeyboard(rows);
};

export const postCommandEditKeyboard = (postId: number, commandId: number) => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('➕ افزودن نام مستعار', `post:cmd:alias:add:${postId}:${commandId}`)],
    [Markup.button.callback('🗑 حذف دستور', `post:cmd:del:${postId}:${commandId}`)],
    [Markup.button.callback('« بازگشت به دستورات', `post:cmd:list:${postId}`)],
  ]);
};

export const postVersionHistoryKeyboard = (versions: any[], postId: number, page?: number) => {
  const rows: any[][] = versions.slice(0, 10).map((v: any) => [
    Markup.button.callback(
      `نسخه ${v.id} - ${new Date(v.createdAt).toLocaleDateString('fa-IR')}`,
      `post:version:restore:${v.id}`
    ),
  ]);
  rows.push([Markup.button.callback('« بازگشت به ویرایشگر', `post:edit:${postId}:full`)]);
  return Markup.inlineKeyboard(rows);
};

export const postIntegrityKeyboard = () => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔍 اجرای بررسی سلامت', 'post:integrity:run')],
    [Markup.button.callback('« بازگشت به منوی پست', 'post:menu')],
  ]);
};

export const postGlobalAnalyticsKeyboard = () => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔄 تازه‌سازی', 'post:analytics:global')],
    [Markup.button.callback('🏆 پست‌های برتر', 'post:analytics:top')],
    [Markup.button.callback('« بازگشت به منوی پست', 'post:menu')],
  ]);
};

// ─── Reply Keyboard: Menu Editor (dynamic from resolved menu layout) ──
// Shows each menu button as a Reply Keyboard button for tap-to-edit.
// The selected button (if any) is wrapped in {} without changing the keyboard structure.
// Updated in real-time after every mutation.
export const buildMenuEditorReplyKeyboard = (layout: any[][], selectedKey?: { row: number; col: number } | null) => {
  const rows: string[][] = layout
    .filter(row => Array.isArray(row))
    .map((row, r) => {
      const resultRow: string[] = [];
      for (let c = 0; c < row.length; c++) {
        const btn = row[c];
        if (!btn) continue;
        const prefix = btn.visible === false ? '🙈 ' : '';
        const text = `${prefix}${buildSafeTelegramButton(buttonDisplayText(btn, 'بدون عنوان'))}`;
        if (selectedKey && selectedKey.row === r && selectedKey.col === c) {
          resultRow.push(`{${text}}`);
        } else {
          resultRow.push(graphemeTruncate(text, 40));
        }
      }
      return resultRow;
    });
  rows.push(['🔙 بازگشت']);
  return Markup.keyboard(rows).resize().persistent();
};

// ─── Reply Keyboard: Button Edit Actions ──
// Shown after user taps a specific menu button to edit it.
export const buildMenuButtonEditReplyKeyboard = (row: number, col: number, button: any) => {
  const isHidden = button?.visible === false;
  return Markup.keyboard([
    [isHidden ? '👁 نمایش' : '🙈 مخفی'],
    ['⬆ سطر قبل', '⬇ سطر بعد'],
    ['◀ چپ', '▶ راست'],
    ['🔙 بازگشت'],
  ]).resize().persistent();
};

export const menuEditorKeyboard = (layout: any[][]) => {
  const rows: any[][] = [];
  logger.debug(`[MenuKeyboard] Generating editor keyboard rows=${layout?.length ?? 0}`);
  if (layout && layout.length > 0) {
    for (let r = 0; r < layout.length; r++) {
      const row = layout[r];
      if (!Array.isArray(row)) continue;
      const rowButtons: any[] = [];
      for (let c = 0; c < row.length; c++) {
        const btn = row[c];
        if (!btn) continue;
        const prefix = btn.visible === false ? '🙈 ' : '';
        rowButtons.push(
          Markup.button.callback(
            `${prefix}${buildSafeTelegramButton(graphemeTruncate(buttonDisplayText(btn, 'بدون عنوان'), 10))}`,
            `menu:edit:${r}:${c}`
          )
        );
      }
      rows.push(rowButtons);
      rows.push([
        Markup.button.callback('⬆', `menu:rowup:${r}`),
        Markup.button.callback('⬇', `menu:rowdown:${r}`),
        Markup.button.callback('🔄 جابجایی', `menu:swap:${r}`),
      ]);
    }
  }
  rows.push([
    Markup.button.callback('👁 پیش‌نمایش', 'menu:preview'),
  ]);
  rows.push([
    Markup.button.callback('🔙 بازگشت', 'menu:back'),
  ]);
  return Markup.inlineKeyboard(rows);
};

export const menuButtonEditKeyboard = (row: number, col: number, button: any) => {
  const isPost = button.ref?.startsWith('post:');
  const isHidden = button.visible === false;
  const btns: any[][] = [
    [
      Markup.button.callback(isHidden ? '👁 نمایش' : '🙈 مخفی', `menu:toggle:${row}:${col}`),
    ],
    [
      Markup.button.callback('⬆ سطر قبل', `menu:btnup:${row}:${col}`),
      Markup.button.callback('⬇ سطر بعد', `menu:btndown:${row}:${col}`),
    ],
    [
      Markup.button.callback('◀ چپ', `menu:btnleft:${row}:${col}`),
      Markup.button.callback('▶ راست', `menu:btnright:${row}:${col}`),
    ],
    [Markup.button.callback('« بازگشت به ویرایشگر منو', 'menu:editor')],
  ];
  return Markup.inlineKeyboard(btns);
};

export const menuRowResizeKeyboard = (row: number) => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('۱ دکمه در سطر', `menu:rowsize:${row}:1`)],
    [Markup.button.callback('۲ دکمه در سطر', `menu:rowsize:${row}:2`)],
    [Markup.button.callback('۳ دکمه در سطر', `menu:rowsize:${row}:3`)],
    [Markup.button.callback('« بازگشت به ویرایشگر منو', 'menu:editor')],
  ]);
};

// ─── Multi-Message Editor Keyboards ────────────────────────

export const postMultiMessageEditorReplyKeyboard = () =>
  Markup.keyboard([
    ['➕ افزودن پیام', 'افزودن دستور'],
    ['📊 آمار', '📤 لغو انتشار'],
    ['🗂 بازگشت به لیست', '🏠 منو اصلی'],
    ['🗑 حذف پست', '⛔ توقف ویرایش'],
    ['🔙 بازگشت'],
  ]).resize().persistent();

export const postMoveModeReplyKeyboard = () =>
  Markup.keyboard([
    ['⬆️ بالا'],
    ['⬇️ پایین'],
    ['🔙 بازگشت'],
  ]).resize().persistent();

export const postAddMessageReplyKeyboard = (forwardOn: boolean) =>
  Markup.keyboard([
    [forwardOn ? '✅ ارسال به عنوان فوروارد (روشن)' : '↪️ ارسال به عنوان فوروارد (خاموش)'],
    ['❌ لغو'],
  ]).resize().persistent();

export const postEditMessageReplyKeyboard = () =>
  Markup.keyboard([
    ['✏️ ویرایش محتوا', '📝 ویرایش عنوان'],
    ['ویرایش دکمه ها'],
    ['🔙 بازگشت'],
  ]).resize().persistent();

export const postCancelOnlyReplyKeyboard = () =>
  Markup.keyboard([
    ['❌ لغو'],
  ]).resize().persistent();

export const postSingleMessageInlineKeyboard = (postId: number, msgIdx: number, totalMsgs: number) => {
  const rows: any[][] = [
    [
      Markup.button.callback('✏️ ویرایش', `post:msg:edit:${postId}:${msgIdx}`),
      Markup.button.callback('🗑 حذف پیام', `post:msg:delete:${postId}:${msgIdx}`),
    ],
  ];
  const moveRow: any[] = [];
  if (msgIdx > 0) moveRow.push(Markup.button.callback('⬆️ بالا', `post:msg:up:${postId}:${msgIdx}`));
  if (msgIdx < totalMsgs - 1) moveRow.push(Markup.button.callback('⬇️ پایین', `post:msg:down:${postId}:${msgIdx}`));
  if (moveRow.length > 0) rows.push(moveRow);
  rows.push([Markup.button.callback('➕ افزودن پیام', `post:msg:add:${postId}:${msgIdx}`)]);
  return Markup.inlineKeyboard(rows);
};

export const menuSwapTargetKeyboard = (sourceRow: number, totalRows: number) => {
  const rows: any[][] = [];
  for (let i = 0; i < totalRows; i++) {
    if (i !== sourceRow) {
      rows.push([Markup.button.callback(`↔ جابجایی با سطر ${i + 1}`, `menu:swapto:${sourceRow}:${i}`)]);
    }
  }
  rows.push([Markup.button.callback('« لغو', 'menu:editor')]);
  return Markup.inlineKeyboard(rows);
};

// ─── Inline Keyboard: Edit Actions for Selected Button ──
// Sent as a separate message after a button is selected in the menu editor.
// The reply keyboard remains unchanged below.
export const buildMenuEditInlineKeyboard = (row: number, col: number, button: any) => {
  const isHidden = button?.visible === false;
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('⬆️ بالا', `menu:sel:up:${row}:${col}`),
      Markup.button.callback('⬇️ پایین', `menu:sel:down:${row}:${col}`),
    ],
    [
      Markup.button.callback('⬅️ چپ', `menu:sel:left:${row}:${col}`),
      Markup.button.callback('➡️ راست', `menu:sel:right:${row}:${col}`),
    ],
    [
      Markup.button.callback('🔄 انتقال به سطر', `menu:sel:torow:${row}:${col}`),
      Markup.button.callback(isHidden ? '👁 نمایش' : '🙈 مخفی کردن', `menu:sel:hide:${row}:${col}`),
    ],
  ]);
};

// ─── Inline Keyboard: Row Selection ──
// Shows all row numbers for the "move to row" action.
export const buildMenuRowSelectKeyboard = (totalRows: number, sourceRow: number) => {
  const rows: any[][] = [];
  for (let i = 0; i < totalRows; i++) {
    if (i !== sourceRow) {
      rows.push([Markup.button.callback(`↔ جابجایی با سطر ${i + 1}`, `menu:swapto:${sourceRow}:${i}`)]);
    }
  }
  rows.push([Markup.button.callback('« لغو', 'menu:editor')]);
  return Markup.inlineKeyboard(rows);
};

// ─── Button Editor — New Design ──────────────────────────────

// Reply keyboard when NO buttons exist
export const buildNoButtonsReplyKeyboard = () =>
  Markup.keyboard([
    ['➕ اضافه کردن دکمه جدید'],
    ['❌ لغو'],
  ]).resize().persistent();

// Reply keyboard when waiting for button type selection
export const buildButtonTypeSelectionKeyboard = () =>
  Markup.keyboard([
    ['🔗 حالت دکمه: لینک یا اشتراک'],
    ['🪟 حالت دکمه: صفحه POP-UP'],
    ['⌨️ حالت دکمه: دستور'],
    ['❌ لغو'],
  ]).resize().persistent();

// Unified cancel-only reply keyboard when waiting for input
export const buildCancelOnlyReplyKeyboard = () =>
  Markup.keyboard([
    ['❌ لغو'],
  ]).resize().persistent();

// Reply keyboard when buttons exist (exit button editor)
export const buildButtonEditorExitKeyboard = () =>
  Markup.keyboard([
    ['🚪 خروج از تنظیمات پیام'],
  ]).resize().persistent();

// ─── Inline keyboard: button list with actions ──────────────
// Each button shown as {➕} text with ⬅️, 🗑, ✏️ below
export const buildButtonListInlineKeyboard = (
  postId: number,
  buttons: any[][],
  mode?: 'swap' | 'delete' | 'edit' | null,
  selectedRow?: number,
  selectedCol?: number,
) => {
  const rows: any[][] = [];
  if (buttons && buttons.length > 0) {
    for (let r = 0; r < buttons.length; r++) {
      const row = buttons[r];
      if (!Array.isArray(row)) continue;
      const rowButtons: any[] = [];
      for (let c = 0; c < row.length; c++) {
        const btn = row[c];
        if (!btn) continue;
        const text = btn.text || 'بدون عنوان';
        const safe = graphemeTruncate(sanitizeTelegramText(text), 15);
        const isSelected = mode === 'swap' && selectedRow === r && selectedCol === c;
        const icon = isSelected ? '📍' : mode === 'swap' ? '⬅️' : mode === 'delete' ? '❌' : mode === 'edit' ? '➗' : '➕';
        rowButtons.push(
          Markup.button.callback(
            `${isSelected ? '📍 ' : ''}${safe}`,
            `pbedit:click:${postId}:${r}:${c}`,
          ),
        );
      }
      if (rowButtons.length > 0) rows.push(rowButtons);
    }
  }
  // Action row
  const actionRow: any[] = [];
  if (mode === 'swap' && selectedRow !== undefined && selectedCol !== undefined) {
    if (selectedRow > 0) actionRow.push(Markup.button.callback('⬆️', `pbedit:moveup:${postId}:${selectedRow}:${selectedCol}`));
    if (selectedRow < rows.length - 1) actionRow.push(Markup.button.callback('⬇️', `pbedit:movedown:${postId}:${selectedRow}:${selectedCol}`));
    actionRow.push(Markup.button.callback('❌ لغو', `pbedit:mode:cancel:${postId}`));
  } else {
    actionRow.push(Markup.button.callback('⬅️ جابجایی', `pbedit:mode:swap:${postId}`));
    actionRow.push(Markup.button.callback('🗑 حذف', `pbedit:mode:delete:${postId}`));
    actionRow.push(Markup.button.callback('✏️ تصحیح', `pbedit:mode:edit:${postId}`));
  }
  rows.push(actionRow);
  return Markup.inlineKeyboard(rows);
};

// ─── Edit button type selection inline keyboard ────────────
export const buildEditButtonTypeKeyboard = (postId: number, row: number, col: number) =>
  Markup.inlineKeyboard([
    [Markup.button.callback('🔗 لینک یا اشتراک', `pbedit:type:url:${postId}:${row}:${col}`)],
    [Markup.button.callback('🪟 POP-UP', `pbedit:type:popup:${postId}:${row}:${col}`)],
    [Markup.button.callback('⌨️ دستور', `pbedit:type:command:${postId}:${row}:${col}`)],
    [Markup.button.callback('❌ لغو', `pbedit:type:cancel:${postId}`)],
  ]);

// ─── Button selection inline keyboard (edit/delete/move/cancel) ──
export const buildButtonSelectionKeyboard = (postId: number) =>
  Markup.inlineKeyboard([
    [Markup.button.callback('✏️ ویرایش', `pbedit:sel:edit:${postId}`)],
    [Markup.button.callback('🗑 حذف', `pbedit:sel:delete:${postId}`)],
    [Markup.button.callback('🔀 جابجایی', `pbedit:sel:move:${postId}`)],
    [Markup.button.callback('🔙 بازگشت', `pbedit:sel:cancel:${postId}`)],
  ]);
