import { Markup } from 'telegraf';
import { sanitizeTelegramText, buildSafeTelegramButton } from '../../utils/unicode';
import { graphemeTruncate } from '../../utils/grapheme';
import { logger } from '../../utils/logger';

function buttonDisplayText(btn: any, fallback: string): string {
  const text = btn?.text || btn?.label || btn?.title || btn?.ref || fallback;
  return typeof text === 'string' && text.trim() ? text : fallback;
}

export const postMainMenuKeyboard = () =>
  Markup.keyboard([
    ['➕ ایجاد پست', '✏️ Edit Post'],
    ['📋 مدیریت پست‌ها', '📦 پیش‌نویس‌ها'],
    ['👻 پست‌های مخفی'],
    ['👁 پیش‌نمایش', '📤 انتشار'],
    ['🔎 جستجو', '📊 آمار پست'],
    ['📊 آمار کلی', '🔍 بررسی سلامت'],
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

// ─── Post Selection List (Edit Post entry point) ──────────
export const postSelectKeyboard = (posts: any[]) => {
  const rows: any[][] = posts.map((p: any) => [
    Markup.button.callback(
      `${p.status === 'PUBLISHED' ? '✅' : p.status === 'DRAFT' ? '📝' : p.status === 'SCHEDULED' ? '⏰' : p.status === 'HIDDEN' ? '👻' : '📦'} ${graphemeTruncate(sanitizeTelegramText(p.title) || 'بدون عنوان', 30)}`,
      `post:select:${p.id}`
    ),
  ]);
  rows.push([Markup.button.callback('« بازگشت به منوی پست', 'post:menu')]);
  return Markup.inlineKeyboard(rows);
};

// ─── Post Management Menu (Main Actions + Action Panel) ───
export const postManageKeyboard = (postId: number) => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✏️ Edit', `post:manage:edit:${postId}`)],
    [
      Markup.button.callback('🚫 Unpublish', `post:unpublish:${postId}`),
      Markup.button.callback('📊 Statistics', `post:analytics:${postId}`),
    ],
    [
      Markup.button.callback('🙈 Hide', `post:hide:${postId}`),
      Markup.button.callback('📦 Archive', `post:archive:${postId}`),
    ],
    [Markup.button.callback('🗑 Delete', `post:delete:${postId}`)],
    // Action Panel
    [
      Markup.button.callback('➕ Add', `post:action:add:${postId}`),
      Markup.button.callback('➖ Remove', `post:action:remove:${postId}`),
      Markup.button.callback('🔁 Replace', `post:action:replace:${postId}`),
    ],
    [Markup.button.callback('🔙 Back', `post:list:1`)],
  ]);
};

// ─── Edit Mode Submenu ─────────────────────────────────────
export const postEditModeKeyboard = (postId: number) => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✏️ Edit Content', `post:edit:${postId}:content`)],
    [
      Markup.button.callback('✏️ Edit Title', `post:edit:${postId}:title`),
      Markup.button.callback('✏️ Edit Buttons', `post:edit:${postId}:buttons`),
    ],
    [Markup.button.callback('🖼 Edit Media', `post:edit:${postId}:media`)],
    [Markup.button.callback('🚀 Change Publication Status', `post:publish:${postId}`)],
    [Markup.button.callback('➕ Add Command', `post:cmd:add:${postId}`)],
    [Markup.button.callback('🔙 Back', `post:manage:back:${postId}`)],
  ]);
};

export const postButtonsEditorKeyboard = (postId: number, buttons: any[], editingRow?: number, editingCol?: number) => {
  const rows: any[][] = [];
  if (buttons && buttons.length > 0) {
    for (let r = 0; r < buttons.length; r++) {
      const row = buttons[r];
      const rowButtons: any[] = [];
      for (let c = 0; c < row.length; c++) {
        const btn = row[c];
        rowButtons.push(
          Markup.button.callback(
            `${buildSafeTelegramButton(graphemeTruncate(buttonDisplayText(btn, 'بدون عنوان'), 15))}`,
            `post:btn:edit:${postId}:${r}:${c}`
          )
        );
      }
      rowButtons.push(Markup.button.callback('✏️', `post:btn:edit:${postId}:${r}:${row.length}`));
      rows.push(rowButtons);
      rows.push([
        Markup.button.callback('⬆', `post:btn:rowup:${postId}:${r}`),
        Markup.button.callback('⬇', `post:btn:rowdown:${postId}:${r}`),
        Markup.button.callback('🔄 جابجایی', `post:btn:swap:${postId}:${r}`),
        Markup.button.callback('📋 کپی سطر', `post:btn:duprow:${postId}:${r}`),
        Markup.button.callback('➖ حذف سطر', `post:btn:delrow:${postId}:${r}`),
      ]);
    }
  }
  rows.push([
    Markup.button.callback('➕ افزودن سطر دکمه', `post:btn:addrow:${postId}`),
  ]);
  rows.push([
    Markup.button.callback('🔙 بازگشت به ویرایشگر', `post:edit:${postId}:full`),
  ]);
  return Markup.inlineKeyboard(rows);
};

