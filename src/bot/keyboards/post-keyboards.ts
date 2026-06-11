import { Markup } from 'telegraf';

export const postMainMenuKeyboard = () =>
  Markup.keyboard([
    ['➕ Create Post'],
    ['📋 Manage Posts', '📦 Drafts'],
    ['📌 Pinned Posts', '👻 Hidden Posts'],
    ['👁 Preview Post', '📤 Publish'],
    ['🔎 Search Posts', '📊 Post Analytics'],
    ['📊 Global Analytics', '🔍 Integrity Check'],
    ['⚙ Post Settings'],
    ['↩️ Back to Admin Panel'],
  ]).resize().persistent();

export const postEditorKeyboard = (postId: number, hasContent: boolean) => {
  const rows: any[][] = [
    [
      Markup.button.callback('✏ Edit Title', `post:edit:${postId}:title`),
      Markup.button.callback('📝 Edit Content', `post:edit:${postId}:content`),
    ],
    [
      Markup.button.callback('🖼 Change Media', `post:edit:${postId}:media`),
      Markup.button.callback('📝 Edit Caption', `post:edit:${postId}:caption`),
    ],
    [
      Markup.button.callback('⌨ Edit Buttons', `post:edit:${postId}:buttons`),
      Markup.button.callback('🔤 Parse Mode', `post:edit:${postId}:parsemode`),
    ],
    [
      Markup.button.callback('📍 Pin/Unpin', `post:pin:${postId}`),
      Markup.button.callback('🗂 Change Position', `post:reorder:${postId}`),
    ],
    [
      Markup.button.callback('🧪 Preview', `post:preview:${postId}`),
      Markup.button.callback('📤 Publish', `post:publish:${postId}`),
    ],
    [
      Markup.button.callback('🔗 Add Command', `post:cmd:add:${postId}`),
      Markup.button.callback('📋 Duplicate', `post:duplicate:${postId}`),
    ],
    [
      Markup.button.callback('🏗 Builder View', `post:builder:${postId}`),
      Markup.button.callback('📁 Category', `post:category:edit:${postId}`),
    ],
    [
      Markup.button.callback('📜 Versions', `post:version:list:${postId}`),
      Markup.button.callback('📊 Analytics', `post:analytics:${postId}`),
    ],
    [
      Markup.button.callback('📦 Archive', `post:archive:${postId}`),
      Markup.button.callback('👻 Hide', `post:hide:${postId}`),
    ],
    [
      Markup.button.callback('🗑 Delete', `post:delete:${postId}`),
      Markup.button.callback('« Back', `post:list:1`),
    ],
  ];
  return Markup.inlineKeyboard(rows);
};

export const postListKeyboard = (posts: any[], page: number, totalPages: number) => {
  const rows: any[][] = posts.map((p: any) => [
    Markup.button.callback(
      `${p.isPinned ? '📌' : ''} ${p.status === 'PUBLISHED' ? '✅' : p.status === 'DRAFT' ? '📝' : p.status === 'SCHEDULED' ? '⏰' : p.status === 'HIDDEN' ? '👻' : '📦'} ${p.title.substring(0, 30)}`,
      `post:view:${p.id}`
    ),
  ]);
  const nav: any[] = [];
  if (page > 1) nav.push(Markup.button.callback('◀️ Previous', `post:list:${page - 1}`));
  nav.push(Markup.button.callback(`${page}/${totalPages}`, 'noop'));
  if (page < totalPages) nav.push(Markup.button.callback('Next ▶️', `post:list:${page + 1}`));
  if (nav.length > 1) rows.push(nav);
  rows.push([Markup.button.callback('« Back to Posts Menu', 'post:menu')]);
  return Markup.inlineKeyboard(rows);
};

