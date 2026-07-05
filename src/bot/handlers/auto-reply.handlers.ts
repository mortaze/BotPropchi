import { Telegraf, Markup } from 'telegraf';
import { PostStatus, PostMessageType } from '@prisma/client';
import { autoReplyService } from '../../services/auto-reply.service';
import { autoReplyState } from '../../services/auto-reply-state.service';
import { autoReplyRepository } from '../../repositories/auto-reply.repository';
import { botAdminService } from '../../services/bot-admin.service';
import { forumTopicService } from '../../services/forum-topic.service';
import { prisma } from '../../prisma/client';
import { logger } from '../../utils/logger';
import { cache } from '../../utils/cache';
import { validateDbInput, sanitizeTelegramText } from '../../utils/unicode';
import { graphemeTruncate } from '../../utils/grapheme';
import { scheduledMessageAutomationKeyboard } from '../keyboards/scheduled-message-keyboards';
import {
  autoReplyMainMenuKeyboard,
  autoReplyListInlineKeyboard,
  autoReplyNewPostManagerReplyKeyboard,
  autoReplyEditorReplyKeyboard,
  autoReplyCancelOnlyKeyboard,
  autoReplyAddMessageKeyboard,
  autoReplyEditMessageReplyKeyboard,
  autoReplySingleMessageInlineKeyboard,
  autoReplyGroupReplyKeyboard,
  autoReplyPublishValidationKeyboard,
  autoReplyDeleteConfirmKeyboard,
  autoReplyDashboardKeyboard,
  autoReplyKeywordManageKeyboard,
  autoReplyKeywordListKeyboard,
  autoReplyKeywordEditKeyboard,
  autoReplyKeywordDeleteKeyboard,
  renderAutoReplyButtonEditor,
  buildArbtnEditTypeKeyboard,
  buildArbtnColorKeyboard,
  buildArbtnMoveKeyboard,
} from '../keyboards/auto-reply-keyboards';

function formatAutoReplyInfo(msg: any): string {
  const status = msg.isPublished ? '🟢 فعال' : '⚪ غیرفعال';
  const msgCount = msg.messages?.length || 0;
  const keywordCount = msg.keywords?.length || 0;
  const sendCount = msg.sendCount || 0;

  return [
    `📝 *${msg.title}*`,
    '',
    `📨 پیام‌ها: ${msgCount}`,
    `🏷 کلمات کلیدی: ${keywordCount}`,
    `📤 وضعیت: ${status}`,
    `👥 گروه: ${msg._groupName || (msg.targetChatId ? String(msg.targetChatId) : '—')}`,
    `📌 تاپیک: ${msg._topicName || (msg.targetTopicId ? `تاپیک ${msg.targetTopicId}` : (msg.targetChatId ? 'همه تاپیک‌ها' : '—'))}`,
    `🔢 دفعات ارسال: ${sendCount}`,
  ].join('\n');
}

function validatePublishReadiness(msg: any): { ready: boolean; missing: { key: string; label: string }[] } {
  const missing: { key: string; label: string }[] = [];
  if ((msg.keywords?.length || 0) === 0) missing.push({ key: 'keywords', label: '🏷 کلمات کلیدی پاسخ' });
  if (!msg.targetChatId) missing.push({ key: 'group', label: '👥 گروه پاسخ' });
  if ((msg.messages?.length || 0) === 0) missing.push({ key: 'messages', label: '➕ افزودن پیام پاسخ' });
  return { ready: missing.length === 0, missing };
}

