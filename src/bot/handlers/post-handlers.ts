import { PostStatus } from '@prisma/client';
import { Context, Markup, Telegraf } from 'telegraf';
import { botAdminService } from '../../services/bot-admin.service';
import { postService } from '../../services/post.service';
import { systemLogService } from '../../services/system-log.service';
import { cache } from '../../utils/cache';
import { logger, traceLogger } from '../../utils/logger';
import { graphemeTruncate } from '../../utils/grapheme';
import {
  postMainMenuKeyboard,
  postEditorKeyboard,
  postListKeyboard,
  postViewKeyboard,
  postTitleOnlyListKeyboard,
  buildPostListFromMenuLayout,
  postInfoActionKeyboard,
  postEditModeReplyKeyboard,
  postPublishOptionsKeyboard,
  postAnalyticsKeyboard,
  postManagerAnalyticsKeyboard,
  postCommandListKeyboard,
  postCommandEditKeyboard,
  postVersionHistoryKeyboard,
  postIntegrityKeyboard,
  postGlobalAnalyticsKeyboard,
  postMultiMessageEditorReplyKeyboard,
  postMoveModeReplyKeyboard,
  postAddMessageReplyKeyboard,
  postEditMessageReplyKeyboard,
  postCancelOnlyReplyKeyboard,
  postNewPostManagerReplyKeyboard,
  postSingleMessageInlineKeyboard,
  buildNoButtonsReplyKeyboard,
  buildButtonTypeSelectionKeyboard,
  buildCancelOnlyReplyKeyboard,
  buildButtonEditorExitKeyboard,
  buildButtonListInlineKeyboard,
  buildEditButtonTypeKeyboard,
  buildButtonColorSelectionKeyboard,
} from '../keyboards/post-keyboards';
import { buildBotAdminPanelKeyboard } from '../keyboards';
import { settingsService } from '../../services/settings.service';
import { safeEdit, sendPostToUser } from '../shared';

function isPostAdmin(admin: any): boolean {
  if (!admin) return false;
  return ['OWNER', 'SUPER_ADMIN', 'ADMIN'].includes(admin.role);
}

function requirePostAdmin(ctx: any): Promise<any> {
  return botAdminService.getActive(ctx.from.id);
}

async function adminMainMenu(ctx: any) {
  clearEditorKeyState(ctx.from.id);
  cache.del(`post_mgmt_mode:${ctx.from.id}`);
  cache.del(`menu:edit_mode:${ctx.from.id}`);
  const admin = await botAdminService.getActive(ctx.from.id);
  if (!admin) return;
  const canBroadcast = admin.role === 'OWNER' || admin.role === 'ADMIN';
  await ctx.reply('⚙️ پنل مدیریت', buildBotAdminPanelKeyboard(canBroadcast));
}

const PENDING_POST_STATE = 'post:pending:';

function pendingKey(telegramId: number, field: string) {
  return `${PENDING_POST_STATE}${telegramId}:${field}`;
}

// ─── Multi-Message Editor State Keys ──────────────────────
const EDITOR_PREFIX = 'post:editor:';
function editorKey(userId: number, field: string) {
  return `${EDITOR_PREFIX}${userId}:${field}`;
}

// ─── Clear all editor state (self-healing) ──────────────
function clearEditorKeyState(userId: number) {
  const keys = [
    'active', 'mode', 'msg_idx', 'message_ids', 'forward_on',
    'btn_sel_row', 'btn_sel_col', 'btn_msg_ids',
    'add_btn_name', 'add_btn_ref_row', 'add_btn_ref_col',
    'btn_text_row', 'btn_text_col', 'btn_link_row', 'btn_link_col',
  ];
  for (const k of keys) cache.del(editorKey(userId, k));
}

// ─── Move button helper (Layout reconstruction) ──────────
// Both ⬆️ and ⬇️ extract a button from its row and reconstruct layout:
//   - Non-singleton row → new singleton row at (originalRow + 1)
//   - Singleton row → ⬇️ appends to next row, ⬆️ prepends to previous row
//   - No row-boundary checks (row === 0 / lastRow are never used)
function moveButtonInLayout(
  buttons: any[][],
  row: number,
  col: number,
  direction: 'up' | 'down',
): { newRow: number; newCol: number } {
  const btn = buttons[row]?.[col];
  if (!btn) return { newRow: row, newCol: col };
  const wasSingleton = buttons[row].length === 1;

  // Remove button from its row
  buttons[row].splice(col, 1);
  if (buttons[row].length === 0) buttons.splice(row, 1);

  if (wasSingleton) {
    // Singleton row was removed — merge into adjacent row
    if (direction === 'down') {
      // Append to the row that shifted into this position (next row)
      if (row < buttons.length) {
        buttons[row].push(btn);
        return { newRow: row, newCol: buttons[row].length - 1 };
      } else {
        buttons.push([btn]);
        return { newRow: buttons.length - 1, newCol: 0 };
      }
    } else {
      // Prepend to the row above
      if (row > 0 && row - 1 < buttons.length) {
        buttons[row - 1].unshift(btn);
        return { newRow: row - 1, newCol: 0 };
      } else {
        buttons.push([btn]);
        return { newRow: buttons.length - 1, newCol: 0 };
      }
    }
  } else {
    // Non-singleton — create a new singleton row right after original position
    buttons.splice(row + 1, 0, [btn]);
    return { newRow: row + 1, newCol: 0 };
  }
}

// ─── Convert array-format buttons to messages-format ────
function ensureMessagesFormat(raw: any): any {
  if (!raw) return raw;
  if (typeof raw === 'object' && !Array.isArray(raw) && raw.messages) return raw;
  if (Array.isArray(raw)) return { messages: { '0': raw } };
  return raw;
}

// ─── Per-message button helpers ──────────────────────────
function getMessageButtons(raw: any, messageIdx: number): any[][] {
  if (!raw) return [];
  if (typeof raw === 'object' && !Array.isArray(raw) && raw.messages) {
    return raw.messages[String(messageIdx)] || raw.messages['_shared'] || [];
  }
  if (Array.isArray(raw)) return messageIdx === 0 ? raw : [];
  return [];
}

function setMessageButtons(raw: any, messageIdx: number, buttons: any[][]): any {
  const formatted = ensureMessagesFormat(raw);
  const result: any = { messages: {} };
  // Preserve existing message entries, including _shared
  if (formatted && formatted.messages) {
    for (const [k, v] of Object.entries(formatted.messages)) {
      result.messages[k] = v;
    }
  }
  result.messages[String(messageIdx)] = buttons;
  return result;
}

function swapMessageButtons(raw: any, idxA: number, idxB: number): any {
  const formatted = ensureMessagesFormat(raw);
  if (!formatted || !formatted.messages) return raw;
  const msgs = { ...formatted.messages };
  const a = String(idxA);
  const b = String(idxB);
  const temp = msgs[a];
  msgs[a] = msgs[b];
  msgs[b] = temp;
  return { messages: msgs };
}

function removeMessageButtons(raw: any, messageIdx: number): any {
  const formatted = ensureMessagesFormat(raw);
  if (!formatted || !formatted.messages) return raw;
  const msgs: any = {};
  const keys = Object.keys(formatted.messages).sort((a, b) => Number(a) - Number(b));
  let skip = String(messageIdx);
  let shift = 0;
  for (const k of keys) {
    if (k === skip) { shift = 1; continue; }
    msgs[String(Number(k) - shift)] = formatted.messages[k];
  }
  // Preserve _shared key
  if (formatted.messages['_shared']) {
    msgs['_shared'] = formatted.messages['_shared'];
  }
  return { messages: msgs };
}

// ─── Clear all button-editor pending state ─────────────
function clearButtonEditorState(userId: number) {
  const keys = [
    'editor_state', 'editor_mode', 'editor_row', 'editor_col',
    'editing_post', 'editing_message_idx',
  ];
  for (const k of keys) cache.del(pendingKey(userId, k));
}

// ─── Parse content into message segments ──────────────────
function parsePostMessages(content: string | null | undefined): string[] {
  if (!content || !content.trim()) return [''];
  const messages: string[] = [];
  const regex = /\[\[copy\]\](.*?)\[\[\/copy\]\]/gs;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const before = content.slice(lastIndex, match.index).trim();
      if (before) messages.push(before);
    }
    messages.push(match[1].trim());
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    const remaining = content.slice(lastIndex).trim();
    if (remaining) messages.push(remaining);
  }
  if (messages.length === 0) messages.push(content.trim() || '');
  return messages;
}

// ─── Serialize message segments back to content ──────────
function serializePostMessages(messages: string[]): string {
  if (messages.length === 0) return '';
  if (messages.length === 1) return messages[0] || '';
  while (messages.length > 1 && messages[messages.length - 1].trim() === '') {
    messages.pop();
  }
  if (messages.length === 1) return messages[0] || '';
  const segments = messages.map((msg, i) => {
    if (i === 0) return msg;
    return `[[copy]]\n${msg}\n[[/copy]]`;
  });
  return segments.join('\n\n');
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    || `post-${Date.now()}`;
}

function formatPostPreview(post: any): string {
  const statusMap: Record<string, string> = {
    PUBLISHED: '✅ منتشر شده',
    DRAFT: '📝 پیش‌نویس',
    SCHEDULED: '⏰ زمان‌بندی شده',
    ARCHIVED: '📦 بایگانی شده',
    HIDDEN: '👻 مخفی',
  };
  const statusText = statusMap[post.status] || post.status;
  const parseMode = post.parseMode || 'Markdown';
  const commands = (post as any).commands || [];
  const lines = [
    `*${post.title}*`,
    `_شناسه: ${post.id} | اسلاگ: \`${post.slug}\`_`,
    `${statusText} | 🔤 ${parseMode}`,
    post.sortOrder ? `🗂 ترتیب: ${post.sortOrder}` : '',
    post.command ? `🔗 دستور: \`/${post.command}\`` : '',
    commands.length ? `🔗 دستورات: ${commands.map((c: any) => `/${c.command}`).join(', ')}` : '',
    post.publishedAt ? `📅 منتشر شده: ${new Date(post.publishedAt).toLocaleDateString('fa-IR')}` : '',
    post.scheduledAt ? `⏰ زمان‌بندی: ${new Date(post.scheduledAt).toLocaleDateString('fa-IR')}` : '',
    post.unpublishAt ? `⏰ لغو انتشار: ${new Date(post.unpublishAt).toLocaleDateString('fa-IR')}` : '',
    post.mediaType ? `🖼 رسانه: ${post.mediaType}` : '',
    `📊 بازدید: ${(post as any)._count?.views || 0} | کلیک: ${(post as any)._count?.clickLogs || 0}`,
    '',
    post.content ? graphemeTruncate(post.content, 200) : '(بدون محتوا)',
  ].filter(Boolean).join('\n');
  return lines;
}

// ─── Persian Post Info Display ────────────────────────────
// Shows full info for ALL posts regardless of publish status.
function formatPostInfoPersian(post: any): string {
  const statusMap: Record<string, string> = {
    PUBLISHED: '✅ منتشر شده',
    DRAFT: '📝 پیش‌نویس',
    SCHEDULED: '⏰ زمان‌بندی شده',
    ARCHIVED: '📦 بایگانی شده',
    HIDDEN: '👻 مخفی',
  };
  const statusText = statusMap[post.status] || post.status;
  const mediaCount = post.mediaType ? (Array.isArray(post.albumMediaIds) ? post.albumMediaIds.length : 1) : 0;
  const views = (post as any)._count?.views || 0;
  const clicks = (post as any)._count?.clickLogs || 0;
  // Calculate message count: count [[copy]] blocks + 1 base message
  const copyBlockCount = post.content ? (post.content.match(/\[\[copy\]\]/g) || []).length : 0;
  const messageCount = post.content ? copyBlockCount + 1 : 0;
  const createdDate = post.createdAt ? new Date(post.createdAt).toLocaleDateString('fa-IR') : '';
  const updatedDate = post.updatedAt ? new Date(post.updatedAt).toLocaleDateString('fa-IR') : '';

  const lines = [
    `📝 *عنوان:* ${post.title}`,
    `🚀 *وضعیت:* ${statusText}`,
    `👁 *بازدید:* ${views} | 👆 *کلیک:* ${clicks}`,
    mediaCount > 0 ? `📎 *رسانه‌ها:* ${mediaCount}` : '',
    messageCount > 0 ? `💬 *پیام‌ها:* ${messageCount}` : '',
    createdDate ? `📅 *ایجاد:* ${createdDate}` : '',
    updatedDate ? `📅 *به‌روزرسانی:* ${updatedDate}` : '',
  ].filter(Boolean).join('\n');
  return lines;
}

