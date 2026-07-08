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
import { extractForwardMeta } from '../../utils/forward';
import {
  autoReplyMainMenuKeyboard,
  autoReplyListInlineKeyboard,
  autoReplyNewPostManagerReplyKeyboard,
  autoReplyEditorReplyKeyboard,
  autoReplyCancelOnlyKeyboard,
  autoReplyAddMessageKeyboard,
  autoReplyEditMessageReplyKeyboard,
  autoReplySingleMessageInlineKeyboard,
  autoReplyPublishValidationKeyboard,
  autoReplyDeleteConfirmKeyboard,
  autoReplyDashboardKeyboard,
  renderKeywordPage,
  autoReplyKeywordCancelKeyboard,
  renderAutoReplyButtonEditor,
  buildArbtnEditTypeKeyboard,
  buildArbtnColorKeyboard,
  buildArbtnMoveKeyboard,
  buildArbtnEditReplyKeyboard,
  buildArbtnEditWaitingKeyboard,
  buildArbtnColorReplyKeyboard,
  buildDestinationGroupKeyboard,
  buildDestinationTopicKeyboard,
  buildTopicStatusInlineKeyboard,
  buildNonForumConfirmKeyboard,
} from '../keyboards/auto-reply-keyboards';

function formatAutoReplyInfo(msg: any, bindingSummaryLines?: string[], statusText?: string): string {
  const status = msg.isPublished ? '🟢 فعال' : '⚪ غیرفعال';
  const msgCount = msg.messages?.length || 0;
  const keywordCount = msg.keywords?.length || 0;
  const sendCount = msg.sendCount || 0;
  const bindingDisplay = (bindingSummaryLines || []).length > 0
    ? bindingSummaryLines!.join('\n')
    : (msg._bindingLines || []).join('\n');
  const statusLine = statusText || status;

  return [
    `📝 *${msg.title}*`,
    '',
    `📨 پیام‌ها: ${msgCount}`,
    `🏷 کلمات کلیدی: ${keywordCount}`,
    `📤 وضعیت: ${status}`,
    `👥 گروه‌ها:\n${bindingDisplay}`,
    `🔢 دفعات ارسال: ${sendCount}`,
    '',
    `${statusLine}`,
  ].join('\n');
}

