import { PostStatus } from '@prisma/client';
import { prisma } from '../../prisma/client';
import { Context, Markup, Telegraf } from 'telegraf';
import { botAdminService } from '../../services/bot-admin.service';
import { postService } from '../../services/post.service';
import { postMessageService } from '../../services/post-message.service';
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
  postCancelOnlyReplyKeyboard,
  postCommandSubMenuKeyboard,
  postNewPostManagerReplyKeyboard,
  postSingleMessageInlineKeyboard,
  postAddMessageReplyKeyboard,
  postEditMessageReplyKeyboard,
  buildNoButtonsReplyKeyboard,
  buildNoButtonsEditorKeyboard,
  buildButtonEditorPersistentKeyboard,
  buildButtonTypeSelectionKeyboard,
  buildCancelOnlyReplyKeyboard,
  buildButtonEditorExitKeyboard,
  buildEditButtonTypeKeyboard,
  buildButtonColorSelectionKeyboard,
  renderButtonEditor,
  buildMoveReplyKeyboard,
  buildPostEditorReplyKeyboard,
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

function extractForwardMeta(message: any): { isForwarded: boolean; forwardMeta: any; forwardSourceChatId: bigint | null; forwardSourceMessageId: number | null } {
  const fo = message.forward_origin;
  const hasLegacy = !!(message.forward_from_chat || message.forward_from);
  const hasModern = !!fo;
  const hasDate = !!message.forward_date;
  const hasSenderName = !!message.forward_sender_name;
  logger.info(`[ForwardDetect] messageId=${message.message_id} hasModern=${hasModern} hasLegacy=${hasLegacy} hasDate=${hasDate} type=${fo?.type || 'legacy'}`);

  if (!hasModern && !hasLegacy && !hasDate && !hasSenderName) {
    return { isForwarded: false, forwardMeta: null, forwardSourceChatId: null, forwardSourceMessageId: null };
  }

  let type = 'hidden_user';
  let originName = message.forward_sender_name || '';
  let originChatId: number | null = null;
  let originMessageId: number | null = null;
  let originUserId: number | null = null;
  let originUsername: string | null = null;
  let forwardDate: number | null = message.forward_date || null;

  if (fo) {
    if (fo.type === 'channel') {
      type = 'channel';
      originName = fo.chat?.title || '';
      originChatId = fo.chat?.id ? Number(fo.chat.id) : null;
      originMessageId = fo.message_id || null;
      forwardDate = fo.date || forwardDate;
    } else if (fo.type === 'chat') {
      type = 'user';
      originName = [fo.sender_chat?.title, fo.sender_chat?.first_name, fo.sender_chat?.last_name].filter(Boolean).join(' ');
      originChatId = fo.sender_chat?.id ? Number(fo.sender_chat.id) : null;
    } else if (fo.type === 'user') {
      type = 'user';
      originName = [fo.sender_user?.first_name, fo.sender_user?.last_name].filter(Boolean).join(' ');
      originUserId = fo.sender_user?.id ? Number(fo.sender_user.id) : null;
      originUsername = fo.sender_user?.username || null;
    } else if (fo.type === 'hidden_user') {
      type = 'hidden_user';
      originName = fo.sender_name || '';
    }
  } else if (message.forward_from_chat) {
    type = message.forward_from_chat.type || 'channel';
    originName = message.forward_from_chat.title || '';
    originChatId = message.forward_from_chat.id ? Number(message.forward_from_chat.id) : null;
    originMessageId = message.forward_from_message_id || null;
  } else if (message.forward_from) {
    type = 'user';
    originName = [message.forward_from.first_name, message.forward_from.last_name].filter(Boolean).join(' ');
    originUserId = message.forward_from.id ? Number(message.forward_from.id) : null;
    originUsername = message.forward_from.username || null;
  }

  const safeChatId = originChatId != null ? String(originChatId) : null;
  const safeMsgId = originMessageId != null ? String(originMessageId) : null;
  const safeUserId = originUserId != null ? String(originUserId) : null;

  logger.info(`[ForwardDetected] type=${type} originName=${originName} chatId=${safeChatId} msgId=${safeMsgId} userId=${safeUserId}`);
  return {
    isForwarded: true,
    forwardMeta: { type, originName, originChatId: safeChatId, originMessageId: safeMsgId, originUserId: safeUserId, originUsername, forwardDate },
    forwardSourceChatId: originChatId != null ? BigInt(originChatId) : null,
    forwardSourceMessageId: originMessageId,
  };
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
    'active', 'mode', 'msg_idx', 'message_ids',
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
    return raw.messages[String(messageIdx)] || [];
  }
  if (Array.isArray(raw)) return messageIdx === 0 ? raw : [];
  return [];
}

// ─── Extract buttons for a given message from post with priority ──
// Priority: post.keyboards (normalized) → post_messages.replyMarkup → post.buttons
function extractButtonsForMessage(post: any, messageId: number): any[][] {
  let currentMsgId: number | null = null;

  // First: try to find by exact DB id
  if (post.messages && Array.isArray(post.messages)) {
    const msg = post.messages.find((m: any) => m.id === messageId);
    if (msg) currentMsgId = msg.id;
  }

  // Fallback: if no message found by id, treat messageId as array index
  if (currentMsgId == null && post.messages && Array.isArray(post.messages) && messageId >= 0 && messageId < post.messages.length) {
    currentMsgId = post.messages[messageId].id;
  }

  if (post.keyboards && Array.isArray(post.keyboards) && post.keyboards.length > 0) {
    const filtered = currentMsgId != null
      ? post.keyboards.filter((kb: any) => kb.messageId === currentMsgId)
      : [];
    const grouped: { [row: number]: any[] } = {};
    for (const kb of filtered) {
      if (kb.row === undefined) continue;
      if (!grouped[kb.row]) grouped[kb.row] = [];
      const baseStyle = kb.payload?.style;
      const rawType = kb.type;
      const reconstructedType = kb.payload?.type || (kb.type === 'URL' ? 'URL' : kb.type === 'CALLBACK' ? 'CALLBACK' : 'NATIVE');
      const reconstructed = kb.payload
        ? { ...kb.payload, text: kb.text, type: reconstructedType, value: kb.value }
        : { text: kb.text, type: reconstructedType, value: kb.value, style: baseStyle || undefined };
      logger.info(`[BTN_EXTRACT] postId=${post.id} msgId=${messageId} resolvedMsgId=${currentMsgId} row=${kb.row} col=${kb.col} db_type="${rawType}" → reconstructed_type="${reconstructed.type}" text="${kb.text}" value="${kb.value}" payload_type="${kb.payload?.type || 'none'}"`);
      grouped[kb.row][kb.col || 0] = reconstructed;
    }
    const rows = Object.keys(grouped).sort((a, b) => Number(a) - Number(b)).map(k => grouped[Number(k)].filter(Boolean));
    if (rows.some(r => r.length > 0)) return rows;
  }

  if (currentMsgId != null && post.messages && Array.isArray(post.messages)) {
    const msg = post.messages.find((m: any) => m.id === currentMsgId);
    if (msg && msg.replyMarkup && Array.isArray(msg.replyMarkup)) {
      logger.info(`[BTN_EXTRACT] postId=${post.id} msgId=${messageId} resolvedMsgId=${currentMsgId} using replyMarkup (${msg.replyMarkup.length} rows)`);
      return msg.replyMarkup;
    }
  }

  const fallbackBtns = getMessageButtons((post as any).buttons, messageId);
  logger.info(`[BTN_EXTRACT] postId=${post.id} msgId=${messageId} resolvedMsgId=${currentMsgId} fallback to post.buttons[${0}] (${fallbackBtns.length} rows)`);
  return fallbackBtns;
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

// ─── Extract message text array from post.messages ───────
function getMessageTexts(post: any): string[] {
  return (post.messages || []).map((m: any) => m.text || '');
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF-]/g, '')
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
  const commands = (post as any).commands || [];
  const msgCount = (post.messages || []).length;
  const firstMsg = post.messages?.[0]?.text || '';
  const lines = [
    `*${post.title}*`,
    `_شناسه: ${post.id} | اسلاگ: \`${post.slug}\`_`,
    `${statusText} | 💬 ${msgCount} پیام`,
    post.sortOrder ? `🗂 ترتیب: ${post.sortOrder}` : '',
    post.command ? `🔗 دستور: \`/${post.command}\`` : '',
    commands.length ? `🔗 دستورات: ${commands.map((c: any) => `/${c.command}`).join(', ')}` : '',
    post.publishedAt ? `📅 منتشر شده: ${new Date(post.publishedAt).toLocaleDateString('fa-IR')}` : '',
    post.scheduledAt ? `⏰ زمان‌بندی: ${new Date(post.scheduledAt).toLocaleDateString('fa-IR')}` : '',
    post.unpublishAt ? `⏰ لغو انتشار: ${new Date(post.unpublishAt).toLocaleDateString('fa-IR')}` : '',
    `📊 بازدید: ${(post as any)._count?.views || 0} | کلیک: ${(post as any)._count?.clickLogs || 0}`,
    '',
    firstMsg ? graphemeTruncate(firstMsg, 200) : '(بدون محتوا)',
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
  const views = (post as any)._count?.views || 0;
  const clicks = (post as any)._count?.clickLogs || 0;
  const msgCount = (post.messages || []).length;
  const createdDate = post.createdAt ? new Date(post.createdAt).toLocaleDateString('fa-IR') : '';
  const updatedDate = post.updatedAt ? new Date(post.updatedAt).toLocaleDateString('fa-IR') : '';

  const lines = [
    `📝 *عنوان:* ${post.title}`,
    `🚀 *وضعیت:* ${statusText}`,
    `👁 *بازدید:* ${views} | 👆 *کلیک:* ${clicks}`,
    msgCount > 0 ? `💬 *پیام‌ها:* ${msgCount}` : '',
    createdDate ? `📅 *ایجاد:* ${createdDate}` : '',
    updatedDate ? `📅 *به‌روزرسانی:* ${updatedDate}` : '',
  ].filter(Boolean).join('\n');
  return lines;
}

