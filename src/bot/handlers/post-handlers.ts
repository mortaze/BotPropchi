import { PostStatus } from '@prisma/client';
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
  postCommandListKeyboard,
  postCommandEditKeyboard,
  postVersionHistoryKeyboard,
  postIntegrityKeyboard,
  postGlobalAnalyticsKeyboard,
  postSwapTargetKeyboard,
} from '../keyboards/post-keyboards';
import { buildBotAdminPanelKeyboard } from '../keyboards';
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
  await ctx.reply('⚙️ پنل مدیریت', buildBotAdminPanelKeyboard(canBroadcast));
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
    post.content ? post.content.substring(0, 200) : '(بدون محتوا)',
  ].filter(Boolean).join('\n');
  return lines;
}

export function registerPostHandlers(bot: Telegraf<Context>) {
  // ─── Post Admin Menu ─────────────────────────────────────
  bot.hears('📝 پست‌ها', async (ctx: any) => {
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    await ctx.reply('📝 سامانه مدیریت پست‌ها', postMainMenuKeyboard());
  });

  // ─── Create Post ─────────────────────────────────────────
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
          await ctx.reply(`✅ ${field === 'title' ? 'عنوان' : field === 'content' ? 'محتوا' : field === 'caption' ? 'کپشن' : 'دستور'} به‌روز شد!`);
        }
        await showPostEditor(ctx, postId);
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
      await showPostEditor(ctx, editingPostId);
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
      await showPostEditor(ctx, editingPostId);
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
    try {
      await ctx.reply(preview, {
        parse_mode: 'Markdown',
        link_preview_options: { is_disabled: true },
        ...postEditorKeyboard(postId, hasContent),
      });
    } catch {
      await ctx.reply(preview, { link_preview_options: { is_disabled: true }, ...postEditorKeyboard(postId, hasContent) });
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
    if (!post) return ctx.reply('❌ پست یافت نشد.');

    if (action === 'full') {
      return showPostEditor(ctx, postId);
    }
    if (action === 'title') {
      cache.set(pendingKey(ctx.from.id, 'editing_field'), 'title', 300);
      cache.set(pendingKey(ctx.from.id, 'editing_post'), postId, 300);
      return ctx.reply(`✏ عنوان فعلی: *${post.title}*\n\nعنوان جدید را ارسال کنید:`, { parse_mode: 'Markdown' });
    }
    if (action === 'content') {
      cache.set(pendingKey(ctx.from.id, 'editing_field'), 'content', 300);
      cache.set(pendingKey(ctx.from.id, 'editing_post'), postId, 300);
      const current = post.content ? `محتوا فعلی:\n${post.content.substring(0, 200)}` : '(بدون محتوا)';
      return ctx.reply(`📝 ${current}\n\nمحتوای جدید را ارسال کنید (Markdown پشتیبانی می‌شود):`);
    }
    if (action === 'media') {
      cache.set(pendingKey(ctx.from.id, 'editing_field'), 'media', 300);
      cache.set(pendingKey(ctx.from.id, 'editing_post'), postId, 300);
      return ctx.reply('🖼 فایل رسانه ارسال کنید (عکس، ویدیو، گیف، سند، صدا، ویس):');
    }
    if (action === 'buttons') {
      const buttons = (post as any).buttons || [];
      await ctx.reply('⌨ ویرایشگر دکمه:\n\nبرای ویرایش روی دکمه ضربه بزنید یا دکمه جدید اضافه کنید.',
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
    try {
      if (ctx.callbackQuery?.message) {
        await ctx.editMessageText(preview, {
          parse_mode: 'Markdown',
          link_preview_options: { is_disabled: true },
          ...postViewKeyboard(post as any),
        });
      } else {
        await ctx.reply(preview, {
          parse_mode: 'Markdown',
          link_preview_options: { is_disabled: true },
          ...postViewKeyboard(post as any),
        });
      }
    } catch {
      if (ctx.callbackQuery?.message) {
        await ctx.editMessageText(preview, { link_preview_options: { is_disabled: true }, ...postViewKeyboard(post as any) });
      } else {
        await ctx.reply(preview, { link_preview_options: { is_disabled: true }, ...postViewKeyboard(post as any) });
      }
    }
  });

  // ─── List Posts ─────────────────────────────────────────
  bot.hears('📋 مدیریت پست‌ها', async (ctx: any) => {
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
        await ctx.editMessageText('📋 پستی یافت نشد.', postListKeyboard([], page, 1));
      } else {
        await ctx.reply('📋 پستی یافت نشد.', postListKeyboard([], page, 1));
      }
      return;
    }
    const text = `📋 پست‌ها (صفحه ${page}/${result.pages})\n\n` +
      result.items.map((p: any) =>
        `${p.status === 'PUBLISHED' ? '✅' : p.status === 'DRAFT' ? '📝' : '📦'} ${p.title} (شناسه: ${p.id})`
      ).join('\n');
    if (edit) {
      await ctx.editMessageText(text, postListKeyboard(result.items, page, result.pages));
    } else {
      await ctx.reply(text, postListKeyboard(result.items, page, result.pages));
    }
  }

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
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    await ctx.reply(`📤 گزینه‌های انتشار برای "${post.title}":`, postPublishOptionsKeyboard(postId));
  });

  bot.action(/^post:publish:now:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    await postService.publish(postId, BigInt(ctx.from.id));
    await ctx.reply('✅ پست منتشر شد!');
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
    await ctx.reply('📝 به عنوان پیش‌نویس ذخیره شد.');
    await showPostEditor(ctx, postId);
  });

  // ─── Archive ─────────────────────────────────────────────
  bot.action(/^post:archive:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    await postService.archive(postId);
    await ctx.reply('📦 پست بایگانی شد.');
    await showPostEditor(ctx, postId);
  });

  // ─── Hide / Show ─────────────────────────────────────────
  bot.action(/^post:hide:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    if (post.status === 'HIDDEN') {
      await postService.show(postId);
      await ctx.reply('👻 پست اکنون قابل مشاهده است.');
    } else {
      await postService.hide(postId);
      await ctx.reply('👻 پست مخفی شد.');
    }
    await showPostEditor(ctx, postId);
  });

  // ─── Schedule ────────────────────────────────────────────
  bot.action(/^post:publish:schedule:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    cache.set(pendingKey(ctx.from.id, 'schedule_publish'), postId, 300);
    await ctx.reply('📅 تاریخ/زمان را به فرمت ISO ارسال کنید:\nmثلاً `2026-06-15T14:30:00.000Z`', { parse_mode: 'Markdown' });
  });

  bot.action(/^post:unpublish:schedule:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    cache.set(pendingKey(ctx.from.id, 'schedule_unpublish'), postId, 300);
    await ctx.reply('⏰ تاریخ/زمان لغو انتشار خودکار را به فرمت ISO ارسال کنید:\nmثلاً `2026-06-20T14:30:00.000Z`', { parse_mode: 'Markdown' });
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
    await ctx.reply(
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
    await ctx.reply('🔗 گزینه‌های دستور:', postCommandEditKeyboard(postId, commandId));
  });

  bot.action(/^post:cmd:del:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const commandId = parseInt(ctx.match[2]);
    try {
      await postService.removeCommand(commandId);
      await ctx.reply('🗑 دستور حذف شد.');
    } catch (err: any) {
      await ctx.reply(`❌ ${err.message}`);
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
    await ctx.reply('➕ نام مستعار را ارسال کنید (بدون /):');
  });

  // ─── Unpublish ───────────────────────────────────────────
  bot.action(/^post:unpublish:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    await postService.unpublish(postId);
    await ctx.reply('📥 انتشار پست لغو شد.');
    await showPostEditor(ctx, postId);
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
    await ctx.reply('🗑 پست حذف شد.');
    await ctx.editMessageText('🗑 پست حذف شد.').catch(() => {});
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
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    const buttons = (post as any).buttons || [];
    const button = buttons[row]?.[col];
    if (!button) {
      return ctx.reply(
        'نوع دکمه را انتخاب کنید:',
        postButtonTypeKeyboard(postId, row, col)
      );
    }
    await ctx.reply(
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
    await ctx.reply('🎨 متن جدید دکمه را ارسال کنید:');
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
    await ctx.reply('🔗 آدرس/مقدار جدید دکمه را ارسال کنید:');
  });

  bot.action(/^post:btn:up:(\d+):(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    if (row === 0) return ctx.reply('هم‌اکنون در بالاست.');
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    const buttons = (post as any).buttons || [];
    [buttons[row - 1], buttons[row]] = [buttons[row], buttons[row - 1]];
    await postService.update(postId, { buttons: JSON.parse(JSON.stringify(buttons)) } as any);
    await ctx.reply('✅ دکمه به بالا منتقل شد.');
    await ctx.reply('⌨ ویرایشگر دکمه:', postButtonsEditorKeyboard(postId, buttons));
  });

  bot.action(/^post:btn:down:(\d+):(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    const buttons = (post as any).buttons || [];
    if (row >= buttons.length - 1) return ctx.reply('هم‌اکنون در پایین‌ترین است.');
    [buttons[row], buttons[row + 1]] = [buttons[row + 1], buttons[row]];
    await postService.update(postId, { buttons: JSON.parse(JSON.stringify(buttons)) } as any);
    await ctx.reply('✅ دکمه به پایین منتقل شد.');
    await ctx.reply('⌨ ویرایشگر دکمه:', postButtonsEditorKeyboard(postId, buttons));
  });

  bot.action(/^post:btn:del:(\d+):(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    const col = parseInt(ctx.match[3]);
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    const buttons = (post as any).buttons || [];
    if (buttons[row]) {
      buttons[row].splice(col, 1);
      if (buttons[row].length === 0) buttons.splice(row, 1);
    }
    await postService.update(postId, { buttons: JSON.parse(JSON.stringify(buttons)) } as any);
    await ctx.reply('➖ دکمه حذف شد.');
    await ctx.reply('⌨ ویرایشگر دکمه:', postButtonsEditorKeyboard(postId, buttons));
  });

  bot.action(/^post:btn:addrow:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    const buttons = (post as any).buttons || [];
    buttons.push([{ text: 'دکمه جدید', type: 'URL', value: '' }]);
    await postService.update(postId, { buttons: JSON.parse(JSON.stringify(buttons)) } as any);
    await ctx.reply('➕ سطر دکمه جدید اضافه شد.');
    await ctx.reply('⌨ ویرایشگر دکمه:', postButtonsEditorKeyboard(postId, buttons));
  });

  bot.action(/^post:btn:resize:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    await ctx.reply('📐 تعداد دکمه در سطر را انتخاب کنید:', postRowResizeKeyboard(postId, row));
  });

  bot.action(/^post:btn:rowsize:(\d+):(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    const size = parseInt(ctx.match[3]);
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    const buttons = (post as any).buttons || [];
    const currentRow = buttons[row] || [];
    const newRow: any[] = [];
    for (let i = 0; i < size; i++) {
      newRow.push(currentRow[i] || { text: `دکمه ${i + 1}`, type: 'URL', value: '' });
    }
    buttons[row] = newRow;
    await postService.update(postId, { buttons: JSON.parse(JSON.stringify(buttons)) } as any);
    await ctx.reply(`✅ سطر ${row + 1} به ${size} دکمه تغییر اندازه یافت.`);
    await ctx.reply('⌨ ویرایشگر دکمه:', postButtonsEditorKeyboard(postId, buttons));
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
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    const buttons = (post as any).buttons || [];
    if (!buttons[row]) buttons[row] = [];
    if (!buttons[row][col]) buttons[row][col] = {};
    buttons[row][col].type = btnType;
    await postService.update(postId, { buttons: JSON.parse(JSON.stringify(buttons)) } as any);
    await ctx.reply(`✅ نوع دکمه به ${btnType} تغییر یافت. اکنون مقدار را تنظیم کنید:`);
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
    await ctx.reply('🔗 نام دستور را ارسال کنید (بدون /):\nmثلاً `sgb/discount/rules`', { parse_mode: 'Markdown' });
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
    await ctx.reply('📝 سامانه مدیریت پست‌ها', postMainMenuKeyboard());
  });

  // ─── Version History ────────────────────────────────────
  bot.action(/^post:version:list:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const versions = await postService.getVersions(postId);
    if (versions.length === 0) return ctx.reply('📜 نسخه‌ای ذخیره نشده است.');
    await ctx.reply(
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
      if (!restored) return ctx.reply('❌ نسخه یافت نشد.');
      await ctx.reply(`✅ نسخه بازیابی شد: "${restored.title}"`);
      await showPostEditor(ctx, restored.id);
    } catch (err: any) {
      await ctx.reply(`❌ ${err.message}`);
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
    await ctx.reply('🔍 در حال بررسی سلامت...');
    const issues = await postService.integrityCheck();
    if (issues.length === 0) {
      await ctx.reply('✅ همه پست‌ها سالم هستند.');
    } else {
      await ctx.reply(`⚠ مشکلات یافت شد:\n\n${issues.join('\n')}`);
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
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...postGlobalAnalyticsKeyboard() }).catch(() => {});
  });

  bot.action('post:analytics:top', async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const topPosts = await postService.getTopPosts(10);
    if (topPosts.length === 0) return ctx.reply('🏆 پستی وجود ندارد.');
    const text = '🏆 *پست‌های برتر بر اساس بازدید*\n\n' +
      topPosts.map((p: any, i: number) => `${i + 1}. ${p.title} — ${(p as any).views || 0} بازدید`).join('\n');
    await ctx.reply(text, { parse_mode: 'Markdown', ...postGlobalAnalyticsKeyboard() });
  });

  // ─── Button Row Management ──────────────────────────────
  bot.action(/^post:btn:rowup:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    if (row === 0) return ctx.reply('هم‌اکنون در بالاست.');
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    const buttons = (post as any).buttons || [];
    [buttons[row - 1], buttons[row]] = [buttons[row], buttons[row - 1]];
    await postService.update(postId, { buttons: JSON.parse(JSON.stringify(buttons)) } as any);
    await ctx.reply('✅ سطر به بالا منتقل شد.');
    await ctx.reply('⌨ ویرایشگر دکمه:', postButtonsEditorKeyboard(postId, buttons));
  });

  bot.action(/^post:btn:rowdown:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    const buttons = (post as any).buttons || [];
    if (row >= buttons.length - 1) return ctx.reply('هم‌اکنون در پایین‌ترین جایگاه است.');
    [buttons[row], buttons[row + 1]] = [buttons[row + 1], buttons[row]];
    await postService.update(postId, { buttons: JSON.parse(JSON.stringify(buttons)) } as any);
    await ctx.reply('✅ سطر به پایین منتقل شد.');
    await ctx.reply('⌨ ویرایشگر دکمه:', postButtonsEditorKeyboard(postId, buttons));
  });

  bot.action(/^post:btn:swap:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    const buttons = (post as any).buttons || [];
    await ctx.reply('🔄 سطر مقصد را برای جابجایی انتخاب کنید:', postSwapTargetKeyboard(postId, row, buttons.length));
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
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    const buttons = (post as any).buttons || [];
    [buttons[rowA], buttons[rowB]] = [buttons[rowB], buttons[rowA]];
    await postService.update(postId, { buttons: JSON.parse(JSON.stringify(buttons)) } as any);
    await ctx.reply('🔄 سطرها جابجا شدند.');
    await ctx.reply('⌨ ویرایشگر دکمه:', postButtonsEditorKeyboard(postId, buttons));
  });

  bot.action(/^post:btn:duprow:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    const buttons = (post as any).buttons || [];
    if (!buttons[row]) return ctx.reply('❌ سطر یافت نشد.');
    const duplicated = buttons[row].map((b: any) => ({ ...b }));
    buttons.splice(row + 1, 0, duplicated);
    await postService.update(postId, { buttons: JSON.parse(JSON.stringify(buttons)) } as any);
    await ctx.reply('📋 سطر کپی شد.');
    await ctx.reply('⌨ ویرایشگر دکمه:', postButtonsEditorKeyboard(postId, buttons));
  });

  bot.action(/^post:btn:delrow:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await requirePostAdmin(ctx);
    if (!isPostAdmin(admin)) return;
    const postId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    const buttons = (post as any).buttons || [];
    buttons.splice(row, 1);
    await postService.update(postId, { buttons: JSON.parse(JSON.stringify(buttons)) } as any);
    await ctx.reply('➖ سطر حذف شد.');
    await ctx.reply('⌨ ویرایشگر دکمه:', postButtonsEditorKeyboard(postId, buttons));
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

  async function sendPostToChat(ctx: any, post: any) {
    await postService.incrementViews(post.id, undefined, BigInt(ctx.from.id));
    const inlineButtons = buildPostInlineKeyboard((post as any).buttons || [], post.id);
    const parseMode = post.parseMode || 'Markdown';
    const rawText = post.content || post.caption || '';
    const { segments } = parseCopyBlocks(rawText);
    const hasCopyBlocks = segments.some(s => s.type === 'copy');
    const textWithoutCopy = segments.filter(s => s.type === 'text').map(s => s.content).join('').trim();

    if (post.mediaFileId && post.mediaType) {
      const mediaConfig: any = { caption: textWithoutCopy || post.caption, parse_mode: parseMode, link_preview_options: { is_disabled: true }, ...(inlineButtons ? Markup.inlineKeyboard(inlineButtons) : {}) };
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
        caption: i === 0 ? textWithoutCopy : undefined,
        parse_mode: parseMode,
      }));
      await ctx.replyWithMediaGroup(media);
      if (inlineButtons.length > 0) {
        await ctx.reply('عملیات:', Markup.inlineKeyboard(inlineButtons));
      }
    } else if (textWithoutCopy) {
      try {
        await ctx.reply(textWithoutCopy, { parse_mode: parseMode, link_preview_options: { is_disabled: true }, ...(inlineButtons.length > 0 ? Markup.inlineKeyboard(inlineButtons) : {}) });
      } catch {
        await ctx.reply(textWithoutCopy, { link_preview_options: { is_disabled: true }, ...(inlineButtons.length > 0 ? Markup.inlineKeyboard(inlineButtons) : {}) });
      }
    } else {
      await ctx.reply('(پست خالی)', { link_preview_options: { is_disabled: true }, ...(inlineButtons.length > 0 ? Markup.inlineKeyboard(inlineButtons) : {}) });
    }

    if (hasCopyBlocks) {
      for (const segment of segments) {
        if (segment.type === 'copy') {
          await ctx.reply(
            '📋 کپی کد',
            Markup.inlineKeyboard([
              [Markup.button.callback('📋 برای کپی لمس کنید', `post:user:copyblock:${Buffer.from(segment.content).toString('base64')}`)],
            ])
          );
        }
      }
    }

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
        switch (btn.type) {
          case 'URL': return Markup.button.url(btn.text || 'Link', btn.value || '');
          case 'CALLBACK': {
            const clickData = JSON.stringify({ postId, text: btn.text, type: btn.type });
            return Markup.button.callback(btn.text || 'Button', `post:user:click:${clickData}`);
          }
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