function validatePublishReadiness(msg: any, bindings?: any[]): { ready: boolean; missing: { key: string; label: string }[] } {
  const missing: { key: string; label: string }[] = [];
  if ((msg.keywords?.length || 0) === 0) missing.push({ key: 'keywords', label: '🏷 کلمه کلیدی' });
  if (!bindings || bindings.length === 0) missing.push({ key: 'group', label: '👥 انتخاب گروه' });
  if ((msg.messages?.length || 0) === 0) missing.push({ key: 'messages', label: '➕ افزودن پیام' });
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
      autoReplyState.setManagementMode(userId, true);
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

  bot.hears('🔙 بازگشت', async (ctx: any) => {
    const userId = ctx.from.id;
    cache.del(`ar:${userId}:selecting_group`);

    const bindingScene = autoReplyState.getBindingScene(userId);
    if (bindingScene) {
      autoReplyState.clearBindingScene(userId);
    }

    // If in per-message editing mode, go back to editor
    const editingMsgId = autoReplyState.getEditingMessage(userId);
    if (editingMsgId && editingMsgId > 0) {
      autoReplyState.setEditingContent(userId, false);
      autoReplyState.setEditingTitle(userId, false);
      autoReplyState.setEditingMessage(userId, 0);
    }

    const editMode = autoReplyState.getEditMode(userId);
    if (editMode) {
      autoReplyState.setKeywordMode(userId, '');
      autoReplyState.setKeywordCreating(userId, false);
      autoReplyState.setKeywordEditing(userId, 0);
      await showAutoReplyEditor(ctx, editMode);
      return;
    }
    autoReplyState.clearAll(userId);
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

  // ─── Cancel handler (matches scheduled-messages pattern) ──
  bot.hears('❌ لغو', async (ctx: any, next) => {
    if (!ctx.from) return next();
    const userId = ctx.from.id;

    const bindingScene = autoReplyState.getBindingScene(userId);
    if (bindingScene) {
      autoReplyState.clearBindingScene(userId);
      const msgId = autoReplyState.getEditMode(userId);
      if (msgId) await showAutoReplyEditor(ctx, msgId);
      else await ctx.reply('❌ انتخاب گروه لغو شد.');
      return;
    }

    // Button editor state machine - skip if in button editor
    if (autoReplyState.getButtonEditWaiting(userId)) {
      return next();
    }

    if (autoReplyState.isCreating(userId)) {
      const msgId = autoReplyState.getEditingMessage(userId);
      if (msgId) await autoReplyService.delete(msgId).catch(() => {});
      autoReplyState.clearAll(userId);
      await ctx.reply('❌ ایجاد پست لغو شد.', autoReplyMainMenuKeyboard());
      return;
    }

    if (autoReplyState.isKeywordCreating(userId)) {
      const msgId = autoReplyState.getEditMode(userId);
      autoReplyState.setKeywordCreating(userId, false);
      autoReplyState.setKeywordMode(userId, '');
      if (msgId) await showAutoReplyEditor(ctx, msgId);
      return;
    }

    const kwEditing = autoReplyState.getKeywordEditing(userId);
    if (kwEditing) {
      const msgId = autoReplyState.getEditMode(userId);
      autoReplyState.setKeywordEditing(userId, 0);
      autoReplyState.setKeywordMode(userId, '');
      if (msgId) await showAutoReplyEditor(ctx, msgId);
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
      const msgId = autoReplyState.getEditMode(userId);
      if (msgId) await showAutoReplyEditor(ctx, msgId);
      return;
    }

    return next();
  });

  bot.hears('🔙 بازگشت به لیست', async (ctx: any, next) => {
    const userId = ctx.from.id;
    const isAR = autoReplyState.isManagementMode(userId) || autoReplyState.getEditMode(userId);
    if (!isAR) return next();
    autoReplyState.clearAll(userId);
    await sendList(ctx, 1);
  });

  // ─── Editor actions (Reply Keyboard) ────────────────────

  bot.hears('➕ افزودن پیام', async (ctx: any) => {
    const msgId = autoReplyState.getEditMode(ctx.from.id);
    if (!msgId) return;
    autoReplyState.setEditingMessage(ctx.from.id, -1);
    autoReplyState.setEditingContent(ctx.from.id, true);
    await ctx.reply(
      'پیام جدید را ارسال کنید.\nمی‌توانید متن، عکس، ویدیو، فایل، گیف، پیام فوروارد شده یا هر نوع پیام پشتیبانی‌شده توسط سیستم Post را ارسال کنید.',
      autoReplyAddMessageKeyboard(),
    );
  });

  // ─── Destination Binding Flow ─────────────────────────────
  // Idempotent: re-entry always restores from DB, never loses data
  // Source of truth: AutoReplyBinding table, not session/cache

  // ─── Start: 👥 انتخاب گروه ─────────────────────────────
  bot.hears('👥 انتخاب گروه', async (ctx: any, next) => {
    const userId = ctx.from.id;
    const msgId = autoReplyState.getEditMode(userId);
    if (!msgId) return next();
    const groups = await prisma.telegramGroup.findMany({
      where: { status: 'APPROVED', botIsAdmin: true },
      orderBy: { addedAt: 'desc' },
    });
    if (!groups.length) {
      await ctx.reply('هیچ گروه تأییدشده‌ای وجود ندارد.');
      return;
    }
    autoReplyState.clearBindingScene(userId);
    autoReplyState.setBindingScene(userId, 'SELECT_GROUP');
    logger.info(`[AutoReply] SELECT_GROUP user=${userId} msgId=${msgId} groups=${groups.length}`);
    await ctx.reply('👥 گروه مقصد را انتخاب کنید:', buildDestinationGroupKeyboard(groups));
  });

  // ─── Scene: SELECT_GROUP ─────────────────────────────────
  bot.on('text', async (ctx: any, next) => {
    const userId = ctx.from.id;
    const scene = autoReplyState.getBindingScene(userId);
    if (scene !== 'SELECT_GROUP') return next();

    const text = ctx.message.text;
    logger.info(`[AutoReply] ENTER_GROUP_CALLBACK user=${userId} text="${text}"`);

    if (text === '❌ لغو') {
      autoReplyState.clearBindingScene(userId);
      const msgId = autoReplyState.getEditMode(userId);
      if (msgId) await showAutoReplyEditor(ctx, msgId);
      else await ctx.reply('❌ لغو شد.', { reply_markup: { remove_keyboard: true } });
      return;
    }

    const group = await prisma.telegramGroup.findFirst({
      where: { title: text, status: 'APPROVED', botIsAdmin: true },
    });
    if (!group) {
      logger.info(`[AutoReply] GROUP_NOT_FOUND user=${userId} text="${text}"`);
      await ctx.reply('❌ گروه یافت نشد. دوباره انتخاب کنید.');
      return;
    }

    const msgId = autoReplyState.getEditMode(userId);
    logger.info(`[AutoReply] GROUP_SELECTED user=${userId} chatId=${group.chatId} title=${group.title} msgId=${msgId}`);

    // Step 1: Verify real forum status from Telegram API
    let realIsForum = group.isForum;
    try {
      const chatInfo = await ctx.telegram.getChat(group.chatId.toString());
      realIsForum = (chatInfo as any).is_forum ?? false;
      logger.info(`[AutoReply] FORUM_STATUS_FROM_TELEGRAM user=${userId} chatId=${group.chatId} isForum=${realIsForum}`);
      if (realIsForum !== group.isForum) {
        await prisma.telegramGroup.update({ where: { chatId: group.chatId }, data: { isForum: realIsForum } });
      }
    } catch (err: any) {
      logger.warn(`[AutoReply] FORUM_CHECK_FAILED user=${userId} chatId=${group.chatId} error=${err.message}`);
    }

    // Step 2: Load existing bindings from DB (source of truth)
    let existingTopics: { topicId: number; topicName: string }[] = [];
    if (msgId) {
      const existingBindings = await autoReplyRepository.getBindingsByAutoReply(msgId);
      const groupBindings = existingBindings.filter(b => b.chatId === group.chatId);
      existingTopics = groupBindings
        .filter(b => b.topicId != null)
        .map(b => ({ topicId: Number(b.topicId), topicName: '' }));
      // Resolve topic names
      for (const et of existingTopics) {
        const topic = await prisma.forumTopic.findFirst({ where: { chatId: group.chatId, topicId: et.topicId } });
        et.topicName = topic?.name || `Topic ${et.topicId}`;
      }
      logger.info(`[AutoReply] DB_BINDINGS_LOADED user=${userId} chatId=${group.chatId} existingTopics=${existingTopics.length}`);
    }

    // Step 3: If not forum → non-forum path
    if (!realIsForum) {
      const pending = autoReplyState.getPendingBindings(userId);
      // Remove old binding for this group if exists
      const filtered = pending.filter(b => b.chatId !== group.chatId.toString());
      filtered.push({ chatId: group.chatId.toString(), chatTitle: group.title, isForum: false, topics: [] });
      autoReplyState.setPendingBindings(userId, filtered);
      autoReplyState.setBindingScene(userId, 'SELECT_TOPIC');
      autoReplyState.setCurrentGroupForTopic(userId, group.chatId.toString());

      if (existingTopics.length > 0) {
        // Restore from DB
        const groupBinding = filtered.find(b => b.chatId === group.chatId.toString());
        if (groupBinding) groupBinding.topics = [...existingTopics];
        autoReplyState.setPendingBindings(userId, filtered);
        logger.info(`[AutoReply] RESTORED_FROM_DB user=${userId} chatId=${group.chatId} topics=${existingTopics.length}`);
        const statusText = buildTopicStatusText(group.title, existingTopics);
        const inlineKb = buildTopicStatusInlineKeyboard(existingTopics);
        const sent = await ctx.reply(statusText, inlineKb);
        autoReplyState.setBindingReviewMsgId(userId, sent.message_id);
      } else {
        logger.info(`[AutoReply] NON_FORUM_NO_TOPICS user=${userId} chatId=${group.chatId}`);
        const statusMsg = `✅ مقصد انتخاب شد\n\nگروه: ${group.title}\n(بدون تاپیک)`;
        const sent = await ctx.reply(statusMsg, buildNonForumConfirmKeyboard());
        autoReplyState.setBindingReviewMsgId(userId, sent.message_id);
      }
      return;
    }

    // Step 4: Forum group — sync topics (exclude General topic, topicId=1)
    logger.info(`[AutoReply] TOPIC_SYNC_STARTED user=${userId} chatId=${group.chatId}`);
    const topics = (await prisma.forumTopic.findMany({
      where: { chatId: group.chatId, isClosed: false, NOT: { topicId: 1 } },
      orderBy: { topicId: 'asc' },
    })).filter(t => t.name !== 'General');

    for (const t of topics) {
      logger.info(`[AutoReply] TOPIC_FOUND user=${userId} threadId=${t.topicId} title=${t.name}`);
    }
    logger.info(`[AutoReply] TOPIC_SYNC_COMPLETED user=${userId} chatId=${group.chatId} count=${topics.length}`);

    // Step 5: ALWAYS show Reply Keyboard with all topics
    // If existing selections exist, also show inline status message
    const pending = autoReplyState.getPendingBindings(userId);
    const filtered = pending.filter(b => b.chatId !== group.chatId.toString());
    filtered.push({ chatId: group.chatId.toString(), chatTitle: group.title, isForum: true, topics: [...existingTopics] });
    autoReplyState.setPendingBindings(userId, filtered);
    autoReplyState.setCurrentGroupForTopic(userId, group.chatId.toString());
    autoReplyState.setBindingScene(userId, 'SELECT_TOPIC');

    logger.info(`[AutoReply] SHOW_TOPIC_MENU user=${userId} chatId=${group.chatId} allTopics=${topics.length} existingSelections=${existingTopics.length}`);
    await ctx.reply(`📎 تاپیک‌های «${group.title}» را انتخاب کنید:`, buildDestinationTopicKeyboard(topics));

    if (existingTopics.length > 0) {
      logger.info(`[AutoReply] RESTORED_FROM_DB user=${userId} chatId=${group.chatId} topics=${existingTopics.length}`);
      const statusText = buildTopicStatusText(group.title, existingTopics);
      const inlineKb = buildTopicStatusInlineKeyboard(existingTopics);
      const sent = await ctx.reply(statusText, inlineKb);
      autoReplyState.setBindingReviewMsgId(userId, sent.message_id);
    }
  });

  // ─── Scene: SELECT_TOPIC ─────────────────────────────────
  bot.on('text', async (ctx: any, next) => {
    const userId = ctx.from.id;
    const scene = autoReplyState.getBindingScene(userId);
    if (scene !== 'SELECT_TOPIC') return next();

    const text = ctx.message.text;
    logger.info(`[AutoReply] ENTER_TOPIC_CALLBACK user=${userId} text="${text}"`);

    if (text === '❌ لغو') {
      autoReplyState.clearBindingScene(userId);
      const msgId = autoReplyState.getEditMode(userId);
      if (msgId) await showAutoReplyEditor(ctx, msgId);
      else await ctx.reply('❌ لغو شد.', { reply_markup: { remove_keyboard: true } });
      return;
    }
    if (text === '⬅️ بازگشت') {
      autoReplyState.setBindingScene(userId, 'SELECT_GROUP');
      const groups = await prisma.telegramGroup.findMany({
        where: { status: 'APPROVED', botIsAdmin: true },
        orderBy: { addedAt: 'desc' },
      });
      await ctx.reply('👥 گروه مقصد را انتخاب کنید:', buildDestinationGroupKeyboard(groups));
      return;
    }

    const chatIdStr = autoReplyState.getCurrentGroupForTopic(userId);
    if (!chatIdStr) return next();

    // Handle "🌍 همه گروه‌ها" — global binding (no group/topic)
    if (text === '🌍 همه گروه‌ها') {
      const pending = autoReplyState.getPendingBindings(userId);
      // Remove any existing global binding
      const filtered = pending.filter(b => !b.isGlobal);
      filtered.push({ chatId: '0', chatTitle: '🌍 همه گروه‌ها', isForum: false, topics: [], isGlobal: true });
      autoReplyState.setPendingBindings(userId, filtered);
      autoReplyState.setBindingScene(userId, 'SELECT_TOPIC');
      logger.info(`[AutoReply] GLOBAL_BINDING_SELECTED user=${userId}`);
      const statusText = '🌍 پاسخ خودکار در تمام گروه‌های فعال اعمال خواهد شد.';
      const inlineKb = buildTopicStatusInlineKeyboard([]);
      const sent = await ctx.reply(statusText, inlineKb);
      autoReplyState.setBindingReviewMsgId(userId, sent.message_id);
      return;
    }

    // Strip 📂 prefix and find topic by name in DB
    const cleanName = text.replace(/^📂 /, '');
    const topic = await prisma.forumTopic.findFirst({
      where: { chatId: BigInt(chatIdStr), name: cleanName, isClosed: false },
    });
    if (!topic) {
      logger.info(`[AutoReply] TOPIC_NOT_FOUND user=${userId} text="${text}" chatId=${chatIdStr}`);
      await ctx.reply('❌ تاپیک یافت نشد. دوباره انتخاب کنید.');
      return;
    }

    const topicId = topic.topicId;
    const topicName = topic.name;

    const pending = autoReplyState.getPendingBindings(userId);
    const groupBinding = pending.find(b => b.chatId === chatIdStr);
    if (!groupBinding) return next();

    // No duplicate check — add always
    groupBinding.topics.push({ topicId, topicName });
    autoReplyState.setPendingBindings(userId, pending);
    logger.info(`[AutoReply] TOPIC_SELECTED user=${userId} topicId=${topicId} name=${topicName}`);

    // Send NEW message each time (don't edit old ones)
    const statusText = buildTopicStatusText(groupBinding.chatTitle, groupBinding.topics);
    const inlineKb = buildTopicStatusInlineKeyboard(groupBinding.topics);
    const sent = await ctx.reply(statusText, inlineKb);
    autoReplyState.setBindingReviewMsgId(userId, sent.message_id);
  });

  // ─── Inline: Remove topic — delete from DB immediately ──
  bot.action(/^ar:dest:remove_topic:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const topicId = parseInt(ctx.match[1]);
    const msgId = autoReplyState.getEditMode(userId);
    const pending = autoReplyState.getPendingBindings(userId);
    const lastGroup = pending[pending.length - 1];
    if (!lastGroup) return;

    // Delete from DB immediately
    if (msgId) {
      await autoReplyRepository.removeBindingsForTopic(msgId, BigInt(lastGroup.chatId), topicId);
      logger.info(`[AutoReply] DB_BINDING_DELETED user=${userId} msgId=${msgId} chatId=${lastGroup.chatId} topicId=${topicId}`);
    }

    // Remove from session
    const idx = lastGroup.topics.findIndex(t => t.topicId === topicId);
    if (idx >= 0) {
      const removed = lastGroup.topics.splice(idx, 1)[0];
      autoReplyState.setPendingBindings(userId, pending);
      logger.info(`[AutoReply] TOPIC_REMOVED user=${userId} topicId=${topicId} name=${removed.topicName}`);
    }

    // Send NEW status message
    if (lastGroup.topics.length === 0) {
      const statusMsg = `✅ مقصد انتخاب شد\n\nگروه: ${lastGroup.chatTitle}\n(هیچ تاپیکی انتخاب نشده)`;
      const sent = await ctx.reply(statusMsg, buildNonForumConfirmKeyboard());
      autoReplyState.setBindingReviewMsgId(userId, sent.message_id);
    } else {
      const statusText = buildTopicStatusText(lastGroup.chatTitle, lastGroup.topics);
      const inlineKb = buildTopicStatusInlineKeyboard(lastGroup.topics);
      const sent = await ctx.reply(statusText, inlineKb);
      autoReplyState.setBindingReviewMsgId(userId, sent.message_id);
    }
  });

  // ─── Inline: Final confirm → persist to DB ──────────────
  bot.action('ar:dest:final_confirm', async (ctx: any) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const msgId = autoReplyState.getEditMode(userId);
    const pending = autoReplyState.getPendingBindings(userId);
    if (!msgId || pending.length === 0) return;

    const bindingsData: { chatId: bigint; topicId: number | null; isGlobal?: boolean }[] = [];
    for (const b of pending) {
      if (b.isGlobal) {
        bindingsData.push({ chatId: BigInt(0), topicId: null, isGlobal: true });
      } else if (!b.isForum || b.topics.length === 0) {
        bindingsData.push({ chatId: BigInt(b.chatId), topicId: null });
      } else {
        for (const t of b.topics) {
          bindingsData.push({ chatId: BigInt(b.chatId), topicId: t.topicId });
        }
      }
    }

    await autoReplyRepository.bulkCreateBindings(msgId, bindingsData);
    autoReplyState.clearBindingScene(userId);

    logger.info(`[AutoReply] BINDING_UPDATED user=${userId} msgId=${msgId} total=${bindingsData.length}`);
    await showDestinationSummary(ctx, userId, pending);
    await showAutoReplyEditor(ctx, msgId);
  });

  // ─── Content editing ─────────────────────────────────────
  bot.hears('✏️ ویرایش محتوا', async (ctx: any) => {
    const editingMsgId = autoReplyState.getEditingMessage(ctx.from.id);
    if (!editingMsgId) return;
    autoReplyState.setEditingContent(ctx.from.id, true);
    const msg = await prisma.autoReplyMessage.findUnique({ where: { id: editingMsgId } });
    await ctx.reply(
      `📝 محتوای پیام را ویرایش کنید:\n\nمحتوای فعلی:\n${msg?.text || '(خالی)'}`,
      autoReplyCancelOnlyKeyboard(),
    );
  });

  // ─── Title editing ──────────────────────────────────────
  bot.hears('📝 ویرایش عنوان', async (ctx: any) => {
    const userId = ctx.from.id;
    const editMode = autoReplyState.getEditMode(userId);
    if (!editMode) return;
    const msg = await autoReplyRepository.findById(editMode);
    autoReplyState.setEditingTitle(userId, true);
    await ctx.reply(
      `✏ عنوان فعلی: *${msg?.title || ''}*\n\nعنوان جدید را ارسال کنید:`,
      { parse_mode: 'Markdown', ...autoReplyCancelOnlyKeyboard() },
    );
  });

  // ─── Button management ──────────────────────────────────
  bot.hears('🔘 مدیریت دکمه‌ها', async (ctx: any, next) => {
    const userId = ctx.from.id;
    const msgId = autoReplyState.getEditingMessage(userId);
    if (!msgId || msgId <= 0) return next();

    const buttons = await autoReplyRepository.findButtonsByMessage(msgId);
    const grid = buttonsToGrid(buttons);
    const { text, reply_markup } = renderAutoReplyButtonEditor(msgId, grid, 'create');
    const sent = await ctx.reply(text, { reply_markup });
    if (sent) autoReplyState.setButtonEditorMsgId(userId, sent.message_id);
    autoReplyState.setButtonMode(userId, 'create');
  });

  // ─── Keyword Management ─────────────────────────────────

  async function showKeywordPage(ctx: any, mode: 'list' | 'edit' | 'delete' = 'list') {
    const msgId = autoReplyState.getEditMode(ctx.from.id);
    if (!msgId) return;
    autoReplyState.setKeywordMode(ctx.from.id, mode);
    const keywords = await autoReplyService.listKeywords(msgId);
    const page = renderKeywordPage(keywords, mode);
    await ctx.reply(page.text, { reply_markup: page.reply_markup });
  }

  bot.hears('🏷 کلمه کلیدی', async (ctx: any) => {
    if (!autoReplyState.getEditMode(ctx.from.id)) return;
    await showKeywordPage(ctx, 'list');
  });

  bot.hears('➕ ایجاد کلمه جدید', async (ctx: any) => {
    const msgId = autoReplyState.getEditMode(ctx.from.id);
    if (!msgId) return;
    autoReplyState.clearAll(ctx.from.id);
    autoReplyState.setEditMode(ctx.from.id, msgId);
    autoReplyState.setManagementMode(ctx.from.id, true);
    autoReplyState.setKeywordCreating(ctx.from.id, true);
    await ctx.reply('کلمه یا عبارت کلیدی جدید را ارسال کنید:', autoReplyKeywordCancelKeyboard());
  });

  bot.hears('✏️ ویرایش', async (ctx: any) => {
    if (!autoReplyState.getEditMode(ctx.from.id)) return;
    await showKeywordPage(ctx, 'edit');
  });

  bot.hears('🗑 حذف', async (ctx: any) => {
    if (!autoReplyState.getEditMode(ctx.from.id)) return;
    await showKeywordPage(ctx, 'delete');
  });

  // ─── Keyword inline callbacks ───────────────────────────

  bot.action('ar:kw:create', async (ctx: any) => {
    await ctx.answerCbQuery();
    const msgId = autoReplyState.getEditMode(ctx.from.id);
    if (!msgId) return;
    autoReplyState.clearAll(ctx.from.id);
    autoReplyState.setEditMode(ctx.from.id, msgId);
    autoReplyState.setManagementMode(ctx.from.id, true);
    autoReplyState.setKeywordCreating(ctx.from.id, true);
    await ctx.reply('کلمه یا عبارت کلیدی جدید را ارسال کنید:', autoReplyKeywordCancelKeyboard());
  });

  bot.action('ar:kw:enter_edit', async (ctx: any) => {
    await ctx.answerCbQuery();
    await showKeywordPage(ctx, 'edit');
  });

  bot.action('ar:kw:enter_delete', async (ctx: any) => {
    await ctx.answerCbQuery();
    await showKeywordPage(ctx, 'delete');
  });

  bot.action('ar:kw:back', async (ctx: any) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const editMode = autoReplyState.getEditMode(userId);
    autoReplyState.setKeywordMode(userId, '');
    autoReplyState.setKeywordCreating(userId, false);
    autoReplyState.setKeywordEditing(userId, 0);
    if (editMode) await showAutoReplyEditor(ctx, editMode);
  });

  bot.action(/^ar:kw:noop:\d+$/, async (ctx: any) => {
    await ctx.answerCbQuery();
  });

  bot.action(/^ar:kw:edit:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const keywordId = parseInt(ctx.match[1]);
    const msgId = autoReplyState.getEditMode(ctx.from.id);
    if (!msgId) return;
    autoReplyState.clearAll(ctx.from.id);
    autoReplyState.setEditMode(ctx.from.id, msgId);
    autoReplyState.setManagementMode(ctx.from.id, true);
    autoReplyState.setKeywordEditing(ctx.from.id, keywordId);
    await ctx.reply('کلمه یا عبارت جدید را ارسال کنید:', autoReplyKeywordCancelKeyboard());
  });

  bot.action(/^ar:kw:delete:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const keywordId = parseInt(ctx.match[1]);
    const msgId = autoReplyState.getEditMode(ctx.from.id);
    if (!msgId) return;
    try {
      await autoReplyService.deleteKeyword(keywordId);
      const keywords = await autoReplyService.listKeywords(msgId);
      const page = renderKeywordPage(keywords, 'list');
      await ctx.reply(`✅ کلمه حذف شد.`, { reply_markup: page.reply_markup });
    } catch (err: any) {
      await ctx.reply(`❌ خطا: ${err.message}`);
    }
  });

  // ─── Publish ────────────────────────────────────────────

  bot.hears('✅ انتشار', async (ctx: any) => {
    const msgId = autoReplyState.getEditMode(ctx.from.id);
    if (!msgId) {
      await ctx.reply('❌ پستی انتخاب نشده است.');
      return;
    }
    const msg = await autoReplyRepository.findById(msgId);
    if (!msg) return;

    const bindings = await autoReplyRepository.getBindingsByAutoReply(msgId);
    const { ready, missing } = validatePublishReadiness(msg, bindings);
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

  bot.hears('📤 لغو انتشار', async (ctx: any) => {
    const msgId = autoReplyState.getEditMode(ctx.from.id);
    if (!msgId) return;
    try {
      await autoReplyService.unpublish(msgId);
      await ctx.reply('📤 انتشار لغو شد.');
      await showAutoReplyEditor(ctx, msgId);
    } catch (err: any) {
      await ctx.reply(`❌ خطا: ${err.message}`);
    }
  });

  // ─── Delete ─────────────────────────────────────────────

  bot.hears('🗑 حذف', async (ctx: any) => {
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

    // Button editor state machine - skip if in button editor waiting state
    const btnEditWaiting = autoReplyState.getButtonEditWaiting(userId);
    if (btnEditWaiting && btnEditWaiting !== 'menu') {
      return next();
    }

    const isCreating = autoReplyState.isCreating(userId);
    const isEditingTitle = autoReplyState.isEditingTitle(userId);
    const isEditingContent = autoReplyState.isEditingContent(userId);

    if (autoReplyState.isButtonMoveActive(userId)) {
      return next();
    }

    // ─── Button text input (highest priority after move) ──
    const btnState = autoReplyState.getButtonState(userId);
    if (btnState === 'wait_text') {
      return next();
    }

    // ─── Keyword creation input ──
    if (autoReplyState.isKeywordCreating(userId)) {
      const msgId = autoReplyState.getEditMode(userId);
      if (!msgId) return next();
      if (text === 'لغو' || text === '❌ لغو') {
        autoReplyState.setKeywordCreating(userId, false);
        autoReplyState.setKeywordMode(userId, '');
        await showAutoReplyEditor(ctx, msgId);
        return;
      }
      try {
        await autoReplyService.addKeyword(msgId, text);
        autoReplyState.setKeywordCreating(userId, false);
        autoReplyState.setKeywordMode(userId, '');
        await showAutoReplyEditor(ctx, msgId);
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
      if (text === 'لغو' || text === '❌ لغو') {
        autoReplyState.setKeywordEditing(userId, 0);
        autoReplyState.setKeywordMode(userId, '');
        await showAutoReplyEditor(ctx, msgId);
        return;
      }
      try {
        await autoReplyService.updateKeyword(kwEditing, text);
        autoReplyState.setKeywordEditing(userId, 0);
        autoReplyState.setKeywordMode(userId, '');
        await showAutoReplyEditor(ctx, msgId);
      } catch (err: any) {
        await ctx.reply(`❌ خطا: ${err.message}`);
      }
      return;
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

    if (!isCreating && !isEditingTitle && !isEditingContent) {
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
      const editMode = autoReplyState.getEditMode(userId);
      if (text === 'لغو' || text === '❌ لغو') {
        autoReplyState.setEditingTitle(userId, false);
        autoReplyState.setEditingMessage(userId, 0);
        if (editMode) await showAutoReplyEditor(ctx, editMode);
        return;
      }
      if (editMode) {
        const title = validateDbInput(text, 'title');
        await autoReplyService.update(editMode, { title });
        autoReplyState.setEditingTitle(userId, false);
        autoReplyState.setEditingMessage(userId, 0);
        await ctx.reply(`✅ عنوان بروزرسانی شد.`);
        await showAutoReplyEditor(ctx, editMode);
      }
      return;
    }

    if (isEditingContent) {
      const editingMsgId = autoReplyState.getEditingMessage(userId);
      const autoReplyId = autoReplyState.getEditMode(userId);
      if (!autoReplyId) return next();

      const { isForwarded, forwardMeta } = extractForwardMeta(ctx.message);
      if (isForwarded && forwardMeta?.originChatId && forwardMeta.originMessageId) {
        const srcChatId = Number(forwardMeta.originChatId);
        const srcMsgId = Number(forwardMeta.originMessageId);
        if (srcChatId && srcMsgId && !isNaN(srcChatId) && !isNaN(srcMsgId)) {
          try {
            await ctx.telegram.copyMessage(ctx.chat.id, srcChatId, srcMsgId);
          } catch {
            await ctx.reply('⚠️ منبع پیام فوروارد در دسترس نیست.');
            return;
          }
        }
        if (editingMsgId && editingMsgId === -1) {
          const newMsg = await autoReplyService.addMessage(autoReplyId);
          await autoReplyService.updateMessage(newMsg.id, {
            type: PostMessageType.forward,
            forwardSource: {
              chatId: forwardMeta.originChatId,
              messageId: forwardMeta.originMessageId,
              sourceType: forwardMeta.type,
              sourceTitle: forwardMeta.originName,
              sourceUsername: forwardMeta.originUsername,
            },
          });
        } else if (editingMsgId) {
          await autoReplyService.updateMessage(editingMsgId, {
            type: PostMessageType.forward,
            forwardSource: {
              chatId: forwardMeta.originChatId,
              messageId: forwardMeta.originMessageId,
              sourceType: forwardMeta.type,
              sourceTitle: forwardMeta.originName,
              sourceUsername: forwardMeta.originUsername,
            },
          });
        }
        autoReplyState.setEditingContent(userId, false);
        autoReplyState.setEditingMessage(userId, 0);
        await ctx.reply('✅ پیام فوروارد ذخیره شد.');
        await showAutoReplyEditor(ctx, autoReplyId);
        return;
      }

      const entities = ctx.message.entities?.map((e: any) => ({
        type: e.type, offset: e.offset, length: e.length,
        url: e.url, user: e.user, language: e.language, custom_emoji_id: e.custom_emoji_id,
      })) || [];

      if (editingMsgId && editingMsgId === -1) {
        const newMsg = await autoReplyService.addMessage(autoReplyId);
        await autoReplyService.updateMessage(newMsg.id, {
          text,
          entities,
          type: PostMessageType.text,
        });
        autoReplyState.setEditingMessage(userId, newMsg.id);
        await ctx.reply(`✅ پیام ذخیره شد.`);
        await showAutoReplyEditor(ctx, autoReplyId);
      } else if (editingMsgId) {
        await autoReplyService.updateMessage(editingMsgId, {
          text,
          entities,
          type: PostMessageType.text,
        });
        autoReplyState.setEditingContent(userId, false);
        autoReplyState.setEditingMessage(userId, 0);
        await ctx.reply(`✅ محتوا بروزرسانی شد.`);
        await showAutoReplyEditor(ctx, autoReplyId);
      }
      return;
    }

    return next();
  });

  // ─── Media message handler ──────────────────────────────
  bot.on(['photo', 'video', 'animation', 'document', 'audio', 'voice', 'video_note', 'sticker'], async (ctx: any, next) => {
    if (!ctx.from || ctx.chat?.type !== 'private') return next();
    const userId = ctx.from.id;

    const admin = await botAdminService.getActive(userId);
    if (!admin) return next();

    if (!autoReplyState.isEditingContent(userId)) return next();

    const editingMsgId = autoReplyState.getEditingMessage(userId);
    const autoReplyId = autoReplyState.getEditMode(userId);
    if (!autoReplyId) return next();

    try {
      const msg = ctx.message;
      const caption = msg.caption || null;
      const captionEntities = msg.caption_entities?.map((e: any) => ({
        type: e.type, offset: e.offset, length: e.length,
        url: e.url, user: e.user, language: e.language, custom_emoji_id: e.custom_emoji_id,
      })) || [];

      let mediaFileId = '';
      let messageType: PostMessageType = PostMessageType.text;

      if (msg.photo) {
        mediaFileId = msg.photo[msg.photo.length - 1].file_id;
        messageType = PostMessageType.photo;
      } else if (msg.video) {
        mediaFileId = msg.video.file_id;
        messageType = PostMessageType.video;
      } else if (msg.animation) {
        mediaFileId = msg.animation.file_id;
        messageType = PostMessageType.animation;
      } else if (msg.document) {
        mediaFileId = msg.document.file_id;
        messageType = PostMessageType.document;
      } else if (msg.audio) {
        mediaFileId = msg.audio.file_id;
        messageType = PostMessageType.audio;
      } else if (msg.voice) {
        mediaFileId = msg.voice.file_id;
        messageType = PostMessageType.voice;
      } else if (msg.video_note) {
        mediaFileId = msg.video_note.file_id;
        messageType = PostMessageType.video_note;
      } else if (msg.sticker) {
        mediaFileId = msg.sticker.file_id;
        messageType = PostMessageType.sticker;
      }

      if (!mediaFileId) {
        await ctx.reply('❌ نوع فایل پشتیبانی نمی‌شود.');
        return;
      }

      const { isForwarded, forwardMeta } = extractForwardMeta(msg);

      if (isForwarded && forwardMeta?.originChatId && forwardMeta.originMessageId) {
        const srcChatId = Number(forwardMeta.originChatId);
        const srcMsgId = Number(forwardMeta.originMessageId);
        if (srcChatId && srcMsgId && !isNaN(srcChatId) && !isNaN(srcMsgId)) {
          try {
            await ctx.telegram.copyMessage(ctx.chat.id, srcChatId, srcMsgId);
          } catch {
            await ctx.reply('⚠️ منبع پیام فوروارد در دسترس نیست.');
            return;
          }
        }
        if (editingMsgId && editingMsgId === -1) {
          const newMsg = await autoReplyService.addMessage(autoReplyId);
          await autoReplyService.updateMessage(newMsg.id, {
            type: PostMessageType.forward,
            forwardSource: {
              chatId: forwardMeta.originChatId,
              messageId: forwardMeta.originMessageId,
              sourceType: forwardMeta.type,
              sourceTitle: forwardMeta.originName,
              sourceUsername: forwardMeta.originUsername,
            },
          });
        } else if (editingMsgId) {
          await autoReplyService.updateMessage(editingMsgId, {
            type: PostMessageType.forward,
            forwardSource: {
              chatId: forwardMeta.originChatId,
              messageId: forwardMeta.originMessageId,
              sourceType: forwardMeta.type,
              sourceTitle: forwardMeta.originName,
              sourceUsername: forwardMeta.originUsername,
            },
          });
        }
        autoReplyState.setEditingContent(userId, false);
        autoReplyState.setEditingMessage(userId, 0);
        await ctx.reply('✅ پیام فوروارد ذخیره شد.');
        await showAutoReplyEditor(ctx, autoReplyId);
        return;
      }

      if (editingMsgId && editingMsgId === -1) {
        const newMsg = await autoReplyService.addMessage(autoReplyId);
        await autoReplyService.updateMessage(newMsg.id, {
          type: messageType,
          mediaFileId,
          text: caption || '',
          caption,
          captionEntities,
          entities: [],
        });
        autoReplyState.setEditingMessage(userId, newMsg.id);
        await ctx.reply(`✅ رسانه ذخیره شد.`);
        await showAutoReplyEditor(ctx, autoReplyId);
      } else if (editingMsgId) {
        await autoReplyService.updateMessage(editingMsgId, {
          type: messageType,
          mediaFileId,
          text: caption || '',
          caption,
          captionEntities,
          entities: [],
        });
        autoReplyState.setEditingContent(userId, false);
        autoReplyState.setEditingMessage(userId, 0);
        await ctx.reply(`✅ رسانه بروزرسانی شد.`);
        await showAutoReplyEditor(ctx, autoReplyId);
      }
    } catch (e: any) {
      logger.error(`[AutoReply] Media save error: ${e.message}`);
      await ctx.reply('❌ خطا در ذخیره رسانه.');
    }
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

  // ─── Message inline callbacks ───────────────────────────

  // Click "✏️ ویرایش پیام" on a message → show per-message editing menu
  bot.action(/^ar:msg:edit:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const msgId = parseInt(ctx.match[1]);
    const userId = ctx.from.id;
    const editMode = autoReplyState.getEditMode(userId);
    if (!editMode) return;

    // Find index of this message in the auto-reply's message list
    const allMsgs = await autoReplyService.listMessages(editMode);
    const idx = allMsgs.findIndex((m: any) => m.id === msgId);
    const total = allMsgs.length;
    const position = idx >= 0 ? idx + 1 : msgId;

    autoReplyState.setEditingMessage(userId, msgId);
    const msg = await prisma.autoReplyMessage.findUnique({ where: { id: msgId } });
    await ctx.reply(
      `📝 پیام ${position} از ${total}\n\nمحتوای فعلی:\n${msg?.text || '(رسانه)'}`,
      autoReplyEditMessageReplyKeyboard(),
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

  // Enter button editor via inline button
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
    const userId = ctx.from.id;
    const msgId = autoReplyState.getEditMode(userId);
    if (!msgId) return;
    if (key === 'keywords') {
      autoReplyState.setKeywordMode(userId, 'list');
      await showKeywordPage(ctx, 'list');
    } else if (key === 'group') {
      const groups = await prisma.telegramGroup.findMany({
        where: { status: 'APPROVED', botIsAdmin: true },
        orderBy: { addedAt: 'desc' },
      });
      if (!groups.length) {
        await ctx.reply('هیچ گروه تأییدشده‌ای وجود ندارد.');
        return;
      }
      autoReplyState.clearBindingScene(userId);
      autoReplyState.setBindingScene(userId, 'SELECT_GROUP');
      autoReplyState.setPendingBindings(userId, []);
      await ctx.reply('👥 گروه مقصد را انتخاب کنید:', buildDestinationGroupKeyboard(groups));
    } else if (key === 'messages') {
      autoReplyState.setEditingMessage(userId, -1);
      autoReplyState.setEditingContent(userId, true);
      await ctx.reply('پیام جدید را ارسال کنید:', autoReplyAddMessageKeyboard());
    }
  });

  bot.action(/^ar:back:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const editMode = autoReplyState.getEditMode(userId);
    if (editMode) await showAutoReplyEditor(ctx, editMode);
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

  async function resolveAutoReplyForMessage(messageId: number): Promise<{ autoReplyId: number } | null> {
    const msg = await prisma.autoReplyMessage.findUnique({ where: { id: messageId } });
    if (!msg) return null;
    return { autoReplyId: msg.autoReplyId };
  }

  // Click on a button slot in the editor — callback params are grid positions (row, col)
  bot.action(/^arbtn:click:(\d+):(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const msgId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    const col = parseInt(ctx.match[3]);
    const mode = autoReplyState.getButtonMode(userId) || 'create';

    const buttons = await autoReplyRepository.findButtonsByMessage(msgId);
    const grid = buttonsToGrid(buttons);
    const btn = grid[row]?.[col];

    if (mode === 'move') {
      if (!btn) return;
      autoReplyState.setButtonMoveSelected(userId, btn.row, btn.col);
      autoReplyState.setButtonMoveActive(userId, true);
      const editorMsgId = autoReplyState.getButtonEditorMsgId(userId);
      if (editorMsgId) {
        const { text, reply_markup } = renderAutoReplyButtonEditor(msgId, grid, 'move', { row: btn.row, col: btn.col });
        try { await ctx.telegram.editMessageText(ctx.chat.id, editorMsgId, null, text, { reply_markup }); } catch {}
      }
      const moveKb = buildDynamicMoveKeyboard(grid, btn.row, btn.col);
      await ctx.reply(`🔀 "${btn.text || ''}" انتخاب شد. جهت را انتخاب کنید:`, moveKb);
      return;
    }

    if (mode === 'delete') {
      if (btn && btn.id) {
        await autoReplyService.deleteButton(btn.id);
        autoReplyState.setButtonMode(userId, 'create');
        await refreshButtonEditor(ctx, msgId);
      }
      return;
    }

    if (mode === 'edit') {
      if (!btn) return;
      autoReplyState.setButtonRow(userId, btn.row);
      autoReplyState.setButtonCol(userId, btn.col);
      autoReplyState.setButtonMode(userId, 'edit');
      const typeLabel = btn.type === 'POPUP' ? '🪟 POP-UP' : btn.type === 'COMMAND' ? '⌨️ دستور' : btn.type === 'URL' ? '🔗 لینک' : btn.type;
      const valueLabel = btn.type === 'URL' ? 'آدرس' : btn.type === 'COMMAND' ? 'دستور' : btn.type === 'POPUP' ? 'متن پنجره' : 'مقدار';
      const colorText = btn.style ? `🎨 ${btn.style}` : '⚪ بدون رنگ';

      autoReplyState.setButtonEditWaiting(userId, 'menu');

      await ctx.reply(
        `🔧 تنظیمات دکمه\n\nℹ️ مقدار فعلی:\n${typeLabel}\n🏷 ${btn.text}\n${valueLabel}: ${btn.value || '(خالی)'}\n${colorText}\n\nیکی از گزینه‌های زیر را انتخاب کنید:`,
        buildArbtnEditReplyKeyboard(),
      );
      return;
    }

    // Create mode — insert new button
    const resolved = await resolveAutoReplyForMessage(msgId);
    if (!resolved) return;

    if (!btn) {
      // Empty grid: {+} was clicked — create first button at (0, 0)
      await autoReplyService.addButton(resolved.autoReplyId, {
        text: 'دکمه جدید',
        type: 'URL',
        value: '',
        row: 0,
        col: 0,
        messageId: msgId,
      });
      autoReplyState.setButtonRow(userId, 0);
      autoReplyState.setButtonCol(userId, 0);
      autoReplyState.setButtonMode(userId, 'edit');
      await refreshButtonEditor(ctx, msgId);
      return;
    }

    const existingButtons = await autoReplyRepository.findButtonsByMessage(msgId);
    const shiftedButtons = existingButtons.filter((b: any) => b.row > row);
    for (const b of shiftedButtons) {
      await autoReplyService.updateButton(b.id, { row: b.row + 1, col: 0 });
    }

    await autoReplyService.addButton(resolved.autoReplyId, {
      text: 'دکمه جدید',
      type: 'URL',
      value: '',
      row: row + 1,
      col: 0,
      messageId: msgId,
    });
    autoReplyState.setButtonRow(userId, row + 1);
    autoReplyState.setButtonCol(userId, 0);
    autoReplyState.setButtonMode(userId, 'edit');
    await refreshButtonEditor(ctx, msgId);
  });

  // Switch editor mode
  bot.action(/^arbtn:mode:(create|edit|delete|move):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const mode = ctx.match[1];
    const msgId = parseInt(ctx.match[2]);

    if (mode === 'create') {
      autoReplyState.setButtonMode(userId, 'create');
      const buttons = await autoReplyRepository.findButtonsByMessage(msgId);
      const grid = buttonsToGrid(buttons);
      const { text, reply_markup } = renderAutoReplyButtonEditor(msgId, grid, 'create');
      try { await ctx.editMessageText(text, { reply_markup }); } catch {}
      return;
    }

    autoReplyState.setButtonMode(userId, mode);
    autoReplyState.setButtonState(userId, '');
    autoReplyState.setButtonRow(userId, 0);
    autoReplyState.setButtonCol(userId, 0);
    if (mode === 'move') {
      autoReplyState.setButtonMoveActive(userId, false);
    }
    const buttons = await autoReplyRepository.findButtonsByMessage(msgId);
    const grid = buttonsToGrid(buttons);
    const { text, reply_markup } = renderAutoReplyButtonEditor(msgId, grid, mode as any);
    try { await ctx.editMessageText(text, { reply_markup }); } catch {}
  });

  // Select button type
  bot.action(/^arbtn:type:(url|popup|command):(\d+):(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const btnType = ctx.match[1];
    const msgId = parseInt(ctx.match[2]);
    const row = parseInt(ctx.match[3]);
    const col = parseInt(ctx.match[4]);
    const buttons = await autoReplyRepository.findButtonsByMessage(msgId);
    const grid = buttonsToGrid(buttons);
    const existing = grid[row]?.[col];

    if (existing) {
      await autoReplyService.updateButton(existing.id, { type: btnType.toUpperCase() });
    } else {
      const resolved = await resolveAutoReplyForMessage(msgId);
      if (!resolved) return;
      await autoReplyService.addButton(resolved.autoReplyId, { text: '', type: btnType.toUpperCase(), row, col, messageId: msgId });
    }

    autoReplyState.setButtonPreviousView(userId, autoReplyState.getButtonMode(userId) || 'edit');
    autoReplyState.setButtonType(userId, btnType);
    autoReplyState.setButtonState(userId, 'wait_text');
    autoReplyState.setButtonRow(userId, row);
    autoReplyState.setButtonCol(userId, col);

    const editorMsgId = autoReplyState.getButtonEditorMsgId(userId);
    if (editorMsgId) {
      try {
        await ctx.telegram.editMessageText(ctx.chat.id, editorMsgId, null, '📝 متن و مقدار دکمه را وارد کنید:\nخط اول: عنوان دکمه\nخط دوم: مقدار (لینک/دستور/متن)', {
          reply_markup: { inline_keyboard: [[Markup.button.callback('❌ لغو', `arbtn:type:cancel:${msgId}`)]] },
        });
      } catch {}
    }
  });

  // Cancel type selection
  bot.action(/^arbtn:type:cancel:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    autoReplyState.setButtonState(userId, '');
    autoReplyState.setButtonType(userId, '');
    const prevMode = autoReplyState.getButtonPreviousView(userId) || 'edit';
    autoReplyState.setButtonMode(userId, prevMode);
    const msgId = parseInt(ctx.match[1]);
    const buttons = await autoReplyRepository.findButtonsByMessage(msgId);
    await refreshButtonEditor(ctx, msgId);
  });

  // ─── Button text input (wait_text state) ────────────────
  bot.on('text', async (ctx: any, next) => {
    const userId = ctx.from.id;
    const btnState = autoReplyState.getButtonState(userId);
    if (btnState !== 'wait_text') return next();

    const rawText = ctx.message.text;
    const msgId = autoReplyState.getEditingMessage(userId);
    const row = autoReplyState.getButtonRow(userId);
    const col = autoReplyState.getButtonCol(userId);
    const btnType = autoReplyState.getButtonType(userId);
    if (!msgId || row === undefined || col === undefined) return next();

    const lines = rawText.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
    if (lines.length < 2) {
      await ctx.reply('❌ حداقل دو خط وارد کنید:\nخط اول: عنوان دکمه\nخط دوم: مقدار', {
        reply_markup: { inline_keyboard: [[Markup.button.callback('❌ لغو', `arbtn:type:cancel:${msgId}`)]] },
      });
      return;
    }
    const title = lines[0];
    const value = lines.slice(1).join('\n');

    if (btnType === 'url') {
      if (!value.startsWith('http') && !value.startsWith('https') && !value.startsWith('t.me/') && !value.startsWith('tg://')) {
        await ctx.reply('❌ آدرس نامعتبر است. باید با http://، https://، t.me/ یا tg:// شروع شود.', {
          reply_markup: { inline_keyboard: [[Markup.button.callback('❌ لغو', `arbtn:type:cancel:${msgId}`)]] },
        });
        return;
      }
    }
    if (btnType === 'command') {
      if (!/^[a-z0-9_]+$/.test(value)) {
        await ctx.reply('❌ دستور نامعتبر است. فقط حروف a-z، اعداد 0-9 و زیرخط (_) مجاز است.', {
          reply_markup: { inline_keyboard: [[Markup.button.callback('❌ لغو', `arbtn:type:cancel:${msgId}`)]] },
        });
        return;
      }
    }
    if (btnType === 'popup') {
      if (value.length > 200) {
        await ctx.reply('❌ متن POP-UP نمی‌تواند بیش از ۲۰۰ کاراکتر باشد.', {
          reply_markup: { inline_keyboard: [[Markup.button.callback('❌ لغو', `arbtn:type:cancel:${msgId}`)]] },
        });
        return;
      }
    }

    const buttons = await autoReplyRepository.findButtonsByMessage(msgId);
    const grid = buttonsToGrid(buttons);
    const existingBtn = grid[row]?.[col];

    const dbType = btnType === 'url' ? 'URL' : btnType === 'command' ? 'COMMAND' : btnType === 'popup' ? 'POPUP' : 'CALLBACK';

    if (existingBtn?.id) {
      await autoReplyService.updateButton(existingBtn.id, { text: title, type: dbType, value });
    } else {
      const resolved = await resolveAutoReplyForMessage(msgId);
      if (!resolved) {
        logger.error(`[ButtonEditor:wait_text] AutoReplyMessage not found for id=${msgId}`);
        return;
      }
      await autoReplyService.addButton(resolved.autoReplyId, { text: title, type: dbType, value, row, col, messageId: msgId });
    }

    autoReplyState.setButtonState(userId, '');
    autoReplyState.setButtonType(userId, '');
    autoReplyState.setButtonMode(userId, 'edit');
    autoReplyState.setButtonRow(userId, row);
    autoReplyState.setButtonCol(userId, col);
    await refreshButtonEditor(ctx, msgId);
  });

  bot.action(/^arbtn:color:(\d+):(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const msgId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    const col = parseInt(ctx.match[3]);
    const kb = buildArbtnColorKeyboard(msgId, row, col);
    await ctx.reply('رنگ دکمه را انتخاب کنید:', kb);
  });

  // ─── Button Editor Reply Keyboard Handlers (State Machine) ──

  bot.hears('🔗 لینک یا اشتراک', async (ctx: any, next) => {
    const userId = ctx.from.id;
    const waiting = autoReplyState.getButtonEditWaiting(userId);
    if (waiting !== 'menu') return next();
    
    const msgId = autoReplyState.getEditingMessage(userId);
    const row = autoReplyState.getButtonRow(userId);
    const col = autoReplyState.getButtonCol(userId);
    if (!msgId || row === undefined || col === undefined) return next();
    
    const buttons = await autoReplyRepository.findButtonsByMessage(msgId);
    const grid = buttonsToGrid(buttons);
    const btn = grid[row]?.[col];
    
    autoReplyState.setButtonEditWaiting(userId, 'wait_link_title');
    
    await ctx.reply(
      `🔗 داده‌های جدید را برای URL / دکمه اشتراک‌گذاری وارد کنید:\n\n🏷 عنوان دکمه\n🌐 آدرس جدید\n\n(هر کدام در یک خط جداگانه)`,
      buildArbtnEditWaitingKeyboard(),
    );
  });

  bot.hears('🪟 POP-UP', async (ctx: any, next) => {
    const userId = ctx.from.id;
    const waiting = autoReplyState.getButtonEditWaiting(userId);
    if (waiting !== 'menu') return next();
    
    const msgId = autoReplyState.getEditingMessage(userId);
    const row = autoReplyState.getButtonRow(userId);
    const col = autoReplyState.getButtonCol(userId);
    if (!msgId || row === undefined || col === undefined) return next();
    
    autoReplyState.setButtonEditWaiting(userId, 'wait_popup_title');
    
    await ctx.reply(
      `🪟 داده‌های جدید را برای POP-UP وارد کنید:\n\n🏷 عنوان دکمه\n📝 محتوای جدید\n\n(هر کدام در یک خط جداگانه)`,
      buildArbtnEditWaitingKeyboard(),
    );
  });

  bot.hears('⌨️ دستور', async (ctx: any, next) => {
    const userId = ctx.from.id;
    const waiting = autoReplyState.getButtonEditWaiting(userId);
    if (waiting !== 'menu') return next();
    
    const msgId = autoReplyState.getEditingMessage(userId);
    const row = autoReplyState.getButtonRow(userId);
    const col = autoReplyState.getButtonCol(userId);
    if (!msgId || row === undefined || col === undefined) return next();
    
    autoReplyState.setButtonEditWaiting(userId, 'wait_command_title');
    
    await ctx.reply(
      `⌨️ داده‌های جدید را برای دستور وارد کنید:\n\n🏷 عنوان دکمه\n⌨️ COMMAND جدید\n\n(هر کدام در یک خط جداگانه)`,
      buildArbtnEditWaitingKeyboard(),
    );
  });

  bot.hears('🎨 رنگ', async (ctx: any, next) => {
    const userId = ctx.from.id;
    const waiting = autoReplyState.getButtonEditWaiting(userId);
    if (waiting !== 'menu') return next();
    
    autoReplyState.setButtonEditWaiting(userId, 'wait_color');
    
    await ctx.reply(
      '🎨 رنگ دکمه را انتخاب کنید:',
      buildArbtnColorReplyKeyboard(),
    );
  });

  // ─── Color selection from Reply Keyboard ──

  bot.hears('🔵 Primary (آبی)', async (ctx: any, next) => {
    const userId = ctx.from.id;
    const waiting = autoReplyState.getButtonEditWaiting(userId);
    if (waiting !== 'wait_color') return next();
    
    await handleARBtnColorSelect(ctx, 'primary');
  });

  bot.hears('🟢 Success (سبز)', async (ctx: any, next) => {
    const userId = ctx.from.id;
    const waiting = autoReplyState.getButtonEditWaiting(userId);
    if (waiting !== 'wait_color') return next();
    
    await handleARBtnColorSelect(ctx, 'success');
  });

  bot.hears('🔴 Danger (قرمز)', async (ctx: any, next) => {
    const userId = ctx.from.id;
    const waiting = autoReplyState.getButtonEditWaiting(userId);
    if (waiting !== 'wait_color') return next();
    
    await handleARBtnColorSelect(ctx, 'danger');
  });

  bot.hears('⚪ Default', async (ctx: any, next) => {
    const userId = ctx.from.id;
    const waiting = autoReplyState.getButtonEditWaiting(userId);
    if (waiting !== 'wait_color') return next();
    
    await handleARBtnColorSelect(ctx, 'default');
  });

  // ─── Cancel handler for button editor ──

  bot.hears('❌ لغو', async (ctx: any, next) => {
    const userId = ctx.from.id;
    const waiting = autoReplyState.getButtonEditWaiting(userId);
    
    if (!waiting) return next();
    
    // If in waiting state (not menu), just return to menu
    if (waiting !== 'menu') {
      autoReplyState.setButtonEditWaiting(userId, 'menu');
      const msgId = autoReplyState.getEditingMessage(userId);
      const row = autoReplyState.getButtonRow(userId);
      const col = autoReplyState.getButtonCol(userId);
      
      if (msgId && row !== undefined && col !== undefined) {
        const buttons = await autoReplyRepository.findButtonsByMessage(msgId);
        const grid = buttonsToGrid(buttons);
        const btn = grid[row]?.[col];
        
        if (btn) {
          const typeLabel = btn.type === 'POPUP' ? '🪟 POP-UP' : btn.type === 'COMMAND' ? '⌨️ دستور' : btn.type === 'URL' ? '🔗 لینک' : btn.type;
          const valueLabel = btn.type === 'URL' ? 'آدرس' : btn.type === 'COMMAND' ? 'دستور' : btn.type === 'POPUP' ? 'متن پنجره' : 'مقدار';
          const colorText = btn.style ? `🎨 ${btn.style}` : '⚪ بدون رنگ';
          
          await ctx.reply(
            `🔧 تنظیمات دکمه\n\nℹ️ مقدار فعلی:\n${typeLabel}\n🏷 ${btn.text}\n${valueLabel}: ${btn.value || '(خالی)'}\n${colorText}\n\nیکی از گزینه‌های زیر را انتخاب کنید:`,
            buildArbtnEditReplyKeyboard(),
          );
          return;
        }
      }
    }
    
    // If in menu state, clear everything and return to button editor
    autoReplyState.setButtonEditWaiting(userId, null);
    autoReplyState.setButtonMode(userId, 'create');
    autoReplyState.setButtonState(userId, '');
    autoReplyState.setButtonRow(userId, 0);
    autoReplyState.setButtonCol(userId, 0);
    
    await ctx.reply('⌨️', autoReplyEditMessageReplyKeyboard());
    
    const msgId = autoReplyState.getEditingMessage(userId);
    if (msgId) {
      await refreshButtonEditor(ctx, msgId);
    }
  });

  // ─── Text input handler for link/command/popup fields ──

  bot.on('text', async (ctx: any, next) => {
    const userId = ctx.from.id;
    const waiting = autoReplyState.getButtonEditWaiting(userId);
    
    if (!waiting || waiting === 'menu' || waiting === 'wait_color') return next();
    
    const text = ctx.message.text;
    const msgId = autoReplyState.getEditingMessage(userId);
    const row = autoReplyState.getButtonRow(userId);
    const col = autoReplyState.getButtonCol(userId);
    
    if (!msgId || row === undefined || col === undefined) return next();
    
    const lines = text.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
    
    if (waiting === 'wait_link_title') {
      // Expect: title on first line, URL on second line
      if (lines.length < 2) {
        await ctx.reply('❌ حداقل دو خط وارد کنید:\nخط اول: عنوان دکمه\nخط دوم: آدرس URL', buildArbtnEditWaitingKeyboard());
        return;
      }
      
      const title = lines[0];
      const url = lines.slice(1).join('\n');
      
      if (!url.startsWith('http') && !url.startsWith('https') && !url.startsWith('t.me/') && !url.startsWith('tg://')) {
        await ctx.reply('❌ آدرس نامعتبر است. باید با http://، https://، t.me/ یا tg:// شروع شود.', buildArbtnEditWaitingKeyboard());
        return;
      }
      
      const buttons = await autoReplyRepository.findButtonsByMessage(msgId);
      const grid = buttonsToGrid(buttons);
      const existing = grid[row]?.[col];
      
      if (existing) {
        await autoReplyService.updateButton(existing.id, { text: title, type: 'URL', value: url });
      } else {
        const resolved = await resolveAutoReplyForMessage(msgId);
        if (!resolved) return;
        await autoReplyService.addButton(resolved.autoReplyId, { text: title, type: 'URL', value: url, row, col, messageId: msgId });
      }
      
      autoReplyState.setButtonEditWaiting(userId, 'menu');
      await ctx.reply(`✅ دکمه بروزرسانی شد.\n\n🏷 عنوان: ${title}\n🌐 آدرس: ${url}`, autoReplyEditMessageReplyKeyboard());

      // Return to button editor
      const refreshed = await autoReplyRepository.findButtonsByMessage(msgId);
      await refreshButtonEditor(ctx, msgId);
      return;
    }
    
    if (waiting === 'wait_popup_title') {
      // Expect: title on first line, popup text on second line
      if (lines.length < 2) {
        await ctx.reply('❌ حداقل دو خط وارد کنید:\nخط اول: عنوان دکمه\nخط دوم: متن POP-UP', buildArbtnEditWaitingKeyboard());
        return;
      }
      
      const title = lines[0];
      const popupText = lines.slice(1).join('\n');
      
      if (popupText.length > 200) {
        await ctx.reply('❌ متن POP-UP نمی‌تواند بیش از ۲۰۰ کاراکتر باشد.', buildArbtnEditWaitingKeyboard());
        return;
      }
      
      const buttons = await autoReplyRepository.findButtonsByMessage(msgId);
      const grid = buttonsToGrid(buttons);
      const existing = grid[row]?.[col];
      
      if (existing) {
        await autoReplyService.updateButton(existing.id, { text: title, type: 'POPUP', value: popupText });
      } else {
        const resolved = await resolveAutoReplyForMessage(msgId);
        if (!resolved) return;
        await autoReplyService.addButton(resolved.autoReplyId, { text: title, type: 'POPUP', value: popupText, row, col, messageId: msgId });
      }
      
      autoReplyState.setButtonEditWaiting(userId, 'menu');
      await ctx.reply(`✅ دکمه بروزرسانی شد.\n\n🏷 عنوان: ${title}\n📝 متن POP-UP: ${popupText}`, autoReplyEditMessageReplyKeyboard());

      // Return to button editor
      const refreshed = await autoReplyRepository.findButtonsByMessage(msgId);
      await refreshButtonEditor(ctx, msgId);
      return;
    }
    
    if (waiting === 'wait_command_title') {
      // Expect: title on first line, command on second line
      if (lines.length < 2) {
        await ctx.reply('❌ حداقل دو خط وارد کنید:\nخط اول: عنوان دکمه\nخط دوم: دستور', buildArbtnEditWaitingKeyboard());
        return;
      }
      
      const title = lines[0];
      const command = lines.slice(1).join('\n');
      
      if (!/^[a-z0-9_]+$/.test(command)) {
        await ctx.reply('❌ دستور نامعتبر است. فقط حروف a-z، اعداد 0-9 و زیرخط (_) مجاز است.', buildArbtnEditWaitingKeyboard());
        return;
      }
      
      const buttons = await autoReplyRepository.findButtonsByMessage(msgId);
      const grid = buttonsToGrid(buttons);
      const existing = grid[row]?.[col];
      
      if (existing) {
        await autoReplyService.updateButton(existing.id, { text: title, type: 'COMMAND', value: command });
      } else {
        const resolved = await resolveAutoReplyForMessage(msgId);
        if (!resolved) return;
        await autoReplyService.addButton(resolved.autoReplyId, { text: title, type: 'COMMAND', value: command, row, col, messageId: msgId });
      }
      
      autoReplyState.setButtonEditWaiting(userId, 'menu');
      await ctx.reply(`✅ دکمه بروزرسانی شد.\n\n🏷 عنوان: ${title}\n⌨️ دستور: ${command}`, autoReplyEditMessageReplyKeyboard());

      // Return to button editor
      const refreshed = await autoReplyRepository.findButtonsByMessage(msgId);
      await refreshButtonEditor(ctx, msgId);
      return;
    }
    
    return next();
  });

  // ─── Helper function for color selection ──

  async function handleARBtnColorSelect(ctx: any, color: string) {
    const userId = ctx.from.id;
    const msgId = autoReplyState.getEditingMessage(userId);
    const row = autoReplyState.getButtonRow(userId);
    const col = autoReplyState.getButtonCol(userId);
    
    if (!msgId || row === undefined || col === undefined) return;
    
    const buttons = await autoReplyRepository.findButtonsByMessage(msgId);
    const grid = buttonsToGrid(buttons);
    const existing = grid[row]?.[col];
    
    if (existing) {
      await autoReplyService.updateButton(existing.id, { style: color === 'default' ? undefined : color });
    }
    
    autoReplyState.setButtonEditWaiting(userId, 'menu');
    await ctx.reply(`✅ رنگ دکمه بروزرسانی شد.`, autoReplyEditMessageReplyKeyboard());
    
    // Return to button editor
    const refreshed = await autoReplyRepository.findButtonsByMessage(msgId);
    await refreshButtonEditor(ctx, msgId);
  }

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
    await refreshButtonEditor(ctx, msgId);
  });

  // ─── Move direction handlers ────────────────────────────

  bot.hears('⬆️ بالا', async (ctx: any, next) => {
    if (!autoReplyState.isButtonMoveActive(ctx.from.id)) return next();
    await handleARMoveDirection(ctx, 'up');
  });

  bot.hears('⬇️ پایین', async (ctx: any, next) => {
    if (!autoReplyState.isButtonMoveActive(ctx.from.id)) return next();
    await handleARMoveDirection(ctx, 'down');
  });

  bot.hears('⬅️ چپ', async (ctx: any, next) => {
    if (!autoReplyState.isButtonMoveActive(ctx.from.id)) return next();
    await handleARMoveDirection(ctx, 'left');
  });

  bot.hears('➡️ راست', async (ctx: any, next) => {
    if (!autoReplyState.isButtonMoveActive(ctx.from.id)) return next();
    await handleARMoveDirection(ctx, 'right');
  });

  bot.hears('✅ تایید جابه‌جایی', async (ctx: any, next) => {
    try {
      const userId = ctx.from.id;
      if (!autoReplyState.isButtonMoveActive(userId)) return next();
      const msgId = autoReplyState.getEditingMessage(userId);
      if (!msgId) return next();

      autoReplyState.setButtonMoveActive(userId, false);
      autoReplyState.setButtonMode(userId, 'create');
      autoReplyState.setButtonState(userId, '');
      autoReplyState.setButtonRow(userId, 0);
      autoReplyState.setButtonCol(userId, 0);

      try { await ctx.reply('⌨️', { reply_markup: { remove_keyboard: true } }); } catch {}
      await refreshButtonEditor(ctx, msgId);
      await ctx.reply('✅ جابه‌جایی ذخیره شد.', autoReplyEditMessageReplyKeyboard());
    } catch (err: any) {
      logger.error(`[ARMove] confirm error: ${err.message}`);
    }
  });

  bot.hears('🔄 بازگشت', async (ctx: any, next) => {
    try {
      const userId = ctx.from.id;
      if (!autoReplyState.isButtonMoveActive(userId)) return next();
      const msgId = autoReplyState.getEditingMessage(userId);

      autoReplyState.setButtonMoveActive(userId, false);
      autoReplyState.setButtonMode(userId, 'create');
      autoReplyState.setButtonState(userId, '');
      autoReplyState.setButtonRow(userId, 0);
      autoReplyState.setButtonCol(userId, 0);

      try { await ctx.reply('⌨️', { reply_markup: { remove_keyboard: true } }); } catch {}
      if (msgId) await refreshButtonEditor(ctx, msgId);
      await ctx.reply('↩️ بازگشت از حالت جابه‌جایی.', autoReplyEditMessageReplyKeyboard());
    } catch (err: any) {
      logger.error(`[ARMove] return error: ${err.message}`);
    }
  });

  bot.hears('❌ لغو جابجایی', async (ctx: any, next) => {
    try {
      const userId = ctx.from.id;
      if (!autoReplyState.isButtonMoveActive(userId)) return next();
      const msgId = autoReplyState.getEditingMessage(userId);

      autoReplyState.setButtonMoveActive(userId, false);
      autoReplyState.setButtonMode(userId, 'create');
      autoReplyState.setButtonState(userId, '');
      autoReplyState.setButtonRow(userId, 0);
      autoReplyState.setButtonCol(userId, 0);

      try { await ctx.reply('⌨️', { reply_markup: { remove_keyboard: true } }); } catch {}
      if (msgId) await refreshButtonEditor(ctx, msgId);
      await ctx.reply('❌ جابه‌جایی لغو شد.', autoReplyEditMessageReplyKeyboard());
    } catch (err: any) {
      logger.error(`[ARMove] cancel error: ${err.message}`);
    }
  });

  // ─── Move direction helpers ──
  function buildDynamicMoveKeyboard(grid: any[][], row: number, col: number) {
    const rows: string[][] = [];
    const directionRow: string[] = [];
    if (row > 0 || (grid[row] && grid[row].length > 1)) directionRow.push('⬆️ بالا');
    if (row < grid.length - 1 || (grid[row] && grid[row].length > 1)) directionRow.push('⬇️ پایین');
    if (directionRow.length > 0) rows.push(directionRow);

    const horizRow: string[] = [];
    if (col > 0) horizRow.push('⬅️ چپ');
    if (grid[row] && col < grid[row].length - 1) horizRow.push('➡️ راست');
    if (horizRow.length > 0) rows.push(horizRow);

    rows.push(['✅ تایید جابه‌جایی', '❌ لغو جابجایی']);
    return Markup.keyboard(rows).resize().persistent();
  }

  async function handleARMoveDirection(ctx: any, direction: 'up' | 'down' | 'left' | 'right') {
    try {
      const userId = ctx.from.id;
      if (!autoReplyState.isButtonMoveActive(userId)) return;
      const msgId = autoReplyState.getEditingMessage(userId);
      if (!msgId) return;
      const moveSel = autoReplyState.getButtonMoveSelected(userId);
      if (moveSel.row === undefined || moveSel.col === undefined) return;

      const buttons = await autoReplyRepository.findButtonsByMessage(msgId);
      const rawGrid = buttonsToGrid(buttons);
      const rawBtn = rawGrid[moveSel.row]?.[moveSel.col];
      if (!rawBtn?.id) return;
      const btnId = rawBtn.id;

      let grid = normalizeGrid(rawGrid);
      const normPos = findButtonInGrid(grid, btnId);
      if (!normPos) return;
      const btn = grid[normPos.row][normPos.col];
      const curRow = normPos.row;
      const curCol = normPos.col;

      if (direction === 'left' || direction === 'right') {
        const targetCol = direction === 'left' ? curCol - 1 : curCol + 1;
        if (targetCol < 0 || targetCol >= grid[curRow].length) return;
        const temp = grid[curRow][curCol];
        grid[curRow][curCol] = grid[curRow][targetCol];
        grid[curRow][targetCol] = temp;
      } else if (direction === 'down') {
        const isSingleton = grid[curRow].length === 1;
        grid[curRow].splice(curCol, 1);
        grid = grid.filter((r: any[]) => r.length > 0);
        if (isSingleton) {
          const nextIdx = curRow < grid.length ? curRow : -1;
          if (nextIdx >= 0) {
            grid[nextIdx].push(btn);
          } else {
            grid.push([btn]);
          }
        } else {
          grid.splice(curRow + 1, 0, [btn]);
        }
      } else if (direction === 'up') {
        const isSingleton = grid[curRow].length === 1;
        grid[curRow].splice(curCol, 1);
        grid = grid.filter((r: any[]) => r.length > 0);
        if (isSingleton) {
          const prevIdx = curRow - 1;
          if (prevIdx >= 0) {
            grid[prevIdx].push(btn);
          } else {
            grid.unshift([btn]);
          }
        } else {
          grid.splice(curRow, 0, [btn]);
        }
      }

      for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
          if (grid[r][c]?.id) {
            await autoReplyService.updateButton(grid[r][c].id, { row: r, col: c });
          }
        }
      }

      const newPos = findButtonInGrid(grid, btnId);
      const newRow = newPos ? newPos.row : 0;
      const newCol = newPos ? newPos.col : 0;

      autoReplyState.setButtonMoveSelected(userId, newRow, newCol);
      autoReplyState.setButtonRow(userId, newRow);
      autoReplyState.setButtonCol(userId, newCol);

      await refreshButtonEditor(ctx, msgId);

      const moveKb = buildDynamicMoveKeyboard(grid, newRow, newCol);
      await ctx.reply(`🔀 "${btn.text || ''}" — جهت را انتخاب کنید:`, moveKb);
    } catch (err: any) {
      logger.error(`[ARMove] ${direction} error: ${err.message}`);
    }
  }

  async function refreshButtonEditor(ctx: any, msgId: number) {
    const userId = ctx.from.id;
    const editorMsgId = autoReplyState.getButtonEditorMsgId(userId);
    if (!editorMsgId) return;
    const buttons = await autoReplyRepository.findButtonsByMessage(msgId);
    const grid = buttonsToGrid(buttons);
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

  function buildTopicStatusText(groupTitle: string, topics: { topicId: number; topicName: string }[]): string {
    const lines = ['✅ مقصد انتخاب شد', '', `گروه: ${groupTitle}`];
    if (topics.length === 0) {
      lines.push('(هیچ تاپیکی انتخاب نشده)');
    } else {
      lines.push('تاپیک‌های انتخاب‌شده:');
      for (const t of topics) {
        lines.push(`• ${t.topicName}`);
      }
    }
    return lines.join('\n');
  }

  async function showDestinationSummary(ctx: any, userId: number, pending: any[]) {
    const lines = ['✅ مقصدهای انتخاب‌شده:', ''];
    for (const b of pending) {
      if (b.isGlobal) {
        lines.push('🌍 همه گروه‌ها (سراسری)');
      } else {
        lines.push(`📌 ${b.chatTitle}`);
        if (!b.isForum || b.topics.length === 0) {
          lines.push('  • (بدون تاپیک)');
        } else {
          for (const t of b.topics) {
            lines.push(`  • ${t.topicName}`);
          }
        }
      }
    }
    await ctx.reply(lines.join('\n'));
  }

  async function showAutoReplyEditor(ctx: any, id: number) {
    const msg = await autoReplyRepository.findById(id);
    if (!msg) {
      await ctx.reply('❌ پست یافت نشد.');
      return;
    }

    autoReplyState.setEditMode(ctx.from.id, id);
    autoReplyState.setManagementMode(ctx.from.id, true);

    const bindings = await autoReplyRepository.getBindingsByAutoReply(id);
    const bindingLines: string[] = [];
    const groupedByChat = new Map<string, bigint[]>();
    let hasGlobal = false;
    for (const b of bindings) {
      if (b.isGlobal) { hasGlobal = true; continue; }
      const key = b.chatId.toString();
      if (!groupedByChat.has(key)) groupedByChat.set(key, []);
      if (b.topicId != null) groupedByChat.get(key)!.push(b.topicId);
    }

    if (hasGlobal) bindingLines.push('  🌍 همه گروه‌ها (سراسری)');
    for (const [chatIdStr, topicIds] of groupedByChat) {
      const group = await prisma.telegramGroup.findUnique({ where: { chatId: BigInt(chatIdStr) } });
      const groupName = group?.title || chatIdStr;
      if (topicIds.length === 0) {
        bindingLines.push(`  • ${groupName} → همه تاپیک‌ها`);
      } else {
        const topicNames: string[] = [];
        for (const tid of topicIds) {
          const topic = await prisma.forumTopic.findUnique({ where: { chatId_topicId: { chatId: BigInt(chatIdStr), topicId: Number(tid) } } });
          topicNames.push(topic?.name || `Topic ${tid}`);
        }
        bindingLines.push(`  • ${groupName} → ${topicNames.join(', ')}`);
      }
    }

    (msg as any)._bindingLines = bindingLines.length > 0 ? bindingLines : ['  — بدون گروه —'];

    const bindingSummaryLines: string[] = [];
    if (bindings.length > 0) {
      if (hasGlobal) bindingSummaryLines.push('🌍 همه گروه‌ها (سراسری)');
      for (const [chatIdStr, topicIds] of groupedByChat) {
        const group = await prisma.telegramGroup.findUnique({ where: { chatId: BigInt(chatIdStr) } });
        const groupName = group?.title || chatIdStr;
        const botIsAdmin = group?.botIsAdmin ?? false;
        const statusIcon = botIsAdmin ? '✅' : '⚠️';
        if (topicIds.length === 0) {
          bindingSummaryLines.push(`گروه: ${groupName} → همه تاپیک‌ها ${statusIcon}`);
        } else {
          const topicNames: string[] = [];
          for (const tid of topicIds) {
            const topic = await prisma.forumTopic.findUnique({ where: { chatId_topicId: { chatId: BigInt(chatIdStr), topicId: Number(tid) } } });
            topicNames.push(topic?.name || `Topic ${tid}`);
          }
          bindingSummaryLines.push(`گروه: ${groupName}\nتاپیک: ${topicNames.join(', ')} ${statusIcon}`);
        }
      }
    } else {
      bindingSummaryLines.push('گروه: بدون گروه');
    }

    const statusText = msg.isPublished ? '✅ آماده انتشار' : '📝 پیش‌نویس';

    const text = formatAutoReplyInfo(msg, bindingSummaryLines, statusText);
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

function normalizeGrid(grid: any[][]): any[][] {
  const dense: any[][] = [];
  for (let r = 0; r < grid.length; r++) {
    if (!Array.isArray(grid[r]) || grid[r].length === 0) continue;
    const row: any[] = [];
    for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c]) row.push(grid[r][c]);
    }
    if (row.length > 0) dense.push(row);
  }
  return dense;
}

function findButtonInGrid(grid: any[][], btnId: number): { row: number; col: number } | null {
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c]?.id === btnId) return { row: r, col: c };
    }
  }
  return null;
}