export function clearAllPostStates(userId: number) {
  const pendingPrefix = `post:pending:${userId}:`;
  const editorPrefix = `post:editor:${userId}:`;
  const pendingKeys = [
    'editing_cmd', 'editing_post', 'editing_field', 'editing_button',
    'schedule_publish', 'schedule_unpublish', 'alias_cmd_id',
    'searching', 'preview_id', 'publish_id', 'analytics_id',
    'import_title', 'import_post', 'creating', 'edit_mode',
    'editor_state', 'editor_mode', 'editor_row', 'editor_col',
    'editing_message_idx', 'selected_post',
  ];
  for (const k of pendingKeys) cache.del(`${pendingPrefix}${k}`);
  const editorKeys = [
    'active', 'mode', 'msg_idx', 'message_ids',
    'btn_sel_row', 'btn_sel_col', 'btn_msg_ids',
    'add_btn_name', 'add_btn_ref_row', 'add_btn_ref_col',
    'btn_text_row', 'btn_text_col', 'btn_link_row', 'btn_link_col',
  ];
  for (const k of editorKeys) cache.del(`${editorPrefix}${k}`);
  cache.del(`post_mgmt_mode:${userId}`);
  cache.del(`pbedit:editor_msg_id:${userId}`);
  cache.del(`menu:edit_mode:${userId}`);
  cache.del(`menu:selected:${userId}`);
  cache.del(`menu:renaming:${userId}`);
  cache.del(`search_mode:${userId}`);
  cache.del(`admin_broadcast:${userId}`);
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
    cache.setPermanent(`post_mgmt_mode:${ctx.from.id}`, true);
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
    cache.setPermanent(`post_mgmt_mode:${ctx.from.id}`, true);
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
      if (existingMode === 'main') {
        const text = ctx.message.text;
        const isEditorAction = ['➕ افزودن پیام', '🔗 دستور', '📊 آمار', '📤 لغو انتشار', '✅ انتشار', '🔗 متغیرها',
          '🗂 بازگشت به لیست', '🏠 منو اصلی', '🔙 بازگشت', '⛔ توقف ویرایش',
          '✏️ ویرایش محتوا', '📝 ویرایش عنوان', 'ویرایش دکمه ها', '❌ لغو',
          '🔙 بازگشت به ویرایشگر',
          '🗑 حذف پست',
        ].includes(text);
        if (!isEditorAction) {
          logger.warn(`[StaleEditorKey] Clearing stale editor key for user ${ctx.from.id} (mode=${existingMode}, text="${text.substring(0, 30)}")`);
          clearEditorKeyState(ctx.from.id);
        }
      }
      if (cache.get<number>(editorKey(ctx.from.id, 'active'))) return next();
    }

    const text = ctx.message.text;

    // Start post → open editor
    if (text === '🚀 پیام Start') {
      const startPost = await postService.getOrCreateStartPost();
      if (!startPost) return ctx.reply('❌ خطا در بارگذاری پیام Start.');
      cache.setPermanent(pendingKey(ctx.from.id, 'selected_post'), startPost.id);
      cache.del(`post_mgmt_mode:${ctx.from.id}`);
      cache.del(pendingKey(ctx.from.id, 'edit_mode'));
      await enterPostEditor(ctx, startPost);
      return;
    }

    // Anonymous post → open editor
    if (text === '📩 پیام ناشناس') {
      const anonPost = await postService.getOrCreateAnonymousPost();
      if (!anonPost) return ctx.reply('❌ خطا در بارگذاری پیام ناشناس.');
      cache.setPermanent(pendingKey(ctx.from.id, 'selected_post'), anonPost.id);
      cache.del(`post_mgmt_mode:${ctx.from.id}`);
      cache.del(pendingKey(ctx.from.id, 'edit_mode'));
      await enterPostEditor(ctx, anonPost);
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
      cache.setPermanent(pendingKey(ctx.from.id, 'selected_post'), matched.id);
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
    cache.setPermanent(pendingKey(ctx.from.id, 'editing_field'), 'add_content');
    cache.setPermanent(pendingKey(ctx.from.id, 'editing_post'), postId);
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
    cache.setPermanent(pendingKey(ctx.from.id, 'import_title'), true);
    await ctx.reply('📥 عنوان پست جدید را ارسال کنید، سپس پیام تلگرام اصلی را فوروارد کنید.');
  });

  bot.hears('➕ ایجاد پست', async (ctx: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    clearEditorKeyState(ctx.from.id);
    cache.setPermanent(pendingKey(ctx.from.id, 'creating'), true);
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
      await ctx.reply('❌ ایجاد پست لغو شد.');
      await showPostListFromLayout(ctx);
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

    const text = ctx.message.text;

    // 🔗 دستور — intercept BEFORE state checks to avoid stale editingField consuming it
    if (text === '🔗 دستور') {
      const postId = cache.get<number>(pendingKey(ctx.from.id, 'edit_mode'));
      if (postId) {
        // Clear any stale editing states that could interfere
        cache.del(pendingKey(ctx.from.id, 'editing_field'));
        cache.del(pendingKey(ctx.from.id, 'editing_post'));
        cache.del(pendingKey(ctx.from.id, 'editing_button'));
        cache.del(pendingKey(ctx.from.id, 'import_title'));
        cache.del(pendingKey(ctx.from.id, 'import_post'));
        cache.del(pendingKey(ctx.from.id, 'creating'));

        cache.setPermanent(pendingKey(ctx.from.id, 'editing_cmd'), true);
        cache.setPermanent(pendingKey(ctx.from.id, 'editing_post'), postId);
        const existingCmd = await postService.getCommandByPostId(postId);
        const statusLine = existingCmd ? `دستور پست: /${existingCmd.command}` : 'دستور پست: ندارد';
        await ctx.reply(`🔗 نام دستور را ارسال کنید (بدون /):\n\n${statusLine}\n\nمثال: sgb/discount/rules`, {
          ...postCommandSubMenuKeyboard(!!existingCmd),
        });
        return;
      }
    }

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
      let slug = slugify(title);
      let post;
      try {
        post = await postService.create({ title, slug, content: '', contentFormat: 'telegram_entities', contentVersion: 2, createdBy: BigInt(ctx.from.id) } as any);
      } catch (err: any) {
        if (err.code === 'P2002') {
          slug = `${slug}-${Date.now()}`;
          post = await postService.create({ title, slug, content: '', contentFormat: 'telegram_entities', contentVersion: 2, createdBy: BigInt(ctx.from.id) } as any);
        } else {
          throw err;
        }
      }
      cache.setPermanent(pendingKey(ctx.from.id, 'import_post'), post.id);
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
      let slug = slugify(title);
      try {
        const post = await postService.create({ title, slug, createdBy: BigInt(ctx.from.id) });
        cache.setPermanent(editorKey(ctx.from.id, 'active'), post.id);
        cache.setPermanent(editorKey(ctx.from.id, 'mode'), 'new_post_manager');
        await ctx.reply(`✅ پست ساخته شد!\n\nعنوان: ${title}\nاسلاگ: ${slug}`, {
          ...postNewPostManagerReplyKeyboard(),
        });
      } catch (err: any) {
        if (err.code === 'P2002') {
          slug = `${slug}-${Date.now()}`;
          try {
            const post = await postService.create({ title, slug, createdBy: BigInt(ctx.from.id) });
            cache.setPermanent(editorKey(ctx.from.id, 'active'), post.id);
            cache.setPermanent(editorKey(ctx.from.id, 'mode'), 'new_post_manager');
            await ctx.reply(`✅ پست ساخته شد!\n\nعنوان: ${title}\nاسلاگ: ${slug}`, {
              ...postNewPostManagerReplyKeyboard(),
            });
          } catch (err2: any) {
            logger.error('[Post] Create error (retry):', err2);
            await ctx.reply('❌ ایجاد پست ناموفق بود.');
          }
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
          const entities = ctx.message.entities?.map((e: any) => ({ type: e.type, offset: e.offset, length: e.length, url: e.url, user: e.user, language: e.language, custom_emoji_id: e.custom_emoji_id })) || [];
          updateData.messages = [{ messageType: 'text', text: ctx.message.text, entities, order: 0 }];
          logger.info(`[PostEdit] content update post=${postId} textLength=${(ctx.message.text || '').length} entities=${entities.length}`);
        } else if (field === 'add_content') {
          const entities = ctx.message.entities?.map((e: any) => ({ type: e.type, offset: e.offset, length: e.length, url: e.url, user: e.user, language: e.language, custom_emoji_id: e.custom_emoji_id })) || [];
          await postMessageService.create(postId, { messageType: 'text', text: ctx.message.text, entities });
          const updated = await postService.findById(postId);
          await ctx.reply(formatPostInfoPersian(updated), {
            parse_mode: 'Markdown' as any,
            link_preview_options: { is_disabled: true } as any,
            ...postInfoActionKeyboard(updated),
          });
          logger.info(`[PostEdit] add_content post=${postId} — appended message`);
          return;
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
      cache.setPermanent(pendingKey(ctx.from.id, 'editing_post'), editingPostId);
      cache.setPermanent(pendingKey(ctx.from.id, 'editor_mode'), 'edit');
      cache.del(pendingKey(ctx.from.id, 'editor_state'));
      const msgId = cache.get<number>(`pbedit:editor_msg_id:${ctx.from.id}`);
      if (msgId) {
        const { text, reply_markup } = renderButtonEditor(editingPostId, updatedButtons, 'edit');
        try { await ctx.telegram.editMessageText(ctx.chat.id, msgId, null, text, { reply_markup }); } catch {}
      }
      return;
    }

    if (editingCommand && editingPostId) {
      // Handle cancel and delete before processing command text
      if (text === '↩️ لغو' || text === '❌ لغو') {
        cache.del(pendingKey(ctx.from.id, 'editing_cmd'));
        cache.del(pendingKey(ctx.from.id, 'editing_post'));
        await ctx.reply('↩️ عملیات دستور لغو شد.');
        await showEditMode(ctx, editingPostId);
        return;
      }
      if (text === '❌ حذف دستور') {
        cache.del(pendingKey(ctx.from.id, 'editing_cmd'));
        cache.del(pendingKey(ctx.from.id, 'editing_post'));
        try {
          await postService.removeCommandByPostId(editingPostId);
          await ctx.reply('✅ دستور پست حذف شد.');
        } catch (err: any) {
          await ctx.reply(`❌ ${err.message || 'حذف دستور ناموفق بود.'}`);
        }
        await showEditMode(ctx, editingPostId);
        return;
      }

      cache.del(pendingKey(ctx.from.id, 'editing_cmd'));
      cache.del(pendingKey(ctx.from.id, 'editing_post'));
      const cmdText = ctx.message.text.replace(/^\//, '').trim();
      if (!cmdText) return ctx.reply('❌ دستور نامعتبر.');
      try {
        const existingCmd = await postService.getCommandByPostId(editingPostId);
        await postService.setCommand(editingPostId, cmdText);
        if (existingCmd) {
          await ctx.reply(`✅ دستور پست بروزرسانی شد:\n/${existingCmd.command} → /${cmdText}`);
        } else {
          await ctx.reply(`✅ دستور پست ایجاد شد:\n/${cmdText}`);
        }
      } catch (err: any) {
        await ctx.reply(`❌ ${err.message || 'ثبت دستور ناموفق بود.'}`);
      }
      await showEditMode(ctx, editingPostId);
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
  // ─── Handle media messages for editing posts ──────────
  bot.on(['photo', 'video', 'animation', 'document', 'audio', 'voice', 'video_note', 'sticker'], async (ctx: any, next) => {
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
      let mediaFileUniqueId = '';
      let mediaMimeType = '';

      if (msg.photo) {
        const p = msg.photo[msg.photo.length - 1];
        mediaFileId = p.file_id;
        mediaFileUniqueId = p.file_unique_id;
        mediaMimeType = p.mime_type || '';
        mediaType = 'photo';
      } else if (msg.video) {
        mediaFileId = msg.video.file_id;
        mediaFileUniqueId = msg.video.file_unique_id;
        mediaMimeType = msg.video.mime_type || '';
        mediaType = 'video';
      } else if (msg.animation) {
        mediaFileId = msg.animation.file_id;
        mediaFileUniqueId = msg.animation.file_unique_id;
        mediaMimeType = msg.animation.mime_type || '';
        mediaType = 'animation';
      } else if (msg.document) {
        mediaFileId = msg.document.file_id;
        mediaFileUniqueId = msg.document.file_unique_id;
        mediaMimeType = msg.document.mime_type || '';
        mediaType = 'document';
      } else if (msg.audio) {
        mediaFileId = msg.audio.file_id;
        mediaFileUniqueId = msg.audio.file_unique_id;
        mediaMimeType = msg.audio.mime_type || '';
        mediaType = 'audio';
      } else if (msg.voice) {
        mediaFileId = msg.voice.file_id;
        mediaFileUniqueId = msg.voice.file_unique_id;
        mediaMimeType = msg.voice.mime_type || '';
        mediaType = 'voice';
      } else if (msg.video_note) {
        mediaFileId = msg.video_note.file_id;
        mediaFileUniqueId = msg.video_note.file_unique_id;
        mediaType = 'video_note';
      } else if (msg.sticker) {
        mediaFileId = msg.sticker.file_id;
        mediaFileUniqueId = msg.sticker.file_unique_id;
        mediaType = 'sticker';
      }

      let replyMessageType: string | null = null;
      let replyMessageText: string | null = null;
      let replyMediaFileId: string | null = null;
      let replyMediaType: string | null = null;
      const reply = msg.reply_to_message;
      if (reply) {
        replyMessageText = reply.text || reply.caption || null;
        if (reply.photo) { replyMediaType = 'photo'; replyMediaFileId = reply.photo[reply.photo.length - 1].file_id; }
        else if (reply.video) { replyMediaType = 'video'; replyMediaFileId = reply.video.file_id; }
        else if (reply.document) { replyMediaType = 'document'; replyMediaFileId = reply.document.file_id; }
        else if (reply.animation) { replyMediaType = 'animation'; replyMediaFileId = reply.animation.file_id; }
        else if (reply.audio) { replyMediaType = 'audio'; replyMediaFileId = reply.audio.file_id; }
        else if (reply.voice) { replyMediaType = 'voice'; replyMediaFileId = reply.voice.file_id; }
        else if (reply.sticker) { replyMediaType = 'sticker'; replyMediaFileId = reply.sticker.file_id; }
        else if (reply.video_note) { replyMediaType = 'video_note'; replyMediaFileId = reply.video_note.file_id; }
        else { replyMessageType = 'text'; }
      }

      const { isForwarded, forwardMeta, forwardSourceChatId, forwardSourceMessageId } = extractForwardMeta(msg);

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
                mediaFileUniqueId,
                mediaMimeType,
                albumMediaIds: allMedia,
                replyMessageType,
                replyMessageText,
                replyMediaFileId,
                replyMediaType,
                isForwarded,
                forwardMeta,
                forwardSourceChatId,
                forwardSourceMessageId,
                updatedBy: BigInt(ctx.from.id),
              } as any);
              await ctx.reply(`✅ آلبوم با ${allMedia.length} رسانه ذخیره شد!`);
            } else if (allMedia) {
              await postService.update(editingPostId, {
                mediaFileId: allMedia[0],
                mediaType,
                mediaFileUniqueId,
                mediaMimeType,
                replyMessageType,
                replyMessageText,
                replyMediaFileId,
                replyMediaType,
                isForwarded,
                forwardMeta,
                forwardSourceChatId,
                forwardSourceMessageId,
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
        mediaFileUniqueId,
        mediaMimeType,
        replyMessageType,
        replyMessageText,
        replyMediaFileId,
        replyMediaType,
        isForwarded,
        forwardMeta,
        forwardSourceChatId,
        forwardSourceMessageId,
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
    cache.setPermanent(editorKey(ctx.from.id, 'active'), postId);
    cache.setPermanent(editorKey(ctx.from.id, 'mode'), 'main');
    const messages = (post.messages || []);
    await ctx.reply(`📝 ${post.title} | ✏️ ویرایشگر (${messages.length} پیام)`, {
      link_preview_options: { is_disabled: true },
      ...postMultiMessageEditorReplyKeyboard(post.isPublished, post.slug === '__start__', post.slug === '__anonymous__'),
    });
    await refreshEditorMessages(ctx, post);
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
      cache.setPermanent(pendingKey(ctx.from.id, 'editing_field'), 'title');
      cache.setPermanent(pendingKey(ctx.from.id, 'editing_post'), postId);
      return safeEdit(ctx, `✏ عنوان فعلی: *${post.title}*\n\nعنوان جدید را ارسال کنید:`, { parse_mode: 'Markdown' });
    }
    if (action === 'content') {
      cache.setPermanent(pendingKey(ctx.from.id, 'editing_field'), 'content');
      cache.setPermanent(pendingKey(ctx.from.id, 'editing_post'), postId);
      const firstMsg = post.messages?.[0]?.text || '';
      const current = firstMsg ? `محتوا فعلی:\n${graphemeTruncate(firstMsg, 200)}` : '(بدون محتوا)';
      return safeEdit(ctx, `📝 ${current}\n\nمحتوای جدید را ارسال کنید (Markdown پشتیبانی می‌شود):`);
    }
    if (action === 'media') {
      cache.setPermanent(pendingKey(ctx.from.id, 'editing_field'), 'media');
      cache.setPermanent(pendingKey(ctx.from.id, 'editing_post'), postId);
      return safeEdit(ctx, '🖼 فایل رسانه ارسال کنید (عکس، ویدیو، گیف، سند، صدا، ویس):');
    }
    if (action === 'buttons') {
      const buttons = (post as any).buttons || [];
      cache.setPermanent(pendingKey(ctx.from.id, 'editing_post'), postId);
      cache.setPermanent(pendingKey(ctx.from.id, 'editor_mode'), 'create');
      cache.del(pendingKey(ctx.from.id, 'editor_state'));
      cache.del(pendingKey(ctx.from.id, 'editor_row'));
      cache.del(pendingKey(ctx.from.id, 'editor_col'));
      const { text, reply_markup } = renderButtonEditor(postId, buttons, 'create');
      const sent = await ctx.reply(text, { reply_markup });
      if (sent) cache.setPermanent(`pbedit:editor_msg_id:${ctx.from.id}`, sent.message_id);
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
    cache.setPermanent(pendingKey(ctx.from.id, 'searching'), true);
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
    cache.setPermanent(pendingKey(ctx.from.id, 'preview_id'), true);
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
    cache.setPermanent(pendingKey(ctx.from.id, 'publish_id'), true);
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
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    cache.setPermanent(editorKey(ctx.from.id, 'active'), postId);
    cache.setPermanent(editorKey(ctx.from.id, 'mode'), 'main');
    const messages = (post.messages || []);
    await ctx.reply(`✅ پست منتشر شد!\n\n📝 ${post.title} | ✏️ ویرایشگر (${messages.length} پیام)`, {
      link_preview_options: { is_disabled: true },
      ...postMultiMessageEditorReplyKeyboard(post.isPublished, post.slug === '__start__', post.slug === '__anonymous__'),
    });
    await refreshEditorMessages(ctx, post);
  });

  bot.action(/^post:draft:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    await postService.update(postId, { status: PostStatus.DRAFT, updatedBy: BigInt(ctx.from.id) } as any);
    postService.invalidateCache();
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    cache.setPermanent(editorKey(ctx.from.id, 'active'), postId);
    cache.setPermanent(editorKey(ctx.from.id, 'mode'), 'main');
    const messages = (post.messages || []);
    await ctx.reply(`📝 به عنوان پیش‌نویس ذخیره شد.\n\n📝 ${post.title} | ✏️ ویرایشگر (${messages.length} پیام)`, {
      link_preview_options: { is_disabled: true },
      ...postMultiMessageEditorReplyKeyboard(post.isPublished, post.slug === '__start__', post.slug === '__anonymous__'),
    });
    await refreshEditorMessages(ctx, post);
  });

  // ─── Archive ─────────────────────────────────────────────
  bot.action(/^post:archive:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    await postService.archive(postId);
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    cache.setPermanent(editorKey(ctx.from.id, 'active'), postId);
    cache.setPermanent(editorKey(ctx.from.id, 'mode'), 'main');
    const messages = (post.messages || []);
    await ctx.reply(`📦 پست بایگانی شد.\n\n📝 ${post.title} | ✏️ ویرایشگر (${messages.length} پیام)`, {
      link_preview_options: { is_disabled: true },
      ...postMultiMessageEditorReplyKeyboard(post.isPublished, post.slug === '__start__', post.slug === '__anonymous__'),
    });
    await refreshEditorMessages(ctx, post);
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
    cache.setPermanent(editorKey(ctx.from.id, 'active'), postId);
    cache.setPermanent(editorKey(ctx.from.id, 'mode'), 'main');
    const messages = (updated.messages || []);
    const msg = wasHidden ? '👻 پست اکنون قابل مشاهده است.' : '👻 پست مخفی شد.';
    await ctx.reply(`${msg}\n\n📝 ${updated.title} | ✏️ ویرایشگر (${messages.length} پیام)`, {
      link_preview_options: { is_disabled: true },
      ...postMultiMessageEditorReplyKeyboard(updated.isPublished, updated.slug === '__start__', updated.slug === '__anonymous__'),
    });
    await refreshEditorMessages(ctx, updated);
  });

  // ─── Schedule ────────────────────────────────────────────
  bot.action(/^post:publish:schedule:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    cache.setPermanent(pendingKey(ctx.from.id, 'schedule_publish'), postId);
    await safeEdit(ctx, '📅 تاریخ/زمان را به فرمت ISO ارسال کنید:\nmثلاً `2026-06-15T14:30:00.000Z`', { parse_mode: 'Markdown' });
  });

  bot.action(/^post:unpublish:schedule:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    cache.setPermanent(pendingKey(ctx.from.id, 'schedule_unpublish'), postId);
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
    cache.setPermanent(pendingKey(ctx.from.id, 'alias_cmd_id'), commandId);
    cache.setPermanent(pendingKey(ctx.from.id, 'editing_post'), postId);
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
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    cache.setPermanent(editorKey(ctx.from.id, 'active'), postId);
    cache.setPermanent(editorKey(ctx.from.id, 'mode'), 'main');
    const messages = (post.messages || []);
    await ctx.reply(`📥 انتشار پست لغو شد.\n\n📝 ${post.title} | ✏️ ویرایشگر (${messages.length} پیام)`, {
      link_preview_options: { is_disabled: true },
      ...postMultiMessageEditorReplyKeyboard(post.isPublished, post.slug === '__start__', post.slug === '__anonymous__'),
    });
    await refreshEditorMessages(ctx, post);
  });

  // ─── Delete ─────────────────────────────────────────────
  bot.action(/^post:delete:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    if (post.slug === '__start__' || post.slug === '__anonymous__') return ctx.reply('❌ پیام سیستمی قابل حذف نیست.');
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
    if (post.slug === '__start__' || post.slug === '__anonymous__') return ctx.reply('❌ پیام سیستمی قابل حذف نیست.');
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
      cache.setPermanent(pendingKey(ctx.from.id, 'editor_mode'), 'create');
      cache.setPermanent(pendingKey(ctx.from.id, 'editor_state'), 'select_type');
      cache.setPermanent(pendingKey(ctx.from.id, 'editing_post'), postId);
      await ctx.reply('❇️ نوع دکمه را انتخاب کنید:', buildButtonTypeSelectionKeyboard());
    } else if (savedView && ['create', 'edit', 'delete', 'move'].includes(savedView)) {
      cache.setPermanent(pendingKey(ctx.from.id, 'editor_mode'), savedView);
      cache.setPermanent(pendingKey(ctx.from.id, 'editing_post'), postId);
      await refreshButtonListView(ctx, postId);
    } else {
      cache.setPermanent(pendingKey(ctx.from.id, 'editor_mode'), 'create');
      cache.setPermanent(pendingKey(ctx.from.id, 'editing_post'), postId);
      await refreshButtonListView(ctx, postId);
    }
  });

  // ─── Route guard: pbedit callbacks only work with active edit session ──
  function requireButtonEditSession(ctx: any): number | null {
    const postId = cache.get<number>(pendingKey(ctx.from.id, 'editing_post'));
    if (!postId) {
      ctx.answerCbQuery('❌ دسترسی مستقیم مجاز نیست.\n⬅️ ابتدا وارد بخش پست‌ها شوید.', { show_alert: true }).catch(() => {});
    }
    return postId;
  }

  // ─── NEW BUTTON EDITOR (pbedit) ─────────────────────────
  // State machine: button_idle → select_type → wait_popup/wait_url/wait_command
  // Also handles swap, delete, edit modes on existing buttons.
  // State stored in pendingKey(ctx.from.id, 'editor_state')
  // Post ID stored in pendingKey(ctx.from.id, 'editing_post')

  async function refreshButtonListView(ctx: any, postId: number, removeReplyKeyboard?: boolean) {
    const post = await postService.findById(postId);
    if (!post) return;
    const messageIdx = cache.get<number>(pendingKey(ctx.from.id, 'editing_message_idx')) ?? 0;
    const buttons = extractButtonsForMessage(post, messageIdx);
    const editorMode = cache.get<string>(pendingKey(ctx.from.id, 'editor_mode'));
    const listMode: 'create' | 'edit' | 'delete' | 'move' = editorMode === 'edit' ? 'edit' : editorMode === 'delete' ? 'delete' : editorMode === 'move' ? 'move' : 'create';

    let selectedPos: { row: number; col: number } | undefined;
    if (listMode === 'move') {
      const sr = cache.get<number>(pendingKey(ctx.from.id, 'move_selected_row'));
      const sc = cache.get<number>(pendingKey(ctx.from.id, 'move_selected_col'));
      if (sr !== undefined && sc !== undefined) selectedPos = { row: sr, col: sc };
    }

    const pendingDelete = cache.get<{ row: number; col: number } | null>(pendingKey(ctx.from.id, 'pending_delete'));
    const { text, reply_markup } = renderButtonEditor(postId, buttons, listMode, selectedPos, pendingDelete);

    const existingMsgId = cache.get<number>(`pbedit:editor_msg_id:${ctx.from.id}`);
    if (existingMsgId) {
      try {
        await ctx.telegram.editMessageText(ctx.chat.id, existingMsgId, null, text, { reply_markup });
      } catch (err: any) {
        logger.warn(`[ButtonEditor] editMessageText failed, sending new message: ${err?.message}`);
        const sent = await ctx.reply(text, { reply_markup });
        if (sent) cache.setPermanent(`pbedit:editor_msg_id:${ctx.from.id}`, sent.message_id);
      }
    } else {
      const sent = await ctx.reply(text, { reply_markup });
      if (sent) cache.setPermanent(`pbedit:editor_msg_id:${ctx.from.id}`, sent.message_id);
    }

    if (removeReplyKeyboard) {
      try { await ctx.reply('⌨️', { reply_markup: { remove_keyboard: true } }); } catch {}
    }
  }

  // ─── Reply Keyboard: Move Mode Directional Arrows ─────────
  bot.hears('⬆️ بالا', async (ctx: any, next) => {
    if (!cache.get<boolean>(pendingKey(ctx.from.id, 'move_active'))) return next();
    await handleMoveDirection(ctx, 'up');
  });
  bot.hears('⬇️ پایین', async (ctx: any, next) => {
    if (!cache.get<boolean>(pendingKey(ctx.from.id, 'move_active'))) return next();
    await handleMoveDirection(ctx, 'down');
  });
  bot.hears('⬅️ چپ', async (ctx: any, next) => {
    if (!cache.get<boolean>(pendingKey(ctx.from.id, 'move_active'))) return next();
    await handleMoveDirection(ctx, 'left');
  });
  bot.hears('➡️ راست', async (ctx: any, next) => {
    if (!cache.get<boolean>(pendingKey(ctx.from.id, 'move_active'))) return next();
    await handleMoveDirection(ctx, 'right');
  });
  bot.hears('❌ لغو جابجایی', async (ctx: any, next) => {
    const moveActive = cache.get<boolean>(pendingKey(ctx.from.id, 'move_active'));
    if (!moveActive) return next();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return next();
    const postId = cache.get<number>(pendingKey(ctx.from.id, 'editing_post'));
    if (!postId) return next();
    clearMoveState(ctx.from.id);
    cache.setPermanent(pendingKey(ctx.from.id, 'editor_mode'), 'create');
    cache.setPermanent(pendingKey(ctx.from.id, 'edit_mode'), postId);
    await refreshButtonListView(ctx, postId);
    await ctx.reply('✏️ حالت ویرایش:', buildPostEditorReplyKeyboard());
  });

  bot.hears('✅ بازگشت تایید', async (ctx: any, next) => {
    const moveActive = cache.get<boolean>(pendingKey(ctx.from.id, 'move_active'));
    if (!moveActive) return next();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return next();
    const postId = cache.get<number>(pendingKey(ctx.from.id, 'editing_post'));
    if (!postId) return next();
    clearMoveState(ctx.from.id);
    cache.setPermanent(pendingKey(ctx.from.id, 'editor_mode'), 'create');
    cache.setPermanent(pendingKey(ctx.from.id, 'edit_mode'), postId);
    await refreshButtonListView(ctx, postId);
    await ctx.reply('✏️ حالت ویرایش:', buildPostEditorReplyKeyboard());
  });

  function clearMoveState(userId: number) {
    cache.del(pendingKey(userId, 'move_selected_row'));
    cache.del(pendingKey(userId, 'move_selected_col'));
    cache.del(pendingKey(userId, 'move_active'));
  }

  async function handleMoveDirection(ctx: any, direction: string) {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = cache.get<number>(pendingKey(ctx.from.id, 'editing_post'));
    if (!postId) return;
    const moveActive = cache.get<boolean>(pendingKey(ctx.from.id, 'move_active'));
    if (!moveActive) return;
    const selRow = cache.get<number>(pendingKey(ctx.from.id, 'move_selected_row'));
    const selCol = cache.get<number>(pendingKey(ctx.from.id, 'move_selected_col'));
    if (selRow === undefined || selCol === undefined) return;

    const post = await postService.findById(postId);
    if (!post) return;
    const messageIdx = cache.get<number>(pendingKey(ctx.from.id, 'editing_message_idx')) ?? 0;
    const buttons: any[][] = JSON.parse(JSON.stringify(extractButtonsForMessage(post, messageIdx)));
    if (!buttons[selRow] || buttons[selRow][selCol] === undefined) return;

    const btn = buttons[selRow][selCol];
    let newRow = selRow;
    let newCol = selCol;

    if (direction === 'left') {
      if (selCol <= 0) { await refreshMoveEditor(ctx, postId, buttons, { row: selRow, col: selCol }); return; }
      [buttons[selRow][selCol - 1], buttons[selRow][selCol]] = [buttons[selRow][selCol], buttons[selRow][selCol - 1]];
      newCol = selCol - 1;
    } else if (direction === 'right') {
      if (selCol >= buttons[selRow].length - 1) { await refreshMoveEditor(ctx, postId, buttons, { row: selRow, col: selCol }); return; }
      [buttons[selRow][selCol], buttons[selRow][selCol + 1]] = [buttons[selRow][selCol + 1], buttons[selRow][selCol]];
      newCol = selCol + 1;
    } else if (direction === 'down') {
      const wasSingleton = buttons[selRow].length === 1;
      buttons[selRow].splice(selCol, 1);
      const rowEmpty = buttons[selRow].length === 0;
      if (rowEmpty) buttons.splice(selRow, 1);

      if (!wasSingleton) {
        buttons.splice(selRow + 1, 0, [btn]);
        newRow = selRow + 1;
        newCol = 0;
      } else {
        if (selRow < buttons.length) {
          buttons[selRow].push(btn);
          newRow = selRow;
          newCol = buttons[selRow].length - 1;
        } else {
          buttons.push([btn]);
          newRow = buttons.length - 1;
          newCol = 0;
        }
      }
    } else if (direction === 'up') {
      const wasSingleton = buttons[selRow].length === 1;
      buttons[selRow].splice(selCol, 1);
      const rowEmpty = buttons[selRow].length === 0;
      if (rowEmpty) buttons.splice(selRow, 1);

      if (!wasSingleton) {
        buttons.splice(selRow, 0, [btn]);
        newRow = selRow;
        newCol = 0;
      } else {
        if (selRow > 0) {
          buttons[selRow - 1].unshift(btn);
          newRow = selRow - 1;
          newCol = 0;
        } else {
          buttons.unshift([btn]);
          newRow = 0;
          newCol = 0;
        }
      }
    }

    cache.setPermanent(pendingKey(ctx.from.id, 'move_selected_row'), newRow);
    cache.setPermanent(pendingKey(ctx.from.id, 'move_selected_col'), newCol);
    cache.setPermanent(pendingKey(ctx.from.id, 'move_active'), true);

    await postService.update(postId, { buttons: setMessageButtons((post as any).buttons, messageIdx, buttons) } as any);

    await refreshMoveEditor(ctx, postId, buttons, { row: newRow, col: newCol });

    const moveReplyKb = buildMoveReplyKeyboard(newRow, newCol, buttons);
    await ctx.reply(`📍 جهت بعدی:`, moveReplyKb);
  }

  async function refreshMoveEditor(ctx: any, postId: number, buttons: any[][], selectedPos: { row: number; col: number }) {
    const msgId = cache.get<number>(`pbedit:editor_msg_id:${ctx.from.id}`);
    if (msgId) {
      const { text, reply_markup } = renderButtonEditor(postId, buttons, 'move', selectedPos);
      try { await ctx.telegram.editMessageText(ctx.chat.id, msgId, null, text, { reply_markup }); } catch {}
    }
  }

  // ─── Handler: "➕ اضافه کردن دکمه جدید" (legacy reply keyboard) ──
  bot.hears('➕ اضافه کردن دکمه جدید', async (ctx: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = cache.get<number>(pendingKey(ctx.from.id, 'editing_post'));
    if (!postId) return;
    cache.setPermanent(pendingKey(ctx.from.id, 'editor_state'), 'select_type');
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
    cache.setPermanent(pendingKey(ctx.from.id, 'previous_view'), state);
    cache.setPermanent(pendingKey(ctx.from.id, 'button_type'), 'url');
    cache.setPermanent(pendingKey(ctx.from.id, 'editor_mode'), 'create');
    cache.setPermanent(pendingKey(ctx.from.id, 'editor_state'), 'wait_color');
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
    cache.setPermanent(pendingKey(ctx.from.id, 'previous_view'), state);
    cache.setPermanent(pendingKey(ctx.from.id, 'button_type'), 'popup');
    cache.setPermanent(pendingKey(ctx.from.id, 'editor_mode'), 'create');
    cache.setPermanent(pendingKey(ctx.from.id, 'editor_state'), 'wait_color');
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
    cache.setPermanent(pendingKey(ctx.from.id, 'previous_view'), state);
    cache.setPermanent(pendingKey(ctx.from.id, 'button_type'), 'command');
    cache.setPermanent(pendingKey(ctx.from.id, 'editor_mode'), 'create');
    cache.setPermanent(pendingKey(ctx.from.id, 'editor_state'), 'wait_color');
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

    // ─── MOVE MODE — legacy handler removed, new handlers at lines 1306+ ──
    if (state === 'move') {
      return next();
    }

    if (!state || !['wait_popup', 'wait_url', 'wait_command', 'wait_color'].includes(state)) return next();

    // ─── WAIT_COLOR state ──────────────────────────────────
    if (state === 'wait_color') {
      if (ctx.message.text === '❌ لغو') {
        cache.del(pendingKey(ctx.from.id, 'editor_state'));
        cache.del(pendingKey(ctx.from.id, 'button_color'));
        cache.del(pendingKey(ctx.from.id, 'button_type'));
        cache.del(pendingKey(ctx.from.id, 'editor_row'));
        cache.del(pendingKey(ctx.from.id, 'editor_col'));
        await ctx.reply('✏️ حالت ویرایش:', postEditMessageReplyKeyboard());
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
        cache.setPermanent(pendingKey(ctx.from.id, 'button_color'), color);
        const btnType = cache.get<string>(pendingKey(ctx.from.id, 'button_type'));
        if (btnType === 'url') {
          cache.setPermanent(pendingKey(ctx.from.id, 'editor_state'), 'wait_url');
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
          cache.setPermanent(pendingKey(ctx.from.id, 'editor_state'), 'wait_popup');
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
          cache.setPermanent(pendingKey(ctx.from.id, 'editor_state'), 'wait_command');
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
        return await refreshButtonListView(ctx, postId);
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
      const buttons: any[][] = JSON.parse(JSON.stringify(extractButtonsForMessage(post, messageIdx)));
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
      cache.setPermanent(pendingKey(ctx.from.id, 'editor_mode'), 'create');
      await ctx.reply('✅ رنگ دکمه تغییر کرد.');
      await ctx.reply('✏️ حالت ویرایش:', postEditMessageReplyKeyboard());
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
    const buttons: any[][] = JSON.parse(JSON.stringify(extractButtonsForMessage(post, messageIdx)));

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
    cache.setPermanent(pendingKey(ctx.from.id, 'editor_mode'), 'create');
    await ctx.reply('✅ تغییرات دکمه انجام شد.', { reply_markup: { remove_keyboard: true } });
    await ctx.reply('✏️ ویرایشگر پست:', postEditMessageReplyKeyboard());
    await refreshButtonListView(ctx, postId);
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
    if (!requireButtonEditSession(ctx)) return;
    const row = parseInt(ctx.match[2]);
    const col = parseInt(ctx.match[3]);
    const post = await postService.findById(postId);
    if (!post) return safeEdit(ctx, '❌ پست یافت نشد.');
    const messageIdx = cache.get<number>(pendingKey(ctx.from.id, 'editing_message_idx')) ?? 0;
    const buttons: any[][] = JSON.parse(JSON.stringify(extractButtonsForMessage(post, messageIdx)));
    const mode = cache.get<string>(pendingKey(ctx.from.id, 'editor_mode')) || 'create';

    if (mode === 'move') {
      cache.setPermanent(pendingKey(ctx.from.id, 'move_selected_row'), row);
      cache.setPermanent(pendingKey(ctx.from.id, 'move_selected_col'), col);
      cache.setPermanent(pendingKey(ctx.from.id, 'move_active'), true);

      const msgId = cache.get<number>(`pbedit:editor_msg_id:${ctx.from.id}`);
      if (msgId) {
        const { text, reply_markup } = renderButtonEditor(postId, buttons, 'move', { row, col });
        try { await ctx.telegram.editMessageText(ctx.chat.id, msgId, null, text, { reply_markup }); } catch {}
      }

      const replyKb = buildMoveReplyKeyboard(row, col, buttons);
      await ctx.reply(`🔀 "${buttons[row][col].text}" انتخاب شد. جهت را انتخاب کنید:`, replyKb);
      return;
    }

    if (mode === 'delete') {
      if (buttons[row] && buttons[row][col] !== undefined) {
        cache.del(pendingKey(ctx.from.id, 'pending_delete'));
        const deletedText = buttons[row][col].text || '';
        buttons[row].splice(col, 1);
        if (buttons[row].length === 0) buttons.splice(row, 1);
        await postService.update(postId, { buttons: setMessageButtons((post as any).buttons, messageIdx, buttons) } as any);
        cache.del(pendingKey(ctx.from.id, 'editor_state'));
        cache.del(pendingKey(ctx.from.id, 'editor_row'));
        cache.del(pendingKey(ctx.from.id, 'editor_col'));
        cache.setPermanent(pendingKey(ctx.from.id, 'editor_mode'), 'create');
        await refreshButtonListView(ctx, postId);
      }
      return;
    }

    if (mode === 'edit') {
      // Show edit type selection for the clicked button
      const btn = buttons[row]?.[col];
      if (!btn) return safeEdit(ctx, '❌ دکمه یافت نشد.');
      cache.setPermanent(pendingKey(ctx.from.id, 'editor_row'), row);
      cache.setPermanent(pendingKey(ctx.from.id, 'editor_col'), col);
      cache.setPermanent(pendingKey(ctx.from.id, 'editor_mode'), 'edit');
      const currentType = btn.type === 'POPUP' ? '🪟 POP-UP' : btn.type === 'COMMAND' ? '⌨️ دستور' : '🔗 لینک';
      const colorText = btn.style && btn.style !== 'default' ? `🎨 ${btn.style}` : '⚪ بدون رنگ';
      await safeEdit(ctx,
        `🔧 شما در حالت تنظیمات پیام هستید.\n❇️ حالت دکمه را انتخاب کنید.\n\nℹ️ مقدار فعلی:\n${currentType}\n${btn.text}: ${btn.value || ''}\n${colorText}`,
        buildEditButtonTypeKeyboard(postId, row, col, btn.style));
      return;
    }

    // Default: create mode — add a new default button, then enter edit mode for it
    const newRow = row + 1;
    buttons.splice(newRow, 0, [{ text: 'دکمه جدید', type: 'URL', value: '' }]);
    logger.info(`[ButtonEditor] create placeholder postId=${postId} messageIdx=${messageIdx} row=${newRow}`);
    try {
      await postService.update(postId, { buttons: setMessageButtons((post as any).buttons, messageIdx, buttons) } as any);
      logger.info(`[ButtonEditor] persist keyboard postId=${postId}`);
    } catch (e: any) {
      logger.error(`[ButtonEditor] persist failed postId=${postId}: ${e.message}`);
      await ctx.reply('❌ خطا در ذخیره دکمه.');
      return;
    }
    cache.setPermanent(pendingKey(ctx.from.id, 'editor_row'), newRow);
    cache.setPermanent(pendingKey(ctx.from.id, 'editor_col'), 0);
    cache.setPermanent(pendingKey(ctx.from.id, 'editor_mode'), 'create');
    await refreshButtonListView(ctx, postId);
    logger.info(`[ButtonEditor] sync complete postId=${postId}`);
    return;
  });

  // ─── Handler: Set mode (create / edit / delete / move) ──
  bot.action(/^pbedit:mode:(create|edit|delete|move):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[2]);
    if (!requireButtonEditSession(ctx)) return;
    const mode = ctx.match[1];
    const post = await postService.findById(postId);
    if (!post) return safeEdit(ctx, '❌ پست یافت نشد.');
    const messageIdx = cache.get<number>(pendingKey(ctx.from.id, 'editing_message_idx')) ?? 0;
    const buttons: any[][] = JSON.parse(JSON.stringify(extractButtonsForMessage(post, messageIdx)));

    cache.setPermanent(pendingKey(ctx.from.id, 'editor_mode'), mode);
    cache.del(pendingKey(ctx.from.id, 'editor_state'));
    cache.del(pendingKey(ctx.from.id, 'editor_row'));
    cache.del(pendingKey(ctx.from.id, 'editor_col'));
    if (mode === 'move') {
      clearMoveState(ctx.from.id);
    }
    await refreshButtonListView(ctx, postId);
  });

  // ─── Handler: Select edit button type ──────────────────
  bot.action(/^pbedit:type:(url|popup|command):(\d+):(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[2]);
    if (!requireButtonEditSession(ctx)) return;
    const btnType = ctx.match[1];
    const row = parseInt(ctx.match[3]);
    const col = parseInt(ctx.match[4]);
    const currentMode = cache.get<string>(pendingKey(ctx.from.id, 'editor_mode')) || 'edit';
    cache.setPermanent(pendingKey(ctx.from.id, 'previous_view'), currentMode);
    cache.setPermanent(pendingKey(ctx.from.id, 'editor_state'), `wait_${btnType}`);
    cache.setPermanent(pendingKey(ctx.from.id, 'editor_mode'), 'edit');
    cache.setPermanent(pendingKey(ctx.from.id, 'editor_row'), row);
    cache.setPermanent(pendingKey(ctx.from.id, 'editor_col'), col);

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
    if (!requireButtonEditSession(ctx)) return;
    const prevMode = cache.get<string>(pendingKey(ctx.from.id, 'previous_view')) || 'create';
    cache.setPermanent(pendingKey(ctx.from.id, 'editor_mode'), prevMode);
    cache.del(pendingKey(ctx.from.id, 'editor_state'));
    cache.del(pendingKey(ctx.from.id, 'editor_row'));
    cache.del(pendingKey(ctx.from.id, 'editor_col'));
    cache.del(pendingKey(ctx.from.id, 'previous_view'));
    await refreshButtonListView(ctx, postId);
  });

  // ─── Handler: Select button color ─────────────────────────
  bot.action(/^pbedit:color:(\d+):(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    if (!requireButtonEditSession(ctx)) return;
    const row = parseInt(ctx.match[2]);
    const col = parseInt(ctx.match[3]);
    cache.setPermanent(pendingKey(ctx.from.id, 'editor_state'), 'wait_color');
    cache.setPermanent(pendingKey(ctx.from.id, 'editor_row'), row);
    cache.setPermanent(pendingKey(ctx.from.id, 'editor_col'), col);
    await ctx.reply('🎨 رنگ دکمه را انتخاب کنید:', buildButtonColorSelectionKeyboard());
  });

  // ─── Handler: Add new row (from pbedit:addrow inline button) ──
  bot.action(/^pbedit:addrow:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    if (!requireButtonEditSession(ctx)) return;
    const realPostId = cache.get<number>(pendingKey(ctx.from.id, 'editing_post')) || postId;
    const post = await postService.findById(realPostId);
    if (!post) return safeEdit(ctx, '❌ پست یافت نشد.');
    const messageIdx = cache.get<number>(pendingKey(ctx.from.id, 'editing_message_idx')) ?? 0;
    const buttons: any[][] = JSON.parse(JSON.stringify(extractButtonsForMessage(post, messageIdx)));
    buttons.push([{ text: 'دکمه جدید', type: 'URL', value: '' }]);
    await postService.update(realPostId, { buttons: setMessageButtons((post as any).buttons, messageIdx, buttons) } as any);
    cache.setPermanent(pendingKey(ctx.from.id, 'editor_mode'), 'create');
    cache.del(pendingKey(ctx.from.id, 'editor_state'));
    cache.del(pendingKey(ctx.from.id, 'editor_row'));
    cache.del(pendingKey(ctx.from.id, 'editor_col'));
    await refreshButtonListView(ctx, realPostId);
    cache.setPermanent(pendingKey(ctx.from.id, 'editor_state'), 'select_type');
    cache.setPermanent(pendingKey(ctx.from.id, 'editor_row'), buttons.length - 1);
    cache.setPermanent(pendingKey(ctx.from.id, 'editor_col'), 0);
    await ctx.reply('✅ ردیف جدید اضافه شد.\n❇️ نوع دکمه را انتخاب کنید:', buildButtonTypeSelectionKeyboard());
  });

  // ─── Handler: Exit button editor (from inline keyboard) ──
  bot.action(/^pbedit:exit:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    clearButtonEditorState(ctx.from.id);
    cache.del(`pbedit:editor_msg_id:${ctx.from.id}`);
    delete ctx.session?.pbedit;
    cache.setPermanent(`post_mgmt_mode:${ctx.from.id}`, true);
    await showPostListFromLayout(ctx);
  });


  bot.hears('🚪 خروج از تنظیمات پیام', async (ctx: any) => {
    clearButtonEditorState(ctx.from.id);
    delete ctx.session?.pbedit;
    cache.setPermanent(`post_mgmt_mode:${ctx.from.id}`, true);
    return showPostListFromLayout(ctx);
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
    cache.setPermanent(pendingKey(ctx.from.id, 'edit_mode'), postId);
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
    cache.setPermanent(pendingKey(ctx.from.id, 'edit_mode'), postId);
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
    cache.setPermanent(pendingKey(ctx.from.id, 'editing_field'), 'content');
    cache.setPermanent(pendingKey(ctx.from.id, 'editing_post'), postId);
    const firstMsg = post.messages?.[0]?.text || '';
    const current = firstMsg ? `محتوا فعلی:\n${graphemeTruncate(firstMsg, 200)}` : '(بدون محتوا)';
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
    cache.setPermanent(pendingKey(ctx.from.id, 'editing_field'), 'title');
    cache.setPermanent(pendingKey(ctx.from.id, 'editing_post'), postId);
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
    cache.setPermanent(pendingKey(ctx.from.id, 'editing_post'), postId);
    const firstMsgId = post.messages?.[0]?.id ?? 0;
    cache.setPermanent(pendingKey(ctx.from.id, 'editing_message_idx'), firstMsgId);
    cache.setPermanent(pendingKey(ctx.from.id, 'edit_mode'), postId);
    cache.setPermanent(pendingKey(ctx.from.id, 'editor_mode'), 'create');
    cache.del(pendingKey(ctx.from.id, 'editor_state'));
    const buttons = extractButtonsForMessage(post, 0);
    const { text: editorText, reply_markup } = renderButtonEditor(postId, buttons, 'create');
    const sent = await ctx.reply(editorText, { reply_markup });
    if (sent) cache.setPermanent(`pbedit:editor_msg_id:${ctx.from.id}`, sent.message_id);
  });

  // 🖼 ویرایش رسانه
  bot.hears('🖼 ویرایش رسانه', async (ctx: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = cache.get<number>(pendingKey(ctx.from.id, 'edit_mode'));
    if (!postId) return;
    cache.setPermanent(pendingKey(ctx.from.id, 'editing_field'), 'media');
    cache.setPermanent(pendingKey(ctx.from.id, 'editing_post'), postId);
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

  // 🗑 حذف پست: Ask confirmation, then delete, clear cache, go back to post list
  bot.hears('🗑 حذف پست', async (ctx: any, next: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = cache.get<number>(pendingKey(ctx.from.id, 'edit_mode'));
    if (!postId) return next();
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    cache.setPermanent(pendingKey(ctx.from.id, 'delete_post_id'), postId);
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

  // ❌ انصراف: Cancel delete, return to editor
  bot.hears('❌ انصراف', async (ctx: any, next: any) => {
    if (!ctx.from) return next();
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin || !isPostAdmin(admin)) return next();
    const postId = cache.get<number>(pendingKey(ctx.from.id, 'delete_post_id'));
    if (!postId) return next();
    cache.del(pendingKey(ctx.from.id, 'delete_post_id'));
    const post = await postService.findById(postId);
    if (!post) { await ctx.reply('❌ پست یافت نشد.'); return; }
    cache.setPermanent(editorKey(ctx.from.id, 'active'), postId);
    cache.setPermanent(editorKey(ctx.from.id, 'mode'), 'main');
    const messages = (post.messages || []);
    await ctx.reply(`✅ عملیات حذف لغو شد.\n\n📝 ${post.title} | ✏️ ویرایشگر (${messages.length} پیام)`, {
      link_preview_options: { is_disabled: true },
      ...postMultiMessageEditorReplyKeyboard(post.isPublished, post.slug === '__start__', post.slug === '__anonymous__'),
    });
    await refreshEditorMessages(ctx, post);
  });

  // 🔙 بازگشت: Handle back in both editor mode and edit mode
  bot.hears('🔙 بازگشت', async (ctx: any, next: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;

    // Check if in multi-message editor
    const editorPostId = cache.get<number>(editorKey(ctx.from.id, 'active'));
    if (editorPostId) {
      const mode = cache.get<string>(editorKey(ctx.from.id, 'mode')) || 'main';

      // New post manager mode → return to post list
      if (mode === 'new_post_manager') {
        clearAllWaitingStates(ctx.from.id);
        clearEditorKeyState(ctx.from.id);
        cache.del(editorKey(ctx.from.id, 'active'));
        cache.del(editorKey(ctx.from.id, 'mode'));
        cache.setPermanent(`post_mgmt_mode:${ctx.from.id}`, true);
        await showPostListFromLayout(ctx);
        return;
      }

      if (mode === 'add_message' || mode === 'add_command' || mode === 'edit_message' || mode === 'edit_content' || mode === 'edit_title') {
        cache.setPermanent(editorKey(ctx.from.id, 'mode'), 'main');
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
    if (post.slug === '__start__' || post.slug === '__anonymous__') return ctx.reply('❌ پیام سیستمی قابل مخفی‌سازی نیست.');
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
    if (post.slug === '__start__' || post.slug === '__anonymous__') return ctx.reply('❌ پیام سیستمی قابل بایگانی نیست.');
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
    if (post.slug === '__start__' || post.slug === '__anonymous__') return ctx.reply('❌ پیام سیستمی قابل حذف نیست.');
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
    if (post.slug === '__start__' || post.slug === '__anonymous__') return ctx.reply('❌ پیام سیستمی قابل حذف نیست.');
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
    if (post.slug === '__start__' || post.slug === '__anonymous__') return ctx.reply('❌ پیام سیستمی قابل حذف نیست.');
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
    if (post.slug === '__start__' || post.slug === '__anonymous__') return ctx.reply('❌ پیام سیستمی قابل حذف نیست.');
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
    cache.setPermanent(`post_mgmt_mode:${ctx.from.id}`, true);
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
    cache.setPermanent(editorKey(ctx.from.id, 'active'), postId);
    cache.setPermanent(editorKey(ctx.from.id, 'mode'), 'main');
    cache.del(editorKey(ctx.from.id, 'msg_idx'));
    cache.del(editorKey(ctx.from.id, 'message_ids'));

    try {
      await refreshEditorMessages(ctx, post);
      trace.info(`enterPostEditor OK postId=${postId} duration=${trace.duration()}ms`);
    } catch (e: any) {
      trace.error(`enterPostEditor FAILED postId=${postId} error=${e.message}`);
      cache.del(editorKey(ctx.from.id, 'active'));
      cache.del(editorKey(ctx.from.id, 'mode'));
      cache.del(editorKey(ctx.from.id, 'msg_idx'));
      cache.del(editorKey(ctx.from.id, 'message_ids'));
      try { await ctx.reply('❌ خطا در نمایش ویرایشگر. لطفاً دوباره تلاش کنید.'); } catch (_) {}
    }
  }

  async function refreshEditorMessages(ctx: any, post: any) {
    const postId = post.id;
    const messages = (post.messages || []);

    const oldMsgIds = cache.get<number[]>(editorKey(ctx.from.id, 'message_ids')) || [];
    for (const msgId of oldMsgIds) {
      try { await ctx.deleteMessage(msgId); } catch (e) {}
    }

    try {
      await ctx.reply(`📝 ${post.title} | ✏️ ویرایشگر (${messages.length} پیام)`, {
        link_preview_options: { is_disabled: true },
        ...postMultiMessageEditorReplyKeyboard(post.isPublished, post.slug === '__start__', post.slug === '__anonymous__'),
      });
    } catch (e: any) {
      await ctx.reply(`📝 ${post.title} | ✏️ ویرایشگر (${messages.length} پیام)`, {
        ...postMultiMessageEditorReplyKeyboard(post.isPublished, post.slug === '__start__', post.slug === '__anonymous__'),
      });
    }

    const MEDIA_TYPES = ['photo', 'video', 'animation', 'document', 'audio', 'voice', 'video_note', 'sticker'];
    const MEDIA_METHODS: Record<string, string> = {
      photo: 'replyWithPhoto', video: 'replyWithVideo', animation: 'replyWithAnimation',
      document: 'replyWithDocument', audio: 'replyWithAudio', voice: 'replyWithVoice',
      video_note: 'replyWithVideoNote', sticker: 'replyWithSticker',
    };

    const newMsgIds: number[] = [];
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const msgText = msg.text || '';
      const isForward = msg.messageType === 'forward' && msg.forwardSource;
      const isMedia = MEDIA_TYPES.includes(msg.messageType) && msg.mediaFileId;
      const label = `📨 *پیام ${i + 1} از ${messages.length}*`;
      const keyboard = postSingleMessageInlineKeyboard(postId, msg, i, messages.length);

      if (isForward) {
        const fs = msg.forwardSource;
        const sourceTitle = fs.sourceTitle || 'ناشناس';
        const previewText = `${label}\n\n↪️ فوروارد شده از:\n${sourceTitle}`;
        try {
          const sent = await ctx.reply(previewText, {
            parse_mode: 'Markdown',
            link_preview_options: { is_disabled: true },
            ...keyboard,
          });
          if (sent) newMsgIds.push(sent.message_id);
        } catch (e) {
          const sent = await ctx.reply(previewText, { ...keyboard });
          if (sent) newMsgIds.push(sent.message_id);
        }
      } else if (isMedia) {
        const labelText = msg.caption ? `${label}\n\n💬 ${msg.caption}` : label;
        try {
          const sent = await ctx.reply(labelText, {
            parse_mode: 'Markdown',
            link_preview_options: { is_disabled: true },
            ...keyboard,
          });
          if (sent) newMsgIds.push(sent.message_id);
        } catch (e) {
          const sent = await ctx.reply(labelText, { ...keyboard });
          if (sent) newMsgIds.push(sent.message_id);
        }
        try {
          const sendMethod = MEDIA_METHODS[msg.messageType] || 'replyWithDocument';
          const mediaOpts: any = {};
          if (msg.caption && msg.messageType !== 'sticker' && msg.messageType !== 'video_note') {
            mediaOpts.caption = msg.caption;
          }
          const sent = await ctx[sendMethod](msg.mediaFileId, mediaOpts);
          if (sent) newMsgIds.push(sent.message_id);
        } catch (e) {
          try {
            const sent = await ctx.reply('⚠️ رسانه قابل نمایش نیست');
            if (sent) newMsgIds.push(sent.message_id);
          } catch (_) {}
        }
      } else {
        try {
          const sent = await ctx.reply(`${label}\n\n${msgText}`, {
            parse_mode: 'Markdown',
            link_preview_options: { is_disabled: true },
            ...keyboard,
          });
          if (sent) newMsgIds.push(sent.message_id);
        } catch (e) {
          const sent = await ctx.reply(`${label}\n\n${msgText}`, { ...keyboard });
          if (sent) newMsgIds.push(sent.message_id);
        }
      }
    }
    cache.setPermanent(editorKey(ctx.from.id, 'message_ids'), newMsgIds);
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
  }

  async function openEditorAfterMessageCreate(ctx: any, postId: number, isForwarded?: boolean) {
    cache.setPermanent(editorKey(ctx.from.id, 'mode'), 'main');
    cache.del(editorKey(ctx.from.id, 'msg_idx'));
    postService.invalidateCache();
    await ctx.reply(isForwarded ? '✅ پیام فورواردی اضافه شد' : '✅ پیام اضافه شد');
    try {
      const updated = await postService.findById(postId);
      if (updated) await refreshEditorMessages(ctx, updated);
    } catch (e: any) {
      logger.error(`[MsgAdd] refresh failed postId=${postId}: ${e.message}`);
      try { await ctx.reply('⚠️ پیام ذخیره شد اما نمایش ویرایشگر با خطا مواجه شد. دوباره وارد پست شوید.'); } catch (_) {}
    }
  }

  // ─── Per-Message Callbacks ─────────────────────────────

  bot.action(/^post:msg:edit:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const messageId = parseInt(ctx.match[2]);
    cache.setPermanent(editorKey(ctx.from.id, 'active'), postId);
    cache.setPermanent(editorKey(ctx.from.id, 'mode'), 'edit_message');
    cache.setPermanent(editorKey(ctx.from.id, 'msg_idx'), messageId);
    try {
      const post = await postService.findById(postId);
      if (!post) return ctx.reply('❌ پست یافت نشد.');
      const messages = post.messages || [];
      const msg = messages.find((m: any) => m.id === messageId);
      if (!msg) return ctx.reply('❌ پیام یافت نشد.');
      const msgText = msg.text || '(بدون محتوا)';
      await ctx.reply(`✏️ ویرایش پیام:\n\n${msgText}`, {
        ...postEditMessageReplyKeyboard(),
      });
    } catch (e: any) {
      logger.error(`[MsgEdit] Failed postId=${postId} messageId=${messageId}: ${e.message}`, { postId, messageId, userId: ctx.from?.id });
      cache.setPermanent(editorKey(ctx.from.id, 'mode'), 'main');
      cache.del(editorKey(ctx.from.id, 'msg_idx'));
      try { await ctx.reply('❌ خطا در ویرایش پیام. لطفاً دوباره تلاش کنید.'); } catch (_) {}
    }
  });

  bot.action(/^post:msg:delete:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const messageId = parseInt(ctx.match[2]);
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    const messages = post.messages || [];
    const msg = messages.find((m: any) => m.id === messageId);
    if (!msg) return ctx.reply('❌ پیام یافت نشد.');
    logger.debug('[PostEditor][MessageDelete] postId=%d messageId=%d', postId, messageId);
    await prisma.postMessage.delete({ where: { id: messageId } });
    const remaining = await prisma.postKeyboard.findMany({ where: { messageId } });
    logger.info('[PostEditor][MessageDelete] deleted messageId=%d remainingKeyboards=%d', messageId, remaining.length);
    postService.invalidateCache();
    const updated = await postService.findById(postId);
    if (updated) await refreshEditorMessages(ctx, updated);
    await ctx.reply('✅ پیام حذف شد.');
  });

  bot.action(/^post:msg:up:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const messageId = parseInt(ctx.match[2]);
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    const messages = post.messages || [];
    const msgIdx = messages.findIndex((m: any) => m.id === messageId);
    if (msgIdx <= 0) return;
    const msgId = messages[msgIdx].id;
    const prevMsgId = messages[msgIdx - 1].id;
    const currentOrder = messages[msgIdx].order;
    const prevOrder = messages[msgIdx - 1].order;
    await postMessageService.swapOrder(msgId, currentOrder, prevMsgId, prevOrder, postId);
    postService.invalidateCache();
    const updated = await postService.findById(postId);
    if (updated) await refreshEditorMessages(ctx, updated);
  });

  bot.action(/^post:msg:down:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const messageId = parseInt(ctx.match[2]);
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    const messages = post.messages || [];
    const msgIdx = messages.findIndex((m: any) => m.id === messageId);
    if (msgIdx < 0 || msgIdx >= messages.length - 1) return ctx.reply('❌ در پایین‌ترین موقعیت.');
    const msgId = messages[msgIdx].id;
    const nextMsgId = messages[msgIdx + 1].id;
    const currentOrder = messages[msgIdx].order;
    const nextOrder = messages[msgIdx + 1].order;
    await postMessageService.swapOrder(msgId, currentOrder, nextMsgId, nextOrder, postId);
    postService.invalidateCache();
    const updated = await postService.findById(postId);
    if (updated) await refreshEditorMessages(ctx, updated);
  });

  bot.action(/^post:msg:add:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    cache.setPermanent(editorKey(ctx.from.id, 'active'), postId);
    cache.setPermanent(editorKey(ctx.from.id, 'mode'), 'add_message');
    cache.del(editorKey(ctx.from.id, 'msg_idx'));
    try {
      await ctx.reply('🔧 افزودن پیام جدید\n\n❇️ پیام جدید را وارد کنید.\nهمچنین می‌توانید متن را از چت یا کانال دیگری «باز ارسال» کنید.', {
        ...postAddMessageReplyKeyboard(),
      });
    } catch (e: any) {
      logger.error(`[MsgAdd] Failed postId=${postId}: ${e.message}`, { postId, userId: ctx.from?.id });
      cache.setPermanent(editorKey(ctx.from.id, 'mode'), 'main');
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
          cache.setPermanent(editorKey(ctx.from.id, 'mode'), 'add_message');
          cache.del(editorKey(ctx.from.id, 'msg_idx'));
          await ctx.reply('🔧 افزودن پیام جدید\n\n❇️ پیام جدید را وارد کنید.\nهمچنین می‌توانید متن را از چت یا کانال دیگری «باز ارسال» کنید.', {
            ...postAddMessageReplyKeyboard(),
          });
          return;
        }
        case '🔗 دستور': {
          cache.setPermanent(editorKey(ctx.from.id, 'mode'), 'add_command');
          const existingCmd = await postService.getCommandByPostId(editorPostId);
          const statusLine = existingCmd ? `دستور پست: /${existingCmd.command}` : 'دستور پست: ندارد';
          await ctx.reply(`🔗 نام دستور را ارسال کنید (بدون /):\n\n${statusLine}\n\nمثال: sgb/discount/rules`, {
            ...postCommandSubMenuKeyboard(!!existingCmd),
          });
          return;
        }
        case '❌ حذف دستور': {
          try {
            await postService.removeCommandByPostId(editorPostId);
            await ctx.reply('✅ دستور پست حذف شد.');
          } catch (err: any) {
            await ctx.reply(`❌ ${err.message || 'حذف دستور ناموفق بود.'}`);
          }
          cache.setPermanent(editorKey(ctx.from.id, 'mode'), 'main');
          const updatedPost = await postService.findById(editorPostId);
          if (updatedPost) await refreshEditorMessages(ctx, updatedPost);
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
          await safeEdit(ctx, `📤 گزینه‌های انتشار برای "${post.title}":`, postPublishOptionsKeyboard(editorPostId));
          return;
        }
        case '🗑 حذف پست': {
          if (post.slug === '__start__' || post.slug === '__anonymous__') return ctx.reply('❌ پیام سیستمی قابل حذف نیست.');
          cache.setPermanent(pendingKey(ctx.from.id, 'delete_post_id'), editorPostId);
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
          cache.setPermanent(editorKey(ctx.from.id, 'mode'), 'add_message');
          cache.del(editorKey(ctx.from.id, 'msg_idx'));
          await ctx.reply('🔧 افزودن پیام جدید\n\n❇️ پیام جدید را وارد کنید.\nهمچنین می‌توانید متن را از چت یا کانال دیگری «باز ارسال» کنید.', {
            ...postAddMessageReplyKeyboard(),
          });
          return;
        }
        case '🔗 دستور': {
          cache.setPermanent(editorKey(ctx.from.id, 'mode'), 'add_command');
          const existingCmd = await postService.getCommandByPostId(editorPostId);
          const statusLine = existingCmd ? `دستور پست: /${existingCmd.command}` : 'دستور پست: ندارد';
          await ctx.reply(`🔗 نام دستور را ارسال کنید (بدون /):\n\n${statusLine}\n\nمثال: sgb/discount/rules`, {
            ...postCommandSubMenuKeyboard(!!existingCmd),
          });
          return;
        }
        case '❌ حذف دستور': {
          try {
            await postService.removeCommandByPostId(editorPostId);
            await ctx.reply('✅ دستور پست حذف شد.');
          } catch (err: any) {
            await ctx.reply(`❌ ${err.message || 'حذف دستور ناموفق بود.'}`);
          }
          cache.setPermanent(editorKey(ctx.from.id, 'mode'), 'main');
          const updatedPost = await postService.findById(editorPostId);
          if (updatedPost) await refreshEditorMessages(ctx, updatedPost);
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
          const postTitle = (await postService.findById(editorPostId))?.title || '';
          await ctx.reply(`📤 گزینه‌های انتشار برای "${postTitle}":`, postPublishOptionsKeyboard(editorPostId));
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
          cache.setPermanent(pendingKey(ctx.from.id, 'delete_post_id'), editorPostId);
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
        const messageIdx = cache.get<number>(pendingKey(ctx.from.id, 'editing_message_idx')) ?? 0;
        const buttons: any[][] = JSON.parse(JSON.stringify(extractButtonsForMessage(post, messageIdx)));
        if (!buttons[row] || !buttons[row][col]) return ctx.reply('❌ دکمه یافت نشد.');

        const { newRow, newCol } = moveButtonInLayout(buttons, row, col, text === '⬆️ بالا' ? 'up' : 'down');

        await postService.update(editorPostId, { buttons: setMessageButtons((post as any).buttons, messageIdx, buttons) } as any);
        cache.setPermanent(pendingKey(ctx.from.id, 'editor_row'), newRow);
        cache.setPermanent(pendingKey(ctx.from.id, 'editor_col'), newCol);
        const updated = await postService.findById(editorPostId);
        if (updated) await refreshEditorMessages(ctx, updated);
        await ctx.reply(`✅ دکمه به ${text === '⬆️ بالا' ? 'بالا' : 'پایین'} منتقل شد.`);
        return;
      }
      if (text === '🔙 بازگشت') {
        cache.del(pendingKey(ctx.from.id, 'editor_row'));
        cache.del(pendingKey(ctx.from.id, 'editor_col'));
        cache.del(pendingKey(ctx.from.id, 'editor_state'));
        cache.setPermanent(editorKey(ctx.from.id, 'mode'), 'main');
        const post = await postService.findById(editorPostId);
        if (post) await refreshEditorMessages(ctx, post);
        return;
      }
      return;
    }

    // ─── ADD MESSAGE MODE ────────────────────────────────
    if (mode === 'add_message') {
      if (text === '❌ لغو') {
        cache.setPermanent(editorKey(ctx.from.id, 'mode'), 'main');
        cache.del(editorKey(ctx.from.id, 'msg_idx'));
        const post = await postService.findById(editorPostId);
        if (post) await refreshEditorMessages(ctx, post);
        return;
      }

      const { isForwarded, forwardMeta } = extractForwardMeta(ctx.message);
      try {
        if (isForwarded && forwardMeta && forwardMeta.originChatId && forwardMeta.originMessageId) {
          const srcChatId = Number(forwardMeta.originChatId);
          const srcMsgId = Number(forwardMeta.originMessageId);
          if (srcChatId && srcMsgId && !isNaN(srcChatId) && !isNaN(srcMsgId)) {
            try {
              await ctx.telegram.copyMessage(ctx.chat.id, srcChatId, srcMsgId);
            } catch (valErr: any) {
              const valCode = valErr?.response?.error_code || valErr?.code || 0;
              const valDesc = valErr?.response?.description || valErr?.message || 'unknown';
              let reason = 'UNKNOWN';
              if (valCode === 400 && valDesc.includes('message to copy not found')) reason = 'MESSAGE_DELETED';
              else if (valCode === 400 && valDesc.includes('chat not found')) reason = 'BOT_NOT_IN_CHAT';
              else if (valCode === 403) reason = 'NO_FORWARD_PERMISSION';
              logger.warn(`[ForwardValidation] saveValidation postId=${editorPostId} sourceChat=${srcChatId} sourceMessage=${srcMsgId} reason=${reason} error=${valDesc}`);
              await ctx.reply('⚠️ منبع پیام فوروارد در دسترس نیست.\nاین پست را دوباره از منبع ثبت کنید.');
              return;
            }
          }
          await postMessageService.create(editorPostId, {
            messageType: 'forward',
            forwardSource: {
              chatId: forwardMeta.originChatId,
              messageId: forwardMeta.originMessageId,
              sourceType: forwardMeta.type,
              sourceTitle: forwardMeta.originName,
              sourceUsername: forwardMeta.originUsername,
            },
          });
        } else {
          const entities = ctx.message.entities?.map((e: any) => ({ type: e.type, offset: e.offset, length: e.length, url: e.url, user: e.user, language: e.language, custom_emoji_id: e.custom_emoji_id })) || [];
          await postMessageService.create(editorPostId, {
            messageType: 'text',
            text: text,
            entities: entities,
          });
        }
        await openEditorAfterMessageCreate(ctx, editorPostId, isForwarded);
      } catch (e: any) {
        logger.error(`[MsgAdd] create failed postId=${editorPostId}: ${e.message}`);
        await ctx.reply('❌ خطا در ایجاد پیام. لطفاً دوباره تلاش کنید.');
      }
      return;
    }

    // ─── ADD COMMAND MODE ────────────────────────────────
    if (mode === 'add_command') {
      if (text === '↩️ لغو' || text === '❌ لغو') {
        cache.setPermanent(editorKey(ctx.from.id, 'mode'), 'main');
        const post = await postService.findById(editorPostId);
        if (post) await refreshEditorMessages(ctx, post);
        return;
      }

      const cmdText = text.replace(/^\//, '').trim();
      if (!cmdText) {
        await ctx.reply('❌ دستور نامعتبر. لطفاً یک نام معتبر ارسال کنید.');
        return;
      }
      try {
        const existingCmd = await postService.getCommandByPostId(editorPostId);
        await postService.setCommand(editorPostId, cmdText);
        if (existingCmd) {
          await ctx.reply(`✅ دستور پست بروزرسانی شد:\n/${existingCmd.command} → /${cmdText}`);
        } else {
          await ctx.reply(`✅ دستور پست ایجاد شد:\n/${cmdText}`);
        }
      } catch (err: any) {
        await ctx.reply(`❌ ${err.message || 'ثبت دستور ناموفق بود.'}`);
        return;
      }
      cache.setPermanent(editorKey(ctx.from.id, 'mode'), 'main');
      const updated = await postService.findById(editorPostId);
      if (updated) await refreshEditorMessages(ctx, updated);
      return;
    }

    // ─── EDIT MESSAGE MODE ───────────────────────────────
    if (mode === 'edit_message') {
      const messageId = cache.get<number>(editorKey(ctx.from.id, 'msg_idx')) ?? -1;
      const post = await postService.findById(editorPostId);
      const messages = post?.messages || [];
      const targetMsg = messages.find((m: any) => m.id === messageId);
      if (text === '✏️ ویرایش محتوا') {
        cache.setPermanent(editorKey(ctx.from.id, 'mode'), 'edit_content');
        const current = targetMsg?.text || '(بدون محتوا)';
        await ctx.reply(`✏️ محتوای جدید را ارسال کنید:\n\nمتن فعلی: ${current}`, {
          ...postCancelOnlyReplyKeyboard(),
        });
        return;
      }
      if (text === '📝 ویرایش عنوان') {
        cache.setPermanent(editorKey(ctx.from.id, 'mode'), 'edit_title');
        await ctx.reply(`✏️ عنوان جدید را ارسال کنید:\n\nعنوان فعلی: *${post?.title || ''}*`, {
          parse_mode: 'Markdown' as any,
          ...postCancelOnlyReplyKeyboard(),
        });
        return;
      }
      if (text === 'ویرایش دکمه ها') {
        clearButtonEditorState(ctx.from.id);
        cache.setPermanent(pendingKey(ctx.from.id, 'editing_post'), editorPostId);
        cache.setPermanent(pendingKey(ctx.from.id, 'editing_message_idx'), messageId);
        cache.setPermanent(pendingKey(ctx.from.id, 'edit_mode'), editorPostId);
        cache.setPermanent(pendingKey(ctx.from.id, 'editor_mode'), 'create');
        cache.del(pendingKey(ctx.from.id, 'editor_state'));
        if (!post) return ctx.reply('❌ پست یافت نشد.');
        const buttons = extractButtonsForMessage(post, messageId);
        const { text: editorText, reply_markup } = renderButtonEditor(editorPostId, buttons, 'create');
        const sent = await ctx.reply(editorText, { reply_markup });
        if (sent) cache.setPermanent(`pbedit:editor_msg_id:${ctx.from.id}`, sent.message_id);
        return;
      }
      if (text === '🔙 بازگشت') {
        cache.setPermanent(editorKey(ctx.from.id, 'mode'), 'main');
        cache.del(editorKey(ctx.from.id, 'msg_idx'));
        if (post) await refreshEditorMessages(ctx, post);
        return;
      }
      return;
    }

    // ─── EDIT CONTENT MODE ───────────────────────────────
    if (mode === 'edit_content') {
      const messageId = cache.get<number>(editorKey(ctx.from.id, 'msg_idx')) ?? -1;
      if (text === '❌ لغو') {
        cache.setPermanent(editorKey(ctx.from.id, 'mode'), 'edit_message');
        const post = await postService.findById(editorPostId);
        const messages = post?.messages || [];
        const msgText = messages.find((m: any) => m.id === messageId)?.text || '(بدون محتوا)';
        await ctx.reply(`✏️ ویرایش پیام:\n\n${msgText}`, {
          ...postEditMessageReplyKeyboard(),
        });
        return;
      }
      if (messageId > 0) {
        const entityData = ctx.message.entities?.map((e: any) => ({ type: e.type, offset: e.offset, length: e.length, url: e.url, user: e.user, language: e.language, custom_emoji_id: e.custom_emoji_id })) || [];
        await postMessageService.update(messageId, {
          text: text,
          entities: entityData,
        });
      }
      cache.setPermanent(editorKey(ctx.from.id, 'mode'), 'main');
      cache.del(editorKey(ctx.from.id, 'msg_idx'));
      postService.invalidateCache();
      const updated = await postService.findById(editorPostId);
      if (updated) await refreshEditorMessages(ctx, updated);
      return;
    }

    // ─── EDIT TITLE MODE ─────────────────────────────────
    if (mode === 'edit_title') {
      const messageId = cache.get<number>(editorKey(ctx.from.id, 'msg_idx')) ?? -1;
      if (text === '❌ لغو') {
        cache.setPermanent(editorKey(ctx.from.id, 'mode'), 'edit_message');
        const post = await postService.findById(editorPostId);
        const messages = post?.messages || [];
        const msgText = messages.find((m: any) => m.id === messageId)?.text || '(بدون محتوا)';
        await ctx.reply(`✏️ ویرایش پیام:\n\n${msgText}`, {
          ...postEditMessageReplyKeyboard(),
        });
        return;
      }
      await postService.update(editorPostId, { title: text, updatedBy: BigInt(ctx.from.id) } as any);
      cache.setPermanent(editorKey(ctx.from.id, 'mode'), 'main');
      cache.del(editorKey(ctx.from.id, 'msg_idx'));
      postService.invalidateCache();
      const updated = await postService.findById(editorPostId);
      if (updated) await refreshEditorMessages(ctx, updated);
      return;
    }

    return next();
  });

  // ─── Handle forwarded / media messages in add_message mode ──
  bot.on(['photo', 'video', 'animation', 'document', 'audio', 'voice', 'video_note', 'sticker'], async (ctx: any, next) => {
    if (!ctx.from) return next();
    const editorPostId = cache.get<number>(editorKey(ctx.from.id, 'active'));
    if (!editorPostId) return next();
    const mode = cache.get<string>(editorKey(ctx.from.id, 'mode'));
    if (mode !== 'add_message') return next();
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin || !isPostAdmin(admin)) return next();

    try {
      const msg = ctx.message;
      const caption = msg.caption || null;
      const captionEntities = msg.caption_entities?.map((e: any) => ({
        type: e.type, offset: e.offset, length: e.length,
        url: e.url, user: e.user, language: e.language, custom_emoji_id: e.custom_emoji_id
      })) || [];
      let mediaFileId = '';
      let messageType = 'text';
      if (msg.photo) {
        mediaFileId = msg.photo[msg.photo.length - 1].file_id;
        messageType = 'photo';
      } else if (msg.video) {
        mediaFileId = msg.video.file_id;
        messageType = 'video';
      } else if (msg.animation) {
        mediaFileId = msg.animation.file_id;
        messageType = 'animation';
      } else if (msg.document) {
        mediaFileId = msg.document.file_id;
        messageType = 'document';
      } else if (msg.audio) {
        mediaFileId = msg.audio.file_id;
        messageType = 'audio';
      } else if (msg.voice) {
        mediaFileId = msg.voice.file_id;
        messageType = 'voice';
      } else if (msg.video_note) {
        mediaFileId = msg.video_note.file_id;
        messageType = 'video_note';
      } else if (msg.sticker) {
        mediaFileId = msg.sticker.file_id;
        messageType = 'sticker';
      }
      if (!mediaFileId) {
        await ctx.reply('❌ نوع فایل پشتیبانی نمی‌شود.');
        return;
      }
      const { isForwarded, forwardMeta } = extractForwardMeta(msg);
      if (isForwarded && forwardMeta && forwardMeta.originChatId && forwardMeta.originMessageId) {
        const srcChatId = Number(forwardMeta.originChatId);
        const srcMsgId = Number(forwardMeta.originMessageId);
        if (srcChatId && srcMsgId && !isNaN(srcChatId) && !isNaN(srcMsgId)) {
          try {
            await ctx.telegram.copyMessage(ctx.chat.id, srcChatId, srcMsgId);
          } catch (valErr: any) {
            const valCode = valErr?.response?.error_code || valErr?.code || 0;
            const valDesc = valErr?.response?.description || valErr?.message || 'unknown';
            let reason = 'UNKNOWN';
            if (valCode === 400 && valDesc.includes('message to copy not found')) reason = 'MESSAGE_DELETED';
            else if (valCode === 400 && valDesc.includes('chat not found')) reason = 'BOT_NOT_IN_CHAT';
            else if (valCode === 403) reason = 'NO_FORWARD_PERMISSION';
            logger.warn(`[ForwardValidation] saveValidation postId=${editorPostId} sourceChat=${srcChatId} sourceMessage=${srcMsgId} reason=${reason} error=${valDesc}`);
            await ctx.reply('⚠️ منبع پیام فوروارد در دسترس نیست.\nاین پست را دوباره از منبع ثبت کنید.');
            return;
          }
        }
        logger.info(`[ForwardDetect] add_message media postId=${editorPostId} messageId=${msg.message_id} originChat=${forwardMeta.originChatId} originMsg=${forwardMeta.originMessageId}`);
        await postMessageService.create(editorPostId, {
          messageType: 'forward',
          forwardSource: {
            chatId: forwardMeta.originChatId,
            messageId: forwardMeta.originMessageId,
            sourceType: forwardMeta.type,
            sourceTitle: forwardMeta.originName,
            sourceUsername: forwardMeta.originUsername,
          },
        });
      } else {
        await postMessageService.create(editorPostId, {
          messageType,
          mediaFileId,
          text: null,
          entities: [],
          caption,
          captionEntities,
        });
      }
      await openEditorAfterMessageCreate(ctx, editorPostId, isForwarded);
    } catch (e: any) {
      logger.error(`[MsgAdd] media create failed postId=${editorPostId}: ${e.message}`);
      await ctx.reply('❌ خطا در ذخیره رسانه. لطفاً دوباره تلاش کنید.');
    }
  });

  // ═══════════════════════════════════════════════════════════
  // ─── DEAD CALLBACK FIX: Missing handlers for orphaned callback_data ──
  // ═══════════════════════════════════════════════════════════

  // ─── post:cmd:add — Add command to post ──────────────────
  bot.action(/^post:cmd:add:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    cache.setPermanent(pendingKey(ctx.from.id, 'editing_cmd'), true);
    cache.setPermanent(pendingKey(ctx.from.id, 'editing_post'), postId);
    const existingCmd = await postService.getCommandByPostId(postId);
    const statusLine = existingCmd ? `دستور پست: /${existingCmd.command}` : 'دستور پست: ندارد';
    await ctx.reply(`🔗 نام دستور را ارسال کنید (بدون /):\n\n${statusLine}\n\nمثال: sgb/discount/rules`, {
      ...postCommandSubMenuKeyboard(!!existingCmd),
    });
  });

  // ─── post:version:list — Version history ──────────────────
  bot.action(/^post:version:list:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    try {
      const versions = await prisma.postVersion.findMany({
        where: { postId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
      if (versions.length === 0) {
        return safeEdit(ctx, '📜 هنوز نسخه‌ای ذخیره نشده است.', {
          reply_markup: Markup.inlineKeyboard([[Markup.button.callback('« بازگشت', `post:edit:${postId}:full`)]]).reply_markup,
        });
      }
      await safeEdit(ctx, `📜 تاریخچه نسخه‌های پست (${versions.length} نسخه اخیر):`, postVersionHistoryKeyboard(versions, postId));
    } catch (err: any) {
      logger.error(`[PostVersion] list error postId=${postId}: ${err.message}`);
      await safeEdit(ctx, '❌ خطا در بارگذاری تاریخچه نسخه‌ها.');
    }
  });

  // ─── post:version:restore — Restore a version ─────────────
  bot.action(/^post:version:restore:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const versionId = parseInt(ctx.match[1]);
    try {
      const version = await prisma.postVersion.findUnique({ where: { id: versionId } });
      if (!version) return ctx.reply('❌ نسخه یافت نشد.');
      const data = version.snapshot as any;
      if (!data) return ctx.reply('❌ داده نسخه خالی است.');
      await postService.update(version.postId, {
        title: data.title,
        content: data.content,
        contentText: data.contentText,
        contentEntities: data.contentEntities,
        buttons: data.buttons,
        mediaFileId: data.mediaFileId,
        mediaType: data.mediaType,
        status: data.status,
        isPublished: data.isPublished,
        updatedBy: BigInt(ctx.from.id),
      } as any);
      postService.invalidateCache();
      await ctx.reply(`✅ نسخه ${versionId} بازیابی شد.`);
      const post = await postService.findById(version.postId);
      if (post) await showPostEditor(ctx, post.id);
    } catch (err: any) {
      logger.error(`[PostVersion] restore error versionId=${versionId}: ${err.message}`);
      await ctx.reply('❌ خطا در بازیابی نسخه.');
    }
  });

  // ─── post:integrity:run — Run integrity check ─────────────
  bot.action('post:integrity:run', async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    try {
      const posts = await postService.findAll({ page: 1, limit: 1000 });
      const issues: string[] = [];
      for (const post of posts.items) {
        if (!post.slug) issues.push(`Post #${post.id}: missing slug`);
        if (!post.title) issues.push(`Post #${post.id}: missing title`);
        if (post.status === 'PUBLISHED' && !post.isPublished) issues.push(`Post #${post.id}: status=PUBLISHED but isPublished=false`);
      }
      const text = issues.length === 0
        ? '✅ سلامت سیستم: هیچ مشکلی یافت نشد.'
        : `🔍 ${issues.length} مشکل یافت شد:\n\n${issues.slice(0, 20).join('\n')}`;
      await safeEdit(ctx, text, Markup.inlineKeyboard([[Markup.button.callback('🔄 اجرای مجدد', 'post:integrity:run')], [Markup.button.callback('« بازگشت به منوی پست', 'post:menu')]]));
    } catch (err: any) {
      logger.error(`[PostIntegrity] run error: ${err.message}`);
      await safeEdit(ctx, '❌ خطا در اجرای بررسی سلامت.');
    }
  });

  // ─── post:menu — Back to post list ──────────────────────
  bot.action('post:menu', async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    clearEditorKeyState(ctx.from.id);
    cache.setPermanent(`post_mgmt_mode:${ctx.from.id}`, true);
    await showPostListFromLayout(ctx);
  });

  // ─── post:analytics:${postId} — Post analytics ────────────
  bot.action(/^post:analytics:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    try {
      const post = await postService.findById(postId);
      if (!post) return safeEdit(ctx, '❌ پست یافت نشد.');
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
      await safeEdit(ctx, text, {
        parse_mode: 'Markdown' as any,
        link_preview_options: { is_disabled: true } as any,
        ...postAnalyticsKeyboard(postId),
      });
    } catch (err: any) {
      logger.error(`[PostAnalytics] error postId=${postId}: ${err.message}`);
      await safeEdit(ctx, '❌ خطا در بارگذاری آمار.');
    }
  });

  // ─── post:analytics:global — Global analytics ─────────────
  bot.action('post:analytics:global', async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    try {
      const allPosts = await postService.findAll({ page: 1, limit: 1000 });
      let totalViews = 0;
      let totalClicks = 0;
      for (const p of allPosts.items) {
        const a = await postService.getAnalytics(p.id);
        totalViews += a.totalViews;
        totalClicks += a.totalClicks;
      }
      const text = [
        '📊 *آمار کلی پست‌ها*',
        '',
        `📄 تعداد پست‌ها: ${allPosts.total}`,
        `👁 مجموع بازدید: ${totalViews}`,
        `👆 مجموع کلیک: ${totalClicks}`,
      ].join('\n');
      await safeEdit(ctx, text, {
        parse_mode: 'Markdown' as any,
        ...postGlobalAnalyticsKeyboard(),
      });
    } catch (err: any) {
      logger.error(`[PostAnalyticsGlobal] error: ${err.message}`);
      await safeEdit(ctx, '❌ خطا در بارگذاری آمار کلی.');
    }
  });

  // ─── post:analytics:top — Top posts ───────────────────────
  bot.action('post:analytics:top', async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    try {
      const allPosts = await postService.findAll({ page: 1, limit: 1000 });
      const stats: { id: number; title: string; views: number; clicks: number }[] = [];
      for (const p of allPosts.items) {
        const a = await postService.getAnalytics(p.id);
        stats.push({ id: p.id, title: p.title, views: a.totalViews, clicks: a.totalClicks });
      }
      stats.sort((a, b) => b.views - a.views);
      const top10 = stats.slice(0, 10);
      const text = top10.length === 0
        ? '🏆 هنوز آماری ثبت نشده.'
        : '🏆 *پست‌های برتر (بیشترین بازدید):*\n\n' +
          top10.map((s, i) => `${i + 1}. ${s.title} — 👁 ${s.views} بازدید, 👆 ${s.clicks} کلیک`).join('\n');
      await safeEdit(ctx, text, {
        parse_mode: 'Markdown' as any,
        ...Markup.inlineKeyboard([[Markup.button.callback('🔄 تازه‌سازی', 'post:analytics:top')], [Markup.button.callback('« بازگشت', 'post:analytics:global')]]),
      });
    } catch (err: any) {
      logger.error(`[PostAnalyticsTop] error: ${err.message}`);
      await safeEdit(ctx, '❌ خطا در بارگذاری پست‌های برتر.');
    }
  });
}

// Export the helper for main menu integration
export async function getPublishedPostsForMenu(): Promise<any[]> {
  return postService.getPublished();
}