export function registerAutoReplyHandlers(bot: Telegraf) {

  // ─── Entry: /autoreply command ─────────────────────────
  bot.command('autoreply', async (ctx: any) => {
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    autoReplyState.clearAll(ctx.from.id);
    autoReplyState.setManagementMode(ctx.from.id, true);
    const result = await autoReplyRepository.findAll({ page: 1, limit: 100 });
    await ctx.reply('💬 پاسخ‌های خودکار', autoReplyMainMenuKeyboard(result.items));
  });

  // ─── Entry: 💬 پاسخ‌های خودکار button ──────────────────
  bot.hears('💬 پاسخ‌های خودکار', async (ctx: any) => {
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    autoReplyState.clearAll(ctx.from.id);
    autoReplyState.setManagementMode(ctx.from.id, true);
    const result = await autoReplyRepository.findAll({ page: 1, limit: 100 });
    await ctx.reply('💬 پاسخ‌های خودکار', autoReplyMainMenuKeyboard(result.items));
  });

  // ─── Back to automation menu ───────────────────────────
  bot.hears('🔙 بازگشت به اتوماسیون', async (ctx: any) => {
    if (!ctx.from) return;
    const userId = ctx.from.id;

    const kwMode = autoReplyState.getKeywordMode(userId);
    if (kwMode) {
      autoReplyState.setKeywordMode(userId, '');
      autoReplyState.setKeywordCreating(userId, false);
      autoReplyState.setKeywordEditing(userId, 0);
      const msgId = autoReplyState.getEditMode(userId);
      if (msgId) {
        await showAutoReplyEditor(ctx, msgId);
        return;
      }
    }

    const editMode = autoReplyState.getEditMode(userId);
    if (editMode) {
      autoReplyState.clearAll(userId);
      cache.del(`ar:${userId}:selecting_group`);
      const result = await autoReplyRepository.findAll({ page: 1, limit: 100 });
      await ctx.reply('💬 پاسخ‌های خودکار', autoReplyMainMenuKeyboard(result.items));
      return;
    }

    if (autoReplyState.isManagementMode(userId)) {
      autoReplyState.clearAll(userId);
      cache.del(`ar:${userId}:selecting_group`);
      await ctx.reply('🤖 اتوماسیون', scheduledMessageAutomationKeyboard());
      return;
    }

    autoReplyState.clearAll(userId);
    cache.del(`ar:${userId}:selecting_group`);
    await ctx.reply('🤖 اتوماسیون', scheduledMessageAutomationKeyboard());
  });

  // ─── Create new auto reply ──────────────────────────────
  bot.hears('➕ ایجاد پاسخ جدید', async (ctx: any) => {
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    autoReplyState.clearAll(ctx.from.id);
    autoReplyState.setCreating(ctx.from.id);
    await ctx.reply('📝 عنوان پست را وارد کنید:', autoReplyCancelOnlyKeyboard());
  });

  // ─── List posts ─────────────────────────────────────────
  bot.hears('📋 لیست پاسخ‌ها', async (ctx: any) => {
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    autoReplyState.clearAll(ctx.from.id);
    await sendList(ctx, 1);
  });

  // ─── Cancel creation ────────────────────────────────────
  bot.hears('❌ لغو پاسخ', async (ctx: any, next) => {
    if (!ctx.from) return next();
    const userId = ctx.from.id;
    const creating = autoReplyState.isCreating(userId);
    if (creating) {
      const msgId = autoReplyState.getEditingMessage(userId);
      if (msgId) await autoReplyService.delete(msgId).catch(() => {});
      autoReplyState.clearAll(userId);
      await ctx.reply('❌ ایجاد پست لغو شد.', autoReplyMainMenuKeyboard());
      return;
    }
    if (autoReplyState.isEditingContent(userId)) {
      autoReplyState.setEditingContent(userId, false);
      autoReplyState.setEditingMessage(userId, 0);
      const msgId = autoReplyState.getEditMode(userId);
      if (msgId) await showAutoReplyEditor(ctx, msgId);
      return;
    }
    if (autoReplyState.isEditingTitle(userId)) {
      autoReplyState.setEditingTitle(userId, false);
      autoReplyState.setEditingMessage(userId, 0);
      const msgId = autoReplyState.getEditMode(userId);
      if (msgId) await showAutoReplyEditor(ctx, msgId);
      return;
    }
    return next();
  });

  bot.hears('🔙 بازگشت به لیست پاسخ', async (ctx: any) => {
    autoReplyState.clearAll(ctx.from.id);
    await sendList(ctx, 1);
  });

  // ─── Editor actions (Reply Keyboard) ────────────────────

  bot.hears('➕ افزودن پیام پاسخ', async (ctx: any) => {
    const msgId = autoReplyState.getEditMode(ctx.from.id);
    if (!msgId) return;
    autoReplyState.setEditingMessage(ctx.from.id, -1);
    autoReplyState.setEditingContent(ctx.from.id, true);
    await ctx.reply(
      'پیام جدید را ارسال کنید.\nمی‌توانید متن، عکس، ویدیو، فایل، گیف، پیام فوروارد شده یا هر نوع پیام پشتیبانی‌شده توسط سیستم Post را ارسال کنید.',
      autoReplyAddMessageKeyboard(),
    );
  });

  bot.hears('👥 گروه پاسخ', async (ctx: any) => {
    const msgId = autoReplyState.getEditMode(ctx.from.id);
    if (!msgId) return;
    const groups = await prisma.telegramGroup.findMany({
      where: { status: 'APPROVED', botIsAdmin: true },
      orderBy: { addedAt: 'desc' },
    });
    if (!groups.length) {
      await ctx.reply('گروه تأییدشده‌ای که ربات در آن ادمین باشد وجود ندارد.');
      return;
    }
    const { setScheduleStep } = autoReplyState as any;
    await ctx.reply('👥 گروه مقصد را انتخاب کنید:', autoReplyGroupReplyKeyboard(groups));
    cache.setPermanent(`ar:${ctx.from.id}:selecting_group`, true);
  });

  // ─── Keyword Management ─────────────────────────────────

  bot.hears('🏷 کلمات کلیدی پاسخ', async (ctx: any) => {
    const msgId = autoReplyState.getEditMode(ctx.from.id);
    if (!msgId) return;
    const keywords = await autoReplyService.listKeywords(msgId);
    autoReplyState.setKeywordMode(ctx.from.id, 'list');
    const text = keywords.length > 0
      ? `🏷 کلمات کلیدی این پاسخ خودکار:\nهر زمان یکی از کاربران یکی از این عبارات را در گروه ارسال کند، این پاسخ خودکار برای او ارسال خواهد شد.`
      : '🏷 هیچ کلمه کلیدی ثبت نشده است.\nحداقل یک کلمه کلیدی برای انتشار لازم است.';
    await ctx.reply(text, {
      ...autoReplyKeywordListKeyboard(keywords),
      ...autoReplyKeywordManageKeyboard(),
    });
  });

  bot.hears('➕ ایجاد کلمه جدید پاسخ', async (ctx: any) => {
    const msgId = autoReplyState.getEditMode(ctx.from.id);
    if (!msgId) return;
    autoReplyState.setKeywordCreating(ctx.from.id, true);
    await ctx.reply('کلمه یا عبارت کلیدی جدید را ارسال کنید:', autoReplyCancelOnlyKeyboard());
  });

  bot.hears('✏️ ویرایش کلمات پاسخ', async (ctx: any) => {
    const msgId = autoReplyState.getEditMode(ctx.from.id);
    if (!msgId) return;
    const keywords = await autoReplyService.listKeywords(msgId);
    autoReplyState.setKeywordMode(ctx.from.id, 'edit');
    await ctx.reply('کلمه مورد نظر را برای ویرایش انتخاب کنید:', {
      ...autoReplyKeywordEditKeyboard(keywords),
      ...autoReplyKeywordManageKeyboard(),
    });
  });

  bot.hears('🗑 حذف کلمات پاسخ', async (ctx: any) => {
    const msgId = autoReplyState.getEditMode(ctx.from.id);
    if (!msgId) return;
    const keywords = await autoReplyService.listKeywords(msgId);
    autoReplyState.setKeywordMode(ctx.from.id, 'delete');
    await ctx.reply('کلمه مورد نظر را برای حذف انتخاب کنید:', {
      ...autoReplyKeywordDeleteKeyboard(keywords),
      ...autoReplyKeywordManageKeyboard(),
    });
  });

  // ─── Publish ────────────────────────────────────────────

  bot.hears('✅ انتشار پاسخ', async (ctx: any) => {
    const msgId = autoReplyState.getEditMode(ctx.from.id);
    if (!msgId) {
      await ctx.reply('❌ پستی انتخاب نشده است.');
      return;
    }
    const msg = await autoReplyRepository.findById(msgId);
    if (!msg) return;

    const { ready, missing } = validatePublishReadiness(msg);
    if (!ready) {
      const missingList = missing.map((m) => `❌ ${m.label.replace(/^[^\s]+ /, '')}`).join('\n');
      await ctx.reply(
        `این پست هنوز آماده انتشار نیست.\nبخش‌های تکمیل‌نشده:\n${missingList}`,
        autoReplyPublishValidationKeyboard(missing),
      );
      return;
    }

    try {
      await autoReplyService.publish(msgId);
      await ctx.reply('✅ پاسخ خودکار منتشر شد!');
      await showAutoReplyEditor(ctx, msgId);
    } catch (err: any) {
      await ctx.reply(`❌ خطا در انتشار: ${err.message}`);
    }
  });

  // ─── Delete ─────────────────────────────────────────────

  bot.hears('🗑 حذف پاسخ', async (ctx: any) => {
    const msgId = autoReplyState.getEditMode(ctx.from.id);
    if (!msgId) return;
    const msg = await autoReplyRepository.findById(msgId);
    await ctx.reply(
      `⚠️ آیا از حذف "${msg?.title}" مطمئن هستید؟\n\nاین عملیات غیرقابل بازگشت است.`,
      autoReplyDeleteConfirmKeyboard(msgId),
    );
  });

  // ─── Text input handler ─────────────────────────────────
  bot.on('text', async (ctx: any, next) => {
    if (!ctx.from || ctx.chat?.type !== 'private') return next();
    const text = ctx.message.text;
    const userId = ctx.from.id;

    const admin = await botAdminService.getActive(userId);
    if (!admin) return next();

    const isCreating = autoReplyState.isCreating(userId);
    const isEditingTitle = autoReplyState.isEditingTitle(userId);
    const isEditingContent = autoReplyState.isEditingContent(userId);

    if (autoReplyState.isButtonMoveActive(userId)) {
      return next();
    }

    // ─── Post title click from main menu ──
    if (autoReplyState.isManagementMode(userId) && !isCreating && !isEditingTitle && !isEditingContent) {
      const listResult = await autoReplyRepository.findAll({ page: 1, limit: 100 });
      const matchedPost = listResult.items.find((p: any) => {
        const label = graphemeTruncate(sanitizeTelegramText(p.title || 'بدون عنوان'), 30);
        return label === text;
      });
      if (matchedPost) {
        autoReplyState.setEditMode(userId, matchedPost.id);
        autoReplyState.setManagementMode(userId, true);
        await showAutoReplyEditor(ctx, matchedPost.id);
        return;
      }
    }

    // ─── Keyword creation input ──
    if (autoReplyState.isKeywordCreating(userId)) {
      const msgId = autoReplyState.getEditMode(userId);
      if (!msgId) return next();
      try {
        await autoReplyService.addKeyword(msgId, text);
        autoReplyState.setKeywordCreating(userId, false);
        const keywords = await autoReplyService.listKeywords(msgId);
        await ctx.reply(`✅ کلمه "${text}" اضافه شد.`, {
          ...autoReplyKeywordListKeyboard(keywords),
          ...autoReplyKeywordManageKeyboard(),
        });
      } catch (err: any) {
        await ctx.reply(`❌ خطا: ${err.message}`);
      }
      return;
    }

    // ─── Keyword edit input ──
    const kwEditing = autoReplyState.getKeywordEditing(userId);
    if (kwEditing) {
      const msgId = autoReplyState.getEditMode(userId);
      if (!msgId) return next();
      try {
        await autoReplyService.updateKeyword(kwEditing, text);
        autoReplyState.setKeywordEditing(userId, 0);
        autoReplyState.setKeywordMode(userId, 'list');
        const keywords = await autoReplyService.listKeywords(msgId);
        await ctx.reply(`✅ کلمه بروزرسانی شد.`, {
          ...autoReplyKeywordListKeyboard(keywords),
          ...autoReplyKeywordManageKeyboard(),
        });
      } catch (err: any) {
        await ctx.reply(`❌ خطا: ${err.message}`);
      }
      return;
    }

    // ─── Group selection input ──
    if (cache.get<boolean>(`ar:${userId}:selecting_group`)) {
      const msgId = autoReplyState.getEditMode(userId);
      if (!msgId) return next();
      const groups = await prisma.telegramGroup.findMany({
        where: { status: 'APPROVED', botIsAdmin: true },
        orderBy: { addedAt: 'desc' },
      });
      const matchedGroup = groups.find((g: any) => g.title === text);
      if (matchedGroup) {
        await autoReplyRepository.update(msgId, { targetChatId: matchedGroup.chatId });
        cache.del(`ar:${userId}:selecting_group`);
        await ctx.reply(`✅ گروه "${matchedGroup.title}" انتخاب شد.`);
        await showAutoReplyEditor(ctx, msgId);
      } else {
        await ctx.reply('❌ گروه یافت نشد. لطفاً از لیست انتخاب کنید.');
      }
      return;
    }

    if (!isCreating && !isEditingTitle && !isEditingContent) {
      return next();
    }

    const btnState = autoReplyState.getButtonState(userId);
    if (btnState === 'wait_text') {
      return next();
    }

    if (isCreating) {
      const title = validateDbInput(text, 'title');
      const msg = await autoReplyService.create({ title, createdBy: BigInt(userId) });
      cache.del(`ar:${userId}:creating`);
      autoReplyState.setEditingMessage(userId, msg.id);
      autoReplyState.setEditMode(userId, msg.id);
      autoReplyState.setManagementMode(userId, true);
      await ctx.reply(
        `✅ پست ساخته شد!\n\nعنوان: ${title}\nشناسه: ${msg.id}`,
        autoReplyNewPostManagerReplyKeyboard(),
      );
      return;
    }

    if (isEditingTitle) {
      const msgId = autoReplyState.getEditingMessage(userId);
      if (msgId) {
        const title = validateDbInput(text, 'title');
        await autoReplyService.update(msgId, { title });
        autoReplyState.setEditingTitle(userId, false);
        autoReplyState.setEditingMessage(userId, 0);
        await ctx.reply(`✅ عنوان بروزرسانی شد.`);
        await showAutoReplyEditor(ctx, msgId);
      }
      return;
    }

    if (isEditingContent) {
      const editingMsgId = autoReplyState.getEditingMessage(userId);
      if (editingMsgId && editingMsgId === -1) {
        const autoReplyId = autoReplyState.getEditMode(userId);
        if (!autoReplyId) return next();
        const newMsg = await autoReplyService.addMessage(autoReplyId);
        await autoReplyService.updateMessage(newMsg.id, { text });
        autoReplyState.setEditingMessage(userId, newMsg.id);
        await ctx.reply(`✅ پیام ذخیره شد.`);
        await showAutoReplyEditor(ctx, autoReplyId);
      } else if (editingMsgId) {
        await autoReplyService.updateMessage(editingMsgId, { text });
        autoReplyState.setEditingContent(userId, false);
        autoReplyState.setEditingMessage(userId, 0);
        await ctx.reply(`✅ محتوا بروزرسانی شد.`);
        const msgId = autoReplyState.getEditMode(userId);
        if (msgId) await showAutoReplyEditor(ctx, msgId);
      }
      return;
    }

    return next();
  });

  // ─── Inline callback handlers ───────────────────────────

  bot.action(/^ar:view:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const msgId = parseInt(ctx.match[1]);
    await showAutoReplyEditor(ctx, msgId);
  });

  bot.action(/^ar:list:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const page = parseInt(ctx.match[1]);
    await sendList(ctx, page);
  });

  bot.action('ar:menu', async (ctx: any) => {
    await ctx.answerCbQuery();
    autoReplyState.clearAll(ctx.from.id);
    const result = await autoReplyRepository.findAll({ page: 1, limit: 100 });
    await ctx.editMessageText('💬 پاسخ‌های خودکار', autoReplyMainMenuKeyboard(result.items));
  });

  bot.action(/^ar:group:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const chatId = BigInt(ctx.match[1]);
    const msgId = autoReplyState.getEditMode(ctx.from.id);
    if (!msgId) return;
    await autoReplyRepository.update(msgId, { targetChatId: chatId });
    cache.del(`ar:${ctx.from.id}:selecting_group`);
    await ctx.reply('✅ گروه انتخاب شد.');
    await showAutoReplyEditor(ctx, msgId);
  });

  bot.action(/^ar:publish:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const msgId = parseInt(ctx.match[1]);
    try {
      await autoReplyService.publish(msgId);
      await ctx.reply('✅ منتشر شد!');
      await showAutoReplyEditor(ctx, msgId);
    } catch (err: any) {
      await ctx.reply(`❌ ${err.message}`);
    }
  });

  bot.action(/^ar:unpublish:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const msgId = parseInt(ctx.match[1]);
    await autoReplyService.unpublish(msgId);
    await ctx.reply('✅ غیرفعال شد.');
    await showAutoReplyEditor(ctx, msgId);
  });

  bot.action(/^ar:delete:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const msgId = parseInt(ctx.match[1]);
    const msg = await autoReplyRepository.findById(msgId);
    await ctx.reply(
      `⚠️ آیا از حذف "${msg?.title}" مطمئن هستید؟`,
      autoReplyDeleteConfirmKeyboard(msgId),
    );
  });

  bot.action(/^ar:delete:confirm:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const msgId = parseInt(ctx.match[1]);
    await autoReplyService.delete(msgId);
    autoReplyState.clearAll(ctx.from.id);
    await ctx.reply('✅ حذف شد.');
    const result = await autoReplyRepository.findAll({ page: 1, limit: 100 });
    await ctx.reply('💬 پاسخ‌های خودکار', autoReplyMainMenuKeyboard(result.items));
  });

  // ─── Keyword inline callbacks ───────────────────────────

  bot.action(/^ar:kw:edit:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const keywordId = parseInt(ctx.match[1]);
    autoReplyState.setKeywordEditing(ctx.from.id, keywordId);
    await ctx.reply('کلمه یا عبارت جدید را ارسال کنید:', autoReplyCancelOnlyKeyboard());
  });

  bot.action(/^ar:kw:delete:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const keywordId = parseInt(ctx.match[1]);
    const msgId = autoReplyState.getEditMode(ctx.from.id);
    if (!msgId) return;
    try {
      await autoReplyService.deleteKeyword(keywordId);
      const keywords = await autoReplyService.listKeywords(msgId);
      autoReplyState.setKeywordMode(ctx.from.id, 'list');
      await ctx.reply('✅ کلمه حذف شد.', {
        ...autoReplyKeywordListKeyboard(keywords),
        ...autoReplyKeywordManageKeyboard(),
      });
    } catch (err: any) {
      await ctx.reply(`❌ خطا: ${err.message}`);
    }
  });

  // ─── Message inline callbacks ───────────────────────────

  bot.action(/^ar:msg:edit:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const msgId = parseInt(ctx.match[1]);
    autoReplyState.setEditingMessage(ctx.from.id, msgId);
    autoReplyState.setEditingContent(ctx.from.id, true);
    const msg = await prisma.autoReplyMessage.findUnique({ where: { id: msgId } });
    await ctx.reply(
      `📝 محتوای پیام را ویرایش کنید:\n\nمحتوای فعلی:\n${msg?.text || '(خالی)'}`,
      autoReplyCancelOnlyKeyboard(),
    );
  });

  bot.action(/^ar:msg:delete:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const msgId = parseInt(ctx.match[1]);
    const msg = await prisma.autoReplyMessage.findUnique({ where: { id: msgId } });
    if (msg) {
      await autoReplyService.deleteMessage(msgId);
      await ctx.reply('🗑 پیام حذف شد.');
      if (msg.autoReplyId) await showAutoReplyEditor(ctx, msg.autoReplyId);
    }
  });

  bot.action(/^ar:msg:up:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const autoReplyId = parseInt(ctx.match[1]);
    const msgId = parseInt(ctx.match[2]);
    const msgs = await autoReplyService.listMessages(autoReplyId);
    const idx = msgs.findIndex((m: any) => m.id === msgId);
    if (idx > 0) {
      const ids = msgs.map((m: any) => m.id);
      [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
      await autoReplyService.reorderMessages(autoReplyId, ids);
    }
    await showAutoReplyEditor(ctx, autoReplyId);
  });

  bot.action(/^ar:msg:down:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const autoReplyId = parseInt(ctx.match[1]);
    const msgId = parseInt(ctx.match[2]);
    const msgs = await autoReplyService.listMessages(autoReplyId);
    const idx = msgs.findIndex((m: any) => m.id === msgId);
    if (idx < msgs.length - 1) {
      const ids = msgs.map((m: any) => m.id);
      [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
      await autoReplyService.reorderMessages(autoReplyId, ids);
    }
    await showAutoReplyEditor(ctx, autoReplyId);
  });

  bot.action(/^ar:msg:add:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const autoReplyId = parseInt(ctx.match[1]);
    autoReplyState.setEditingMessage(ctx.from.id, -1);
    autoReplyState.setEditingContent(ctx.from.id, true);
    await ctx.reply('پیام جدید را ارسال کنید:', autoReplyAddMessageKeyboard());
  });

  bot.action(/^ar:msg:btnedit:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const msgId = parseInt(ctx.match[1]);
    autoReplyState.setEditingMessage(userId, msgId);
    const buttons = await autoReplyRepository.findButtonsByMessage(msgId);
    const grid = buttonsToGrid(buttons);
    const { text, reply_markup } = renderAutoReplyButtonEditor(msgId, grid, 'create');
    const sent = await ctx.reply(text, { reply_markup });
    if (sent) autoReplyState.setButtonEditorMsgId(userId, sent.message_id);
    autoReplyState.setButtonMode(userId, 'create');
  });

  bot.action(/^ar:goto:(\w+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const key = ctx.match[1];
    const msgId = autoReplyState.getEditMode(ctx.from.id);
    if (!msgId) return;
    if (key === 'keywords') {
      const keywords = await autoReplyService.listKeywords(msgId);
      autoReplyState.setKeywordMode(ctx.from.id, 'list');
      await ctx.reply('🏷 کلمات کلیدی:', {
        ...autoReplyKeywordListKeyboard(keywords),
        ...autoReplyKeywordManageKeyboard(),
      });
    } else if (key === 'group') {
      const groups = await prisma.telegramGroup.findMany({
        where: { status: 'APPROVED', botIsAdmin: true },
        orderBy: { addedAt: 'desc' },
      });
      await ctx.reply('👥 گروه مقصد:', autoReplyGroupReplyKeyboard(groups));
      cache.setPermanent(`ar:${ctx.from.id}:selecting_group`, true);
    } else if (key === 'messages') {
      autoReplyState.setEditingMessage(ctx.from.id, -1);
      autoReplyState.setEditingContent(ctx.from.id, true);
      await ctx.reply('پیام جدید را ارسال کنید:', autoReplyAddMessageKeyboard());
    }
  });

  // ─── Dashboard callbacks ────────────────────────────────

  bot.action('ar:dashboard:refresh', async (ctx: any) => {
    await ctx.answerCbQuery();
    const stats = await autoReplyService.getStats();
    const text = [
      '📊 گزارش پاسخ‌های خودکار',
      '',
      `🟢 پاسخ‌های فعال: ${stats.activeReplies}`,
      `📤 ارسال امروز: ${stats.todaySends}`,
      `📤 ارسال هفته: ${stats.weekSends}`,
      `👥 گروه‌های فعال: ${stats.activeGroups}`,
      `❌ خطاها: ${stats.errorCount}`,
    ].join('\n');
    await ctx.editMessageText(text, autoReplyDashboardKeyboard());
  });

  // ─── Button editor callbacks ────────────────────────────

  bot.action(/^arbtn:click:(\d+):(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const msgId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    const col = parseInt(ctx.match[3]);

    const mode = autoReplyState.getButtonMode(userId) || 'create';
    if (mode === 'move') {
      autoReplyState.setButtonMoveSelected(userId, row, col);
      const buttons = await autoReplyRepository.findButtonsByMessage(msgId);
      const grid = buttonsToGrid(buttons);
      const selected = grid[row]?.[col];
      if (selected) {
        await ctx.reply(`🔀 "${selected.text}" را به کجا منتقل کنید؟`, buildArbtnMoveKeyboard());
      }
      return;
    }

    autoReplyState.setButtonEditorRow(userId, row);
    autoReplyState.setButtonEditorCol(userId, col);
    const buttons = await autoReplyRepository.findButtonsByMessage(msgId);
    const grid = buttonsToGrid(buttons);
    const existing = grid[row]?.[col];

    if (mode === 'delete' && existing) {
      await autoReplyService.deleteButton(existing.id);
      const refreshed = await autoReplyRepository.findButtonsByMessage(msgId);
      await refreshButtonEditor(ctx, msgId, buttonsToGrid(refreshed));
      return;
    }

    if (mode === 'edit' && existing) {
      const kb = buildArbtnEditTypeKeyboard(msgId, row, col, existing.style);
      await ctx.reply('نوع دکمه را انتخاب کنید:', kb);
      autoReplyState.setButtonState(userId, 'wait_type');
      return;
    }

    if (mode === 'create' && !existing) {
      autoReplyState.setButtonState(userId, 'wait_text');
      await ctx.reply('📝 متن دکمه را وارد کنید:', autoReplyCancelOnlyKeyboard());
      return;
    }
  });

  bot.action(/^arbtn:mode:(create|edit|delete|move):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const mode = ctx.match[1];
    const msgId = parseInt(ctx.match[2]);
    autoReplyState.setButtonMode(userId, mode);

    if (mode === 'move') {
      autoReplyState.setButtonMoveActive(userId, true);
      const buttons = await autoReplyRepository.findButtonsByMessage(msgId);
      const grid = buttonsToGrid(buttons);
      const { text, reply_markup } = renderAutoReplyButtonEditor(msgId, grid, 'move');
      try { await ctx.editMessageText(text, { reply_markup }); } catch {}
      await ctx.reply('🔀 دکمه مورد نظر را انتخاب کنید:', buildArbtnMoveKeyboard());
    } else {
      autoReplyState.setButtonMoveActive(userId, false);
      const buttons = await autoReplyRepository.findButtonsByMessage(msgId);
      const grid = buttonsToGrid(buttons);
      const { text, reply_markup } = renderAutoReplyButtonEditor(msgId, grid, mode as any);
      try { await ctx.editMessageText(text, { reply_markup }); } catch {}
    }
  });

  bot.action(/^arbtn:type:(url|popup|command):(\d+):(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const type = ctx.match[1].toUpperCase();
    const msgId = parseInt(ctx.match[2]);
    const row = parseInt(ctx.match[3]);
    const col = parseInt(ctx.match[4]);
    const buttons = await autoReplyRepository.findButtonsByMessage(msgId);
    const grid = buttonsToGrid(buttons);
    const existing = grid[row]?.[col];

    if (existing) {
      await autoReplyService.updateButton(existing.id, { type });
    } else {
      const newBtn = await autoReplyService.addButton(msgId, { text: '', type, row, col });
    }

    autoReplyState.setButtonState(userId, 'wait_value');
    await ctx.reply('📝 مقدار دکمه را وارد کنید (لینک یا متن):', autoReplyCancelOnlyKeyboard());
  });

  bot.action(/^arbtn:type:cancel:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    autoReplyState.setButtonState(userId, '');
    const msgId = parseInt(ctx.match[1]);
    const buttons = await autoReplyRepository.findButtonsByMessage(msgId);
    await refreshButtonEditor(ctx, msgId, buttonsToGrid(buttons));
  });

  bot.action(/^arbtn:color:(\d+):(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const msgId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    const col = parseInt(ctx.match[3]);
    const kb = buildArbtnColorKeyboard(msgId, row, col);
    await ctx.reply('رنگ دکمه را انتخاب کنید:', kb);
  });

  bot.action(/^arbtn:color:set:(\d+):(\d+):(\d+):(\w+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const msgId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    const col = parseInt(ctx.match[3]);
    const color = ctx.match[4];
    const buttons = await autoReplyRepository.findButtonsByMessage(msgId);
    const grid = buttonsToGrid(buttons);
    const existing = grid[row]?.[col];
    if (existing) {
      await autoReplyService.updateButton(existing.id, { style: color === 'default' ? undefined : color });
    }
    const refreshed = await autoReplyRepository.findButtonsByMessage(msgId);
    await refreshButtonEditor(ctx, msgId, buttonsToGrid(refreshed));
  });

  // ─── Move direction handlers ────────────────────────────

  bot.hears('⬆️ بالا پاسخ', async (ctx: any) => {
    if (!autoReplyState.isButtonMoveActive(ctx.from.id)) return;
    await handleARMoveDirection(ctx, 'up');
  });

  bot.hears('⬇️ پایین پاسخ', async (ctx: any) => {
    if (!autoReplyState.isButtonMoveActive(ctx.from.id)) return;
    await handleARMoveDirection(ctx, 'down');
  });

  bot.hears('⬅️ چپ پاسخ', async (ctx: any) => {
    if (!autoReplyState.isButtonMoveActive(ctx.from.id)) return;
    await handleARMoveDirection(ctx, 'left');
  });

  bot.hears('➡️ راست پاسخ', async (ctx: any) => {
    if (!autoReplyState.isButtonMoveActive(ctx.from.id)) return;
    await handleARMoveDirection(ctx, 'right');
  });

  bot.hears('✅ تایید جابه‌جایی پاسخ', async (ctx: any) => {
    const userId = ctx.from.id;
    if (!autoReplyState.isButtonMoveActive(userId)) return;
    const msgId = autoReplyState.getEditingMessage(userId);
    if (!msgId) return;

    autoReplyState.setButtonMoveActive(userId, false);
    autoReplyState.setButtonMode(userId, 'create');

    try { await ctx.reply('⌨️', { reply_markup: { remove_keyboard: true } }); } catch {}
    await ctx.reply('✅ جابه‌جایی ذخیره شد.');
    const msg = await autoReplyRepository.findById(msgId);
    await ctx.reply(formatAutoReplyInfo(msg), {
      parse_mode: 'Markdown',
      link_preview_options: { is_disabled: true },
      ...autoReplyEditMessageReplyKeyboard(),
    });
    const buttons = await autoReplyRepository.findButtonsByMessage(msgId);
    await refreshButtonEditor(ctx, msgId, buttonsToGrid(buttons));
  });

  bot.hears('↩️ پایان جابه‌جایی', async (ctx: any) => {
    const userId = ctx.from.id;
    if (!autoReplyState.isButtonMoveActive(userId)) return;
    const msgId = autoReplyState.getEditingMessage(userId);

    autoReplyState.setButtonMoveActive(userId, false);
    autoReplyState.setButtonMode(userId, 'create');

    try { await ctx.reply('⌨️', { reply_markup: { remove_keyboard: true } }); } catch {}
    await ctx.reply('↩️ بازگشت از حالت جابه‌جایی.');
    if (msgId) {
      const msg = await autoReplyRepository.findById(msgId);
      await ctx.reply(formatAutoReplyInfo(msg), {
        parse_mode: 'Markdown',
        link_preview_options: { is_disabled: true },
        ...autoReplyEditMessageReplyKeyboard(),
      });
      const buttons = await autoReplyRepository.findButtonsByMessage(msgId);
      await refreshButtonEditor(ctx, msgId, buttonsToGrid(buttons));
    }
  });

  bot.hears('❌ لغو جابجایی پاسخ', async (ctx: any) => {
    const userId = ctx.from.id;
    if (!autoReplyState.isButtonMoveActive(userId)) return;
    const msgId = autoReplyState.getEditingMessage(userId);

    autoReplyState.setButtonMoveActive(userId, false);
    autoReplyState.setButtonMode(userId, 'create');

    try { await ctx.reply('⌨️', { reply_markup: { remove_keyboard: true } }); } catch {}
    await ctx.reply('❌ جابه‌جایی لغو شد.');
    if (msgId) {
      const msg = await autoReplyRepository.findById(msgId);
      await ctx.reply(formatAutoReplyInfo(msg), {
        parse_mode: 'Markdown',
        link_preview_options: { is_disabled: true },
        ...autoReplyEditMessageReplyKeyboard(),
      });
      const buttons = await autoReplyRepository.findButtonsByMessage(msgId);
      await refreshButtonEditor(ctx, msgId, buttonsToGrid(buttons));
    }
  });

  // ─── Move direction helpers ──
  function buildDynamicMoveKeyboard(grid: any[][], row: number, col: number) {
    const rows: string[][] = [];
    const directionRow: string[] = [];
    if (row > 0 || (grid[row] && grid[row].length > 1)) directionRow.push('⬆️ بالا پاسخ');
    if (row < grid.length - 1 || (grid[row] && grid[row].length > 1)) directionRow.push('⬇️ پایین پاسخ');
    if (directionRow.length > 0) rows.push(directionRow);

    const horizRow: string[] = [];
    if (col > 0) horizRow.push('⬅️ چپ پاسخ');
    if (grid[row] && col < grid[row].length - 1) horizRow.push('➡️ راست پاسخ');
    if (horizRow.length > 0) rows.push(horizRow);

    rows.push(['✅ تایید جابه‌جایی پاسخ', '❌ لغو جابجایی پاسخ']);
    return Markup.keyboard(rows).resize().persistent();
  }

  async function handleARMoveDirection(ctx: any, direction: string) {
    const userId = ctx.from.id;
    const msgId = autoReplyState.getEditingMessage(userId);
    if (!msgId) return;

    const sel = autoReplyState.getButtonMoveSelected(userId);
    if (sel.row === undefined || sel.col === undefined) return;

    const buttons = await autoReplyRepository.findButtonsByMessage(msgId);
    const grid = buttonsToGrid(buttons);

    let newRow = sel.row;
    let newCol = sel.col;

    switch (direction) {
      case 'up': newRow = Math.max(0, sel.row - 1); break;
      case 'down': newRow = Math.min(grid.length - 1, sel.row + 1); break;
      case 'left': newCol = Math.max(0, sel.col - 1); break;
      case 'right': newCol = Math.min((grid[sel.row]?.length || 1) - 1, sel.col + 1); break;
    }

    if (grid[newRow]?.[newCol]) {
      const other = grid[newRow][newCol];
      const current = grid[sel.row]?.[sel.col];
      if (current && other) {
        await autoReplyService.updateButton(current.id, { row: newRow, col: newCol });
        await autoReplyService.updateButton(other.id, { row: sel.row, col: sel.col });
      }
    } else if (grid[sel.row]?.[sel.col]) {
      const current = grid[sel.row][sel.col];
      await autoReplyService.updateButton(current.id, { row: newRow, col: newCol });
    }

    autoReplyState.setButtonMoveSelected(userId, newRow, newCol);

    const refreshed = await autoReplyRepository.findButtonsByMessage(msgId);
    const newGrid = buttonsToGrid(refreshed);
    const btn = newGrid[newRow]?.[newCol];
    const moveKb = buildDynamicMoveKeyboard(newGrid, newRow, newCol);
    await ctx.reply(`🔀 "${btn?.text || ''}" — جهت را انتخاب کنید:`, moveKb);
  }

  async function refreshButtonEditor(ctx: any, msgId: number, grid: any[][]) {
    const userId = ctx.from.id;
    const editorMsgId = autoReplyState.getButtonEditorMsgId(userId);
    if (!editorMsgId) return;
    const mode = autoReplyState.getButtonMode(userId) || 'create';
    const moveActive = autoReplyState.isButtonMoveActive(userId);
    const moveSel = moveActive ? autoReplyState.getButtonMoveSelected(userId) : undefined;
    const selectedPos = moveSel?.row !== undefined && moveSel?.col !== undefined
      ? { row: moveSel.row, col: moveSel.col }
      : undefined;
    const { text, reply_markup } = renderAutoReplyButtonEditor(msgId, grid, moveActive ? 'move' : mode as any, selectedPos);
    try {
      await ctx.telegram.editMessageText(ctx.chat.id, editorMsgId, null, text, { reply_markup });
    } catch {}
  }

  async function showAutoReplyEditor(ctx: any, id: number) {
    const msg = await autoReplyRepository.findById(id);
    if (!msg) {
      await ctx.reply('❌ پست یافت نشد.');
      return;
    }

    autoReplyState.setEditMode(ctx.from.id, id);
    autoReplyState.setManagementMode(ctx.from.id, true);

    let groupName = '';
    if (msg.targetChatId) {
      const group = await prisma.telegramGroup.findUnique({ where: { chatId: msg.targetChatId } });
      groupName = group?.title || String(msg.targetChatId);
    }
    (msg as any)._groupName = groupName || '—';

    let topicName = '';
    if (msg.targetTopicId && msg.targetChatId) {
      const topic = await prisma.forumTopic.findUnique({
        where: { chatId_topicId: { chatId: msg.targetChatId, topicId: Number(msg.targetTopicId) } },
      });
      topicName = topic?.name || `Topic ${msg.targetTopicId}`;
    }
    (msg as any)._topicName = msg.targetTopicId ? topicName : (msg.targetChatId ? 'همه تاپیک‌ها' : '—');

    const text = formatAutoReplyInfo(msg);
    const messages = msg.messages || [];

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i] as any;
      const label = `📨 پیام ${i + 1} از ${messages.length}`;
      const keyboard = autoReplySingleMessageInlineKeyboard(id, message, i, messages.length);

      if (message.mediaFileId && message.type !== 'text') {
        const captionExtra: any = { reply_markup: keyboard.reply_markup };
        if (message.captionEntities?.length > 0) captionExtra.caption_entities = message.captionEntities;
        captionExtra.caption = `${label}\n\n${message.text || ''}`;

        try {
          switch (message.type) {
            case 'photo': await ctx.replyWithPhoto(message.mediaFileId, captionExtra); break;
            case 'video': await ctx.replyWithVideo(message.mediaFileId, captionExtra); break;
            case 'document': await ctx.replyWithDocument(message.mediaFileId, captionExtra); break;
            case 'voice': await ctx.replyWithVoice(message.mediaFileId, captionExtra); break;
            case 'audio': await ctx.replyWithAudio(message.mediaFileId, captionExtra); break;
            case 'animation': await ctx.replyWithAnimation(message.mediaFileId, captionExtra); break;
            case 'sticker': await ctx.replyWithSticker(message.mediaFileId, { reply_markup: keyboard.reply_markup }); break;
            case 'video_note': await ctx.replyWithVideoNote(message.mediaFileId, { reply_markup: keyboard.reply_markup }); break;
            default: await ctx.reply(`${label}\n\n${graphemeTruncate(message.text || '(رسانه)', 500)}`, { reply_markup: keyboard.reply_markup });
          }
        } catch (err: any) {
          await ctx.reply(`${label}\n\n${graphemeTruncate(message.text || '(رسانه)', 500)}`, { reply_markup: keyboard.reply_markup });
        }
      } else if (message.type === 'forward' && message.forwardSource) {
        const fs = message.forwardSource;
        const srcChatId = Number(fs.chatId || fs.originChatId);
        const srcMsgId = Number(fs.messageId || fs.originMessageId);
        if (srcChatId && srcMsgId) {
          try {
            await ctx.telegram.forwardMessage(ctx.chat.id, srcChatId, srcMsgId);
            await ctx.reply(label, { reply_markup: keyboard.reply_markup });
            continue;
          } catch {}
        }
        await ctx.reply(`${label}\n\n📨 پیام فوروارد`, { reply_markup: keyboard.reply_markup });
      } else {
        await ctx.reply(`${label}\n\n${graphemeTruncate(message.text || '(پیام خالی)', 500)}`, { reply_markup: keyboard.reply_markup });
      }
    }

    await ctx.reply(text, {
      parse_mode: 'Markdown',
      link_preview_options: { is_disabled: true },
      ...autoReplyEditorReplyKeyboard(msg.isPublished),
    });
  }

  async function sendList(ctx: any, _page?: number) {
    const result = await autoReplyRepository.findAll({ page: 1, limit: 100 });
    autoReplyState.setManagementMode(ctx.from.id, true);
    await ctx.reply('💬 پاسخ‌های خودکار', autoReplyMainMenuKeyboard(result.items));
  }
}

function buttonsToGrid(buttons: any[]): any[][] {
  const grid: any[][] = [];
  for (const btn of buttons) {
    if (!grid[btn.row]) grid[btn.row] = [];
    grid[btn.row][btn.col] = btn;
  }
  return grid;
}
