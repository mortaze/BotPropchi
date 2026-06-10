import { PostStatus, PostButtonType } from '@prisma/client';
import { Context, Markup, Telegraf } from 'telegraf';
import { botAdminService } from '../../services/bot-admin.service';
import { postService } from '../../services/post.service';
import { systemLogService } from '../../services/system-log.service';
import { cache } from '../../utils/cache';
import { logger } from '../../utils/logger';
import {
  postMainMenuKeyboard,
  postEditorKeyboard,
  postListKeyboard,
  postViewKeyboard,
  postButtonsEditorKeyboard,
  postButtonEditKeyboard,
  postButtonTypeKeyboard,
  postRowResizeKeyboard,
  postPublishOptionsKeyboard,
  postAnalyticsKeyboard,
} from '../keyboards/post-keyboards';
import { buildMainMenuKeyboard, buildBotAdminPanelKeyboard } from '../keyboards';
import { settingsService } from '../../services/settings.service';

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
  await ctx.reply('⚙️ Admin Panel', buildBotAdminPanelKeyboard(canBroadcast));
}

const PENDING_POST_STATE = 'post:pending:';

function pendingKey(telegramId: number, field: string) {
  return `${PENDING_POST_STATE}${telegramId}:${field}`;
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
  const statusEmoji = post.status === 'PUBLISHED' ? '✅' : post.status === 'DRAFT' ? '📝' : '📦';
  const lines = [
    `${statusEmoji} *${post.title}*`,
    `_ID: ${post.id} | Slug: \`${post.slug}\`_`,
    post.isPinned ? '📌 *Pinned*' : '',
    post.command ? `🔗 Command: \`/${post.command}\`` : '',
    post.status === 'PUBLISHED' && post.publishedAt ? `📅 Published: ${new Date(post.publishedAt).toLocaleDateString('fa-IR')}` : '',
    post.status === 'SCHEDULED' && post.scheduledAt ? `⏰ Scheduled: ${new Date(post.scheduledAt).toLocaleDateString('fa-IR')}` : '',
    `📊 Views: ${(post as any)._count?.views || 0} | Clicks: ${(post as any)._count?.clickLogs || 0}`,
    '',
    post.content ? post.content.substring(0, 200) : '(No content)',
  ].filter(Boolean).join('\n');
  return lines;
}

