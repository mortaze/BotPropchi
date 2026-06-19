import { PostStatus } from '@prisma/client';
import { Context, Markup, Telegraf } from 'telegraf';
import { botAdminService } from '../../services/bot-admin.service';
import { postService } from '../../services/post.service';
import { systemLogService } from '../../services/system-log.service';
import { cache } from '../../utils/cache';
import { logger } from '../../utils/logger';
import { sanitizeTelegramText, sanitizeTelegramExtra, buildSafeTelegramButton } from '../../utils/unicode';
import { graphemeTruncate } from '../../utils/grapheme';
import { normalizePost } from '../../services/post-normalizer.service';
import {
  postMainMenuKeyboard,
  postEditorKeyboard,
  postListKeyboard,
  postViewKeyboard,
  postTitleOnlyListKeyboard,
  buildPostListFromMenuLayout,
  postInfoActionKeyboard,
  postEditModeReplyKeyboard,
  postButtonsEditorKeyboard,
  postButtonEditKeyboard,
  postButtonTypeKeyboard,
  postRowResizeKeyboard,
  postPublishOptionsKeyboard,
  postAnalyticsKeyboard,
  postManagerAnalyticsKeyboard,
  postCommandListKeyboard,
  postCommandEditKeyboard,
  postVersionHistoryKeyboard,
  postIntegrityKeyboard,
  postGlobalAnalyticsKeyboard,
  postSwapTargetKeyboard,
  postMultiMessageEditorReplyKeyboard,
  postAddMessageReplyKeyboard,
  postEditMessageReplyKeyboard,
  postCancelOnlyReplyKeyboard,
  postSingleMessageInlineKeyboard,
} from '../keyboards/post-keyboards';
import { buildBotAdminPanelKeyboard } from '../keyboards';
import { settingsService } from '../../services/settings.service';
import { renderPostToTelegram } from '../../services/post-renderer.service';

function isPostAdmin(admin: any): boolean {
  if (!admin) return false;
  return ['OWNER', 'SUPER_ADMIN', 'ADMIN'].includes(admin.role);
}

function requirePostAdmin(ctx: any): Promise<any> {
  return botAdminService.getActive(ctx.from.id);
}