export const postButtonEditKeyboard = (postId: number, row: number, col: number, button: any) => {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🎨 تغییر متن', `post:btn:text:${postId}:${row}:${col}`),
      Markup.button.callback('🔗 تغییر آدرس/مقدار', `post:btn:value:${postId}:${row}:${col}`),
    ],
    [
      Markup.button.callback('🧭 انتقال بالا', `post:btn:up:${postId}:${row}:${col}`),
      Markup.button.callback('🧭 انتقال پایین', `post:btn:down:${postId}:${row}:${col}`),
    ],
    [
      Markup.button.callback('📐 تغییر اندازه سطر', `post:btn:resize:${postId}:${row}`),
      Markup.button.callback('➖ حذف دکمه', `post:btn:del:${postId}:${row}:${col}`),
    ],
    [Markup.button.callback('« بازگشت به دکمه‌ها', `post:edit:${postId}:buttons`)],
  ]);
};

export const postButtonTypeKeyboard = (postId: number, row: number, col: number) => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔗 لینک', `post:btn:settype:${postId}:${row}:${col}:URL`)],
    [Markup.button.callback('📞 بازگشت (Callback)', `post:btn:settype:${postId}:${row}:${col}:CALLBACK`)],
    [Markup.button.callback('📱 مینی اپ', `post:btn:settype:${postId}:${row}:${col}:OPEN_MINI_APP`)],
    [Markup.button.callback('🌐 باز کردن وب', `post:btn:settype:${postId}:${row}:${col}:OPEN_WEB`)],
    [Markup.button.callback('📋 کپی متن', `post:btn:settype:${postId}:${row}:${col}:COPY_TEXT`)],
    [Markup.button.callback('📤 ارسال دستور', `post:btn:settype:${postId}:${row}:${col}:SEND_COMMAND`)],
    [Markup.button.callback('🧭 ناوبری داخلی', `post:btn:settype:${postId}:${row}:${col}:INTERNAL_NAV`)],
    [Markup.button.callback('« بازگشت', `post:edit:${postId}:buttons`)],
  ]);
};

export const postRowResizeKeyboard = (postId: number, row: number) => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('۱ دکمه در سطر', `post:btn:rowsize:${postId}:${row}:1`)],
    [Markup.button.callback('۲ دکمه در سطر', `post:btn:rowsize:${postId}:${row}:2`)],
    [Markup.button.callback('۳ دکمه در سطر', `post:btn:rowsize:${postId}:${row}:3`)],
    [Markup.button.callback('« بازگشت', `post:edit:${postId}:buttons`)],
  ]);
};

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

export const postSwapTargetKeyboard = (postId: number, sourceRow: number, totalRows: number) => {
  const rows: any[][] = [];
  for (let i = 0; i < totalRows; i++) {
    if (i !== sourceRow) {
      rows.push([Markup.button.callback(`↔ جابجایی با سطر ${i + 1}`, `post:btn:swap:${postId}:${sourceRow}:${i}`)]);
    }
  }
  rows.push([Markup.button.callback('« لغو', `post:edit:${postId}:buttons`)]);
  return Markup.inlineKeyboard(rows);
};

export const menuEditorKeyboard = (layout: any[][]) => {
  const rows: any[][] = [];
  logger.debug(`[MenuKeyboard] Generating editor keyboard rows=${layout?.length ?? 0}`);
  if (layout && layout.length > 0) {
    for (let r = 0; r < layout.length; r++) {
      const row = layout[r];
      const rowButtons: any[] = [];
      for (let c = 0; c < row.length; c++) {
        const btn = row[c];
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