export const postViewKeyboard = (post: any) => {
  const rows: any[][] = [
    [Markup.button.callback('✏ Edit', `post:edit:${post.id}:full`)],
    [
      Markup.button.callback(post.isPublished ? '📥 Unpublish' : '📤 Publish', `post:publish:${post.id}`),
      Markup.button.callback(post.isPinned ? '📌 Unpin' : '📍 Pin', `post:pin:${post.id}`),
    ],
    [
      Markup.button.callback('📋 Duplicate', `post:duplicate:${post.id}`),
      Markup.button.callback('📊 Analytics', `post:analytics:${post.id}`),
    ],
    [
      Markup.button.callback('📦 Archive', `post:archive:${post.id}`),
      Markup.button.callback(post.status === 'HIDDEN' ? '👻 Show' : '👻 Hide', `post:hide:${post.id}`),
    ],
    [
      Markup.button.callback('🗑 Delete', `post:delete:${post.id}`),
      Markup.button.callback('« Back', `post:list:1`),
    ],
  ];
  return Markup.inlineKeyboard(rows);
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
            `${btn.text?.substring(0, 15) || '???'}`,
            `post:btn:edit:${postId}:${r}:${c}`
          )
        );
      }
      rowButtons.push(Markup.button.callback('✏️', `post:btn:edit:${postId}:${r}:${row.length}`));
      rows.push(rowButtons);
      rows.push([
        Markup.button.callback('⬆', `post:btn:rowup:${postId}:${r}`),
        Markup.button.callback('⬇', `post:btn:rowdown:${postId}:${r}`),
        Markup.button.callback('🔄 Swap', `post:btn:swap:${postId}:${r}`),
        Markup.button.callback('📋 Dup Row', `post:btn:duprow:${postId}:${r}`),
        Markup.button.callback('➖ Del Row', `post:btn:delrow:${postId}:${r}`),
      ]);
    }
  }
  rows.push([
    Markup.button.callback('➕ Add Button Row', `post:btn:addrow:${postId}`),
  ]);
  rows.push([
    Markup.button.callback('🔙 Back to Editor', `post:edit:${postId}:full`),
  ]);
  return Markup.inlineKeyboard(rows);
};

export const postButtonEditKeyboard = (postId: number, row: number, col: number, button: any) => {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🎨 Change Text', `post:btn:text:${postId}:${row}:${col}`),
      Markup.button.callback('🔗 Change URL/Value', `post:btn:value:${postId}:${row}:${col}`),
    ],
    [
      Markup.button.callback('🧭 Move Up', `post:btn:up:${postId}:${row}:${col}`),
      Markup.button.callback('🧭 Move Down', `post:btn:down:${postId}:${row}:${col}`),
    ],
    [
      Markup.button.callback('📐 Resize Row', `post:btn:resize:${postId}:${row}`),
      Markup.button.callback('➖ Delete Button', `post:btn:del:${postId}:${row}:${col}`),
    ],
    [Markup.button.callback('« Back to Buttons', `post:edit:${postId}:buttons`)],
  ]);
};

export const postButtonTypeKeyboard = (postId: number, row: number, col: number) => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔗 URL', `post:btn:settype:${postId}:${row}:${col}:URL`)],
    [Markup.button.callback('📞 Callback', `post:btn:settype:${postId}:${row}:${col}:CALLBACK`)],
    [Markup.button.callback('📱 Open Mini App', `post:btn:settype:${postId}:${row}:${col}:OPEN_MINI_APP`)],
    [Markup.button.callback('🌐 Open Web', `post:btn:settype:${postId}:${row}:${col}:OPEN_WEB`)],
    [Markup.button.callback('📋 Copy Text', `post:btn:settype:${postId}:${row}:${col}:COPY_TEXT`)],
    [Markup.button.callback('📤 Send Command', `post:btn:settype:${postId}:${row}:${col}:SEND_COMMAND`)],
    [Markup.button.callback('🧭 Internal Nav', `post:btn:settype:${postId}:${row}:${col}:INTERNAL_NAV`)],
    [Markup.button.callback('« Back', `post:edit:${postId}:buttons`)],
  ]);
};

export const postRowResizeKeyboard = (postId: number, row: number) => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('1 Button per Row', `post:btn:rowsize:${postId}:${row}:1`)],
    [Markup.button.callback('2 Buttons per Row', `post:btn:rowsize:${postId}:${row}:2`)],
    [Markup.button.callback('3 Buttons per Row', `post:btn:rowsize:${postId}:${row}:3`)],
    [Markup.button.callback('« Back', `post:edit:${postId}:buttons`)],
  ]);
};

export const postPublishOptionsKeyboard = (postId: number) => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📤 Publish Now', `post:publish:now:${postId}`)],
    [Markup.button.callback('📅 Schedule Publish', `post:publish:schedule:${postId}`)],
    [Markup.button.callback('⏰ Schedule Unpublish', `post:unpublish:schedule:${postId}`)],
    [Markup.button.callback('📝 Save as Draft', `post:draft:${postId}`)],
    [Markup.button.callback('« Back', `post:view:${postId}`)],
  ]);
};

export const postAnalyticsKeyboard = (postId: number) => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔄 Refresh', `post:analytics:${postId}`)],
    [Markup.button.callback('« Back to Post', `post:view:${postId}`)],
  ]);
};