async function adminMainMenu(ctx: any) {
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

// ─── Single-message editing: edit if possible, reply as fallback ───
async function safeEdit(ctx: any, text: string, extra?: any): Promise<void> {
  const safeText = sanitizeTelegramText(text, 4096);
  const safeExtra = sanitizeTelegramExtra(extra);
  if (ctx.callbackQuery?.message) {
    try {
      await ctx.editMessageText(safeText, safeExtra);
      return;
    } catch (e: any) {
      logger.debug('[safeEdit] Fallback to reply:', e.description || e.message);
    }
  }
  await ctx.reply(safeText, safeExtra).catch(() => {});
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
    const layout = await settingsService.getResolvedMenuLayout(false);
    const postButtons = layout.flat().filter((btn: any) => btn?.ref?.startsWith('post:'));
    if (postButtons.length === 0) {
      return ctx.reply('📋 پستی در منو وجود ندارد. ابتدا پست را در ویرایش منو اضافه کنید.', postMainMenuKeyboard());
    }
    cache.set(`post_mgmt_mode:${ctx.from.id}`, true, 300);
    await ctx.reply('📋 روی عنوان پست مورد نظر ضربه بزنید:', buildPostListFromMenuLayout(layout));
  });

  // ─── Post List (Reply Keyboard with Titles — built from menu layout) ──
  bot.hears('📋 مدیریت پست‌ها', async (ctx: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const layout = await settingsService.getResolvedMenuLayout(false);
    const postButtons = layout.flat().filter((btn: any) => btn?.ref?.startsWith('post:'));
    if (postButtons.length === 0) {
      return ctx.reply('📋 پستی در منو وجود ندارد. ابتدا پست را در ویرایش منو اضافه کنید.', postMainMenuKeyboard());
    }
    // Set flag so the menu button handler in index.ts skips this user's next text
    cache.set(`post_mgmt_mode:${ctx.from.id}`, true, 300);
    await ctx.reply('📋 روی عنوان پست مورد نظر ضربه بزنید:', buildPostListFromMenuLayout(layout));
  });

  // ─── Text: Post Title Selection / Edit Action / Back ────
  bot.on('text', async (ctx: any, next) => {
    if (!ctx.from) return next();
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin || !isPostAdmin(admin)) return next();

    // Skip if multi-message editor is active
    if (cache.get<number>(editorKey(ctx.from.id, 'active'))) return next();

    const text = ctx.message.text;

    // Back to post main menu
    if (text === '🔙 بازگشت به منوی پست' || text === '🔙 بازگشت به منوی پست‌ها') {
      cache.del(`post_mgmt_mode:${ctx.from.id}`);
      return ctx.reply('📝 سامانه مدیریت پست‌ها', postMainMenuKeyboard());
    }

    // Match post title → select that post
    const result = await postService.findAll({ page: 1, limit: 100 });
    const matched = result.items.find((p: any) => p.title === text);
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
    cache.set(pendingKey(ctx.from.id, 'import_title'), true, 300);
    await ctx.reply('📥 عنوان پست جدید را ارسال کنید، سپس پیام تلگرام اصلی را فوروارد کنید.');
  });

  bot.hears('➕ ایجاد پست', async (ctx: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    cache.set(pendingKey(ctx.from.id, 'creating'), true, 300);
    await ctx.reply('📝 عنوان پست را وارد کنید:');
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
        await ctx.reply(`✅ پست ساخته شد!\n\nعنوان: ${title}\nاسلاگ: ${slug}`);
        await showPostEditor(ctx, post.id);
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
      await safeEdit(ctx, '⌨ ویرایشگر دکمه:\n\nبرای ویرایش روی دکمه ضربه بزنید یا دکمه جدید اضافه کنید.',
        postButtonsEditorKeyboard(editingPostId, updatedButtons));
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
      await safeEdit(ctx, '⌨ ویرایشگر دکمه:\n\nبرای ویرایش روی دکمه ضربه بزنید یا دکمه جدید اضافه کنید.',
        postButtonsEditorKeyboard(postId, buttons));
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
    await sendPostToChat(ctx, post);
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
    await sendPostToChat(ctx, post);
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
    await postService.delete(postId);
    await safeEdit(ctx, '🗑 پست حذف شد.');
  });

  // ─── Buttons Editor ─────────────────────────────────────
  bot.action(/^post:btn:edit:(\d+):(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    const col = parseInt(ctx.match[3]);
    const post = await postService.findById(postId);
    if (!post) return safeEdit(ctx, '❌ پست یافت نشد.');
    const buttons = (post as any).buttons || [];
    const button = buttons[row]?.[col];
    if (!button) {
      return safeEdit(ctx, 'نوع دکمه را انتخاب کنید:', postButtonTypeKeyboard(postId, row, col));
    }
    await safeEdit(ctx,
      `دکمه: "${button.text}"\nنوع: ${button.type || 'URL'}\nمقدار: ${button.value || '-'}`,
      postButtonEditKeyboard(postId, row, col, button)
    );
  });

  bot.action(/^post:btn:text:(\d+):(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    const col = parseInt(ctx.match[3]);
    cache.set(pendingKey(ctx.from.id, 'editing_button'), `text:${row}:${col}`, 300);
    cache.set(pendingKey(ctx.from.id, 'editing_post'), postId, 300);
    await safeEdit(ctx, '🎨 متن جدید دکمه را ارسال کنید:');
  });

  bot.action(/^post:btn:value:(\d+):(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    const col = parseInt(ctx.match[3]);
    cache.set(pendingKey(ctx.from.id, 'editing_button'), `value:${row}:${col}`, 300);
    cache.set(pendingKey(ctx.from.id, 'editing_post'), postId, 300);
    await safeEdit(ctx, '🔗 آدرس/مقدار جدید دکمه را ارسال کنید:');
  });

  bot.action(/^post:btn:up:(\d+):(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    if (row === 0) return safeEdit(ctx, 'هم‌اکنون در بالاست.');
    const post = await postService.findById(postId);
    if (!post) return safeEdit(ctx, '❌ پست یافت نشد.');
    const buttons = (post as any).buttons || [];
    [buttons[row - 1], buttons[row]] = [buttons[row], buttons[row - 1]];
    await postService.update(postId, { buttons: JSON.parse(JSON.stringify(buttons)) } as any);
    await safeEdit(ctx, '✅ دکمه به بالا منتقل شد.\n\n⌨ ویرایشگر دکمه:', postButtonsEditorKeyboard(postId, buttons));
  });

  bot.action(/^post:btn:down:(\d+):(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    const post = await postService.findById(postId);
    if (!post) return safeEdit(ctx, '❌ پست یافت نشد.');
    const buttons = (post as any).buttons || [];
    if (row >= buttons.length - 1) return safeEdit(ctx, 'هم‌اکنون در پایین‌ترین است.');
    [buttons[row], buttons[row + 1]] = [buttons[row + 1], buttons[row]];
    await postService.update(postId, { buttons: JSON.parse(JSON.stringify(buttons)) } as any);
    await safeEdit(ctx, '✅ دکمه به پایین منتقل شد.\n\n⌨ ویرایشگر دکمه:', postButtonsEditorKeyboard(postId, buttons));
  });

  bot.action(/^post:btn:del:(\d+):(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    const col = parseInt(ctx.match[3]);
    const post = await postService.findById(postId);
    if (!post) return safeEdit(ctx, '❌ پست یافت نشد.');
    const buttons = (post as any).buttons || [];
    if (buttons[row]) {
      buttons[row].splice(col, 1);
      if (buttons[row].length === 0) buttons.splice(row, 1);
    }
    await postService.update(postId, { buttons: JSON.parse(JSON.stringify(buttons)) } as any);
    await safeEdit(ctx, '➖ دکمه حذف شد.\n\n⌨ ویرایشگر دکمه:', postButtonsEditorKeyboard(postId, buttons));
  });

  bot.action(/^post:btn:addrow:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const post = await postService.findById(postId);
    if (!post) return safeEdit(ctx, '❌ پست یافت نشد.');
    const buttons = (post as any).buttons || [];
    buttons.push([{ text: 'دکمه جدید', type: 'URL', value: '' }]);
    await postService.update(postId, { buttons: JSON.parse(JSON.stringify(buttons)) } as any);
    await safeEdit(ctx, '➕ سطر دکمه جدید اضافه شد.\n\n⌨ ویرایشگر دکمه:', postButtonsEditorKeyboard(postId, buttons));
  });

  bot.action(/^post:btn:resize:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    await safeEdit(ctx, '📐 تعداد دکمه در سطر را انتخاب کنید:', postRowResizeKeyboard(postId, row));
  });

  bot.action(/^post:btn:rowsize:(\d+):(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    const size = parseInt(ctx.match[3]);
    const post = await postService.findById(postId);
    if (!post) return safeEdit(ctx, '❌ پست یافت نشد.');
    const buttons = (post as any).buttons || [];
    const currentRow = buttons[row] || [];
    const newRow: any[] = [];
    for (let i = 0; i < size; i++) {
      newRow.push(currentRow[i] || { text: `دکمه ${i + 1}`, type: 'URL', value: '' });
    }
    buttons[row] = newRow;
    await postService.update(postId, { buttons: JSON.parse(JSON.stringify(buttons)) } as any);
    await safeEdit(ctx, `✅ سطر ${row + 1} به ${size} دکمه تغییر اندازه یافت.\n\n⌨ ویرایشگر دکمه:`, postButtonsEditorKeyboard(postId, buttons));
  });

  bot.action(/^post:btn:settype:(\d+):(\d+):(\d+):(.+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    const col = parseInt(ctx.match[3]);
    const btnType = ctx.match[4];
    const post = await postService.findById(postId);
    if (!post) return safeEdit(ctx, '❌ پست یافت نشد.');
    const buttons = (post as any).buttons || [];
    if (!buttons[row]) buttons[row] = [];
    if (!buttons[row][col]) buttons[row][col] = {};
    buttons[row][col].type = btnType;
    await postService.update(postId, { buttons: JSON.parse(JSON.stringify(buttons)) } as any);
    await safeEdit(ctx, `✅ نوع دکمه به ${btnType} تغییر یافت. اکنون مقدار را تنظیم کنید:`);
    cache.set(pendingKey(ctx.from.id, 'editing_button'), `value:${row}:${col}`, 300);
    cache.set(pendingKey(ctx.from.id, 'editing_post'), postId, 300);
  });

  // ─── Command Add ────────────────────────────────────────
  bot.action(/^post:cmd:add:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    cache.set(pendingKey(ctx.from.id, 'editing_cmd'), true, 300);
    cache.set(pendingKey(ctx.from.id, 'editing_post'), postId, 300);
    await safeEdit(ctx, '🔗 نام دستور را ارسال کنید (بدون /):\nmثلاً `sgb/discount/rules`', { parse_mode: 'Markdown' });
  });

  // ─── Analytics ──────────────────────────────────────────
  bot.hears('📊 آمار پست', async (ctx: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    cache.set(pendingKey(ctx.from.id, 'analytics_id'), true, 120);
    await ctx.reply('📊 شناسه پست را برای مشاهده آمار وارد کنید:');
  });

  bot.action(/^post:analytics:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
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
    await safeEdit(ctx, text, { parse_mode: 'Markdown', ...postAnalyticsKeyboard(postId) });
  });

  bot.on('text', async (ctx: any, next) => {
    if (!ctx.from) return next();
    const analyticsId = cache.get<boolean>(pendingKey(ctx.from.id, 'analytics_id'));
    if (!analyticsId) return next();
    cache.del(pendingKey(ctx.from.id, 'analytics_id'));
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return next();
    const postId = parseInt(ctx.message.text);
    if (isNaN(postId)) return ctx.reply('❌ شناسه نامعتبر.');
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
    await ctx.reply(text, { parse_mode: 'Markdown', ...postAnalyticsKeyboard(postId) });
  });

  // ─── Back to Posts Menu ─────────────────────────────────
  bot.action('post:menu', async (ctx: any) => {
    await ctx.answerCbQuery();
    await safeEdit(ctx, '📝 سامانه مدیریت پست‌ها', postMainMenuKeyboard());
  });

  // ─── Version History ────────────────────────────────────
  bot.action(/^post:version:list:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const versions = await postService.getVersions(postId);
    if (versions.length === 0) return safeEdit(ctx, '📜 نسخه‌ای ذخیره نشده است.');
    await safeEdit(ctx,
      `📜 تاریخچه نسخه‌ها (${versions.length}):\nبرای بازیابی روی نسخه ضربه بزنید.`,
      postVersionHistoryKeyboard(versions, postId)
    );
  });

  bot.action(/^post:version:restore:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const versionId = parseInt(ctx.match[1]);
    try {
      const restored = await postService.restoreVersion(versionId);
      if (!restored) return safeEdit(ctx, '❌ نسخه یافت نشد.');
      await showPostEditor(ctx, restored.id);
    } catch (err: any) {
      await safeEdit(ctx, `❌ ${err.message}`);
    }
  });

  // ─── Integrity Check ────────────────────────────────────
  bot.hears('🔍 بررسی سلامت', async (ctx: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    await ctx.reply('🔍 بررسی سلامت', postIntegrityKeyboard());
  });

  bot.action('post:integrity:run', async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const issues = await postService.integrityCheck();
    if (issues.length === 0) {
      await safeEdit(ctx, '✅ همه پست‌ها سالم هستند.');
    } else {
      await safeEdit(ctx, `⚠ مشکلات یافت شد:\n\n${issues.join('\n')}`);
    }
  });

  // ─── Global Analytics ───────────────────────────────────
  bot.hears('📊 آمار کلی', async (ctx: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const analytics = await postService.getGlobalAnalytics();
    const text = [
      '📊 *آمار کلی*',
      '',
      `📝 کل پست‌ها: ${analytics.totalPosts}`,
      `✅ منتشر شده: ${analytics.published}`,
      `📝 پیش‌نویس: ${analytics.drafts}`,
      `📦 بایگانی: ${analytics.archived}`,
      `👻 مخفی: ${analytics.hidden}`,
      `⏰ زمان‌بندی: ${analytics.scheduled}`,
      `👁 بازدید کل: ${analytics.totalViews}`,
      `👆 کلیک کل: ${analytics.totalClicks}`,
      `👤 کاربران منحصربه‌فرد: ${analytics.uniqueUsers}`,
    ].join('\n');
    await ctx.reply(text, { parse_mode: 'Markdown', ...postGlobalAnalyticsKeyboard() });
  });

  bot.action('post:analytics:global', async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const analytics = await postService.getGlobalAnalytics();
    const text = [
      '📊 *آمار کلی*',
      '',
      `📝 کل پست‌ها: ${analytics.totalPosts}`,
      `✅ منتشر شده: ${analytics.published}`,
      `📝 پیش‌نویس: ${analytics.drafts}`,
      `📦 بایگانی: ${analytics.archived}`,
      `👻 مخفی: ${analytics.hidden}`,
      `⏰ زمان‌بندی: ${analytics.scheduled}`,
      `👁 بازدید کل: ${analytics.totalViews}`,
      `👆 کلیک کل: ${analytics.totalClicks}`,
      `👤 کاربران منحصربه‌فرد: ${analytics.uniqueUsers}`,
    ].join('\n');
    await safeEdit(ctx, text, { parse_mode: 'Markdown', ...postGlobalAnalyticsKeyboard() });
  });

  bot.action('post:analytics:top', async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const topPosts = await postService.getTopPosts(10);
    if (topPosts.length === 0) return safeEdit(ctx, '🏆 پستی وجود ندارد.');
    const text = '🏆 *پست‌های برتر بر اساس بازدید*\n\n' +
      topPosts.map((p: any, i: number) => `${i + 1}. ${p.title} — ${(p as any).views || 0} بازدید`).join('\n');
    await safeEdit(ctx, text, { parse_mode: 'Markdown', ...postGlobalAnalyticsKeyboard() });
  });

  // ─── Button Row Management ──────────────────────────────
  bot.action(/^post:btn:rowup:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    if (row === 0) return safeEdit(ctx, 'هم‌اکنون در بالاست.');
    const post = await postService.findById(postId);
    if (!post) return safeEdit(ctx, '❌ پست یافت نشد.');
    const buttons = (post as any).buttons || [];
    [buttons[row - 1], buttons[row]] = [buttons[row], buttons[row - 1]];
    await postService.update(postId, { buttons: JSON.parse(JSON.stringify(buttons)) } as any);
    await safeEdit(ctx, '✅ سطر به بالا منتقل شد.\n\n⌨ ویرایشگر دکمه:', postButtonsEditorKeyboard(postId, buttons));
  });

  bot.action(/^post:btn:rowdown:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    const post = await postService.findById(postId);
    if (!post) return safeEdit(ctx, '❌ پست یافت نشد.');
    const buttons = (post as any).buttons || [];
    if (row >= buttons.length - 1) return safeEdit(ctx, 'هم‌اکنون در پایین‌ترین جایگاه است.');
    [buttons[row], buttons[row + 1]] = [buttons[row + 1], buttons[row]];
    await postService.update(postId, { buttons: JSON.parse(JSON.stringify(buttons)) } as any);
    await safeEdit(ctx, '✅ سطر به پایین منتقل شد.\n\n⌨ ویرایشگر دکمه:', postButtonsEditorKeyboard(postId, buttons));
  });

  bot.action(/^post:btn:swap:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    const post = await postService.findById(postId);
    if (!post) return safeEdit(ctx, '❌ پست یافت نشد.');
    const buttons = (post as any).buttons || [];
    await safeEdit(ctx, '🔄 سطر مقصد را برای جابجایی انتخاب کنید:', postSwapTargetKeyboard(postId, row, buttons.length));
  });

  bot.action(/^post:btn:swap:(\d+):(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const rowA = parseInt(ctx.match[2]);
    const rowB = parseInt(ctx.match[3]);
    if (rowA === rowB) return;
    const post = await postService.findById(postId);
    if (!post) return safeEdit(ctx, '❌ پست یافت نشد.');
    const buttons = (post as any).buttons || [];
    [buttons[rowA], buttons[rowB]] = [buttons[rowB], buttons[rowA]];
    await postService.update(postId, { buttons: JSON.parse(JSON.stringify(buttons)) } as any);
    await safeEdit(ctx, '🔄 سطرها جابجا شدند.\n\n⌨ ویرایشگر دکمه:', postButtonsEditorKeyboard(postId, buttons));
  });

  bot.action(/^post:btn:duprow:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    const post = await postService.findById(postId);
    if (!post) return safeEdit(ctx, '❌ پست یافت نشد.');
    const buttons = (post as any).buttons || [];
    if (!buttons[row]) return safeEdit(ctx, '❌ سطر یافت نشد.');
    const duplicated = buttons[row].map((b: any) => ({ ...b }));
    buttons.splice(row + 1, 0, duplicated);
    await postService.update(postId, { buttons: JSON.parse(JSON.stringify(buttons)) } as any);
    await safeEdit(ctx, '📋 سطر کپی شد.\n\n⌨ ویرایشگر دکمه:', postButtonsEditorKeyboard(postId, buttons));
  });

  bot.action(/^post:btn:delrow:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    const post = await postService.findById(postId);
    if (!post) return safeEdit(ctx, '❌ پست یافت نشد.');
    const buttons = (post as any).buttons || [];
    buttons.splice(row, 1);
    await postService.update(postId, { buttons: JSON.parse(JSON.stringify(buttons)) } as any);
    await safeEdit(ctx, '➖ سطر حذف شد.\n\n⌨ ویرایشگر دکمه:', postButtonsEditorKeyboard(postId, buttons));
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
    const buttons = (post as any).buttons || [];
    await ctx.reply('⌨ ویرایشگر دکمه:\n\nبرای ویرایش روی دکمه ضربه بزنید یا دکمه جدید اضافه کنید.',
      postButtonsEditorKeyboard(postId, buttons));
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

  // 🔙 بازگشت: Handle back in both editor mode and edit mode
  bot.hears('🔙 بازگشت', async (ctx: any, next: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;

    // Check if in multi-message editor
    const editorPostId = cache.get<number>(editorKey(ctx.from.id, 'active'));
    if (editorPostId) {
      const mode = cache.get<string>(editorKey(ctx.from.id, 'mode')) || 'main';
      if (mode === 'add_message' || mode === 'edit_message' || mode === 'edit_content' || mode === 'edit_title') {
        cache.set(editorKey(ctx.from.id, 'mode'), 'main');
        cache.del(editorKey(ctx.from.id, 'msg_idx'));
        const post = await postService.findById(editorPostId);
        if (post) await refreshEditorMessages(ctx, post);
        return;
      }
      // In main editor mode → back exits to post list
      cache.del(editorKey(ctx.from.id, 'active'));
      cache.del(editorKey(ctx.from.id, 'mode'));
      cache.del(editorKey(ctx.from.id, 'msg_idx'));
      cache.del(editorKey(ctx.from.id, 'message_ids'));
      const result = await postService.findAll({ page: 1, limit: 100 });
      cache.set(`post_mgmt_mode:${ctx.from.id}`, true, 300);
      await ctx.reply('📋 روی عنوان پست مورد نظر ضربه بزنید:', postTitleOnlyListKeyboard(result.items));
      return;
    }

    const postId = cache.get<number>(pendingKey(ctx.from.id, 'edit_mode'));
    if (!postId) return next();
    cache.del(pendingKey(ctx.from.id, 'edit_mode'));
    const result = await postService.findAll({ page: 1, limit: 100 });
    cache.set(`post_mgmt_mode:${ctx.from.id}`, true, 300);
    await ctx.reply('📋 روی عنوان پست مورد نظر ضربه بزنید:', postTitleOnlyListKeyboard(result.items));
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
    await postService.archive(postId);
    const post = await postService.findById(postId);
    if (post) await showPostInfo(ctx, post);
  });

  // 🗑 حذف پست: Ask confirmation, then delete, return to posts list
  bot.action(/^post:manager:delete:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
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
    await postService.delete(postId);
    try { await ctx.editMessageText('🗑 پست حذف شد.'); } catch { await ctx.reply('🗑 پست حذف شد.'); }
    // Return to posts list
    const result = await postService.findAll({ page: 1, limit: 100 });
    cache.set(`post_mgmt_mode:${ctx.from.id}`, true, 300);
    await ctx.reply('📋 روی عنوان پست مورد نظر ضربه بزنید:', postTitleOnlyListKeyboard(result.items));
  });

  // 🔥 حذف دائمی: Confirm then fully remove post from all tables
  bot.action(/^post:manager:harddelete:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
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
    await postService.delete(postId);
    try { await ctx.editMessageText('🔥 پست به طور دائمی حذف شد.'); } catch { await ctx.reply('🔥 پست به طور دائمی حذف شد.'); }
    // Return to posts list
    const result = await postService.findAll({ page: 1, limit: 100 });
    cache.set(`post_mgmt_mode:${ctx.from.id}`, true, 300);
    await ctx.reply('📋 روی عنوان پست مورد نظر ضربه بزنید:', postTitleOnlyListKeyboard(result.items));
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
    const result = await postService.findAll({ page: 1, limit: 100 });
    cache.set(`post_mgmt_mode:${ctx.from.id}`, true, 300);
    await ctx.reply('📋 روی عنوان پست مورد نظر ضربه بزنید:', postTitleOnlyListKeyboard(result.items));
  });

  // ─── Back to Admin Panel ───────────────────────────────
  bot.hears('↩️ بازگشت به پنل ادمین', async (ctx: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    await adminMainMenu(ctx);
  });

  // ─── Published Posts in Main Menu ───────────────────────
  // This is handled by modifying buildMainMenuKeyboard in keyboards/index.ts

  // ─── Post View / Send to User ──────────────────────────
  function parseCopyBlocks(text: string): { segments: { type: 'text' | 'copy'; content: string }[] } {
    const segments: { type: 'text' | 'copy'; content: string }[] = [];
    const regex = /\[\[copy\]\](.*?)\[\[\/copy\]\]/gs;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
      }
      segments.push({ type: 'copy', content: match[1] });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      segments.push({ type: 'text', content: text.slice(lastIndex) });
    }
    return { segments };
  }

  async function sendPostToChat(ctx: any, rawPost: any) {
    const post = normalizePost(rawPost);
    await postService.incrementViews(post.id, undefined, BigInt(ctx.from.id));
    await renderPostToTelegram(ctx, post);
    await systemLogService.log({
      eventType: 'ADMIN_ACTION' as any,
      message: `Post Previewed: "${post.title}"`,
      telegramId: ctx.from.id,
      metadata: { postId: post.id } as any,
    });
  }

  function buildPostInlineKeyboard(buttons: any[], postId?: number): any[][] {
    if (!buttons || buttons.length === 0) return [];
    return buttons.map((row: any[]) =>
      row.map((btn: any) => {
        if (!btn) return null;
        const safeText = sanitizeTelegramText(btn.text || 'Link', 128);
        switch (btn.type) {
          case 'URL': return Markup.button.url(safeText, btn.value || '');
          case 'CALLBACK': {
            const clickData = JSON.stringify({ postId, text: btn.text, type: btn.type });
            return Markup.button.callback(safeText, `post:user:click:${clickData}`);
          }
          case 'OPEN_MINI_APP': return Markup.button.webApp(safeText, btn.value || '');
          case 'COPY_TEXT': return Markup.button.callback(safeText, `post:user:copy:${sanitizeTelegramText(btn.value || '', 64)}`);
          case 'SEND_COMMAND': return Markup.button.switchToChat(safeText, btn.value || '');
          case 'INTERNAL_NAV': return Markup.button.callback(safeText, `post:user:nav:${sanitizeTelegramText(btn.value || 'noop', 64)}`);
          default: return Markup.button.url(safeText, btn.value || '');
        }
      }).filter(Boolean)
    );
  }

  // ═══════════════════════════════════════════════════════════
  // ─── Multi-Message Editor ─────────────────────────────────
  // ═══════════════════════════════════════════════════════════

  async function enterPostEditor(ctx: any, post: any) {
    const postId = post.id;
    cache.set(editorKey(ctx.from.id, 'active'), postId, 600);
    cache.set(editorKey(ctx.from.id, 'mode'), 'main', 600);
    cache.del(editorKey(ctx.from.id, 'msg_idx'));
    cache.del(editorKey(ctx.from.id, 'message_ids'));
    cache.del(editorKey(ctx.from.id, 'forward_on'));

    await refreshEditorMessages(ctx, post);
  }

  async function refreshEditorMessages(ctx: any, post: any) {
    const postId = post.id;
    const content = post.content || '';
    const messages = parsePostMessages(content);

    const oldMsgIds = cache.get<number[]>(editorKey(ctx.from.id, 'message_ids')) || [];
    for (const msgId of oldMsgIds) {
      try { await ctx.deleteMessage(msgId); } catch (e) {}
    }

    await ctx.reply(`📝 *${post.title}* | ✏️ ویرایشگر (${messages.length} پیام)`, {
      parse_mode: 'Markdown',
      link_preview_options: { is_disabled: true },
      ...postMultiMessageEditorReplyKeyboard(),
    });

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
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    const messages = parsePostMessages(post.content || '');
    const msgText = messages[msgIdx] || '(بدون محتوا)';
    await ctx.reply(`✏️ ویرایش پیام ${msgIdx + 1}:\n\n${msgText}`, {
      ...postEditMessageReplyKeyboard(),
    });
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
    if (messages.length <= 1) {
      await postService.update(postId, { content: '', updatedBy: BigInt(ctx.from.id) } as any);
    } else {
      messages.splice(msgIdx, 1);
      const newContent = serializePostMessages(messages);
      await postService.update(postId, { content: newContent, updatedBy: BigInt(ctx.from.id) } as any);
    }
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
    await postService.update(postId, { content: newContent, updatedBy: BigInt(ctx.from.id) } as any);
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
    await postService.update(postId, { content: newContent, updatedBy: BigInt(ctx.from.id) } as any);
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
    const forwardOn = cache.get<boolean>(editorKey(ctx.from.id, 'forward_on')) || false;
    await ctx.reply('🔧 افزودن پیام جدید\n\n❇️ پیام جدید را وارد کنید.\nهمچنین می‌توانید متن را از چت یا کانال دیگری «باز ارسال» کنید.', {
      ...postAddMessageReplyKeyboard(forwardOn),
    });
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
          cache.set(pendingKey(ctx.from.id, 'editing_cmd'), true, 300);
          cache.set(pendingKey(ctx.from.id, 'editing_post'), editorPostId, 300);
          await ctx.reply('🔗 نام دستور را ارسال کنید (بدون /):\nmثلاً \`sgb/discount/rules\`', { parse_mode: 'Markdown' as any });
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
        case '📤 لغو انتشار': {
          await postService.unpublish(editorPostId);
          const post = await postService.findById(editorPostId);
          if (post) await refreshEditorMessages(ctx, post);
          return;
        }
        case '🗂 بازگشت به لیست': {
          cache.del(editorKey(ctx.from.id, 'active'));
          cache.del(editorKey(ctx.from.id, 'mode'));
          cache.del(editorKey(ctx.from.id, 'msg_idx'));
          cache.del(editorKey(ctx.from.id, 'message_ids'));
          const result = await postService.findAll({ page: 1, limit: 100 });
          cache.set(`post_mgmt_mode:${ctx.from.id}`, true, 300);
          await ctx.reply('📋 روی عنوان پست مورد نظر ضربه بزنید:', postTitleOnlyListKeyboard(result.items));
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
      await postService.update(editorPostId, { content: newContent, updatedBy: BigInt(ctx.from.id) } as any);
      cache.set(editorKey(ctx.from.id, 'mode'), 'main', 600);
      cache.del(editorKey(ctx.from.id, 'msg_idx'));
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
        const post = await postService.findById(editorPostId);
        if (!post) return ctx.reply('❌ پست یافت نشد.');
        const buttons = (post as any).buttons || [];
        cache.del(editorKey(ctx.from.id, 'active'));
        cache.del(editorKey(ctx.from.id, 'mode'));
        cache.del(editorKey(ctx.from.id, 'msg_idx'));
        cache.del(editorKey(ctx.from.id, 'message_ids'));
        await ctx.reply('⌨ ویرایشگر دکمه:\n\nبرای ویرایش روی دکمه ضربه بزنید یا دکمه جدید اضافه کنید.',
          postButtonsEditorKeyboard(editorPostId, buttons));
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
        await postService.update(editorPostId, { content: newContent, updatedBy: BigInt(ctx.from.id) } as any);
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
    await postService.update(editorPostId, { content: newContent, updatedBy: BigInt(ctx.from.id) } as any);
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