export function registerPostHandlers(bot: Telegraf<Context>) {
  // ─── Post List (Entry Point) ────────────────────────────
  // Builds the Reply Keyboard from the menu layout (single source of truth).
  // Only post-ref buttons are shown, preserving the exact row/column structure.
  bot.hears('📝 پست‌ها', async (ctx: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    clearEditorKeyState(ctx.from.id);
    const layout = await settingsService.getResolvedMenuLayout(false);
    const drafts = await postService.getDrafts();
    const postButtons = layout.flat().filter((btn: any) => btn?.ref?.startsWith('post:'));
    if (postButtons.length === 0 && drafts.length === 0) {
      return ctx.reply('📋 پستی در منو وجود ندارد. ابتدا پست را در ویرایش منو اضافه کنید.', postMainMenuKeyboard());
    }
    cache.set(`post_mgmt_mode:${ctx.from.id}`, true, 300);
    await ctx.reply('📋 روی عنوان پست مورد نظر ضربه بزنید:', buildPostListFromMenuLayout(layout, drafts));
  });

  // ─── Post List (Reply Keyboard with Titles — built from menu layout) ──
  bot.hears('📋 مدیریت پست‌ها', async (ctx: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    clearEditorKeyState(ctx.from.id);
    const layout = await settingsService.getResolvedMenuLayout(false);
    const drafts = await postService.getDrafts();
    const postButtons = layout.flat().filter((btn: any) => btn?.ref?.startsWith('post:'));
    if (postButtons.length === 0 && drafts.length === 0) {
      return ctx.reply('📋 پستی در منو وجود ندارد. ابتدا پست را در ویرایش منو اضافه کنید.', postMainMenuKeyboard());
    }
    // Set flag so the menu button handler in index.ts skips this user's next text
    cache.set(`post_mgmt_mode:${ctx.from.id}`, true, 300);
    await ctx.reply('📋 روی عنوان پست مورد نظر ضربه بزنید:', buildPostListFromMenuLayout(layout, drafts));
  });

  // ─── Text: Post Title Selection / Edit Action / Back ────
  bot.on('text', async (ctx: any, next) => {
    if (!ctx.from) return next();
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin || !isPostAdmin(admin)) return next();

    // Self-healing: if editorKey is stale (active but user is sending non-editor text),
    // clear it and proceed. Check by seeing if text is a known post title.
    const existingKey = cache.get<number>(editorKey(ctx.from.id, 'active'));
    if (existingKey) {
      const existingMode = cache.get<string>(editorKey(ctx.from.id, 'mode'));
      // If in 'main' mode and text doesn't look like an editor action, the key is stale
      if (existingMode === 'main') {
        const text = ctx.message.text;
        const isEditorAction = ['➕ افزودن پیام', 'افزودن دستور', '📊 آمار', '📤 لغو انتشار', '✅ انتشار', '🔗 متغیرها',
          '🗂 بازگشت به لیست', '🏠 منو اصلی', '🔙 بازگشت', '⛔ توقف ویرایش',
          '✏️ ویرایش محتوا', '📝 ویرایش عنوان', 'ویرایش دکمه ها', '❌ لغو',
          '↪️ ارسال به عنوان فوروارد (خاموش)', '✅ ارسال به عنوان فوروارد (روشن)',
          '🔙 بازگشت به ویرایشگر',
          '🗑 حذف پست',
        ].includes(text);
        if (!isEditorAction) {
          logger.warn(`[StaleEditorKey] Clearing stale editor key for user ${ctx.from.id} (mode=${existingMode}, text="${text.substring(0, 30)}")`);
          clearEditorKeyState(ctx.from.id);
        }
      }
      // In sub-modes like 'edit_message', the editor is legit — skip
      // In stale 'main' mode (cleared above), fall through to post title matching
      if (cache.get<number>(editorKey(ctx.from.id, 'active'))) return next();
    }

    const text = ctx.message.text;

    // Back to post main menu
    if (text === '🔙 بازگشت به منوی پست' || text === '🔙 بازگشت به منوی پست‌ها') {
      cache.del(`post_mgmt_mode:${ctx.from.id}`);
      return ctx.reply('📝 سامانه مدیریت پست‌ها', postMainMenuKeyboard());
    }

    // Start post → open editor
    if (text === '🚀 پیام Start') {
      const startPost = await postService.getOrCreateStartPost();
      if (!startPost) return ctx.reply('❌ خطا در بارگذاری پیام Start.');
      cache.set(pendingKey(ctx.from.id, 'selected_post'), startPost.id, 300);
      cache.del(`post_mgmt_mode:${ctx.from.id}`);
      cache.del(pendingKey(ctx.from.id, 'edit_mode'));
      await enterPostEditor(ctx, startPost);
      return;
    }

    // Match post title → select that post (support draft prefix)
    let searchTitle = text;
    const draftPrefix = '📝 پیش‌نویس: ';
    if (searchTitle.startsWith(draftPrefix)) {
      searchTitle = searchTitle.slice(draftPrefix.length).trim();
    }
    const matched = await postService.findByTitle(searchTitle);
    if (matched) {
      const post = await postService.findById(matched.id);
      if (!post) return ctx.reply('❌ پست یافت نشد.');
      cache.set(pendingKey(ctx.from.id, 'selected_post'), matched.id, 300);
      cache.del(`post_mgmt_mode:${ctx.from.id}`);
      cache.del(pendingKey(ctx.from.id, 'edit_mode'));

      await enterPostEditor(ctx, post);
      return;
    }

    return next();
  });

  // ─── Action: Add Content (Multi-Message) ─────────────────
  bot.action(/^post:action:add:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    cache.set(pendingKey(ctx.from.id, 'editing_field'), 'add_content', 300);
    cache.set(pendingKey(ctx.from.id, 'editing_post'), postId, 300);
    await safeEdit(ctx, '➕ پیام جدید را ارسال کنید تا به این پست اضافه شود.\nبه عنوان یک بلاک مجزا ذخیره خواهد شد.');
  });

  // ─── Action: Remove Content (edits same message, no new messages) ──
  bot.action(/^post:action:remove:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const post = await postService.findById(postId);
    if (!post) return safeEdit(ctx, '❌ پست یافت نشد.');
    // Edit the same management message to show confirmation
    await safeEdit(ctx,
      `🗑 محتوای "${post.title}" حذف شود؟`,
      Markup.inlineKeyboard([
        [Markup.button.callback('🗑 بله، حذف شود', `post:action:remove:confirm:${postId}`)],
        [Markup.button.callback('❌ انصراف', `post:manager:cancel:${postId}`)],
      ])
    );
  });

  bot.action(/^post:action:remove:confirm:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    await postService.update(postId, {
      content: null,
      contentText: null,
      contentEntities: [],
      mediaFileId: null,
      mediaType: null,
      albumMediaIds: null,
      updatedBy: BigInt(ctx.from.id),
    } as any);
    const post = await postService.findById(postId);
    // Edit the same message with updated info + ALL inline buttons (no Reply Keyboard)
    await safeEdit(ctx, formatPostInfoPersian(post), {
      parse_mode: 'Markdown' as any,
      link_preview_options: { is_disabled: true } as any,
      ...postInfoActionKeyboard(post),
    });
  });

  // ─── Action: Replace Content/Media (edits same message, no new messages) ──
  bot.action(/^post:action:replace:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    // Edit the same management message to show options
    await safeEdit(ctx,
      '🔁 چه چیزی را جایگزین کنیم؟',
      Markup.inlineKeyboard([
        [Markup.button.callback('📝 جایگزینی محتوا', `post:edit:${postId}:content`)],
        [Markup.button.callback('🖼 جایگزینی رسانه', `post:edit:${postId}:media`)],
        [Markup.button.callback('❌ انصراف', `post:manager:cancel:${postId}`)],
      ])
    );
  });

  // ─── Cancel placeholder (silent ack) ─────────────────────
  bot.action('post:manage:cancel', async (ctx: any) => {
    await ctx.answerCbQuery();
  });

  // ─── Create Post ─────────────────────────────────────────
  bot.hears('📥 Import From Telegram', async (ctx: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    clearEditorKeyState(ctx.from.id);
    cache.set(pendingKey(ctx.from.id, 'import_title'), true, 300);
    await ctx.reply('📥 عنوان پست جدید را ارسال کنید، سپس پیام تلگرام اصلی را فوروارد کنید.');
  });

  bot.hears('➕ ایجاد پست', async (ctx: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    clearEditorKeyState(ctx.from.id);
    cache.set(pendingKey(ctx.from.id, 'creating'), true, 300);
    await ctx.reply('📝 عنوان پست را وارد کنید:', {
      ...postCancelOnlyReplyKeyboard(),
    });
  });

  // ─── Cancel Post Creation ────────────────────────────
  bot.hears('❌ لغو', async (ctx: any, next) => {
    if (!ctx.from) return next();
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin || !isPostAdmin(admin)) return next();
    const creating = cache.get<boolean>(pendingKey(ctx.from.id, 'creating'));
    if (creating) {
      clearAllWaitingStates(ctx.from.id);
      await ctx.reply('❌ ایجاد پست لغو شد.', postMainMenuKeyboard());
      return;
    }
    return next();
  });

  // ─── Handle text input for post creation/editing ────────
  bot.on('text', async (ctx: any, next) => {
    if (!ctx.from) return next();
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin || !isPostAdmin(admin)) return next();

    // Skip if multi-message editor is active
    if (cache.get<number>(editorKey(ctx.from.id, 'active'))) return next();

    const importTitle = cache.get<boolean>(pendingKey(ctx.from.id, 'import_title'));
    const importingPostId = cache.get<number>(pendingKey(ctx.from.id, 'import_post'));
    const creating = cache.get<boolean>(pendingKey(ctx.from.id, 'creating'));
    const editingField = cache.get<string>(pendingKey(ctx.from.id, 'editing_field'));
    const editingPostId = cache.get<number>(pendingKey(ctx.from.id, 'editing_post'));
    const editingButton = cache.get<string>(pendingKey(ctx.from.id, 'editing_button'));
    const editingCommand = cache.get<boolean>(pendingKey(ctx.from.id, 'editing_cmd'));

    if (importTitle) {
      cache.del(pendingKey(ctx.from.id, 'import_title'));
      const title = ctx.message.text;
      const slug = slugify(title);
      const post = await postService.create({ title, slug, content: '', contentFormat: 'telegram_entities', contentVersion: 2, createdBy: BigInt(ctx.from.id) } as any);
      cache.set(pendingKey(ctx.from.id, 'import_post'), post.id, 300);
      await ctx.reply(`✅ پیش‌نویس ساخته شد (شناسه ${post.id}). حالا پیام اصلی را از تلگرام فوروارد کنید یا همینجا ارسال کنید.`);
      return;
    }

    if (importingPostId) {
      cache.del(pendingKey(ctx.from.id, 'import_post'));
      await postService.importFromTelegram(importingPostId, ctx.message, BigInt(ctx.from.id));
      await ctx.reply('✅ پیام تلگرام با entityها، قالب‌بندی، دکمه‌ها و مدیا ایمپورت شد.');
      await showPostEditor(ctx, importingPostId);
      return;
    }

    if (creating) {
      cache.del(pendingKey(ctx.from.id, 'creating'));
      const title = ctx.message.text;
      const slug = slugify(title);
      try {
        const post = await postService.create({ title, slug, content: '', createdBy: BigInt(ctx.from.id) });
        cache.set(editorKey(ctx.from.id, 'active'), post.id, 600);
        cache.set(editorKey(ctx.from.id, 'mode'), 'new_post_manager', 600);
        await ctx.reply(`✅ پست ساخته شد!\n\nعنوان: ${title}\nاسلاگ: ${slug}`, {
          ...postNewPostManagerReplyKeyboard(),
        });
      } catch (err: any) {
        if (err.code === 'P2002') {
          await ctx.reply(`❌ اسلاگ "${slug}" از قبل وجود دارد. عنوان دیگری انتخاب کنید.`);
        } else {
          logger.error('[Post] Create error:', err);
          await ctx.reply('❌ ایجاد پست ناموفق بود.');
        }
      }
      return;
    }

    if (editingField && editingPostId) {
      const field = editingField;
      const postId = editingPostId;
      cache.del(pendingKey(ctx.from.id, 'editing_field'));
      cache.del(pendingKey(ctx.from.id, 'editing_post'));

      try {
        const updateData: any = {};
        if (field === 'title') {
          updateData.title = ctx.message.text;
          updateData.slug = slugify(ctx.message.text);
        } else if (field === 'content') {
          updateData.content = ctx.message.text;
          updateData.contentText = ctx.message.text;
          updateData.contentEntities = ctx.message.entities || [];
          updateData.renderMode = 'telegram_entities';
          updateData.contentFormat = 'telegram_entities';
          logger.info(`[PostEdit] content update post=${postId} textLength=${(ctx.message.text || '').length} entities=${(ctx.message.entities || []).length} entityTypes=${(ctx.message.entities || []).map((e: any) => e.type).join(',')}`);
        } else if (field === 'add_content') {
          const post = await postService.findById(postId);
          const existingContent = post?.content || '';
          const newBlock = `[[copy]]\n${ctx.message.text}\n[[/copy]]`;
          updateData.content = existingContent + '\n\n' + newBlock;
          updateData.contentText = updateData.content;
          logger.info(`[PostEdit] add_content post=${postId} — appended copy block`);
        } else if (field === 'caption') {
          updateData.caption = ctx.message.text;
        } else if (field === 'command') {
          const cmd = ctx.message.text.replace(/^\//, '');
          updateData.command = cmd;
          await systemLogService.log({
            eventType: 'ADMIN_ACTION' as any,
            message: `Post Command Set: /${cmd}`,
            telegramId: ctx.from.id,
            metadata: { postId } as any,
          });
        }

        if (Object.keys(updateData).length > 0) {
          await postService.update(postId, { ...updateData, updatedBy: BigInt(ctx.from.id) });
          const fieldNames: Record<string, string> = { title: 'عنوان', content: 'محتوا', add_content: 'محتوای جدید اضافه شد', caption: 'کپشن', command: 'دستور' };
          await ctx.reply(`✅ ${fieldNames[field] || field} به‌روز شد!`);
        }
        if (field === 'add_content') {
          const updated = await postService.findById(postId);
          await ctx.reply(formatPostInfoPersian(updated), {
            parse_mode: 'Markdown' as any,
            link_preview_options: { is_disabled: true } as any,
            ...postInfoActionKeyboard(updated),
          });
        } else if (cache.get(pendingKey(ctx.from.id, 'edit_mode'))) {
          const updated = await postService.findById(postId);
          await ctx.reply(formatPostInfoPersian(updated), {
            parse_mode: 'Markdown' as any,
            link_preview_options: { is_disabled: true } as any,
          });
          await ctx.reply('✏️ حالت ویرایش:', postEditModeReplyKeyboard());
        } else {
          await showPostEditor(ctx, postId);
        }
      } catch (err: any) {
        logger.error('[Post] Edit error:', err);
        await ctx.reply(`❌ به‌روزرسانی ${field} ناموفق بود.`);
      }
      return;
    }

    if (editingButton && editingPostId) {
      const [action, rowStr, colStr] = editingButton.split(':');
      const row = parseInt(rowStr);
      const col = parseInt(colStr);
      cache.del(pendingKey(ctx.from.id, 'editing_button'));

      const post = await postService.findById(editingPostId);
      if (!post) return ctx.reply('❌ پست یافت نشد.');

      const buttons = (post as any).buttons || [];

      if (action === 'text') {
        if (!buttons[row]) buttons[row] = [];
        if (!buttons[row][col]) buttons[row][col] = {};
        buttons[row][col].text = ctx.message.text;
        await postService.update(editingPostId, { buttons: JSON.parse(JSON.stringify(buttons)) } as any);
        await ctx.reply('✅ متن دکمه به‌روز شد!');
      } else if (action === 'value') {
        if (!buttons[row]) buttons[row] = [];
        if (!buttons[row][col]) buttons[row][col] = {};
        buttons[row][col].value = ctx.message.text;
        await postService.update(editingPostId, { buttons: JSON.parse(JSON.stringify(buttons)) } as any);
        await ctx.reply('✅ مقدار دکمه به‌روز شد!');
      }
      // Stay in button editor — refresh with latest buttons
      const updatedPost = await postService.findById(editingPostId);
      const updatedButtons = (updatedPost as any).buttons || [];
      cache.set(pendingKey(ctx.from.id, 'editing_post'), editingPostId, 600);
      cache.set(pendingKey(ctx.from.id, 'editor_mode'), 'edit', 600);
      cache.del(pendingKey(ctx.from.id, 'editor_state'));
      if (!updatedButtons.length || updatedButtons.every((r: any[]) => !r || !r.length)) {
        await safeEdit(ctx, '⌨ ویرایشگر دکمه:\nهنوز دکمه‌ای وجود ندارد.', buildNoButtonsReplyKeyboard());
      } else {
        await ctx.reply('⌨ ویرایشگر دکمه:', {
          ...buildButtonEditorExitKeyboard(),
          ...buildButtonListInlineKeyboard(editingPostId, updatedButtons, 'edit'),
        });
      }
      return;
    }

    if (editingCommand && editingPostId) {
      cache.del(pendingKey(ctx.from.id, 'editing_cmd'));
      const cmdText = ctx.message.text.replace(/^\//, '').trim();
      if (!cmdText) return ctx.reply('❌ دستور نامعتبر.');
      try {
        await postService.addCommand(editingPostId, cmdText);
        await ctx.reply(`✅ دستور /${cmdText} اضافه شد!`);
      } catch (err: any) {
        await ctx.reply(`❌ ${err.message || 'افزودن دستور ناموفق بود.'}`);
      }
      if (cache.get(pendingKey(ctx.from.id, 'edit_mode'))) {
        await showEditMode(ctx, editingPostId);
      } else {
        await showPostEditor(ctx, editingPostId);
      }
      return;
    }

    // ─── Handle Alias Input ──────────────────────────────────
    const aliasCommandId = cache.get<number>(pendingKey(ctx.from.id, 'alias_cmd_id'));
    if (aliasCommandId && editingPostId) {
      cache.del(pendingKey(ctx.from.id, 'alias_cmd_id'));
      const alias = ctx.message.text.replace(/^\//, '').trim();
      if (!alias) return ctx.reply('❌ نام مستعار نامعتبر.');
      try {
        await postService.addCommandAlias(aliasCommandId, alias);
        await ctx.reply(`✅ نام مستعار /${alias} اضافه شد!`);
      } catch (err: any) {
        await ctx.reply(`❌ ${err.message || 'افزودن نام مستعار ناموفق بود.'}`);
      }
      const commands = await postService.getCommands(editingPostId);
      await ctx.reply('🔗 دستورات:', postCommandListKeyboard(editingPostId, commands));
      return;
    }

    // ─── Handle Schedule Input ───────────────────────────────
    const schedulePublish = cache.get<number>(pendingKey(ctx.from.id, 'schedule_publish'));
    if (schedulePublish) {
      cache.del(pendingKey(ctx.from.id, 'schedule_publish'));
      const date = new Date(ctx.message.text);
      if (isNaN(date.getTime())) return ctx.reply('❌ فرمت تاریخ نامعتبر. از فرمت ISO استفاده کنید: 2026-06-15T14:30:00.000Z');
      await postService.schedule(schedulePublish, date);
      await ctx.reply(`✅ زمان‌بندی انتشار برای ${date.toISOString()} ثبت شد.`);
      await showPostEditor(ctx, schedulePublish);
      return;
    }

    const scheduleUnpublish = cache.get<number>(pendingKey(ctx.from.id, 'schedule_unpublish'));
    if (scheduleUnpublish) {
      cache.del(pendingKey(ctx.from.id, 'schedule_unpublish'));
      const date = new Date(ctx.message.text);
      if (isNaN(date.getTime())) return ctx.reply('❌ فرمت تاریخ نامعتبر. از فرمت ISO استفاده کنید: 2026-06-20T14:30:00.000Z');
      await postService.scheduleUnpublish(scheduleUnpublish, date);
      await ctx.reply(`✅ زمان‌بندی لغو انتشار برای ${date.toISOString()} ثبت شد.`);
      await showPostEditor(ctx, scheduleUnpublish);
      return;
    }

    return next();
  });

  // ─── Handle Media for Post Creation/Editing ──────────────
  bot.on(['photo', 'video', 'animation', 'document', 'audio', 'voice'], async (ctx: any, next) => {
    if (!ctx.from) return next();
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin || !isPostAdmin(admin)) return next();

    const editingField = cache.get<string>(pendingKey(ctx.from.id, 'editing_field'));
    const editingPostId = cache.get<number>(pendingKey(ctx.from.id, 'editing_post'));

    const importingPostId = cache.get<number>(pendingKey(ctx.from.id, 'import_post'));
    if (importingPostId) {
      cache.del(pendingKey(ctx.from.id, 'import_post'));
      await postService.importFromTelegram(importingPostId, ctx.message, BigInt(ctx.from.id));
      await ctx.reply('✅ پیام تلگرام با ساختار native ایمپورت شد.');
      await showPostEditor(ctx, importingPostId);
      return;
    }

    if (editingField === 'media' && editingPostId) {
      cache.del(pendingKey(ctx.from.id, 'editing_field'));

      const msg = ctx.message;
      let mediaFileId = '';
      let mediaType = '';

      if (msg.photo) {
        mediaFileId = msg.photo[msg.photo.length - 1].file_id;
        mediaType = 'photo';
      } else if (msg.video) {
        mediaFileId = msg.video.file_id;
        mediaType = 'video';
      } else if (msg.animation) {
        mediaFileId = msg.animation.file_id;
        mediaType = 'animation';
      } else if (msg.document) {
        mediaFileId = msg.document.file_id;
        mediaType = 'document';
      } else if (msg.audio) {
        mediaFileId = msg.audio.file_id;
        mediaType = 'audio';
      } else if (msg.voice) {
        mediaFileId = msg.voice.file_id;
        mediaType = 'voice';
      }

      if (msg.media_group_id) {
        const groupKey = `post_media_group:${ctx.from.id}:${msg.media_group_id}`;
        const group = cache.get<string[]>(groupKey) || [];
        group.push(mediaFileId);
        cache.set(groupKey, group, 60);
        if (group.length === 1) {
          setTimeout(async () => {
            const allMedia = cache.get<string[]>(groupKey);
            if (allMedia && allMedia.length > 1) {
              await postService.update(editingPostId, {
                mediaFileId: allMedia[0],
                mediaType,
                albumMediaIds: allMedia,
                updatedBy: BigInt(ctx.from.id),
              } as any);
              await ctx.reply(`✅ آلبوم با ${allMedia.length} رسانه ذخیره شد!`);
            } else if (allMedia) {
              await postService.update(editingPostId, {
                mediaFileId: allMedia[0],
                mediaType,
                updatedBy: BigInt(ctx.from.id),
              } as any);
              await ctx.reply(`✅ ${mediaType} ذخیره شد!`);
            }
            cache.del(groupKey);
            cache.del(pendingKey(ctx.from.id, 'editing_post'));
            await showPostEditor(ctx, editingPostId);
          }, 1500);
          return ctx.reply('📦 گروه رسانه شناسایی شد. منتظر بقیه موارد...');
        }
        return;
      }

      await postService.update(editingPostId, {
        mediaFileId,
        mediaType,
        updatedBy: BigInt(ctx.from.id),
      } as any);
      cache.del(pendingKey(ctx.from.id, 'editing_post'));
      await ctx.reply(`✅ ${mediaType} ذخیره شد!`);
      await showPostEditor(ctx, editingPostId);
      return;
    }

    return next();
  });

  async function showPostEditor(ctx: any, postId: number) {
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    const hasContent = !!(post.content || post.mediaFileId);
    const preview = formatPostPreview(post);
    await safeEdit(ctx, preview, {
      parse_mode: 'Markdown',
      link_preview_options: { is_disabled: true },
      ...postEditorKeyboard(postId, hasContent),
    });
  }

  // ─── Edit Post Actions ───────────────────────────────────
  bot.action(/^post:edit:(\d+):(.+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const action = ctx.match[2];
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');

    if (action === 'full') {
      return showPostEditor(ctx, postId);
    }
    if (action === 'title') {
      cache.set(pendingKey(ctx.from.id, 'editing_field'), 'title', 300);
      cache.set(pendingKey(ctx.from.id, 'editing_post'), postId, 300);
      return safeEdit(ctx, `✏ عنوان فعلی: *${post.title}*\n\nعنوان جدید را ارسال کنید:`, { parse_mode: 'Markdown' });
    }
    if (action === 'content') {
      cache.set(pendingKey(ctx.from.id, 'editing_field'), 'content', 300);
      cache.set(pendingKey(ctx.from.id, 'editing_post'), postId, 300);
      const current = post.content ? `محتوا فعلی:\n${graphemeTruncate(post.content, 200)}` : '(بدون محتوا)';
      return safeEdit(ctx, `📝 ${current}\n\nمحتوای جدید را ارسال کنید (Markdown پشتیبانی می‌شود):`);
    }
    if (action === 'media') {
      cache.set(pendingKey(ctx.from.id, 'editing_field'), 'media', 300);
      cache.set(pendingKey(ctx.from.id, 'editing_post'), postId, 300);
      return safeEdit(ctx, '🖼 فایل رسانه ارسال کنید (عکس، ویدیو، گیف، سند، صدا، ویس):');
    }
    if (action === 'buttons') {
      const buttons = (post as any).buttons || [];
      cache.set(pendingKey(ctx.from.id, 'editing_post'), postId, 600);
      cache.set(pendingKey(ctx.from.id, 'editor_mode'), 'create', 600);
      cache.del(pendingKey(ctx.from.id, 'editor_state'));
      cache.del(pendingKey(ctx.from.id, 'editor_row'));
      cache.del(pendingKey(ctx.from.id, 'editor_col'));
      if (!buttons || buttons.length === 0 || buttons.every((r: any[]) => !r || r.length === 0)) {
        await safeEdit(ctx, '⌨ ویرایشگر دکمه:\nهنوز دکمه‌ای وجود ندارد. یک دکمه جدید ایجاد کنید.', buildNoButtonsReplyKeyboard());
      } else {
        await safeEdit(ctx, '⌨ ویرایشگر دکمه:', {
          ...buildButtonEditorExitKeyboard(),
          ...buildButtonListInlineKeyboard(postId, buttons),
        });
      }
      return;
    }
  });

  // ─── View Post ──────────────────────────────────────────
  bot.action(/^post:view:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    const preview = formatPostPreview(post);
    await safeEdit(ctx, preview, {
      parse_mode: 'Markdown',
      link_preview_options: { is_disabled: true },
      ...postViewKeyboard(post as any),
    });
  });

  // ─── List Posts (paginated inline — used by post:list actions) ──
  bot.action(/^post:list:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const page = parseInt(ctx.match[1]);
    const result = await postService.findAll({ page, limit: 5 });
    if (result.items.length === 0) {
      await ctx.editMessageText('📋 پستی یافت نشد.', postListKeyboard([], page, 1));
      return;
    }
    const text = `📋 پست‌ها (صفحه ${page}/${result.pages})\n\n` +
      result.items.map((p: any) =>
        `${p.status === 'PUBLISHED' ? '✅' : p.status === 'DRAFT' ? '📝' : '📦'} ${p.title} (شناسه: ${p.id})`
      ).join('\n');
    await ctx.editMessageText(text, postListKeyboard(result.items, page, result.pages));
  })

  // ─── Drafts ─────────────────────────────────────────────
  bot.hears('📦 پیش‌نویس‌ها', async (ctx: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const drafts = await postService.getDrafts();
    if (drafts.length === 0) {
      return ctx.reply('📦 پیش‌نویسی وجود ندارد.');
    }
    const rows = Markup.inlineKeyboard(
      drafts.map((d: any) => [Markup.button.callback(`📝 ${d.title}`, `post:view:${d.id}`)])
    );
    await ctx.reply(`📦 پیش‌نویس‌ها (${drafts.length}):`, rows);
  });

  // ─── Hidden Posts ────────────────────────────────────────
  bot.hears('👻 پست‌های مخفی', async (ctx: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const hidden = await postService.getHidden();
    if (hidden.length === 0) {
      return ctx.reply('👻 پست مخفی وجود ندارد.');
    }
    const rows = Markup.inlineKeyboard(
      hidden.map((p: any) => [Markup.button.callback(`👻 ${p.title}`, `post:view:${p.id}`)])
    );
    await ctx.reply(`👻 پست‌های مخفی (${hidden.length}):`, rows);
  });

  // ─── Search Posts ───────────────────────────────────────
  bot.hears('🔎 جستجو', async (ctx: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    cache.set(pendingKey(ctx.from.id, 'searching'), true, 120);
    await ctx.reply('🔎 جستجوی پست‌ها بر اساس عنوان، محتوا یا اسلاگ:');
  });

  bot.on('text', async (ctx: any, next) => {
    if (!ctx.from) return next();
    const searching = cache.get<boolean>(pendingKey(ctx.from.id, 'searching'));
    if (!searching) return next();
    cache.del(pendingKey(ctx.from.id, 'searching'));
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return next();
    const query = ctx.message.text;
    const result = await postService.findAll({ search: query, page: 1, limit: 10 });
    if (result.items.length === 0) {
      return ctx.reply(`🔎 نتیجه‌ای برای "${query}" یافت نشد.`);
    }
    const text = `🔎 نتایج جستجو برای "${query}":\n\n` +
      result.items.map((p: any) =>
        `✅ ${p.title} (${p.status})`
      ).join('\n');
    await ctx.reply(text, postListKeyboard(result.items, 1, result.pages));
  });

  // ─── Preview Post ───────────────────────────────────────
  bot.hears('👁 پیش‌نمایش', async (ctx: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    cache.set(pendingKey(ctx.from.id, 'preview_id'), true, 120);
    await ctx.reply('👁 شناسه پست را برای پیش‌نمایش وارد کنید:');
  });

  bot.on('text', async (ctx: any, next) => {
    if (!ctx.from) return next();
    const previewMode = cache.get<boolean>(pendingKey(ctx.from.id, 'preview_id'));
    if (!previewMode) return next();
    cache.del(pendingKey(ctx.from.id, 'preview_id'));
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return next();
    const postId = parseInt(ctx.message.text);
    if (isNaN(postId)) return ctx.reply('❌ شناسه نامعتبر.');
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    await sendPostToUser(ctx, post);
    await systemLogService.log({
      eventType: 'ADMIN_ACTION' as any,
      message: `Post Previewed: "${post.title}"`,
      telegramId: ctx.from.id,
      metadata: { postId: post.id } as any,
    });
  });

  // ─── Publish Post ───────────────────────────────────────
  bot.hears('📤 انتشار', async (ctx: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    cache.set(pendingKey(ctx.from.id, 'publish_id'), true, 120);
    await ctx.reply('📤 شناسه پست را برای انتشار وارد کنید:');
  });

  bot.action(/^post:publish:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const post = await postService.findById(postId);
    if (!post) return safeEdit(ctx, '❌ پست یافت نشد.');
    await safeEdit(ctx, `📤 گزینه‌های انتشار برای "${post.title}":`, postPublishOptionsKeyboard(postId));
  });

  bot.action(/^post:publish:now:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    await postService.publish(postId, BigInt(ctx.from.id));
    const post = await postService.findById(postId);
    const preview = formatPostPreview(post);
    const hasContent = !!(post.content || post.mediaFileId);
    await safeEdit(ctx, `✅ پست منتشر شد!\n\n${preview}`, {
      parse_mode: 'Markdown',
      link_preview_options: { is_disabled: true },
      ...postEditorKeyboard(postId, hasContent),
    });
  });

  bot.action(/^post:draft:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    await postService.update(postId, { status: PostStatus.DRAFT, updatedBy: BigInt(ctx.from.id) } as any);
    postService.invalidateCache();
    const post = await postService.findById(postId);
    const preview = formatPostPreview(post);
    const hasContent = !!(post.content || post.mediaFileId);
    await safeEdit(ctx, `📝 به عنوان پیش‌نویس ذخیره شد.\n\n${preview}`, {
      parse_mode: 'Markdown',
      link_preview_options: { is_disabled: true },
      ...postEditorKeyboard(postId, hasContent),
    });
  });

  // ─── Archive ─────────────────────────────────────────────
  bot.action(/^post:archive:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    await postService.archive(postId);
    const post = await postService.findById(postId);
    const preview = formatPostPreview(post);
    const hasContent = !!(post.content || post.mediaFileId);
    await safeEdit(ctx, `📦 پست بایگانی شد.\n\n${preview}`, {
      parse_mode: 'Markdown',
      link_preview_options: { is_disabled: true },
      ...postEditorKeyboard(postId, hasContent),
    });
  });

  // ─── Hide / Show ─────────────────────────────────────────
  bot.action(/^post:hide:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    const wasHidden = post.status === 'HIDDEN';
    if (wasHidden) {
      await postService.show(postId);
    } else {
      await postService.hide(postId);
    }
    const updated = await postService.findById(postId);
    const preview = formatPostPreview(updated);
    const hasContent = !!(updated.content || updated.mediaFileId);
    const msg = wasHidden ? '👻 پست اکنون قابل مشاهده است.' : '👻 پست مخفی شد.';
    await safeEdit(ctx, `${msg}\n\n${preview}`, {
      parse_mode: 'Markdown',
      link_preview_options: { is_disabled: true },
      ...postEditorKeyboard(postId, hasContent),
    });
  });

  // ─── Schedule ────────────────────────────────────────────
  bot.action(/^post:publish:schedule:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    cache.set(pendingKey(ctx.from.id, 'schedule_publish'), postId, 300);
    await safeEdit(ctx, '📅 تاریخ/زمان را به فرمت ISO ارسال کنید:\nmثلاً `2026-06-15T14:30:00.000Z`', { parse_mode: 'Markdown' });
  });

  bot.action(/^post:unpublish:schedule:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    cache.set(pendingKey(ctx.from.id, 'schedule_unpublish'), postId, 300);
    await safeEdit(ctx, '⏰ تاریخ/زمان لغو انتشار خودکار را به فرمت ISO ارسال کنید:\nmثلاً `2026-06-20T14:30:00.000Z`', { parse_mode: 'Markdown' });
  });

  // ─── Preview from Editor ────────────────────────────────
  bot.action(/^post:preview:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    await sendPostToUser(ctx, post);
    await systemLogService.log({
      eventType: 'ADMIN_ACTION' as any,
      message: `Post Previewed: "${post.title}"`,
      telegramId: ctx.from.id,
      metadata: { postId: post.id } as any,
    });
  });

  // ─── Command List ────────────────────────────────────────
  bot.action(/^post:cmd:list:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const commands = await postService.getCommands(postId);
    await safeEdit(ctx,
      commands.length ? `🔗 دستورات این پست:\n${commands.map((c: any) => `/${c.command}${c.aliases?.length ? ` (نام‌های مستعار: ${(c.aliases as string[]).join(', ')})` : ''}`).join('\n')}` : '🔗 دستوری وجود ندارد.',
      postCommandListKeyboard(postId, commands)
    );
  });

  bot.action(/^post:cmd:view:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const commandId = parseInt(ctx.match[2]);
    await safeEdit(ctx, '🔗 گزینه‌های دستور:', postCommandEditKeyboard(postId, commandId));
  });

  bot.action(/^post:cmd:del:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const commandId = parseInt(ctx.match[2]);
    try {
      await postService.removeCommand(commandId);
      await safeEdit(ctx, '🗑 دستور حذف شد.');
    } catch (err: any) {
      await safeEdit(ctx, `❌ ${err.message}`);
    }
  });

  bot.action(/^post:cmd:alias:add:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const commandId = parseInt(ctx.match[2]);
    cache.set(pendingKey(ctx.from.id, 'alias_cmd_id'), commandId, 300);
    cache.set(pendingKey(ctx.from.id, 'editing_post'), postId, 300);
    await safeEdit(ctx, '➕ نام مستعار را ارسال کنید (بدون /):');
  });

  // ─── Unpublish ───────────────────────────────────────────
  bot.action(/^post:unpublish:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    await postService.unpublish(postId);
    const post = await postService.findById(postId);
    const preview = formatPostPreview(post);
    const hasContent = !!(post.content || post.mediaFileId);
    await safeEdit(ctx, `📥 انتشار پست لغو شد.\n\n${preview}`, {
      parse_mode: 'Markdown',
      link_preview_options: { is_disabled: true },
      ...postEditorKeyboard(postId, hasContent),
    });
  });

  // ─── Delete ─────────────────────────────────────────────
  bot.action(/^post:delete:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    if (post.slug === '__start__') return ctx.reply('❌ پیام Start قابل حذف نیست.');
    await ctx.reply(
      `🗑 آیا از حذف "${post.title}" مطمئن هستید؟`,
      Markup.inlineKeyboard([
        [Markup.button.callback('✅ بله، حذف شود', `post:delete:confirm:${postId}`)],
        [Markup.button.callback('❌ انصراف', `post:view:${postId}`)],
      ])
    );
  });

  bot.action(/^post:delete:confirm:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    if (post.slug === '__start__') return ctx.reply('❌ پیام Start قابل حذف نیست.');
    await postService.delete(postId);
    await safeEdit(ctx, '🗑 پست حذف شد.');
  });

  // ─── ❌ لغو in button editor (all states) ──────────────
  bot.hears('❌ لغو', async (ctx: any, next: any) => {
    if (!ctx.from) return next();
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin || !isPostAdmin(admin)) return next();
    const postId = cache.get<number>(pendingKey(ctx.from.id, 'editing_post'));
    const state = cache.get<string>(pendingKey(ctx.from.id, 'editor_state'));
    if (!postId || !state) return next();
    const savedView = cache.get<string>(pendingKey(ctx.from.id, 'previous_view'));
    clearButtonEditorState(ctx.from.id);
    cache.del(pendingKey(ctx.from.id, 'previous_view'));
    if (savedView === 'select_type') {
      cache.set(pendingKey(ctx.from.id, 'editor_mode'), 'create', 600);
      cache.set(pendingKey(ctx.from.id, 'editor_state'), 'select_type', 600);
      cache.set(pendingKey(ctx.from.id, 'editing_post'), postId, 600);
      await ctx.reply('❇️ نوع دکمه را انتخاب کنید:', buildButtonTypeSelectionKeyboard());
    } else if (savedView && ['create', 'edit', 'delete', 'move'].includes(savedView)) {
      cache.set(pendingKey(ctx.from.id, 'editor_mode'), savedView, 600);
      cache.set(pendingKey(ctx.from.id, 'editing_post'), postId, 600);
      await refreshButtonListView(ctx, postId, '✅ عملیات لغو شد.');
    } else {
      cache.set(pendingKey(ctx.from.id, 'editor_mode'), 'create', 600);
      cache.set(pendingKey(ctx.from.id, 'editing_post'), postId, 600);
      await refreshButtonListView(ctx, postId, '✅ عملیات لغو شد.\n🔧 شما دوباره در بخش تنظیمات دکمه‌های پیام قرار دارید.');
    }
  });

  // ─── NEW BUTTON EDITOR (pbedit) ─────────────────────────
  // State machine: button_idle → select_type → wait_popup/wait_url/wait_command
  // Also handles swap, delete, edit modes on existing buttons.
  // State stored in pendingKey(ctx.from.id, 'editor_state')
  // Post ID stored in pendingKey(ctx.from.id, 'editing_post')

  async function refreshButtonListView(ctx: any, postId: number, msg?: string) {
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    const messageIdx = cache.get<number>(pendingKey(ctx.from.id, 'editing_message_idx')) ?? 0;
    const buttons = getMessageButtons((post as any).buttons, messageIdx);
    const editorMode = cache.get<string>(pendingKey(ctx.from.id, 'editor_mode'));
    const listMode: 'create' | 'edit' | 'delete' | 'move' = editorMode === 'edit' ? 'edit' : editorMode === 'delete' ? 'delete' : editorMode === 'move' ? 'move' : 'create';
    const hasButtons = buttons.length && buttons.some(r => Array.isArray(r) && r.length);
    const displayText = msg || '⌨ ویرایشگر دکمه:';

    const editorMsgId = cache.get<number>(`pbedit:editor_msg_id:${ctx.from.id}`);
    if (!editorMsgId) {
      if (ctx.callbackQuery?.message?.message_id) {
        cache.set(`pbedit:editor_msg_id:${ctx.from.id}`, ctx.callbackQuery.message.message_id, 600);
      }
    }
    const msgId = cache.get<number>(`pbedit:editor_msg_id:${ctx.from.id}`);

    if (hasButtons) {
      const inlineKeyboardMarkup = buildButtonListInlineKeyboard(postId, buttons, listMode).reply_markup;
      if (msgId) {
        try {
          await ctx.telegram.editMessageText(ctx.chat.id, msgId, null, displayText, {
            reply_markup: inlineKeyboardMarkup,
          });
          return;
        } catch (e) {
          cache.del(`pbedit:editor_msg_id:${ctx.from.id}`);
        }
      }
      const sent = await ctx.reply(displayText, {
        reply_markup: {
          ...inlineKeyboardMarkup,
          keyboard: [['🚪 خروج از تنظیمات پیام']],
          resize_keyboard: true,
          persistent: true,
        },
      });
      if (sent) cache.set(`pbedit:editor_msg_id:${ctx.from.id}`, sent.message_id, 600);
    } else {
      const extra = buildNoButtonsReplyKeyboard();
      if (msgId) {
        try {
          await ctx.telegram.editMessageText(ctx.chat.id, msgId, null, displayText, extra);
          return;
        } catch (e) {
          cache.del(`pbedit:editor_msg_id:${ctx.from.id}`);
        }
      }
      await safeEdit(ctx, displayText, extra);
    }
  }

  // ─── Handler: "➕ ایجاد دکمه" (from reply keyboard when no buttons) ──
  bot.hears('➕ اضافه کردن دکمه جدید', async (ctx: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = cache.get<number>(pendingKey(ctx.from.id, 'editing_post'));
    if (!postId) return;
    cache.set(pendingKey(ctx.from.id, 'editor_state'), 'select_type', 600);
    await ctx.reply('❇️ نوع دکمه را انتخاب کنید:', buildButtonTypeSelectionKeyboard());
  });

  // ─── Keyboard type selection handlers ────────────────────
  bot.hears('🔗 حالت دکمه: لینک یا اشتراک', async (ctx: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = cache.get<number>(pendingKey(ctx.from.id, 'editing_post'));
    if (!postId) return;
    const state = cache.get<string>(pendingKey(ctx.from.id, 'editor_state'));
    if (state !== 'select_type') return;
    cache.set(pendingKey(ctx.from.id, 'previous_view'), state, 600);
    cache.set(pendingKey(ctx.from.id, 'button_type'), 'url', 600);
    cache.set(pendingKey(ctx.from.id, 'editor_mode'), 'create', 600);
    cache.set(pendingKey(ctx.from.id, 'editor_state'), 'wait_color', 600);
    await ctx.reply(
      '🎨 رنگ دکمه را انتخاب کنید:',
      buildButtonColorSelectionKeyboard(),
    );
  });

  bot.hears('🪟 حالت دکمه: صفحه POP-UP', async (ctx: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = cache.get<number>(pendingKey(ctx.from.id, 'editing_post'));
    if (!postId) return;
    const state = cache.get<string>(pendingKey(ctx.from.id, 'editor_state'));
    if (state !== 'select_type') return;
    cache.set(pendingKey(ctx.from.id, 'previous_view'), state, 600);
    cache.set(pendingKey(ctx.from.id, 'button_type'), 'popup', 600);
    cache.set(pendingKey(ctx.from.id, 'editor_mode'), 'create', 600);
    cache.set(pendingKey(ctx.from.id, 'editor_state'), 'wait_color', 600);
    await ctx.reply(
      '🎨 رنگ دکمه را انتخاب کنید:',
      buildButtonColorSelectionKeyboard(),
    );
  });

  bot.hears('⌨️ حالت دکمه: دستور', async (ctx: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = cache.get<number>(pendingKey(ctx.from.id, 'editing_post'));
    if (!postId) return;
    const state = cache.get<string>(pendingKey(ctx.from.id, 'editor_state'));
    if (state !== 'select_type') return;
    cache.set(pendingKey(ctx.from.id, 'previous_view'), state, 600);
    cache.set(pendingKey(ctx.from.id, 'button_type'), 'command', 600);
    cache.set(pendingKey(ctx.from.id, 'editor_mode'), 'create', 600);
    cache.set(pendingKey(ctx.from.id, 'editor_state'), 'wait_color', 600);
    await ctx.reply(
      '🎨 رنگ دکمه را انتخاب کنید:',
      buildButtonColorSelectionKeyboard(),
    );
  });

  // ─── Handler: Text input for new button data ─────────────
  bot.on('text', async (ctx: any, next) => {
    if (!ctx.from) return next();
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin || !isPostAdmin(admin)) return next();
    const postId = cache.get<number>(pendingKey(ctx.from.id, 'editing_post'));
    if (!postId) return next();
    const state = cache.get<string>(pendingKey(ctx.from.id, 'editor_state'));

    // ─── MOVE MODE (button swap with reply keyboard) ─────
    if (state === 'move') {
      const text = ctx.message.text;

      // EXIT — immediate, no DB queries
      if (text === '🚪 خروج از تنظیمات پیام') {
        clearButtonEditorState(ctx.from.id);
        cache.del(`pbedit:editor_msg_id:${ctx.from.id}`);
        delete ctx.session?.pbedit;
        return;
      }

      if (text === '⬆️ بالا' || text === '⬇️ پایین') {
        const row = cache.get<number>(pendingKey(ctx.from.id, 'editor_row'));
        const col = cache.get<number>(pendingKey(ctx.from.id, 'editor_col'));
        if (row === undefined || col === undefined) return ctx.reply('❌ دکمه‌ای انتخاب نشده است.');
        const post = await postService.findById(postId);
        if (!post) return ctx.reply('❌ پست یافت نشد.');
        const messageIdx = cache.get<number>(pendingKey(ctx.from.id, 'editing_message_idx')) ?? 0;
        const buttons: any[][] = JSON.parse(JSON.stringify(getMessageButtons((post as any).buttons, messageIdx)));
        if (!buttons[row] || !buttons[row][col]) return ctx.reply('❌ دکمه یافت نشد.');

        const { newRow, newCol } = moveButtonInLayout(buttons, row, col, text === '⬆️ بالا' ? 'up' : 'down');

        await postService.update(postId, { buttons: setMessageButtons((post as any).buttons, messageIdx, buttons) } as any);
        cache.del(pendingKey(ctx.from.id, 'editor_state'));
        cache.del(pendingKey(ctx.from.id, 'editor_row'));
        cache.del(pendingKey(ctx.from.id, 'editor_col'));
        cache.set(pendingKey(ctx.from.id, 'editor_mode'), 'create', 600);
        await refreshButtonListView(ctx, postId, '🛠 ویرایشگر دکمه‌ها به‌روزرسانی شد\n📌 لیست دکمه‌ها:');
        return;
      }
      if (text === '🔙 بازگشت') {
        cache.del(pendingKey(ctx.from.id, 'editor_row'));
        cache.del(pendingKey(ctx.from.id, 'editor_col'));
        cache.del(pendingKey(ctx.from.id, 'editor_state'));
        cache.set(pendingKey(ctx.from.id, 'editor_mode'), 'create', 600);
        await refreshButtonListView(ctx, postId, '⌨️ جابجایی لغو شد.');
        return;
      }
      return;
    }

    if (!state || !['wait_popup', 'wait_url', 'wait_command', 'wait_color'].includes(state)) return next();

    // ─── WAIT_COLOR state ──────────────────────────────────
    if (state === 'wait_color') {
      if (ctx.message.text === '❌ لغو') {
        cache.del(pendingKey(ctx.from.id, 'editor_state'));
        cache.del(pendingKey(ctx.from.id, 'button_color'));
        cache.del(pendingKey(ctx.from.id, 'button_type'));
        await refreshButtonListView(ctx, postId, '⌨️ عملیات لغو شد.');
        return;
      }

      const colorMap: Record<string, string> = {
        '🔵 Primary (آبی)': 'primary',
        '🟢 Success (سبز)': 'success',
        '🔴 Danger (قرمز)': 'danger',
        '⚪ default': 'default',
      };
      const color = colorMap[ctx.message.text];
      if (!color) {
        await ctx.reply('❌ لطفاً یک رنگ از دکمه‌های زیر انتخاب کنید.', buildButtonColorSelectionKeyboard());
        return;
      }

      const mode = cache.get<string>(pendingKey(ctx.from.id, 'editor_mode'));

      if (mode === 'create') {
        // Store color and proceed to value entry
        cache.set(pendingKey(ctx.from.id, 'button_color'), color, 600);
        const btnType = cache.get<string>(pendingKey(ctx.from.id, 'button_type'));
        if (btnType === 'url') {
          cache.set(pendingKey(ctx.from.id, 'editor_state'), 'wait_url', 600);
          return await ctx.reply(
            '🔗 ❇️ داده ها را برای URL / دکمه اشتراک گذاری وارد کنید.\n\n' +
            'مثال:\n' +
            'اشتراک گذاری کنید\n' +
            'https://t.me/share/url?url=t.me/MenuBuilderHelpBot\n\n' +
            'ℹ️ داده ها در دو خط هستند:\n' +
            '🏷 عنوان دکمه\n' +
            '🌐 آدرس اینترنتی',
            buildCancelOnlyReplyKeyboard(),
          );
        }
        if (btnType === 'popup') {
          cache.set(pendingKey(ctx.from.id, 'editor_state'), 'wait_popup', 600);
          return await ctx.reply(
            '🪟 ❇️ داده های دکمه را با پنجره POP-UP وارد کنید.\n\n' +
            '⚠️ محدودیت تلگرام برای این نوع پیام‌ها 200 کاراکتر است.\n' +
            'ℹ️ داده‌ها می‌توانند در چندین خط باشند:\n\n' +
            '🏷 عنوان دکمه\n' +
            '📝 اولین خط پیام\n' +
            '📝 دومین خط پیام',
            buildCancelOnlyReplyKeyboard(),
          );
        }
        if (btnType === 'command') {
          cache.set(pendingKey(ctx.from.id, 'editor_state'), 'wait_command', 600);
          return await ctx.reply(
            '⌨️ ❇️ داده های دکمه را وارد کنید.\n' +
            'فرمان نباید با "/" شروع شود.\n' +
            'فقط: a-z0-9_\n\n' +
            'مثال:\n' +
            'mycommand\n' +
            'mycommand1\n' +
            'mycommand_1\n\n' +
            'ℹ️ داده ها:\n' +
            '🏷 عنوان دکمه\n' +
            '⌨️ COMMAND',
            buildCancelOnlyReplyKeyboard(),
          );
        }
        // Fallback
        cache.del(pendingKey(ctx.from.id, 'editor_state'));
        cache.del(pendingKey(ctx.from.id, 'button_color'));
        cache.del(pendingKey(ctx.from.id, 'button_type'));
        return await refreshButtonListView(ctx, postId, '❌ نوع دکمه نامشخص است.');
      }

      // Edit mode — directly update button's style
      const row = cache.get<number>(pendingKey(ctx.from.id, 'editor_row'));
      const col = cache.get<number>(pendingKey(ctx.from.id, 'editor_col'));
      if (row === undefined || col === undefined) {
        return await ctx.reply('❌ دکمه‌ای انتخاب نشده است.');
      }
      const messageIdx = cache.get<number>(pendingKey(ctx.from.id, 'editing_message_idx')) ?? 0;
      const post = await postService.findById(postId);
      if (!post) return await ctx.reply('❌ پست یافت نشد.');
      const buttons: any[][] = JSON.parse(JSON.stringify(getMessageButtons((post as any).buttons, messageIdx)));
      if (!buttons[row] || !buttons[row][col]) {
        return await ctx.reply('❌ دکمه یافت نشد.');
      }
      // Preserve existing text/value, update only the style
      buttons[row][col] = { ...buttons[row][col], style: color === 'default' ? undefined : color };
      await postService.update(postId, { buttons: setMessageButtons((post as any).buttons, messageIdx, buttons) } as any);
      cache.del(pendingKey(ctx.from.id, 'editor_state'));
      cache.del(pendingKey(ctx.from.id, 'editor_row'));
      cache.del(pendingKey(ctx.from.id, 'editor_col'));
      cache.del(pendingKey(ctx.from.id, 'button_color'));
      cache.del(pendingKey(ctx.from.id, 'button_type'));
      cache.set(pendingKey(ctx.from.id, 'editor_mode'), 'create', 600);
      await refreshButtonListView(ctx, postId, '🛠 ویرایشگر دکمه‌ها به‌روزرسانی شد\n📌 لیست دکمه‌ها:');
      return;
    }

    if (ctx.message.text === '❌ لغو') {
      cache.del(pendingKey(ctx.from.id, 'editor_state'));
      await refreshButtonListView(ctx, postId, '⌨️ عملیات لغو شد.');
      return;
    }

    const text = ctx.message.text;
    const lines = text.split('\n').map((l: string) => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      await ctx.reply('❌ حداقل دو خط وارد کنید: عنوان و مقدار.', buildCancelOnlyReplyKeyboard());
      return;
    }
    const title = lines[0];
    const value = lines.slice(1).join('\n');

    if (state === 'wait_url') {
      const url = value;
      if (!url.startsWith('http') && !url.startsWith('https') && !url.startsWith('t.me/') && !url.startsWith('tg://')) {
        await ctx.reply('❌ آدرس اینترنتی معتبر نیست. باید با http:// یا https:// یا t.me/ یا tg:// شروع شود.', buildCancelOnlyReplyKeyboard());
        return;
      }
    }

    if (state === 'wait_command') {
      const command = value;
      if (!/^[a-z0-9_]+$/.test(command)) {
        await ctx.reply('❌ دستور نامعتبر است. فقط حروف a-z، اعداد 0-9 و زیرخط (_) مجاز است.', buildCancelOnlyReplyKeyboard());
        return;
      }
    }

    if (state === 'wait_popup') {
      if (value.length > 200) {
        await ctx.reply('❌ متن POP-UP نمی‌تواند بیش از 200 کاراکتر باشد.', buildCancelOnlyReplyKeyboard());
        return;
      }
    }

    const mode = cache.get<string>(pendingKey(ctx.from.id, 'editor_mode'));
    const row = cache.get<number>(pendingKey(ctx.from.id, 'editor_row'));
    const col = cache.get<number>(pendingKey(ctx.from.id, 'editor_col'));
    const messageIdx = cache.get<number>(pendingKey(ctx.from.id, 'editing_message_idx')) ?? 0;
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    const buttons: any[][] = JSON.parse(JSON.stringify(getMessageButtons((post as any).buttons, messageIdx)));

    const buttonColor = cache.get<string>(pendingKey(ctx.from.id, 'button_color'));
    if (mode === 'create') {
      const btn: any = { text: title, type: state === 'wait_popup' ? 'POPUP' : state === 'wait_command' ? 'COMMAND' : 'URL', value };
      if (buttonColor && buttonColor !== 'default') btn.style = buttonColor;
      buttons.push([btn]);
    } else if (mode === 'edit' && row !== undefined && col !== undefined) {
      // Edit existing button
      if (buttons[row] && buttons[row][col]) {
        buttons[row][col] = { text: title, type: state === 'wait_popup' ? 'POPUP' : state === 'wait_command' ? 'COMMAND' : 'URL', value, style: buttons[row][col].style };
      }
    }

    await postService.update(postId, { buttons: setMessageButtons((post as any).buttons, messageIdx, buttons) } as any);
    cache.del(pendingKey(ctx.from.id, 'editor_state'));
    cache.del(pendingKey(ctx.from.id, 'editor_row'));
    cache.del(pendingKey(ctx.from.id, 'editor_col'));
    cache.del(pendingKey(ctx.from.id, 'button_color'));
    cache.del(pendingKey(ctx.from.id, 'button_type'));
    cache.set(pendingKey(ctx.from.id, 'editor_mode'), 'create', 600);
    await refreshButtonListView(ctx, postId, '🛠 ویرایشگر دکمه‌ها به‌روزرسانی شد\n📌 لیست دکمه‌ها:');
  });

  // ─── Handler: Click on a button ──────────────────────────
  // Mode-based behavior:
  //   create (default) → adds a new default button immediately below clicked one
  //   edit → shows type-selection inline keyboard
  //   delete → deletes the clicked button and re-renders
  //   move → selects the button, shows ⬆️/⬇️/🔙 reply keyboard
  bot.action(/^pbedit:click:(\d+):(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    const col = parseInt(ctx.match[3]);
    const post = await postService.findById(postId);
    if (!post) return safeEdit(ctx, '❌ پست یافت نشد.');
    const messageIdx = cache.get<number>(pendingKey(ctx.from.id, 'editing_message_idx')) ?? 0;
    const buttons: any[][] = JSON.parse(JSON.stringify(getMessageButtons((post as any).buttons, messageIdx)));
    const mode = cache.get<string>(pendingKey(ctx.from.id, 'editor_mode')) || 'create';

    if (mode === 'move') {
      const srcRow = cache.get<number>(pendingKey(ctx.from.id, 'editor_row'));
      const srcCol = cache.get<number>(pendingKey(ctx.from.id, 'editor_col'));
      if (srcRow === undefined || srcCol === undefined) {
        // First click — select source button, enter move sub-state with reply keyboard
        cache.set(pendingKey(ctx.from.id, 'editor_row'), row, 600);
        cache.set(pendingKey(ctx.from.id, 'editor_col'), col, 600);
        cache.set(pendingKey(ctx.from.id, 'editor_state'), 'move', 600);
        await safeEdit(ctx,
          `📍 ${buttons[row][col].text} انتخاب شد.\n⬆️ یا ⬇️ را برای جابجایی انتخاب کنید.`,
          buildButtonListInlineKeyboard(postId, buttons, 'move'));
        await ctx.reply('🔀 حالت جابجایی:', postMoveModeReplyKeyboard());
      } else {
        // User clicked a different button — update selection
        cache.set(pendingKey(ctx.from.id, 'editor_row'), row, 600);
        cache.set(pendingKey(ctx.from.id, 'editor_col'), col, 600);
        await safeEdit(ctx,
          `📍 ${buttons[row][col].text} انتخاب شد.\n⬆️ یا ⬇️ را برای جابجایی انتخاب کنید.`,
          buildButtonListInlineKeyboard(postId, buttons, 'move'));
      }
      return;
    }

    if (mode === 'delete') {
      // Delete the clicked button
      if (buttons[row] && buttons[row][col] !== undefined) {
        const deletedText = buttons[row][col].text || '';
        buttons[row].splice(col, 1);
        if (buttons[row].length === 0) buttons.splice(row, 1);
        await postService.update(postId, { buttons: setMessageButtons((post as any).buttons, messageIdx, buttons) } as any);
        cache.del(pendingKey(ctx.from.id, 'editor_state'));
        cache.del(pendingKey(ctx.from.id, 'editor_row'));
        cache.del(pendingKey(ctx.from.id, 'editor_col'));
        cache.set(pendingKey(ctx.from.id, 'editor_mode'), 'create', 600);
        await refreshButtonListView(ctx, postId, '🛠 ویرایشگر دکمه‌ها به‌روزرسانی شد\n📌 لیست دکمه‌ها:');
      }
      return;
    }

    if (mode === 'edit') {
      // Show edit type selection for the clicked button
      const btn = buttons[row]?.[col];
      if (!btn) return safeEdit(ctx, '❌ دکمه یافت نشد.');
      cache.set(pendingKey(ctx.from.id, 'editor_row'), row, 600);
      cache.set(pendingKey(ctx.from.id, 'editor_col'), col, 600);
      cache.set(pendingKey(ctx.from.id, 'editor_mode'), 'edit', 600);
      const currentType = btn.type === 'POPUP' ? '🪟 POP-UP' : btn.type === 'COMMAND' ? '⌨️ دستور' : '🔗 لینک';
      const colorText = btn.style && btn.style !== 'default' ? `🎨 ${btn.style}` : '⚪ بدون رنگ';
      await safeEdit(ctx,
        `🔧 شما در حالت تنظیمات پیام هستید.\n❇️ حالت دکمه را انتخاب کنید.\n\nℹ️ مقدار فعلی:\n${currentType}\n${btn.text}: ${btn.value || ''}\n${colorText}`,
        buildEditButtonTypeKeyboard(postId, row, col, btn.style));
      return;
    }

    // Default: create mode — add a new default button in a new row below clicked row
    buttons.splice(row + 1, 0, [{ text: 'دکمه جدید', type: 'URL', value: '' }]);
    await postService.update(postId, { buttons: setMessageButtons((post as any).buttons, messageIdx, buttons) } as any);
    await refreshButtonListView(ctx, postId, '🛠 ویرایشگر دکمه‌ها به‌روزرسانی شد\n📌 لیست دکمه‌ها:');
    return;
  });

  // ─── Handler: Set mode (create / edit / delete / move) ──
  bot.action(/^pbedit:mode:(create|edit|delete|move):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const mode = ctx.match[1];
    const postId = parseInt(ctx.match[2]);
    const post = await postService.findById(postId);
    if (!post) return safeEdit(ctx, '❌ پست یافت نشد.');
    const messageIdx = cache.get<number>(pendingKey(ctx.from.id, 'editing_message_idx')) ?? 0;
    const buttons: any[][] = JSON.parse(JSON.stringify(getMessageButtons((post as any).buttons, messageIdx)));

    cache.set(pendingKey(ctx.from.id, 'editor_mode'), mode, 600);
    cache.del(pendingKey(ctx.from.id, 'editor_state'));
    cache.del(pendingKey(ctx.from.id, 'editor_row'));
    cache.del(pendingKey(ctx.from.id, 'editor_col'));

    const label: Record<string, string> = {
      create: '➕ حالت ایجاد دکمه — روی یک دکمه ضربه بزنید تا دکمه جدید بعد از آن اضافه شود.',
      edit: '✏️ روی دکمه مورد نظر برای ویرایش کلیک کنید.',
      delete: '🗑 روی دکمه مورد نظر برای حذف کلیک کنید.',
      move: '🔀 روی دکمه مورد نظر برای جابجایی کلیک کنید.',
    };
    await safeEdit(ctx, label[mode] || '', buildButtonListInlineKeyboard(postId, buttons, mode as any));
  });

  // ─── Handler: Select edit button type ──────────────────
  bot.action(/^pbedit:type:(url|popup|command):(\d+):(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const btnType = ctx.match[1];
    const postId = parseInt(ctx.match[2]);
    const row = parseInt(ctx.match[3]);
    const col = parseInt(ctx.match[4]);
    const currentMode = cache.get<string>(pendingKey(ctx.from.id, 'editor_mode')) || 'edit';
    cache.set(pendingKey(ctx.from.id, 'previous_view'), currentMode, 600);
    cache.set(pendingKey(ctx.from.id, 'editor_state'), `wait_${btnType}`, 600);
    cache.set(pendingKey(ctx.from.id, 'editor_mode'), 'edit', 600);
    cache.set(pendingKey(ctx.from.id, 'editor_row'), row, 600);
    cache.set(pendingKey(ctx.from.id, 'editor_col'), col, 600);

    const messages: Record<string, string> = {
      url: '🔗 داده های جدید را برای URL / دکمه اشتراک گذاری وارد کنید:\n\n🏷 عنوان دکمه\n🌐 آدرس جدید',
      popup: '🪟 داده های جدید را برای POP-UP وارد کنید:\n\n🏷 عنوان دکمه\n📝 محتوای جدید',
      command: '⌨️ داده های جدید را برای دستور وارد کنید:\n\n🏷 عنوان دکمه\n⌨️ COMMAND جدید',
    };
    await ctx.reply(messages[btnType] || '', buildCancelOnlyReplyKeyboard());
  });

  bot.action(/^pbedit:type:cancel:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const prevMode = cache.get<string>(pendingKey(ctx.from.id, 'previous_view')) || 'create';
    cache.set(pendingKey(ctx.from.id, 'editor_mode'), prevMode, 600);
    cache.del(pendingKey(ctx.from.id, 'editor_state'));
    cache.del(pendingKey(ctx.from.id, 'editor_row'));
    cache.del(pendingKey(ctx.from.id, 'editor_col'));
    cache.del(pendingKey(ctx.from.id, 'previous_view'));
    await refreshButtonListView(ctx, postId, '⌨️ عملیات لغو شد.');
  });

  // ─── Handler: Select button color ─────────────────────────
  bot.action(/^pbedit:color:(\d+):(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    const col = parseInt(ctx.match[3]);
    cache.set(pendingKey(ctx.from.id, 'editor_state'), 'wait_color', 600);
    cache.set(pendingKey(ctx.from.id, 'editor_row'), row, 600);
    cache.set(pendingKey(ctx.from.id, 'editor_col'), col, 600);
    await ctx.reply('🎨 رنگ دکمه را انتخاب کنید:', buildButtonColorSelectionKeyboard());
  });

  // ─── Handler: Add new row (from pbedit:addrow inline button) ──
  bot.action(/^pbedit:addrow:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const realPostId = cache.get<number>(pendingKey(ctx.from.id, 'editing_post')) || postId;
    const post = await postService.findById(realPostId);
    if (!post) return safeEdit(ctx, '❌ پست یافت نشد.');
    const messageIdx = cache.get<number>(pendingKey(ctx.from.id, 'editing_message_idx')) ?? 0;
    const buttons: any[][] = JSON.parse(JSON.stringify(getMessageButtons((post as any).buttons, messageIdx)));
    buttons.push([{ text: 'دکمه جدید', type: 'URL', value: '' }]);
    await postService.update(realPostId, { buttons: setMessageButtons((post as any).buttons, messageIdx, buttons) } as any);
    cache.set(pendingKey(ctx.from.id, 'editor_mode'), 'create', 600);
    cache.del(pendingKey(ctx.from.id, 'editor_state'));
    cache.del(pendingKey(ctx.from.id, 'editor_row'));
    cache.del(pendingKey(ctx.from.id, 'editor_col'));
    await refreshButtonListView(ctx, realPostId, '🛠 ویرایشگر دکمه‌ها به‌روزرسانی شد\n📌 لیست دکمه‌ها:');
    cache.set(pendingKey(ctx.from.id, 'editor_state'), 'select_type', 600);
    cache.set(pendingKey(ctx.from.id, 'editor_row'), buttons.length - 1, 600);
    cache.set(pendingKey(ctx.from.id, 'editor_col'), 0, 600);
    await ctx.reply('✅ ردیف جدید اضافه شد.\n❇️ نوع دکمه را انتخاب کنید:', buildButtonTypeSelectionKeyboard());
  });


  bot.hears('🚪 خروج از تنظیمات پیام', async (ctx: any) => {
    clearButtonEditorState(ctx.from.id);
    delete ctx.session?.pbedit;
    return ctx.reply('📝 سامانه مدیریت پست‌ها', postMainMenuKeyboard());
  });

  // ═══════════════════════════════════════════════════════════
  // ─── Post Manager Inline Keyboard Callbacks ───────────────
  // These operate on the post info message using inline keyboards
  // and work for ALL posts regardless of publish status.
  // ═══════════════════════════════════════════════════════════

  // Helper: edit or re-show the post info message with action keyboard
  async function showPostInfo(ctx: any, post: any) {
    const text = formatPostInfoPersian(post);
    try {
      await ctx.editMessageText(text, {
        parse_mode: 'Markdown' as any,
        link_preview_options: { is_disabled: true } as any,
        ...postInfoActionKeyboard(post),
      });
    } catch (e: any) {
      logger.debug('[PostManager] showPostInfo fallback:', e.message);
      await ctx.reply(text, {
        parse_mode: 'Markdown' as any,
        link_preview_options: { is_disabled: true } as any,
        ...postInfoActionKeyboard(post),
      });
    }
  }

  // ✏️ ویرایش: Switch to edit mode (ReplyKeyboard)
  // Works for ALL posts regardless of status (Published, Draft, Archived, Hidden, Scheduled)
  bot.action(/^post:manager:edit:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    clearEditorKeyState(ctx.from.id);
    const postId = parseInt(ctx.match[1]);
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    cache.set(pendingKey(ctx.from.id, 'edit_mode'), postId, 300);
    const text = formatPostInfoPersian(post) + '\n\n✏️ در حالت ویرایش. گزینه مورد نظر را انتخاب کنید:';
    try {
      await ctx.editMessageText(text, {
        parse_mode: 'Markdown' as any,
        link_preview_options: { is_disabled: true } as any,
      });
    } catch (e: any) {
      logger.debug('[PostManager] Edit mode fallback:', e.message);
    }
    await ctx.reply('✏️ حالت ویرایش:', postEditModeReplyKeyboard());
  });

  // ═══════════════════════════════════════════════════════════
  // ─── Edit Mode ReplyKeyboard Handlers ─────────────────────
  // These hears handlers fire when user is in edit mode and clicks an option.
  // ═══════════════════════════════════════════════════════════

  async function showEditMode(ctx: any, postId: number) {
    clearEditorKeyState(ctx.from.id);
    const post = await postService.findById(postId);
    if (!post) {
      await ctx.reply('❌ پست یافت نشد.');
      return;
    }
    cache.set(pendingKey(ctx.from.id, 'edit_mode'), postId, 300);
    await ctx.reply(formatPostInfoPersian(post), {
      parse_mode: 'Markdown' as any,
      link_preview_options: { is_disabled: true } as any,
    });
    await ctx.reply('✏️ حالت ویرایش:', postEditModeReplyKeyboard());
  }

  // 📝 ویرایش محتوا
  bot.hears('📝 ویرایش محتوا', async (ctx: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = cache.get<number>(pendingKey(ctx.from.id, 'edit_mode'));
    if (!postId) return;
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    cache.set(pendingKey(ctx.from.id, 'editing_field'), 'content', 300);
    cache.set(pendingKey(ctx.from.id, 'editing_post'), postId, 300);
    const current = post.content ? `محتوا فعلی:\n${graphemeTruncate(post.content, 200)}` : '(بدون محتوا)';
    await ctx.reply(`📝 ${current}\n\nمحتوای جدید را ارسال کنید (Markdown پشتیبانی می‌شود):`);
  });

  // 🏷 ویرایش عنوان
  bot.hears('🏷 ویرایش عنوان', async (ctx: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = cache.get<number>(pendingKey(ctx.from.id, 'edit_mode'));
    if (!postId) return;
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    cache.set(pendingKey(ctx.from.id, 'editing_field'), 'title', 300);
    cache.set(pendingKey(ctx.from.id, 'editing_post'), postId, 300);
    await ctx.reply(`✏ عنوان فعلی: *${post.title}*\n\nعنوان جدید را ارسال کنید:`, { parse_mode: 'Markdown' as any });
  });

  // 🔘 ویرایش دکمه‌ها
  bot.hears('🔘 ویرایش دکمه‌ها', async (ctx: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = cache.get<number>(pendingKey(ctx.from.id, 'edit_mode'));
    if (!postId) return;
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    cache.del(pendingKey(ctx.from.id, 'edit_mode'));
    clearButtonEditorState(ctx.from.id);
    cache.set(pendingKey(ctx.from.id, 'editing_post'), postId, 600);
    cache.set(pendingKey(ctx.from.id, 'editing_message_idx'), 0, 600);
    cache.set(pendingKey(ctx.from.id, 'edit_mode'), postId, 300);
    cache.set(pendingKey(ctx.from.id, 'editor_mode'), 'create', 600);
    cache.del(pendingKey(ctx.from.id, 'editor_state'));
    const buttons = getMessageButtons((post as any).buttons, 0);
    if (!buttons.length || buttons.every((r: any[]) => !r || !r.length)) {
      const sent = await ctx.reply('⌨ ویرایشگر دکمه:\nهنوز دکمه‌ای وجود ندارد. یک دکمه جدید ایجاد کنید.', buildNoButtonsReplyKeyboard());
      if (sent) cache.set(`pbedit:editor_msg_id:${ctx.from.id}`, sent.message_id, 600);
    } else {
      const exitKB = buildButtonEditorExitKeyboard();
      const listKB = buildButtonListInlineKeyboard(postId, buttons, 'create');
      const sent = await ctx.reply('⌨ ویرایشگر دکمه:', {
        reply_markup: {
          ...(listKB.reply_markup || {}),
          ...(exitKB.reply_markup || {}),
        },
      });
      if (sent) cache.set(`pbedit:editor_msg_id:${ctx.from.id}`, sent.message_id, 600);
    }
  });

  // 🖼 ویرایش رسانه
  bot.hears('🖼 ویرایش رسانه', async (ctx: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = cache.get<number>(pendingKey(ctx.from.id, 'edit_mode'));
    if (!postId) return;
    cache.set(pendingKey(ctx.from.id, 'editing_field'), 'media', 300);
    cache.set(pendingKey(ctx.from.id, 'editing_post'), postId, 300);
    await ctx.reply('🖼 فایل رسانه ارسال کنید (عکس، ویدیو، گیف، سند، صدا، ویس):');
  });

  // 🚀 تغییر وضعیت انتشار (toggle between Published and Draft)
  bot.hears('🚀 تغییر وضعیت انتشار', async (ctx: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = cache.get<number>(pendingKey(ctx.from.id, 'edit_mode'));
    if (!postId) return;
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    const isPublished = post.status === 'PUBLISHED' && post.isPublished;
    if (isPublished) {
      await postService.unpublish(postId);
      await ctx.reply('📥 انتشار پست لغو شد. به حالت پیش‌نویس برگشت.');
    } else {
      await postService.publish(postId, BigInt(ctx.from.id));
      await ctx.reply('✅ پست با موفقیت منتشر شد.');
    }
    await showEditMode(ctx, postId);
  });

  // ➕ افزودن دستور
  bot.hears('➕ افزودن دستور', async (ctx: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = cache.get<number>(pendingKey(ctx.from.id, 'edit_mode'));
    if (!postId) return;
    cache.set(pendingKey(ctx.from.id, 'editing_cmd'), true, 300);
    cache.set(pendingKey(ctx.from.id, 'editing_post'), postId, 300);
    await ctx.reply('🔗 نام دستور را ارسال کنید (بدون /):\nmثلاً \`sgb/discount/rules\`', { parse_mode: 'Markdown' as any });
  });

  // 🗑 حذف پست: Ask confirmation, then delete, clear cache, go back to post list
  bot.hears('🗑 حذف پست', async (ctx: any, next: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = cache.get<number>(pendingKey(ctx.from.id, 'edit_mode'));
    if (!postId) return next();
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    cache.set(pendingKey(ctx.from.id, 'delete_post_id'), postId, 600);
    await ctx.reply(
      '⚠️ آیا از حذف کامل این پست مطمئن هستید؟\n' +
      'این عملیات غیرقابل بازگشت است.\n\n' +
      'تمام موارد زیر حذف خواهند شد:\n' +
      '📝 اطلاعات پست\n' +
      '⌨️ دکمه‌ها\n' +
      '🏷 دستورات\n' +
      '🖼 مدیاهای وابسته\n' +
      '🔗 ارتباطات\n' +
      '📦 کش‌های مربوط\n\n' +
      '❗ این عملیات قابل بازیابی نیست.',
      Markup.keyboard([
        ['✅ تایید حذف'],
        ['❌ انصراف'],
      ]).resize().persistent(),
    );
  });

  // ✅ تایید حذف: Execute the delete with full cleanup
  bot.hears('✅ تایید حذف', async (ctx: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = cache.get<number>(pendingKey(ctx.from.id, 'delete_post_id'));
    if (!postId) return ctx.reply('❌ درخواست حذف یافت نشد.');
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    try {
      await postService.delete(postId);
      cache.del(pendingKey(ctx.from.id, 'delete_post_id'));
      cache.del(pendingKey(ctx.from.id, 'edit_mode'));
      cache.del(pendingKey(ctx.from.id, 'editor_state'));
      cache.del(pendingKey(ctx.from.id, 'editor_mode'));
      cache.del(pendingKey(ctx.from.id, 'editor_row'));
      cache.del(pendingKey(ctx.from.id, 'editor_col'));
      cache.del(pendingKey(ctx.from.id, 'editing_post'));
      cache.del(pendingKey(ctx.from.id, 'editing_field'));
      clearEditorKeyState(ctx.from.id);
      await ctx.reply(
        '✅ پست با موفقیت حذف شد.\n' +
        '🗑 تمامی اطلاعات وابسته نیز حذف شدند.\n' +
        '🔄 منو بروزرسانی شد.',
      );
      await showPostListFromLayout(ctx);
    } catch (err: any) {
      logger.error(`[DeletePost] Failed to delete post ${postId}: ${err.message}`, { postId, userId: ctx.from?.id });
      await ctx.reply('❌ خطا در حذف پست. لطفاً دوباره تلاش کنید.');
      await showEditMode(ctx, postId);
    }
  });

  // ❌ انصراف: Cancel delete, return to edit mode
  bot.hears('❌ انصراف', async (ctx: any, next: any) => {
    if (!ctx.from) return next();
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin || !isPostAdmin(admin)) return next();
    const postId = cache.get<number>(pendingKey(ctx.from.id, 'delete_post_id'));
    if (!postId) return next();
    cache.del(pendingKey(ctx.from.id, 'delete_post_id'));
    await ctx.reply('✅ عملیات حذف لغو شد. هیچ تغییری اعمال نشد.');
    await showEditMode(ctx, postId);
  });

  // 🔙 بازگشت: Handle back in both editor mode and edit mode
  bot.hears('🔙 بازگشت', async (ctx: any, next: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;

    // Check if in multi-message editor
    const editorPostId = cache.get<number>(editorKey(ctx.from.id, 'active'));
    if (editorPostId) {
      const mode = cache.get<string>(editorKey(ctx.from.id, 'mode')) || 'main';

      // New post manager mode → return to post main menu
      if (mode === 'new_post_manager') {
        clearAllWaitingStates(ctx.from.id);
        clearEditorKeyState(ctx.from.id);
        cache.del(editorKey(ctx.from.id, 'active'));
        cache.del(editorKey(ctx.from.id, 'mode'));
        await ctx.reply('📝 سامانه مدیریت پست‌ها', postMainMenuKeyboard());
        return;
      }

      if (mode === 'add_message' || mode === 'add_command' || mode === 'edit_message' || mode === 'edit_content' || mode === 'edit_title') {
        cache.set(editorKey(ctx.from.id, 'mode'), 'main', 600);
        cache.del(editorKey(ctx.from.id, 'msg_idx'));
        try {
          const post = await postService.findById(editorPostId);
          if (post) await refreshEditorMessages(ctx, post);
        } catch (e: any) {
          logger.error(`[BackHandler] Failed to refresh editor for post ${editorPostId}: ${e.message}`, { postId: editorPostId, userId: ctx.from?.id });
        }
        return;
      }
      // In main editor mode → back exits to post list
      cache.del(editorKey(ctx.from.id, 'active'));
      cache.del(editorKey(ctx.from.id, 'mode'));
      cache.del(editorKey(ctx.from.id, 'msg_idx'));
      cache.del(editorKey(ctx.from.id, 'message_ids'));
      await showPostListFromLayout(ctx);
      return;
    }

    const postId = cache.get<number>(pendingKey(ctx.from.id, 'edit_mode'));
    if (!postId) return next();
    cache.del(pendingKey(ctx.from.id, 'edit_mode'));
    cache.del(pendingKey(ctx.from.id, 'delete_post_id'));
    cache.del(pendingKey(ctx.from.id, 'editor_state'));
    cache.del(pendingKey(ctx.from.id, 'editor_mode'));
    cache.del(pendingKey(ctx.from.id, 'editor_row'));
    cache.del(pendingKey(ctx.from.id, 'editor_col'));
    cache.del(pendingKey(ctx.from.id, 'editing_post'));
    cache.del(pendingKey(ctx.from.id, 'editing_field'));
    clearEditorKeyState(ctx.from.id);
    await showPostListFromLayout(ctx);
  });

  // 📥 لغو انتشار / 📤 انتشار: Toggle publish status, then refresh post info
  bot.action(/^post:manager:unpublish:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const current = await postService.findById(postId);
    if (!current) return ctx.reply('❌ پست یافت نشد.');
    const isPublished = current.isPublished && current.status === 'PUBLISHED';
    if (isPublished) {
      await postService.unpublish(postId);
    } else {
      await postService.publish(postId);
    }
    const post = await postService.findById(postId);
    if (post) await showPostInfo(ctx, post);
  });

  // 📊 آمار: Show analytics with back button to new action keyboard
  bot.action(/^post:manager:stats:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    const analytics = await postService.getAnalytics(postId);
    const text = [
      `📊 *آمار: ${post.title}*`,
      '',
      `👁 بازدید کل: ${analytics.totalViews}`,
      `👆 کلیک کل: ${analytics.totalClicks}`,
      `👤 کاربران منحصربه‌فرد: ${analytics.uniqueUsers}`,
      '',
      '📈 بازدید روزانه (۳۰ روز اخیر):',
      ...analytics.dailyViews.slice(-7).map((d: any) => `  ${d.date}: ${d.count} بازدید`),
    ].join('\n');
    try {
      await ctx.editMessageText(text, {
        parse_mode: 'Markdown' as any,
        link_preview_options: { is_disabled: true } as any,
        ...postManagerAnalyticsKeyboard(postId),
      });
    } catch (e: any) {
      await ctx.reply(text, {
        parse_mode: 'Markdown' as any,
        link_preview_options: { is_disabled: true } as any,
        ...postManagerAnalyticsKeyboard(postId),
      });
    }
  });

  // 🙈 مخفی کردن: Toggle hide/show, then refresh post info
  bot.action(/^post:manager:hide:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    if (post.slug === '__start__') return ctx.reply('❌ پیام Start قابل مخفی‌سازی نیست.');
    const wasHidden = post.status === 'HIDDEN';
    if (wasHidden) {
      await postService.show(postId);
    } else {
      await postService.hide(postId);
    }
    const updated = await postService.findById(postId);
    if (updated) await showPostInfo(ctx, updated);
  });

  // 📦 بایگانی: Archive, then refresh post info
  bot.action(/^post:manager:archive:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    if (post.slug === '__start__') return ctx.reply('❌ پیام Start قابل بایگانی نیست.');
    await postService.archive(postId);
    const updated = await postService.findById(postId);
    if (updated) await showPostInfo(ctx, updated);
  });

  // 🗑 حذف پست: Ask confirmation, then delete, return to posts list
  bot.action(/^post:manager:delete:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    if (post.slug === '__start__') return ctx.reply('❌ پیام Start قابل حذف نیست.');
    const text = `🗑 آیا از حذف "${post.title}" مطمئن هستید؟\n\nاین پست از منو و لیست پست‌ها حذف خواهد شد.`;
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('✅ بله، حذف شود', `post:manager:delete:confirm:${postId}`)],
      [Markup.button.callback('❌ انصراف', `post:manager:cancel:${postId}`)],
    ]);
    try { await ctx.editMessageText(text, keyboard); } catch { await ctx.reply(text, keyboard); }
  });

  bot.action(/^post:manager:delete:confirm:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    if (post.slug === '__start__') return ctx.reply('❌ پیام Start قابل حذف نیست.');
    await postService.delete(postId);
    try { await ctx.editMessageText('🗑 پست حذف شد.'); } catch { await ctx.reply('🗑 پست حذف شد.'); }
    await showPostListFromLayout(ctx);
  });

  // 🔥 حذف دائمی: Confirm then fully remove post from all tables
  bot.action(/^post:manager:harddelete:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    if (post.slug === '__start__') return ctx.reply('❌ پیام Start قابل حذف نیست.');
    const text = `⚠️ *حذف دائمی*\n\nآیا از حذف دائمی "${post.title}" مطمئن هستید؟\n\nاین عملیات قابل بازگشت نیست و پست به طور کامل از تمام جداول دیتابیس حذف خواهد شد.`;
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔥 بله، حذف دائمی شود', `post:manager:harddelete:confirm:${postId}`)],
      [Markup.button.callback('❌ انصراف', `post:manager:cancel:${postId}`)],
    ]);
    try { await ctx.editMessageText(text, { parse_mode: 'Markdown' as any, ...keyboard }); } catch { await ctx.reply(text, { parse_mode: 'Markdown' as any, ...keyboard }); }
  });

  bot.action(/^post:manager:harddelete:confirm:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    if (post.slug === '__start__') return ctx.reply('❌ پیام Start قابل حذف نیست.');
    await postService.delete(postId);
    try { await ctx.editMessageText('🔥 پست به طور دائمی حذف شد.'); } catch { await ctx.reply('🔥 پست به طور دائمی حذف شد.'); }
    await showPostListFromLayout(ctx);
  });

  // Cancel delete confirmation → show post info again
  bot.action(/^post:manager:cancel:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const post = await postService.findById(postId);
    if (post) await showPostInfo(ctx, post);
  });

  // ⬅️ بازگشت به عملیات: Go back to normal action keyboard from edit mode
  bot.action(/^post:manager:backtomain:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const post = await postService.findById(postId);
    if (post) await showPostInfo(ctx, post);
  });

  // ↩️ بازگشت: Go back to post list (reply keyboard, so send as new message)
  bot.action(/^post:manager:back:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    await showPostListFromLayout(ctx);
  });

  // ─── Back to Admin Panel ───────────────────────────────
  bot.hears('↩️ بازگشت به پنل ادمین', async (ctx: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    await adminMainMenu(ctx);
  });

  // ─── Published Posts in Main Menu ───────────────────────
  // This is handled by modifying buildMainMenuKeyboard in keyboards/index.ts

  // ═══════════════════════════════════════════════════════════
  // ─── Multi-Message Editor ─────────────────────────────────
  // ═══════════════════════════════════════════════════════════

  // ─── Helper: Show post list from menu layout ────────────
  async function showPostListFromLayout(ctx: any) {
    clearEditorKeyState(ctx.from.id);
    const layout = await settingsService.getResolvedMenuLayout(false);
    const drafts = await postService.getDrafts();
    const postButtons = layout.flat().filter((btn: any) => btn?.ref?.startsWith('post:'));
    if (postButtons.length === 0 && drafts.length === 0) {
      return ctx.reply('📋 پستی در منو وجود ندارد. ابتدا پست را در ویرایش منو اضافه کنید.', postMainMenuKeyboard());
    }
    cache.set(`post_mgmt_mode:${ctx.from.id}`, true, 300);
    await ctx.reply('📋 روی عنوان پست مورد نظر ضربه بزنید:', buildPostListFromMenuLayout(layout, drafts));
  }

  // ─── Clear all waiting states ───────────────────────────
  function clearAllWaitingStates(userId: number) {
    const keys = [
      'editing_cmd', 'editing_post', 'editing_field', 'editing_button',
      'schedule_publish', 'schedule_unpublish', 'alias_cmd_id',
      'searching', 'preview_id', 'publish_id', 'analytics_id',
      'import_title', 'import_post', 'creating', 'edit_mode',
    ];
    for (const k of keys) cache.del(pendingKey(userId, k));
  }

  async function enterPostEditor(ctx: any, post: any) {
    const postId = post.id;
    const trace = traceLogger();
    trace.info(`enterPostEditor postId=${postId} userId=${ctx.from?.id}`);

    clearAllWaitingStates(ctx.from.id);
    cache.set(editorKey(ctx.from.id, 'active'), postId, 600);
    cache.set(editorKey(ctx.from.id, 'mode'), 'main', 600);
    cache.del(editorKey(ctx.from.id, 'msg_idx'));
    cache.del(editorKey(ctx.from.id, 'message_ids'));
    cache.del(editorKey(ctx.from.id, 'forward_on'));

    try {
      await refreshEditorMessages(ctx, post);
      trace.info(`enterPostEditor OK postId=${postId} duration=${trace.duration()}ms`);
    } catch (e: any) {
      trace.error(`enterPostEditor FAILED postId=${postId} error=${e.message}`);
      cache.del(editorKey(ctx.from.id, 'active'));
      cache.del(editorKey(ctx.from.id, 'mode'));
      cache.del(editorKey(ctx.from.id, 'msg_idx'));
      cache.del(editorKey(ctx.from.id, 'message_ids'));
      cache.del(editorKey(ctx.from.id, 'forward_on'));
      try { await ctx.reply('❌ خطا در نمایش ویرایشگر. لطفاً دوباره تلاش کنید.'); } catch (_) {}
    }
  }

  async function refreshEditorMessages(ctx: any, post: any) {
    const postId = post.id;
    const content = post.content || '';
    const messages = parsePostMessages(content);

    const oldMsgIds = cache.get<number[]>(editorKey(ctx.from.id, 'message_ids')) || [];
    for (const msgId of oldMsgIds) {
      try { await ctx.deleteMessage(msgId); } catch (e) {}
    }

    try {
      await ctx.reply(`📝 ${post.title} | ✏️ ویرایشگر (${messages.length} پیام)`, {
        link_preview_options: { is_disabled: true },
        ...postMultiMessageEditorReplyKeyboard(post.isPublished, post.slug === '__start__'),
      });
    } catch (e: any) {
      await ctx.reply(`📝 ${post.title} | ✏️ ویرایشگر (${messages.length} پیام)`, {
        ...postMultiMessageEditorReplyKeyboard(post.isPublished, post.slug === '__start__'),
      });
    }

    const newMsgIds: number[] = [];
    for (let i = 0; i < messages.length; i++) {
      const msgText = messages[i];
      const label = `📨 *پیام ${i + 1} از ${messages.length}*`;
      try {
        const sent = await ctx.reply(`${label}\n\n${msgText}`, {
          parse_mode: 'Markdown',
          link_preview_options: { is_disabled: true },
          ...postSingleMessageInlineKeyboard(postId, i, messages.length),
        });
        if (sent) newMsgIds.push(sent.message_id);
      } catch (e) {
        const sent = await ctx.reply(`${label}\n\n${msgText}`, {
          ...postSingleMessageInlineKeyboard(postId, i, messages.length),
        });
        if (sent) newMsgIds.push(sent.message_id);
      }
    }
    cache.set(editorKey(ctx.from.id, 'message_ids'), newMsgIds, 600);
  }

  async function deleteAllEditorMessages(ctx: any) {
    const oldMsgIds = cache.get<number[]>(editorKey(ctx.from.id, 'message_ids')) || [];
    for (const msgId of oldMsgIds) {
      try { await ctx.deleteMessage(msgId); } catch (e) {}
    }
    cache.del(editorKey(ctx.from.id, 'active'));
    cache.del(editorKey(ctx.from.id, 'mode'));
    cache.del(editorKey(ctx.from.id, 'msg_idx'));
    cache.del(editorKey(ctx.from.id, 'message_ids'));
    cache.del(editorKey(ctx.from.id, 'forward_on'));
  }

  // ─── Per-Message Callbacks ─────────────────────────────

  bot.action(/^post:msg:edit:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const msgIdx = parseInt(ctx.match[2]);
    cache.set(editorKey(ctx.from.id, 'active'), postId, 600);
    cache.set(editorKey(ctx.from.id, 'mode'), 'edit_message', 600);
    cache.set(editorKey(ctx.from.id, 'msg_idx'), msgIdx, 600);
    try {
      const post = await postService.findById(postId);
      if (!post) return ctx.reply('❌ پست یافت نشد.');
      const messages = parsePostMessages(post.content || '');
      const msgText = messages[msgIdx] || '(بدون محتوا)';
      await ctx.reply(`✏️ ویرایش پیام ${msgIdx + 1}:\n\n${msgText}`, {
        ...postEditMessageReplyKeyboard(),
      });
    } catch (e: any) {
      logger.error(`[MsgEdit] Failed postId=${postId} msgIdx=${msgIdx}: ${e.message}`, { postId, msgIdx, userId: ctx.from?.id });
      cache.set(editorKey(ctx.from.id, 'mode'), 'main', 600);
      cache.del(editorKey(ctx.from.id, 'msg_idx'));
      try { await ctx.reply('❌ خطا در ویرایش پیام. لطفاً دوباره تلاش کنید.'); } catch (_) {}
    }
  });

  bot.action(/^post:msg:delete:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const msgIdx = parseInt(ctx.match[2]);
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    const messages = parsePostMessages(post.content || '');
    if (msgIdx < 0 || msgIdx >= messages.length) return ctx.reply('❌ پیام یافت نشد.');
    const updateData: any = { updatedBy: BigInt(ctx.from.id) };
    if (messages.length <= 1) {
      updateData.content = '';
    } else {
      messages.splice(msgIdx, 1);
      updateData.content = serializePostMessages(messages);
    }
    updateData.buttons = removeMessageButtons((post as any).buttons, msgIdx);
    await postService.update(postId, updateData);
    const updated = await postService.findById(postId);
    if (updated) await refreshEditorMessages(ctx, updated);
  });

  bot.action(/^post:msg:up:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const msgIdx = parseInt(ctx.match[2]);
    if (msgIdx <= 0) return;
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    const messages = parsePostMessages(post.content || '');
    if (msgIdx >= messages.length) return ctx.reply('❌ پیام یافت نشد.');
    [messages[msgIdx - 1], messages[msgIdx]] = [messages[msgIdx], messages[msgIdx - 1]];
    const newContent = serializePostMessages(messages);
    const rawButtons = (post as any).buttons;
    const swappedButtons = swapMessageButtons(rawButtons, msgIdx - 1, msgIdx);
    await postService.update(postId, { content: newContent, buttons: swappedButtons, updatedBy: BigInt(ctx.from.id) } as any);
    const updated = await postService.findById(postId);
    if (updated) await refreshEditorMessages(ctx, updated);
  });

  bot.action(/^post:msg:down:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const msgIdx = parseInt(ctx.match[2]);
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    const messages = parsePostMessages(post.content || '');
    if (msgIdx < 0 || msgIdx >= messages.length - 1) return ctx.reply('❌ در پایین‌ترین موقعیت.');
    [messages[msgIdx], messages[msgIdx + 1]] = [messages[msgIdx + 1], messages[msgIdx]];
    const newContent = serializePostMessages(messages);
    const rawButtons = (post as any).buttons;
    const swappedButtons = swapMessageButtons(rawButtons, msgIdx, msgIdx + 1);
    await postService.update(postId, { content: newContent, buttons: swappedButtons, updatedBy: BigInt(ctx.from.id) } as any);
    const updated = await postService.findById(postId);
    if (updated) await refreshEditorMessages(ctx, updated);
  });

  bot.action(/^post:msg:add:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const msgIdx = parseInt(ctx.match[2]);
    cache.set(editorKey(ctx.from.id, 'active'), postId, 600);
    cache.set(editorKey(ctx.from.id, 'mode'), 'add_message', 600);
    cache.set(editorKey(ctx.from.id, 'msg_idx'), msgIdx, 600);
    try {
      const forwardOn = cache.get<boolean>(editorKey(ctx.from.id, 'forward_on')) || false;
      await ctx.reply('🔧 افزودن پیام جدید\n\n❇️ پیام جدید را وارد کنید.\nهمچنین می‌توانید متن را از چت یا کانال دیگری «باز ارسال» کنید.', {
        ...postAddMessageReplyKeyboard(forwardOn),
      });
    } catch (e: any) {
      logger.error(`[MsgAdd] Failed postId=${postId}: ${e.message}`, { postId, userId: ctx.from?.id });
      cache.set(editorKey(ctx.from.id, 'mode'), 'main', 600);
      cache.del(editorKey(ctx.from.id, 'msg_idx'));
      try { await ctx.reply('❌ خطا. لطفاً دوباره تلاش کنید.'); } catch (_) {}
    }
  });

  // ─── Editor Text Handler ───────────────────────────────
  // Handles all text input while the multi-message editor is active.
  bot.on('text', async (ctx: any, next) => {
    if (!ctx.from) return next();
    const editorPostId = cache.get<number>(editorKey(ctx.from.id, 'active'));
    if (!editorPostId) return next();
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin || !isPostAdmin(admin)) return next();

    const mode = cache.get<string>(editorKey(ctx.from.id, 'mode')) || 'main';
    const text = ctx.message.text;

    // ─── NEW POST MANAGER MODE ──────────────────────────
    if (mode === 'new_post_manager') {
      const post = await postService.findById(editorPostId);
      if (!post) { clearEditorKeyState(ctx.from.id); return next(); }
      switch (text) {
        case '➕ افزودن پیام': {
          cache.set(editorKey(ctx.from.id, 'mode'), 'main', 600);
          await refreshEditorMessages(ctx, post);
          return;
        }
        case 'افزودن دستور': {
          cache.set(editorKey(ctx.from.id, 'mode'), 'add_command', 600);
          await ctx.reply('🔗 نام دستور را ارسال کنید (بدون /):\nmثلاً \`sgb/discount/rules\`', {
            parse_mode: 'Markdown' as any,
            ...postCancelOnlyReplyKeyboard(),
          });
          return;
        }
        case '📊 آمار': {
          const analytics = await postService.getAnalytics(editorPostId);
          const statsText = [
            `📊 *آمار: ${post.title}*`,
            '',
            `👁 بازدید کل: ${analytics.totalViews}`,
            `👆 کلیک کل: ${analytics.totalClicks}`,
            `👤 کاربران منحصربه‌فرد: ${analytics.uniqueUsers}`,
          ].join('\n');
          await ctx.reply(statsText, { parse_mode: 'Markdown' as any });
          return;
        }
        case '✅ انتشار': {
          await postService.publish(editorPostId);
          await ctx.reply('✅ پست منتشر شد!');
          return;
        }
        case '🗑 حذف پست': {
          if (post.slug === '__start__') return ctx.reply('❌ پیام Start قابل حذف نیست.');
          cache.set(pendingKey(ctx.from.id, 'delete_post_id'), editorPostId, 600);
          await ctx.reply(
            '⚠️ آیا از حذف کامل این پست مطمئن هستید؟\n' +
            'این عملیات غیرقابل بازگشت است.\n\n' +
            'تمام موارد زیر حذف خواهند شد:\n' +
            '📝 اطلاعات پست\n' +
            '⌨️ دکمه‌ها\n' +
            '🏷 دستورات\n' +
            '🖼 مدیاهای وابسته\n' +
            '🔗 ارتباطات\n' +
            '📦 کش‌های مربوط\n\n' +
            '❗ این عملیات قابل بازیابی نیست.',
            Markup.keyboard([
              ['✅ تایید حذف'],
              ['❌ انصراف'],
            ]).resize().persistent(),
          );
          return;
        }
        default:
          return next();
      }
      return;
    }

    // ─── MAIN MODE ───────────────────────────────────────
    if (mode === 'main') {
      switch (text) {
        case '➕ افزودن پیام': {
          const post = await postService.findById(editorPostId);
          if (!post) return ctx.reply('❌ پست یافت نشد.');
          const messages = parsePostMessages(post.content || '');
          const addAfter = messages.length - 1;
          cache.set(editorKey(ctx.from.id, 'mode'), 'add_message', 600);
          cache.set(editorKey(ctx.from.id, 'msg_idx'), addAfter, 600);
          const forwardOn = cache.get<boolean>(editorKey(ctx.from.id, 'forward_on')) || false;
          await ctx.reply('🔧 افزودن پیام جدید\n\n❇️ پیام جدید را وارد کنید.\nهمچنین می‌توانید متن را از چت یا کانال دیگری «باز ارسال» کنید.', {
            ...postAddMessageReplyKeyboard(forwardOn),
          });
          return;
        }
        case 'افزودن دستور': {
          cache.set(editorKey(ctx.from.id, 'mode'), 'add_command', 600);
          await ctx.reply('🔗 نام دستور را ارسال کنید (بدون /):\nmثلاً \`sgb/discount/rules\`', {
            parse_mode: 'Markdown' as any,
            ...postCancelOnlyReplyKeyboard(),
          });
          return;
        }
        case '📊 آمار': {
          const post = await postService.findById(editorPostId);
          if (!post) return ctx.reply('❌ پست یافت نشد.');
          const analytics = await postService.getAnalytics(editorPostId);
          const text = [
            `📊 *آمار: ${post.title}*`,
            '',
            `👁 بازدید کل: ${analytics.totalViews}`,
            `👆 کلیک کل: ${analytics.totalClicks}`,
            `👤 کاربران منحصربه‌فرد: ${analytics.uniqueUsers}`,
            '',
            '📈 بازدید روزانه (۳۰ روز اخیر):',
            ...analytics.dailyViews.slice(-7).map((d: any) => `  ${d.date}: ${d.count} بازدید`),
          ].join('\n');
          await ctx.reply(text, { parse_mode: 'Markdown' as any });
          return;
        }
        case '🔗 متغیرها': {
          const variables = [
            '`{first_name}` — نام کاربر',
            '`{last_name}` — نام خانوادگی',
            '`{username}` — نام کاربری',
            '`{user_id}` — شناسه عددی',
            '`{join_date}` — تاریخ عضویت',
            '`{bot_name}` — نام ربات',
          ].join('\n');
          await ctx.reply(`📝 *متغیرهای قابل استفاده در پیام Start:*\n\n${variables}\n\nدر زمان ارسال، مقادیر واقعی جایگزین می‌شوند.`, { parse_mode: 'Markdown' as any });
          return;
        }
        case '✅ انتشار': {
          await postService.publish(editorPostId);
          const postPub = await postService.findById(editorPostId);
          if (postPub) await refreshEditorMessages(ctx, postPub);
          return;
        }
        case '📤 لغو انتشار': {
          await postService.unpublish(editorPostId);
          const postUnpub = await postService.findById(editorPostId);
          if (postUnpub) await refreshEditorMessages(ctx, postUnpub);
          return;
        }
        case '🗑 حذف پست': {
          const post = await postService.findById(editorPostId);
          if (!post) return ctx.reply('❌ پست یافت نشد.');
          cache.set(pendingKey(ctx.from.id, 'delete_post_id'), editorPostId, 600);
          await ctx.reply(
            '⚠️ آیا از حذف کامل این پست مطمئن هستید؟\n' +
            'این عملیات غیرقابل بازگشت است.\n\n' +
            'تمام موارد زیر حذف خواهند شد:\n' +
            '📝 اطلاعات پست\n' +
            '⌨️ دکمه‌ها\n' +
            '🏷 دستورات\n' +
            '🖼 مدیاهای وابسته\n' +
            '🔗 ارتباطات\n' +
            '📦 کش‌های مربوط\n\n' +
            '❗ این عملیات قابل بازیابی نیست.',
            Markup.keyboard([
              ['✅ تایید حذف'],
              ['❌ انصراف'],
            ]).resize().persistent(),
          );
          return;
        }
        case '🗂 بازگشت به لیست': {
          cache.del(editorKey(ctx.from.id, 'active'));
          cache.del(editorKey(ctx.from.id, 'mode'));
          cache.del(editorKey(ctx.from.id, 'msg_idx'));
          cache.del(editorKey(ctx.from.id, 'message_ids'));
          await showPostListFromLayout(ctx);
          return;
        }
        case '🏠 منو اصلی': {
          await postService.invalidateCache();
          cache.del(editorKey(ctx.from.id, 'active'));
          cache.del(editorKey(ctx.from.id, 'mode'));
          cache.del(editorKey(ctx.from.id, 'msg_idx'));
          cache.del(editorKey(ctx.from.id, 'message_ids'));
          await adminMainMenu(ctx);
          return;
        }
        case '🔙 بازگشت':
        case '⛔ توقف ویرایش': {
          cache.del(editorKey(ctx.from.id, 'active'));
          cache.del(editorKey(ctx.from.id, 'mode'));
          cache.del(editorKey(ctx.from.id, 'msg_idx'));
          cache.del(editorKey(ctx.from.id, 'message_ids'));
          await adminMainMenu(ctx);
          return;
        }
        default:
          return next();
      }
      return;
    }

    // ─── MOVE MODE (button swap) ─────────────────────────
    if (mode === 'move') {
      if (text === '⬆️ بالا' || text === '⬇️ پایین') {
        const row = cache.get<number>(pendingKey(ctx.from.id, 'editor_row'));
        const col = cache.get<number>(pendingKey(ctx.from.id, 'editor_col'));
        if (row === undefined || col === undefined) return ctx.reply('❌ دکمه‌ای انتخاب نشده است.');
        const post = await postService.findById(editorPostId);
        if (!post) return ctx.reply('❌ پست یافت نشد.');
        const buttons: any[][] = JSON.parse(JSON.stringify((post as any).buttons || []));
        if (!buttons[row] || !buttons[row][col]) return ctx.reply('❌ دکمه یافت نشد.');

        const { newRow, newCol } = moveButtonInLayout(buttons, row, col, text === '⬆️ بالا' ? 'up' : 'down');

        await postService.update(editorPostId, { buttons } as any);
        cache.set(pendingKey(ctx.from.id, 'editor_row'), newRow, 600);
        cache.set(pendingKey(ctx.from.id, 'editor_col'), newCol, 600);
        const updated = await postService.findById(editorPostId);
        if (updated) await refreshEditorMessages(ctx, updated);
        await ctx.reply(`✅ دکمه به ${text === '⬆️ بالا' ? 'بالا' : 'پایین'} منتقل شد.`);
        return;
      }
      if (text === '🔙 بازگشت') {
        cache.del(pendingKey(ctx.from.id, 'editor_row'));
        cache.del(pendingKey(ctx.from.id, 'editor_col'));
        cache.del(pendingKey(ctx.from.id, 'editor_state'));
        cache.set(editorKey(ctx.from.id, 'mode'), 'main', 600);
        const post = await postService.findById(editorPostId);
        if (post) await refreshEditorMessages(ctx, post);
        return;
      }
      return;
    }

    // ─── ADD MESSAGE MODE ────────────────────────────────
    if (mode === 'add_message') {
      const msgIdx = cache.get<number>(editorKey(ctx.from.id, 'msg_idx')) ?? -1;

      if (text === '↪️ ارسال به عنوان فوروارد (خاموش)' || text === '✅ ارسال به عنوان فوروارد (روشن)') {
        const current = cache.get<boolean>(editorKey(ctx.from.id, 'forward_on')) || false;
        cache.set(editorKey(ctx.from.id, 'forward_on'), !current, 600);
        await ctx.reply(`🔧 افزودن پیام جدید\n\n❇️ پیام جدید را وارد کنید.\nهمچنین می‌توانید متن را از چت یا کانال دیگری «باز ارسال» کنید.`, {
          ...postAddMessageReplyKeyboard(!current),
        });
        return;
      }

      if (text === '❌ لغو') {
        cache.set(editorKey(ctx.from.id, 'mode'), 'main', 600);
        cache.del(editorKey(ctx.from.id, 'msg_idx'));
        const post = await postService.findById(editorPostId);
        if (post) await refreshEditorMessages(ctx, post);
        return;
      }

      // Regular text = new message content
      const post = await postService.findById(editorPostId);
      if (!post) return ctx.reply('❌ پست یافت نشد.');
      const messages = parsePostMessages(post.content || '');
      const insertAt = msgIdx < 0 ? messages.length : Math.min(msgIdx + 1, messages.length);
      messages.splice(insertAt, 0, text);
      const newContent = serializePostMessages(messages);
      await postService.update(editorPostId, {
        content: newContent,
        contentText: text,
        contentEntities: ctx.message.entities || [],
        renderMode: 'telegram_entities',
        contentFormat: 'telegram_entities',
        updatedBy: BigInt(ctx.from.id),
      } as any);
      cache.set(editorKey(ctx.from.id, 'mode'), 'main', 600);
      cache.del(editorKey(ctx.from.id, 'msg_idx'));
      const updated = await postService.findById(editorPostId);
      if (updated) await refreshEditorMessages(ctx, updated);
      return;
    }

    // ─── ADD COMMAND MODE ────────────────────────────────
    if (mode === 'add_command') {
      if (text === '❌ لغو') {
        cache.set(editorKey(ctx.from.id, 'mode'), 'main', 600);
        const post = await postService.findById(editorPostId);
        if (post) await refreshEditorMessages(ctx, post);
        return;
      }

      // Regular text = command name
      const cmdText = text.replace(/^\//, '').trim();
      if (!cmdText) {
        await ctx.reply('❌ دستور نامعتبر. لطفاً یک نام معتبر ارسال کنید.', {
          ...postCancelOnlyReplyKeyboard(),
        });
        return;
      }
      try {
        await postService.addCommand(editorPostId, cmdText);
        await ctx.reply(`✅ دستور /${cmdText} اضافه شد!`);
      } catch (err: any) {
        await ctx.reply(`❌ ${err.message || 'افزودن دستور ناموفق بود.'}`, {
          ...postCancelOnlyReplyKeyboard(),
        });
        return;
      }
      cache.set(editorKey(ctx.from.id, 'mode'), 'main', 600);
      const updated = await postService.findById(editorPostId);
      if (updated) await refreshEditorMessages(ctx, updated);
      return;
    }

    // ─── EDIT MESSAGE MODE ───────────────────────────────
    if (mode === 'edit_message') {
      if (text === '✏️ ویرایش محتوا') {
        const msgIdx = cache.get<number>(editorKey(ctx.from.id, 'msg_idx')) ?? -1;
        cache.set(editorKey(ctx.from.id, 'mode'), 'edit_content', 600);
        const post = await postService.findById(editorPostId);
        const messages = post ? parsePostMessages(post.content || '') : [];
        const current = messages[msgIdx] || '(بدون محتوا)';
        await ctx.reply(`✏️ پیام ${msgIdx + 1} - محتوای جدید را ارسال کنید:\n\nمتن فعلی: ${current}`, {
          ...postCancelOnlyReplyKeyboard(),
        });
        return;
      }
      if (text === '📝 ویرایش عنوان') {
        cache.set(editorKey(ctx.from.id, 'mode'), 'edit_title', 600);
        const post = await postService.findById(editorPostId);
        await ctx.reply(`✏️ عنوان جدید را ارسال کنید:\n\nعنوان فعلی: *${post?.title || ''}*`, {
          parse_mode: 'Markdown' as any,
          ...postCancelOnlyReplyKeyboard(),
        });
        return;
      }
      if (text === 'ویرایش دکمه ها') {
        const msgIdx = cache.get<number>(editorKey(ctx.from.id, 'msg_idx')) ?? 0;
        clearButtonEditorState(ctx.from.id);
        cache.set(pendingKey(ctx.from.id, 'editing_post'), editorPostId, 600);
        cache.set(pendingKey(ctx.from.id, 'editing_message_idx'), msgIdx, 600);
        cache.set(pendingKey(ctx.from.id, 'edit_mode'), editorPostId, 300);
        cache.set(pendingKey(ctx.from.id, 'editor_mode'), 'create', 600);
        cache.del(pendingKey(ctx.from.id, 'editor_state'));
        const post = await postService.findById(editorPostId);
        if (!post) return ctx.reply('❌ پست یافت نشد.');
        const buttons = getMessageButtons((post as any).buttons, msgIdx);
        if (!buttons.length || buttons.every((r: any[]) => !r || !r.length)) {
          const sent = await ctx.reply('⌨ ویرایشگر دکمه:\nهنوز دکمه‌ای وجود ندارد. یک دکمه جدید ایجاد کنید.', buildNoButtonsReplyKeyboard());
          if (sent) cache.set(`pbedit:editor_msg_id:${ctx.from.id}`, sent.message_id, 600);
        } else {
          const sent = await ctx.reply('⌨ ویرایشگر دکمه:', {
            ...buildButtonEditorExitKeyboard(),
            ...buildButtonListInlineKeyboard(editorPostId, buttons, 'create'),
          });
          if (sent) cache.set(`pbedit:editor_msg_id:${ctx.from.id}`, sent.message_id, 600);
        }
        return;
      }
      if (text === '🔙 بازگشت') {
        cache.set(editorKey(ctx.from.id, 'mode'), 'main', 600);
        cache.del(editorKey(ctx.from.id, 'msg_idx'));
        const post = await postService.findById(editorPostId);
        if (post) await refreshEditorMessages(ctx, post);
        return;
      }
      return;
    }

    // ─── EDIT CONTENT MODE ───────────────────────────────
    if (mode === 'edit_content') {
      if (text === '❌ لغو') {
        cache.set(editorKey(ctx.from.id, 'mode'), 'edit_message', 600);
        const msgIdx = cache.get<number>(editorKey(ctx.from.id, 'msg_idx')) ?? -1;
        const post = await postService.findById(editorPostId);
        const messages = post ? parsePostMessages(post.content || '') : [];
        const msgText = messages[msgIdx] || '(بدون محتوا)';
        await ctx.reply(`✏️ ویرایش پیام ${msgIdx + 1}:\n\n${msgText}`, {
          ...postEditMessageReplyKeyboard(),
        });
        return;
      }
      const msgIdx = cache.get<number>(editorKey(ctx.from.id, 'msg_idx')) ?? -1;
      const post = await postService.findById(editorPostId);
      if (!post) return ctx.reply('❌ پست یافت نشد.');
      const messages = parsePostMessages(post.content || '');
      if (msgIdx >= 0 && msgIdx < messages.length) {
        messages[msgIdx] = text;
        const newContent = serializePostMessages(messages);
        await postService.update(editorPostId, {
          content: newContent,
          contentText: text,
          contentEntities: ctx.message.entities || [],
          renderMode: 'telegram_entities',
          contentFormat: 'telegram_entities',
          updatedBy: BigInt(ctx.from.id),
        } as any);
      }
      cache.set(editorKey(ctx.from.id, 'mode'), 'main', 600);
      cache.del(editorKey(ctx.from.id, 'msg_idx'));
      const updated = await postService.findById(editorPostId);
      if (updated) await refreshEditorMessages(ctx, updated);
      return;
    }

    // ─── EDIT TITLE MODE ─────────────────────────────────
    if (mode === 'edit_title') {
      if (text === '❌ لغو') {
        cache.set(editorKey(ctx.from.id, 'mode'), 'edit_message', 600);
        const msgIdx = cache.get<number>(editorKey(ctx.from.id, 'msg_idx')) ?? -1;
        const post = await postService.findById(editorPostId);
        const messages = post ? parsePostMessages(post.content || '') : [];
        const msgText = messages[msgIdx] || '(بدون محتوا)';
        await ctx.reply(`✏️ ویرایش پیام ${msgIdx + 1}:\n\n${msgText}`, {
          ...postEditMessageReplyKeyboard(),
        });
        return;
      }
      await postService.update(editorPostId, { title: text, updatedBy: BigInt(ctx.from.id) } as any);
      cache.set(editorKey(ctx.from.id, 'mode'), 'main', 600);
      cache.del(editorKey(ctx.from.id, 'msg_idx'));
      const updated = await postService.findById(editorPostId);
      if (updated) await refreshEditorMessages(ctx, updated);
      return;
    }

    return next();
  });

  // ─── Handle forwarded / media messages in add_message mode ──
  bot.on(['photo', 'video', 'animation', 'document', 'audio', 'voice'], async (ctx: any, next) => {
    if (!ctx.from) return next();
    const editorPostId = cache.get<number>(editorKey(ctx.from.id, 'active'));
    if (!editorPostId) return next();
    const mode = cache.get<string>(editorKey(ctx.from.id, 'mode'));
    if (mode !== 'add_message') return next();
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin || !isPostAdmin(admin)) return next();

    const msg = ctx.message;
    const caption = msg.caption || '';
    const msgIdx = cache.get<number>(editorKey(ctx.from.id, 'msg_idx')) ?? -1;
    const post = await postService.findById(editorPostId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    const messages = parsePostMessages(post.content || '');
    const insertAt = msgIdx < 0 ? messages.length : Math.min(msgIdx + 1, messages.length);
    messages.splice(insertAt, 0, caption || '(رسانه)');
    const newContent = serializePostMessages(messages);
    await postService.update(editorPostId, {
      content: newContent,
      contentText: caption,
      contentEntities: msg.caption_entities || [],
      renderMode: 'telegram_entities',
      contentFormat: 'telegram_entities',
      updatedBy: BigInt(ctx.from.id),
    } as any);
    cache.set(editorKey(ctx.from.id, 'mode'), 'main', 600);
    cache.del(editorKey(ctx.from.id, 'msg_idx'));
    const updated = await postService.findById(editorPostId);
    if (updated) await refreshEditorMessages(ctx, updated);
  });
}

// Export the helper for main menu integration
export async function getPublishedPostsForMenu(): Promise<any[]> {
  return postService.getPublished();
}