export function registerPostHandlers(bot: Telegraf<Context>) {
  // ─── Post Admin Menu ─────────────────────────────────────
  bot.hears('📝 Posts', async (ctx: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    await ctx.reply('📝 Post Management System', postMainMenuKeyboard());
  });

  // ─── Create Post ─────────────────────────────────────────
  bot.hears('➕ Create Post', async (ctx: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    cache.set(pendingKey(ctx.from.id, 'creating'), true, 300);
    await ctx.reply('📝 Enter post title:');
  });

  // ─── Handle text input for post creation/editing ────────
  bot.on('text', async (ctx: any, next) => {
    if (!ctx.from) return next();
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin || !isPostAdmin(admin)) return next();

    const creating = cache.get<boolean>(pendingKey(ctx.from.id, 'creating'));
    const editingField = cache.get<string>(pendingKey(ctx.from.id, 'editing_field'));
    const editingPostId = cache.get<number>(pendingKey(ctx.from.id, 'editing_post'));
    const editingButton = cache.get<string>(pendingKey(ctx.from.id, 'editing_button'));
    const editingCommand = cache.get<boolean>(pendingKey(ctx.from.id, 'editing_cmd'));

    if (creating) {
      cache.del(pendingKey(ctx.from.id, 'creating'));
      const title = ctx.message.text;
      const slug = slugify(title);
      try {
        const post = await postService.create({ title, slug, createdBy: BigInt(ctx.from.id) });
        await ctx.reply(`✅ Post created!\n\nTitle: ${title}\nSlug: ${slug}`);
        await showPostEditor(ctx, post.id);
      } catch (err: any) {
        if (err.code === 'P2002') {
          await ctx.reply(`❌ Slug "${slug}" already exists. Try a different title.`);
        } else {
          logger.error('[Post] Create error:', err);
          await ctx.reply('❌ Failed to create post.');
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
          await ctx.reply(`✅ ${field} updated!`);
        }
        await showPostEditor(ctx, postId);
      } catch (err: any) {
        logger.error('[Post] Edit error:', err);
        await ctx.reply(`❌ Failed to update ${field}.`);
      }
      return;
    }

    if (editingButton && editingPostId) {
      const [action, rowStr, colStr] = editingButton.split(':');
      const row = parseInt(rowStr);
      const col = parseInt(colStr);
      cache.del(pendingKey(ctx.from.id, 'editing_button'));

      const post = await postService.findById(editingPostId);
      if (!post) return ctx.reply('❌ Post not found.');

      const buttons = (post as any).buttons || [];

      if (action === 'text') {
        if (!buttons[row]) buttons[row] = [];
        if (!buttons[row][col]) buttons[row][col] = {};
        buttons[row][col].text = ctx.message.text;
        await postService.update(editingPostId, { buttons: JSON.parse(JSON.stringify(buttons)) } as any);
        await ctx.reply('✅ Button text updated!');
      } else if (action === 'value') {
        if (!buttons[row]) buttons[row] = [];
        if (!buttons[row][col]) buttons[row][col] = {};
        buttons[row][col].value = ctx.message.text;
        await postService.update(editingPostId, { buttons: JSON.parse(JSON.stringify(buttons)) } as any);
        await ctx.reply('✅ Button value updated!');
      }
      await showPostEditor(ctx, editingPostId);
      return;
    }

    if (editingCommand && editingPostId) {
      cache.del(pendingKey(ctx.from.id, 'editing_cmd'));
      const cmdText = ctx.message.text.replace(/^\//, '').trim();
      if (!cmdText) return ctx.reply('❌ Invalid command.');
      try {
        await postService.addCommand(editingPostId, cmdText);
        await ctx.reply(`✅ Command /${cmdText} added!`);
      } catch (err: any) {
        await ctx.reply(`❌ ${err.message || 'Failed to add command.'}`);
      }
      await showPostEditor(ctx, editingPostId);
      return;
    }

    return next();
  });

  async function showPostEditor(ctx: any, postId: number) {
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ Post not found.');
    const hasContent = !!(post.content || post.mediaFileId);
    const preview = formatPostPreview(post);
    try {
      await ctx.reply(preview, {
        parse_mode: 'Markdown',
        ...postEditorKeyboard(postId, hasContent),
      });
    } catch {
      await ctx.reply(preview, postEditorKeyboard(postId, hasContent));
    }
  }

  // ─── Edit Post Actions ───────────────────────────────────
  bot.action(/^post:edit:(\d+):(.+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const action = ctx.match[2];
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ Post not found.');

    if (action === 'full') {
      return showPostEditor(ctx, postId);
    }
    if (action === 'title') {
      cache.set(pendingKey(ctx.from.id, 'editing_field'), 'title', 300);
      cache.set(pendingKey(ctx.from.id, 'editing_post'), postId, 300);
      return ctx.reply(`✏ Current title: *${post.title}*\n\nSend the new title:`, { parse_mode: 'Markdown' });
    }
    if (action === 'content') {
      cache.set(pendingKey(ctx.from.id, 'editing_field'), 'content', 300);
      cache.set(pendingKey(ctx.from.id, 'editing_post'), postId, 300);
      const current = post.content ? `Current content:\n${post.content.substring(0, 200)}` : '(No content)';
      return ctx.reply(`📝 ${current}\n\nSend the new content (Markdown supported):`);
    }
    if (action === 'media') {
      cache.set(pendingKey(ctx.from.id, 'editing_field'), 'media', 300);
      cache.set(pendingKey(ctx.from.id, 'editing_post'), postId, 300);
      return ctx.reply('🖼 Send the media file (photo, video, GIF, document, audio, voice):');
    }
    if (action === 'buttons') {
      const buttons = (post as any).buttons || [];
      await ctx.reply('⌨ Button Editor:\n\nTap a button to edit, or add new buttons.',
        postButtonsEditorKeyboard(postId, buttons));
      return;
    }
    if (action === 'caption') {
      cache.set(pendingKey(ctx.from.id, 'editing_field'), 'caption', 300);
      cache.set(pendingKey(ctx.from.id, 'editing_post'), postId, 300);
      return ctx.reply(`📝 Current caption: ${post.caption || '(none)'}\n\nSend the new caption:`);
    }
  });

  // ─── View Post ──────────────────────────────────────────
  bot.action(/^post:view:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ Post not found.');
    const preview = formatPostPreview(post);
    try {
      if (ctx.callbackQuery?.message) {
        await ctx.editMessageText(preview, {
          parse_mode: 'Markdown',
          ...postViewKeyboard(post as any),
        });
      } else {
        await ctx.reply(preview, {
          parse_mode: 'Markdown',
          ...postViewKeyboard(post as any),
        });
      }
    } catch {
      if (ctx.callbackQuery?.message) {
        await ctx.editMessageText(preview, postViewKeyboard(post as any));
      } else {
        await ctx.reply(preview, postViewKeyboard(post as any));
      }
    }
  });

  // ─── List Posts ─────────────────────────────────────────
  bot.hears('📋 Manage Posts', async (ctx: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    return showPostList(ctx, 1);
  });

  bot.action(/^post:list:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const page = parseInt(ctx.match[1]);
    return showPostList(ctx, page, true);
  });

  async function showPostList(ctx: any, page: number, edit = false) {
    const result = await postService.findAll({ page, limit: 5 });
    if (result.items.length === 0) {
      if (edit) {
        await ctx.editMessageText('📋 No posts found.', postListKeyboard([], page, 1));
      } else {
        await ctx.reply('📋 No posts found.', postListKeyboard([], page, 1));
      }
      return;
    }
    const text = `📋 Posts (Page ${page}/${result.pages})\n\n` +
      result.items.map((p: any) =>
        `${p.isPinned ? '📌' : '  '} ${p.status === 'PUBLISHED' ? '✅' : p.status === 'DRAFT' ? '📝' : '📦'} ${p.title} (ID: ${p.id})`
      ).join('\n');
    if (edit) {
      await ctx.editMessageText(text, postListKeyboard(result.items, page, result.pages));
    } else {
      await ctx.reply(text, postListKeyboard(result.items, page, result.pages));
    }
  }

  // ─── Drafts ─────────────────────────────────────────────
  bot.hears('📦 Drafts', async (ctx: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const drafts = await postService.getDrafts();
    if (drafts.length === 0) {
      return ctx.reply('📦 No drafts found.');
    }
    const rows = Markup.inlineKeyboard(
      drafts.map((d: any) => [Markup.button.callback(`📝 ${d.title}`, `post:view:${d.id}`)])
    );
    await ctx.reply(`📦 Drafts (${drafts.length}):`, rows);
  });

  // ─── Pinned Posts ───────────────────────────────────────
  bot.hears('📌 Pinned Posts', async (ctx: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const pinned = await postService.getPinned();
    if (pinned.length === 0) {
      return ctx.reply('📌 No pinned posts.');
    }
    const rows = Markup.inlineKeyboard(
      pinned.map((p: any) => [Markup.button.callback(`📌 ${p.title}`, `post:view:${p.id}`)])
    );
    await ctx.reply(`📌 Pinned Posts (${pinned.length}):`, rows);
  });

  // ─── Search Posts ───────────────────────────────────────
  bot.hears('🔎 Search Posts', async (ctx: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    cache.set(pendingKey(ctx.from.id, 'searching'), true, 120);
    await ctx.reply('🔎 Search posts by title, content, or slug:');
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
      return ctx.reply(`🔎 No results for "${query}".`);
    }
    const text = `🔎 Results for "${query}":\n\n` +
      result.items.map((p: any) =>
        `✅ ${p.title} (${p.status})`
      ).join('\n');
    await ctx.reply(text, postListKeyboard(result.items, 1, result.pages));
  });

  // ─── Preview Post ───────────────────────────────────────
  bot.hears('👁 Preview Post', async (ctx: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    cache.set(pendingKey(ctx.from.id, 'preview_id'), true, 120);
    await ctx.reply('👁 Enter Post ID to preview:');
  });

  bot.on('text', async (ctx: any, next) => {
    if (!ctx.from) return next();
    const previewMode = cache.get<boolean>(pendingKey(ctx.from.id, 'preview_id'));
    if (!previewMode) return next();
    cache.del(pendingKey(ctx.from.id, 'preview_id'));
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return next();
    const postId = parseInt(ctx.message.text);
    if (isNaN(postId)) return ctx.reply('❌ Invalid ID.');
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ Post not found.');
    await sendPostToChat(ctx, post);
  });

  // ─── Publish Post ───────────────────────────────────────
  bot.hears('📤 Publish', async (ctx: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    cache.set(pendingKey(ctx.from.id, 'publish_id'), true, 120);
    await ctx.reply('📤 Enter Post ID to publish:');
  });

  bot.action(/^post:publish:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ Post not found.');
    await ctx.reply(`📤 Publish options for "${post.title}":`, postPublishOptionsKeyboard(postId));
  });

  bot.action(/^post:publish:now:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    await postService.publish(postId, BigInt(ctx.from.id));
    await ctx.reply('✅ Post published!');
    const post = await postService.findById(postId);
    await showPostEditor(ctx, postId);
  });

  bot.action(/^post:draft:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    await postService.update(postId, { status: PostStatus.DRAFT, updatedBy: BigInt(ctx.from.id) } as any);
    postService.invalidateCache();
    await ctx.reply('📝 Saved as draft.');
    await showPostEditor(ctx, postId);
  });

  // ─── Pin / Unpin ────────────────────────────────────────
  bot.action(/^post:pin:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const updated = await postService.togglePin(postId);
    if (!updated) return ctx.reply('❌ Post not found.');
    await ctx.reply(updated.isPinned ? '📌 Post pinned!' : '📌 Post unpinned!');
    await showPostEditor(ctx, postId);
  });

  // ─── Reorder ────────────────────────────────────────────
  bot.action(/^post:reorder:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    cache.set(pendingKey(ctx.from.id, 'reorder'), postId, 120);
    await ctx.reply('🗂 Enter new sort order number:');
  });

  bot.on('text', async (ctx: any, next) => {
    if (!ctx.from) return next();
    const reorderPostId = cache.get<number>(pendingKey(ctx.from.id, 'reorder'));
    if (!reorderPostId) return next();
    cache.del(pendingKey(ctx.from.id, 'reorder'));
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return next();
    const order = parseInt(ctx.message.text);
    if (isNaN(order)) return ctx.reply('❌ Invalid number.');
    await postService.reorder(reorderPostId, order);
    await ctx.reply(`✅ Sort order set to ${order}.`);
  });

  // ─── Duplicate ──────────────────────────────────────────
  bot.action(/^post:duplicate:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const dup = await postService.duplicate(postId, BigInt(ctx.from.id));
    if (!dup) return ctx.reply('❌ Post not found.');
    await ctx.reply(`✅ Duplicate created: "${dup.title}"`);
    await showPostEditor(ctx, dup.id);
  });

  // ─── Delete ─────────────────────────────────────────────
  bot.action(/^post:delete:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ Post not found.');
    await ctx.reply(
      `🗑 Are you sure you want to delete "${post.title}"?`,
      Markup.inlineKeyboard([
        [Markup.button.callback('✅ Yes, Delete', `post:delete:confirm:${postId}`)],
        [Markup.button.callback('❌ Cancel', `post:view:${postId}`)],
      ])
    );
  });

  bot.action(/^post:delete:confirm:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    await postService.delete(postId);
    await ctx.reply('🗑 Post deleted.');
    await ctx.editMessageText('🗑 Post has been deleted.').catch(() => {});
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
    if (!post) return ctx.reply('❌ Post not found.');
    const buttons = (post as any).buttons || [];
    const button = buttons[row]?.[col];
    if (!button) {
      return ctx.reply(
        'Select button type to add:',
        postButtonTypeKeyboard(postId, row, col)
      );
    }
    await ctx.reply(
      `Button: "${button.text}"\nType: ${button.type || 'URL'}\nValue: ${button.value || '-'}`,
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
    await ctx.reply('🎨 Send the new button text:');
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
    await ctx.reply('🔗 Send the new URL/value for this button:');
  });

  bot.action(/^post:btn:up:(\d+):(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    if (row === 0) return ctx.reply('Already at top.');
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ Post not found.');
    const buttons = (post as any).buttons || [];
    [buttons[row - 1], buttons[row]] = [buttons[row], buttons[row - 1]];
    await postService.update(postId, { buttons: JSON.parse(JSON.stringify(buttons)) } as any);
    await ctx.reply('✅ Button moved up.');
    await ctx.reply('⌨ Button Editor:', postButtonsEditorKeyboard(postId, buttons));
  });

  bot.action(/^post:btn:down:(\d+):(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ Post not found.');
    const buttons = (post as any).buttons || [];
    if (row >= buttons.length - 1) return ctx.reply('Already at bottom.');
    [buttons[row], buttons[row + 1]] = [buttons[row + 1], buttons[row]];
    await postService.update(postId, { buttons: JSON.parse(JSON.stringify(buttons)) } as any);
    await ctx.reply('✅ Button moved down.');
    await ctx.reply('⌨ Button Editor:', postButtonsEditorKeyboard(postId, buttons));
  });

  bot.action(/^post:btn:del:(\d+):(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    const col = parseInt(ctx.match[3]);
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ Post not found.');
    const buttons = (post as any).buttons || [];
    if (buttons[row]) {
      buttons[row].splice(col, 1);
      if (buttons[row].length === 0) buttons.splice(row, 1);
    }
    await postService.update(postId, { buttons: JSON.parse(JSON.stringify(buttons)) } as any);
    await ctx.reply('➖ Button deleted.');
    await ctx.reply('⌨ Button Editor:', postButtonsEditorKeyboard(postId, buttons));
  });

  bot.action(/^post:btn:addrow:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ Post not found.');
    const buttons = (post as any).buttons || [];
    buttons.push([{ text: 'New Button', type: 'URL', value: '' }]);
    await postService.update(postId, { buttons: JSON.parse(JSON.stringify(buttons)) } as any);
    await ctx.reply('➕ New button row added.');
    await ctx.reply('⌨ Button Editor:', postButtonsEditorKeyboard(postId, buttons));
  });

  bot.action(/^post:btn:resize:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    await ctx.reply('📐 Select buttons per row:', postRowResizeKeyboard(postId, row));
  });

  bot.action(/^post:btn:rowsize:(\d+):(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    const size = parseInt(ctx.match[3]);
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ Post not found.');
    const buttons = (post as any).buttons || [];
    const currentRow = buttons[row] || [];
    const newRow: any[] = [];
    for (let i = 0; i < size; i++) {
      newRow.push(currentRow[i] || { text: `Button ${i + 1}`, type: 'URL', value: '' });
    }
    buttons[row] = newRow;
    await postService.update(postId, { buttons: JSON.parse(JSON.stringify(buttons)) } as any);
    await ctx.reply(`✅ Row ${row + 1} resized to ${size} button(s).`);
    await ctx.reply('⌨ Button Editor:', postButtonsEditorKeyboard(postId, buttons));
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
    if (!post) return ctx.reply('❌ Post not found.');
    const buttons = (post as any).buttons || [];
    if (!buttons[row]) buttons[row] = [];
    if (!buttons[row][col]) buttons[row][col] = {};
    buttons[row][col].type = btnType;
    await postService.update(postId, { buttons: JSON.parse(JSON.stringify(buttons)) } as any);
    await ctx.reply(`✅ Button type set to ${btnType}. Now set the value:`);
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
    await ctx.reply('🔗 Send the command name (without /):\ne.g. `sgb/discount/rules`', { parse_mode: 'Markdown' });
  });

  // ─── Analytics ──────────────────────────────────────────
  bot.hears('📊 Post Analytics', async (ctx: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    cache.set(pendingKey(ctx.from.id, 'analytics_id'), true, 120);
    await ctx.reply('📊 Enter Post ID for analytics:');
  });

  bot.action(/^post:analytics:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ Post not found.');
    const analytics = await postService.getAnalytics(postId);
    const text = [
      `📊 *Analytics: ${post.title}*`,
      '',
      `👁 Total Views: ${analytics.totalViews}`,
      `👆 Total Clicks: ${analytics.totalClicks}`,
      `👤 Unique Users: ${analytics.uniqueUsers}`,
      '',
      '📈 Daily Views (last 30d):',
      ...analytics.dailyViews.slice(-7).map((d: any) => `  ${d.date}: ${d.count} views`),
    ].join('\n');
    await ctx.reply(text, { parse_mode: 'Markdown', ...postAnalyticsKeyboard(postId) });
  });

  bot.on('text', async (ctx: any, next) => {
    if (!ctx.from) return next();
    const analyticsId = cache.get<boolean>(pendingKey(ctx.from.id, 'analytics_id'));
    if (!analyticsId) return next();
    cache.del(pendingKey(ctx.from.id, 'analytics_id'));
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return next();
    const postId = parseInt(ctx.message.text);
    if (isNaN(postId)) return ctx.reply('❌ Invalid ID.');
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ Post not found.');
    const analytics = await postService.getAnalytics(postId);
    const text = [
      `📊 *Analytics: ${post.title}*`,
      '',
      `👁 Total Views: ${analytics.totalViews}`,
      `👆 Total Clicks: ${analytics.totalClicks}`,
      `👤 Unique Users: ${analytics.uniqueUsers}`,
      '',
      '📈 Daily Views (last 30d):',
      ...analytics.dailyViews.slice(-7).map((d: any) => `  ${d.date}: ${d.count} views`),
    ].join('\n');
    await ctx.reply(text, { parse_mode: 'Markdown', ...postAnalyticsKeyboard(postId) });
  });

  // ─── Post Settings ─────────────────────────────────────
  bot.hears('⚙ Post Settings', async (ctx: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const text = [
      '⚙ *Post Settings*',
      '',
      'Use the post editor to configure:',
      '• Parse mode (Markdown / HTML)',
      '• Sort order',
      '• Commands and aliases',
      '• Pin status',
      '• Media type',
    ].join('\n');
    await ctx.reply(text, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('« Back to Posts Menu', 'post:menu')],
      ]),
    });
  });

  // ─── Back to Posts Menu ─────────────────────────────────
  bot.action('post:menu', async (ctx: any) => {
    await ctx.answerCbQuery();
    await ctx.reply('📝 Post Management System', postMainMenuKeyboard());
  });

  // ─── Back to Admin Panel ───────────────────────────────
  bot.hears('↩️ Back to Admin Panel', async (ctx: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    await adminMainMenu(ctx);
  });

  // ─── Published Posts in Main Menu ───────────────────────
  // This is handled by modifying buildMainMenuKeyboard in keyboards/index.ts

  // ─── Post View / Send to User ──────────────────────────
  async function sendPostToChat(ctx: any, post: any) {
    await postService.incrementViews(post.id, undefined, BigInt(ctx.from.id));
    const inlineButtons = buildPostInlineKeyboard((post as any).buttons || []);
    const parseMode = post.parseMode || 'Markdown';
    const hasText = post.content || post.caption;

    if (post.mediaFileId && post.mediaType) {
      const mediaConfig: any = { caption: post.caption || post.content, parse_mode: parseMode, ...(inlineButtons ? Markup.inlineKeyboard(inlineButtons) : {}) };
      switch (post.mediaType) {
        case 'photo': await ctx.replyWithPhoto(post.mediaFileId, mediaConfig); break;
        case 'video': await ctx.replyWithVideo(post.mediaFileId, mediaConfig); break;
        case 'animation': await ctx.replyWithAnimation(post.mediaFileId, mediaConfig); break;
        case 'document': await ctx.replyWithDocument(post.mediaFileId, mediaConfig); break;
        case 'audio': await ctx.replyWithAudio(post.mediaFileId, mediaConfig); break;
        case 'voice': await ctx.replyWithVoice(post.mediaFileId, mediaConfig); break;
        default: await ctx.replyWithPhoto(post.mediaFileId, mediaConfig); break;
      }
    } else if (post.albumMediaIds && Array.isArray(post.albumMediaIds) && post.albumMediaIds.length > 0) {
      const media = post.albumMediaIds.map((id: string, i: number) => ({
        type: 'photo' as const,
        media: id,
        caption: i === 0 ? (post.caption || post.content) : undefined,
        parse_mode: parseMode,
      }));
      await ctx.replyWithMediaGroup(media);
      if (inlineButtons.length > 0) {
        await ctx.reply('Actions:', Markup.inlineKeyboard(inlineButtons));
      }
    } else if (hasText) {
      const text = post.content || post.caption;
      try {
        await ctx.reply(text, { parse_mode: parseMode, ...(inlineButtons.length > 0 ? Markup.inlineKeyboard(inlineButtons) : {}) });
      } catch {
        await ctx.reply(text, { ...(inlineButtons.length > 0 ? Markup.inlineKeyboard(inlineButtons) : {}) });
      }
    } else {
      await ctx.reply('(Empty post)', { ...(inlineButtons.length > 0 ? Markup.inlineKeyboard(inlineButtons) : {}) });
    }

    await systemLogService.log({
      eventType: 'ADMIN_ACTION' as any,
      message: `Post Previewed: "${post.title}"`,
      telegramId: ctx.from.id,
      metadata: { postId: post.id } as any,
    });
  }

  function buildPostInlineKeyboard(buttons: any[]): any[][] {
    if (!buttons || buttons.length === 0) return [];
    return buttons.map((row: any[]) =>
      row.map((btn: any) => {
        if (!btn) return null;
        switch (btn.type) {
          case 'URL': return Markup.button.url(btn.text || 'Link', btn.value || '');
          case 'CALLBACK': return Markup.button.callback(btn.text || 'Button', btn.value || 'noop');
          case 'OPEN_MINI_APP': return Markup.button.webApp(btn.text || 'Open', btn.value || '');
          case 'COPY_TEXT': return Markup.button.callback(btn.text || 'Copy', `post:user:copy:${btn.value || ''}`);
          case 'SEND_COMMAND': return Markup.button.switchToChat(btn.text || 'Send', btn.value || '');
          case 'INTERNAL_NAV': return Markup.button.callback(btn.text || 'Nav', btn.value || 'noop');
          default: return Markup.button.url(btn.text || 'Link', btn.value || '');
        }
      }).filter(Boolean)
    );
  }
}

// Export the helper for main menu integration
export async function getPublishedPostsForMenu(): Promise<any[]> {
  return postService.getPublished();
}