export const postParseModeKeyboard = (postId: number, currentMode: string) => {
  return Markup.inlineKeyboard([
    [Markup.button.callback(`${currentMode === 'Markdown' ? '✅ ' : ''}Markdown`, `post:parsemode:${postId}:Markdown`)],
    [Markup.button.callback(`${currentMode === 'HTML' ? '✅ ' : ''}HTML`, `post:parsemode:${postId}:HTML`)],
    [Markup.button.callback('« Back to Editor', `post:edit:${postId}:full`)],
  ]);
};

export const postScheduleKeyboard = (postId: number) => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📅 Schedule Publish', `post:publish:schedule:${postId}`)],
    [Markup.button.callback('⏰ Schedule Unpublish', `post:unpublish:schedule:${postId}`)],
    [Markup.button.callback('« Back', `post:view:${postId}`)],
  ]);
};

export const postCommandListKeyboard = (postId: number, commands: any[]) => {
  const rows: any[][] = commands.map((cmd: any) => [
    Markup.button.callback(`/${cmd.command}${cmd.aliases?.length ? ` (+${cmd.aliases.length} aliases)` : ''}`, `post:cmd:view:${postId}:${cmd.id}`),
  ]);
  rows.push([Markup.button.callback('➕ Add Command', `post:cmd:add:${postId}`)]);
  rows.push([Markup.button.callback('« Back to Editor', `post:edit:${postId}:full`)]);
  return Markup.inlineKeyboard(rows);
};

export const postCommandEditKeyboard = (postId: number, commandId: number) => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('➕ Add Alias', `post:cmd:alias:add:${postId}:${commandId}`)],
    [Markup.button.callback('🗑 Remove Command', `post:cmd:del:${postId}:${commandId}`)],
    [Markup.button.callback('« Back to Commands', `post:cmd:list:${postId}`)],
  ]);
};

export const postCategoryKeyboard = (categories: string[], current?: string | null) => {
  const rows: any[][] = categories.map((cat) => [
    Markup.button.callback(
      `${current === cat ? '✅ ' : ''}${cat}`,
      `post:category:set:${cat}`
    ),
  ]);
  rows.push([Markup.button.callback('🚫 No Category', `post:category:set:`), Markup.button.callback('➕ New Category', 'post:category:new')]);
  rows.push([Markup.button.callback('« Back', `post:category:back`)]);
  return Markup.inlineKeyboard(rows);
};

export const postCategoriesListKeyboard = (categories: string[]) => {
  const rows: any[][] = categories.map((cat) => [
    Markup.button.callback(cat, `post:category:posts:${cat}`),
  ]);
  rows.push([Markup.button.callback('« Back to Posts Menu', 'post:menu')]);
  return Markup.inlineKeyboard(rows);
};

export const postVersionHistoryKeyboard = (versions: any[], postId: number, page?: number) => {
  const rows: any[][] = versions.slice(0, 10).map((v: any) => [
    Markup.button.callback(
      `v${v.id} - ${new Date(v.createdAt).toLocaleDateString('fa-IR')}`,
      `post:version:restore:${v.id}`
    ),
  ]);
  rows.push([Markup.button.callback('« Back to Post Editor', `post:edit:${postId}:full`)]);
  return Markup.inlineKeyboard(rows);
};

export const postIntegrityKeyboard = () => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔍 Run Integrity Check', 'post:integrity:run')],
    [Markup.button.callback('« Back to Posts Menu', 'post:menu')],
  ]);
};

export const postGlobalAnalyticsKeyboard = () => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔄 Refresh', 'post:analytics:global')],
    [Markup.button.callback('🏆 Top Posts', 'post:analytics:top')],
    [Markup.button.callback('« Back to Posts Menu', 'post:menu')],
  ]);
};

export const postSwapTargetKeyboard = (postId: number, sourceRow: number, totalRows: number) => {
  const rows: any[][] = [];
  for (let i = 0; i < totalRows; i++) {
    if (i !== sourceRow) {
      rows.push([Markup.button.callback(`↔ Swap with Row ${i + 1}`, `post:btn:swap:${postId}:${sourceRow}:${i}`)]);
    }
  }
  rows.push([Markup.button.callback('« Cancel', `post:edit:${postId}:buttons`)]);
  return Markup.inlineKeyboard(rows);
};

export const postBuilderViewKeyboard = (postId: number) => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🔄 Refresh Preview', `post:builder:refresh:${postId}`)],
    [Markup.button.callback('✏ Edit Title', `post:edit:${postId}:title`)],
    [Markup.button.callback('📝 Edit Content', `post:edit:${postId}:content`)],
    [Markup.button.callback('⌨ Edit Buttons', `post:edit:${postId}:buttons`)],
    [Markup.button.callback('📤 Publish', `post:publish:${postId}`)],
    [Markup.button.callback('« Back to Editor', `post:edit:${postId}:full`)],
  ]);
};
