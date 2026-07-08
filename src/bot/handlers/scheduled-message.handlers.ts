import { Telegraf, Markup } from 'telegraf';
import { PostStatus, PostMessageType, BotAdminRole } from '@prisma/client';
import { scheduledMessageService } from '../../services/scheduled-message.service';
import { scheduledMessageState } from '../../services/scheduled-message-state.service';
import { scheduledMessageRepository } from '../../repositories/scheduled-message.repository';
import { botAdminService } from '../../services/bot-admin.service';
import { forumTopicService } from '../../services/forum-topic.service';
import { autoReplyState } from '../../services/auto-reply-state.service';
import { prisma } from '../../prisma/client';
import { logger } from '../../utils/logger';
import { cache } from '../../utils/cache';
import { validateDbInput, sanitizeTelegramText } from '../../utils/unicode';
import { graphemeTruncate } from '../../utils/grapheme';
import { buildBotAdminPanelKeyboard } from '../keyboards/index';
import {
  scheduledMessageMainMenuKeyboard,
  scheduledMessageAutomationKeyboard,
  scheduledMessageListInlineKeyboard,
  scheduledMessageNewPostManagerReplyKeyboard,
  scheduledMessageEditorReplyKeyboard,
  scheduledMessageCancelOnlyKeyboard,
  scheduledMessageAddMessageKeyboard,
  scheduledMessageEditMessageReplyKeyboard,
  scheduledMessageSingleMessageInlineKeyboard,
  scheduleIntervalKeyboard,
  scheduleGroupReplyKeyboard,
  scheduleTopicReplyKeyboard,
  scheduledMessagePublishValidationKeyboard,
  scheduledMessageDeleteConfirmKeyboard,
  scheduledMessageDashboardKeyboard,
  renderScheduledButtonEditor,
  buildSmbtnEditTypeKeyboard,
  buildSmbtnColorKeyboard,
} from '../keyboards/scheduled-message-keyboards';
import {
  buildDestinationGroupKeyboard,
  buildDestinationTopicKeyboard,
  buildTopicStatusInlineKeyboard,
  buildTopicStatusText,
} from '../keyboards/auto-reply-keyboards';

function formatScheduledMessageInfo(msg: any): string {
  const status = msg.isPublished ? '🟢 فعال' : '⚪ غیرفعال';
  const interval = msg.intervalMinutes ? `هر ${msg.intervalMinutes >= 60 ? Math.floor(msg.intervalMinutes / 60) + ' ساعت' : msg.intervalMinutes + ' دقیقه'}` : '—';
  const startTime = msg.startTime || '—';
  const msgCount = msg.messages?.length || 0;
  const sendCount = msg.sendCount || 0;

  return [
    `📝 *${msg.title}*`,
    '',
    `📨 پیام‌ها: ${msgCount}`,
    `📤 وضعیت: ${status}`,
    `⏰ زمان‌بندی: ${interval}`,
    `🕐 ساعت شروع: ${startTime}`,
    `👥 گروه: ${msg._groupName || (msg.targetChatId ? String(msg.targetChatId) : '—')}`,
    `📌 تاپیک: ${msg._topicName || (msg.targetTopicId ? `تاپیک ${msg.targetTopicId}` : (msg.targetChatId ? 'همه تاپیک‌ها' : '—'))}`,
    `🔢 دفعات ارسال: ${sendCount}`,
  ].join('\n');
}

function validatePublishReadiness(msg: any): { ready: boolean; missing: { key: string; label: string }[] } {
  const missing: { key: string; label: string }[] = [];
  if (!msg.intervalMinutes) missing.push({ key: 'schedule', label: '⏰ تنظیم زمان‌بندی' });
  if (!msg.targetChatId) missing.push({ key: 'group', label: '👥 انتخاب گروه' });
  if (!msg.startTime) missing.push({ key: 'schedule', label: '⏰ تنظیم ساعت شروع' });
  if ((msg.messages?.length || 0) === 0) missing.push({ key: 'messages', label: '➕ افزودن پیام' });
  return { ready: missing.length === 0, missing };
}

export function registerScheduledMessageHandlers(bot: Telegraf) {

  // ─── Entry: 🤖 اتوماسیون ─────────────────────────
  bot.hears('🤖 اتوماسیون', async (ctx: any) => {
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    const { clearAllPostStates } = require('./post-handlers');
    clearAllPostStates(ctx.from.id);
    scheduledMessageState.clearAll(ctx.from.id);
    await ctx.reply('🤖 اتوماسیون', scheduledMessageAutomationKeyboard());
  });

  // ─── Entry: 📨 پیام‌های خودکار ──────────────────────
  bot.hears('📨 پیام‌های خودکار', async (ctx: any) => {
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    const { clearAllPostStates } = require('./post-handlers');
    clearAllPostStates(ctx.from.id);
    scheduledMessageState.clearAll(ctx.from.id);
    scheduledMessageState.setManagementMode(ctx.from.id, true);
    const result = await scheduledMessageRepository.findAll({ page: 1, limit: 100 });
    await ctx.reply('📨 پیام‌های خودکار', scheduledMessageMainMenuKeyboard(result.items));
  });

  // ─── From scheduled messages menu → back to automation ──
  bot.hears('🔙 بازگشت', async (ctx: any, next) => {
    if (!scheduledMessageState.isManagementMode(ctx.from.id)) return next();
    const msgId = scheduledMessageState.getEditMode(ctx.from.id);
    if (msgId) return next();
    scheduledMessageState.clearAll(ctx.from.id);
    await ctx.reply('🤖 اتوماسیون', scheduledMessageAutomationKeyboard());
  });

  // ─── Back to admin panel ────────────────────────────────
  bot.hears('🔙 بازگشت به پنل ادمین', async (ctx: any, next) => {
    if (!scheduledMessageState.isManagementMode(ctx.from.id)) return next();
    scheduledMessageState.clearAll(ctx.from.id);
    autoReplyState.clearBindingScene(ctx.from.id);
    const admin = await botAdminService.getActive(ctx.from.id);
    const canBroadcast = admin && (admin.role === BotAdminRole.OWNER || admin.role === BotAdminRole.ADMIN);
    await ctx.reply('⚙️ پنل مدیریت ربات', buildBotAdminPanelKeyboard(canBroadcast));
  });

  // ─── Create new scheduled post ──────────────────────────
  bot.hears('➕ ایجاد پست جدید', async (ctx: any) => {
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    scheduledMessageState.clearAll(ctx.from.id);
    scheduledMessageState.setCreating(ctx.from.id);
    await ctx.reply('📝 عنوان پست را وارد کنید:', scheduledMessageCancelOnlyKeyboard());
  });

  // ─── List posts ─────────────────────────────────────────
  bot.hears('📋 لیست پست‌ها', async (ctx: any) => {
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    scheduledMessageState.clearAll(ctx.from.id);
    await sendList(ctx, 1);
  });

  // ─── Reports ────────────────────────────────────────────
  bot.hears('📊 گزارش ارسال', async (ctx: any) => {
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    const stats = await scheduledMessageService.getStats();
    const text = [
      '📊 گزارش ارسال خودکار',
      '',
      `🟢 پیام‌های فعال: ${stats.activeMessages}`,
      `📤 ارسال امروز: ${stats.todaySends}`,
      `📤 ارسال هفته: ${stats.weekSends}`,
      `👥 گروه‌های فعال: ${stats.activeGroups}`,
      `❌ خطاها: ${stats.errorCount}`,
    ].join('\n');
    await ctx.reply(text, scheduledMessageDashboardKeyboard());
  });

  // ─── Cancel creation ────────────────────────────────────
  bot.hears('❌ لغو', async (ctx: any, next) => {
    if (!ctx.from) return next();
    const userId = ctx.from.id;
    const creating = scheduledMessageState.isCreating(userId);
    if (creating) {
      const msgId = scheduledMessageState.getEditingMessage(userId);
      if (msgId) await scheduledMessageService.delete(msgId).catch(() => {});
      scheduledMessageState.clearAll(userId);
      await ctx.reply('❌ ایجاد پست لغو شد.', scheduledMessageMainMenuKeyboard());
      return;
    }
    // Close editing content state
    if (scheduledMessageState.isEditingContent(userId)) {
      scheduledMessageState.setEditingContent(userId, false);
      scheduledMessageState.setEditingMessage(userId, 0);
      const msgId = scheduledMessageState.getEditMode(userId);
      if (msgId) {
        await showPostEditor(ctx, msgId);
      }
      return;
    }
    // Close editing title state
    if (scheduledMessageState.isEditingTitle(userId)) {
      scheduledMessageState.setEditingTitle(userId, false);
      scheduledMessageState.setEditingMessage(userId, 0);
      const msgId = scheduledMessageState.getEditMode(userId);
      if (msgId) {
        await showPostEditor(ctx, msgId);
      }
      return;
    }
    // Close scheduling states
    if (scheduledMessageState.getScheduleStep(userId)) {
      scheduledMessageState.setScheduleStep(userId, null as any);
      const msgId = scheduledMessageState.getEditMode(userId);
      if (msgId) {
        await showPostEditor(ctx, msgId);
      }
      return;
    }
    return next();
  });

  // ─── Back buttons ──
  bot.hears('🔙 بازگشت', async (ctx: any, next) => {
    if (!ctx.from) return next();
    const userId = ctx.from.id;
    // Close all editing states
    scheduledMessageState.setEditingContent(userId, false);
    scheduledMessageState.setEditingTitle(userId, false);
    const editMsgId = scheduledMessageState.getEditingMessage(userId);
    if (editMsgId) {
      scheduledMessageState.setEditingMessage(userId, 0);
    }
    // Also close scheduling states
    scheduledMessageState.setScheduleStep(userId, null as any);
    const msgId = scheduledMessageState.getEditMode(userId);
    if (msgId) {
      await showPostEditor(ctx, msgId);
      return;
    }
    return next();
  });

  bot.hears('🔙 بازگشت به لیست', async (ctx: any, next) => {
    const { autoReplyState } = require('../../services/auto-reply-state.service');
    const isAR = autoReplyState.isManagementMode(ctx.from.id) || autoReplyState.getEditMode(ctx.from.id);
    if (isAR) return next();
    scheduledMessageState.clearAll(ctx.from.id);
    await sendList(ctx, 1);
  });

  // ─── Editor actions (Reply Keyboard) ────────────────────

  // ─── Add message — only set state, message created on content delivery ──
  bot.hears('➕ افزودن پیام', async (ctx: any, next) => {
    const msgId = scheduledMessageState.getEditMode(ctx.from.id);
    if (!msgId) return next();
    // Don't create message yet — just set state to expect content
    scheduledMessageState.setEditingMessage(ctx.from.id, -1); // -1 = new message pending
    scheduledMessageState.setEditingContent(ctx.from.id, true);
    await ctx.reply(
      'پیام جدید را ارسال کنید.\nمی‌توانید متن، عکس، ویدیو، فایل، گیف، پیام فوروارد شده یا هر نوع پیام پشتیبانی‌شده توسط سیستم Post را ارسال کنید.',
      scheduledMessageAddMessageKeyboard(),
    );
  });

  bot.hears('⏰ تنظیم زمان‌بندی', async (ctx: any) => {
    const msgId = scheduledMessageState.getEditMode(ctx.from.id);
    if (!msgId) return;
    scheduledMessageState.setSchedulingMode(ctx.from.id, msgId);
    scheduledMessageState.setScheduleStep(ctx.from.id, 'interval');
    await ctx.reply('⏰ بازه زمانی ارسال را انتخاب کنید:', scheduleIntervalKeyboard());
  });

  // Bug #4: Group selection uses Reply Keyboard
  bot.hears('👥 انتخاب گروه', async (ctx: any, next) => {
    const msgId = scheduledMessageState.getEditMode(ctx.from.id);
    if (!msgId) return next();
    const groups = await prisma.telegramGroup.findMany({
      where: { status: 'APPROVED', botIsAdmin: true },
      orderBy: { addedAt: 'desc' },
    });
    if (!groups.length) {
      await ctx.reply('گروه تأییدشده‌ای که ربات در آن ادمین باشد وجود ندارد.');
      return;
    }
    scheduledMessageState.clearBindingScene(ctx.from.id);
    scheduledMessageState.setBindingScene(ctx.from.id, 'SELECT_GROUP');
    logger.info(`[SchedMsg] SELECT_GROUP user=${ctx.from.id} msgId=${msgId} groups=${groups.length}`);
    await ctx.reply('👥 گروه مقصد را انتخاب کنید:', buildDestinationGroupKeyboard(groups));
  });

  // Bug #11: Command management
  bot.hears('📖 دستور', async (ctx: any) => {
    const msgId = scheduledMessageState.getEditMode(ctx.from.id);
    if (!msgId) return;
    scheduledMessageState.setScheduleStep(ctx.from.id, 'command_input');
    const msg = await scheduledMessageRepository.findById(msgId);
    const currentCmd = (msg as any)?.command || '';
    const hint = currentCmd ? `\n\nدستور فعلی: ${currentCmd}\n\nبرای حذف دستور: ❌ حذف دستور` : '';
    await ctx.reply(`نام دستور را ارسال کنید.\nبدون علامت /\nمثال: start, help, vip${hint}`, scheduledMessageCancelOnlyKeyboard());
  });

  bot.hears('❌ حذف دستور', async (ctx: any) => {
    const msgId = scheduledMessageState.getEditMode(ctx.from.id);
    if (!msgId) return;
    scheduledMessageState.setScheduleStep(ctx.from.id, null as any);
    // Delete command from DB
    await prisma.scheduledMessage.update({ where: { id: msgId }, data: { slug: null } as any }).catch(() => {});
    await ctx.reply('🗑 دستور حذف شد.');
    await showPostEditor(ctx, msgId);
  });

  bot.hears('✅ انتشار', async (ctx: any, next) => {
    const msgId = scheduledMessageState.getEditMode(ctx.from.id);
    logger.info(`[SchedMsg] Publish requested by userId=${ctx.from.id} editMode=${msgId}`);
    if (!msgId) {
      logger.warn(`[SchedMsg] Publish ABORTED: editMode is null`);
      return next();
    }
    const msg = await scheduledMessageRepository.findById(msgId);
    if (!msg) {
      logger.warn(`[SchedMsg] Publish ABORTED: msg=${msgId} not found in DB`);
      return;
    }

    logger.info(`[SchedMsg] Publish pre-check msg=${msgId} interval=${msg.intervalMinutes}min startTime=${msg.startTime} chatId=${msg.targetChatId} topicId=${msg.targetTopicId} isPublished=${msg.isPublished} status=${msg.status} messages=${msg.messages?.length}`);

    const { ready, missing } = validatePublishReadiness(msg);
    if (!ready) {
      logger.warn(`[SchedMsg] Publish ABORTED: not ready. Missing: ${missing.map(m => m.key).join(', ')}`);
      const missingList = missing.map((m) => `❌ ${m.label.replace(/^[^\s]+ /, '')}`).join('\n');
      await ctx.reply(
        `این پست هنوز آماده انتشار نیست.\nبخش‌های تکمیل‌نشده:\n${missingList}`,
        scheduledMessagePublishValidationKeyboard(missing),
      );
      return;
    }

    try {
      await scheduledMessageService.publish(msgId);
      // Verify what was saved
      const verify = await scheduledMessageRepository.findById(msgId);
      logger.info(`[SchedMsg] Publish SUCCESS msg=${msgId} isPublished=${verify?.isPublished} status=${verify?.status} nextSendAt=${verify?.nextSendAt?.toISOString()} interval=${verify?.intervalMinutes}min startTime=${verify?.startTime} chatId=${verify?.targetChatId}`);
      await ctx.reply('✅ پست منتشر شد و ارسال خودکار فعال شد!');
      await showPostEditor(ctx, msgId);
    } catch (err: any) {
      logger.error(`[SchedMsg] Publish FAILED msg=${msgId}: ${err.message}`);
      await ctx.reply(`❌ خطا در انتشار: ${err.message}`);
    }
  });

  bot.hears('🧪 ارسال تستی', async (ctx: any) => {
    const msgId = scheduledMessageState.getEditMode(ctx.from.id);
    if (!msgId) {
      await ctx.reply('❌ پستی انتخاب نشده.');
      return;
    }
    const msg = await scheduledMessageRepository.findById(msgId);
    if (!msg) {
      await ctx.reply('❌ پست یافت نشد.');
      return;
    }
    if (!msg.targetChatId) {
      await ctx.reply('❌ گروه مقصد تعیین نشده.');
      return;
    }
    if ((msg.messages?.length || 0) === 0) {
      await ctx.reply('❌ پیامی برای ارسال وجود ندارد.');
      return;
    }

    await ctx.reply('🧪 در حال ارسال تستی (دقیقاً مانند Scheduler)...');

    // Same pipeline as scheduler: sendToGroup → update nextSendAt + sendCount
    try {
      await scheduledMessageService.testSend(msgId);
      await ctx.reply('✅ ارسال تستی انجام شد. نتیجه را در لاگ بررسی کنید.');
    } catch (err: any) {
      await ctx.reply(`❌ خطا در ارسال تستی: ${err.message}`);
    }

    await showPostEditor(ctx, msgId);
  });

  bot.hears('📊 آمار', async (ctx: any, next) => {
    const msgId = scheduledMessageState.getEditMode(ctx.from.id);
    if (!msgId) return next();
    const msg = await scheduledMessageRepository.findById(msgId);
    if (!msg) return;
    const logs = await scheduledMessageService.getLogs(msgId, 5);
    const text = [
      `📊 آمار پست: ${msg.title}`,
      '',
      `🔢 دفعات ارسال: ${msg.sendCount || 0}`,
      `🕐 آخرین ارسال: ${msg.lastSentAt ? new Date(msg.lastSentAt).toLocaleString('fa-IR') : 'هرگز'}`,
      '',
      '📤 آخرین ارسال‌ها:',
      ...logs.map((l: any) => `  ${new Date(l.sentAt).toLocaleString('fa-IR')} — ${l.status === 'SUCCESS' ? '✅' : '❌'}`),
    ].join('\n');
    await ctx.reply(text);
  });

  // ─── Debug: Scheduler Status ──
  bot.hears('📊 وضعیت Scheduler', async (ctx: any) => {
    const msgId = scheduledMessageState.getEditMode(ctx.from.id);
    if (!msgId) {
      await ctx.reply('❌ پستی انتخاب نشده.');
      return;
    }
    const status = await scheduledMessageService.getSchedulerStatus(msgId);
    if (!status) {
      await ctx.reply('❌ پست یافت نشد.');
      return;
    }
    const diffText = status.diffMinutes != null
      ? (status.diffMinutes > 0 ? `${status.diffMinutes} دقیقه دیگر` : 'الان!')
      : '—';
    const text = [
      '📊 **وضعیت Scheduler**',
      '',
      `ID: ${status.id}`,
      `عنوان: ${status.title}`,
      `⏰ ساعت شروع: ${status.startTime ?? '—'}`,
      `⏱ بازه: ${status.intervalMinutes ?? '—'} دقیقه`,
      `🕐 آخرین ارسال: ${status.lastSentAt}`,
      `📍 nextSendAt (DB): ${status.nextSendAtDB}`,
      `📍 nextDue (محاسبه): ${status.nextDueCalculated}`,
      `⏳ اختلاف: ${diffText}`,
      `📊 تعداد ارسال: ${status.sendCount}`,
      `👥 گروه: ${status.targetChatId}`,
      `📌 تاپیک: ${status.targetTopicId}`,
      '',
      `🔘 IS_DUE: ${status.isDue ? '✅ YES' : '❌ NO'}`,
      `📝 علت: ${status.reason}`,
    ].join('\n');
    await ctx.reply(text, { parse_mode: 'Markdown' });
  });

  bot.hears('🗑 حذف', async (ctx: any, next) => {
    const msgId = scheduledMessageState.getEditMode(ctx.from.id);
    if (!msgId) return next();
    const msg = await scheduledMessageRepository.findById(msgId);
    await ctx.reply(
      `⚠️ آیا از حذف "${msg?.title}" مطمئن هستید؟\n\nاین عملیات غیرقابل بازگشت است.`,
      scheduledMessageDeleteConfirmKeyboard(msgId),
    );
  });

  bot.hears('📤 لغو انتشار', async (ctx: any, next) => {
    const msgId = scheduledMessageState.getEditMode(ctx.from.id);
    if (!msgId) return next();
    try {
      await scheduledMessageService.unpublish(msgId);
      await ctx.reply('📤 انتشار لغو شد.');
      await showPostEditor(ctx, msgId);
    } catch (err: any) {
      await ctx.reply(`❌ خطا: ${err.message}`);
    }
  });

  // ─── Text input handler (with proper state isolation) ───
  bot.on('text', async (ctx: any, next) => {
    if (!ctx.from || ctx.chat?.type !== 'private') return next();
    const text = ctx.message.text;
    const userId = ctx.from.id;

    const admin = await botAdminService.getActive(userId);
    if (!admin) return next();

    const isCreating = scheduledMessageState.isCreating(userId);
    const isEditingTitle = scheduledMessageState.isEditingTitle(userId);
    const isEditingContent = scheduledMessageState.isEditingContent(userId);
    const scheduleStep = scheduledMessageState.getScheduleStep(userId);

    // Button move mode has priority — always pass through to direction handlers
    if (scheduledMessageState.isButtonMoveActive(userId)) {
      return next();
    }

    // Bug #8: If no state is active, pass through
    const bindingScene = scheduledMessageState.getBindingScene(userId);
    if (!isCreating && !isEditingTitle && !isEditingContent && !scheduleStep && !bindingScene) {
      // Check if text matches a post title in the reply keyboard list
      if (scheduledMessageState.isManagementMode(userId) && !scheduledMessageState.getEditMode(userId)) {
        const listResult = await scheduledMessageRepository.findAll({ page: 1, limit: 100 });
        const matchedPost = listResult.items.find((p: any) => {
          const label = graphemeTruncate(sanitizeTelegramText(p.title || 'بدون عنوان'), 30);
          return label === text;
        });
        if (matchedPost) {
          scheduledMessageState.setEditMode(userId, matchedPost.id);
          scheduledMessageState.setManagementMode(userId, true);
          await showPostEditor(ctx, matchedPost.id);
          return;
        }
      }
      return next();
    }

    // Button editor has priority — if wait_text, let button handler process it
    const btnState = scheduledMessageState.getButtonState(userId);
    if (btnState === 'wait_text') {
      return next();
    }

    // Bug #8: If scheduleStep is set but text matches a known button, don't consume it
    const knownButtons = [
      '🤖 اتوماسیون', '📨 پیام‌های خودکار',
      '➕ ایجاد پست جدید', '📋 لیست پست‌ها',
      '🔙 بازگشت به پنل ادمین', '➕ افزودن پیام', '⏰ تنظیم زمان‌بندی',
      '👥 انتخاب گروه', '📖 دستور', '✅ انتشار', '📊 آمار',
      '🧪 ارسال تستی', '📊 وضعیت Scheduler',
      '🗑 حذف پست', '🔙 بازگشت', '🔙 بازگشت به لیست', '❌ لغو',
      '❌ حذف دستور', '🔘 مدیریت دکمه‌ها',
      '✏️ ویرایش محتوا', '📝 ویرایش عنوان',
      '⬆️ بالا', '⬇️ پایین', '⬅️ چپ', '➡️ راست',
      '✅ تایید جابه‌جایی', '❌ لغو جابجایی',
    ];
    if (scheduleStep && knownButtons.includes(text)) {
      // Let the hears handlers process it
      return next();
    }

    // ── Title input (creating) ──
    if (isCreating) {
      const title = validateDbInput(text, 'title');
      const msg = await scheduledMessageService.create({ title, createdBy: BigInt(userId) });
      cache.del(`sched:${userId}:creating`);
      scheduledMessageState.setEditingMessage(userId, msg.id);
      scheduledMessageState.setEditMode(userId, msg.id);
      scheduledMessageState.setManagementMode(userId, true);
      await ctx.reply(
        `✅ پست ساخته شد!\n\nعنوان: ${title}\nشناسه: ${msg.id}`,
        scheduledMessageNewPostManagerReplyKeyboard(),
      );
      return;
    }

    // ── Title input (editing) ──
    if (isEditingTitle) {
      const msgId = scheduledMessageState.getEditingMessage(userId);
      if (!msgId) return next();
      const title = validateDbInput(text, 'title');
      await scheduledMessageService.update(msgId, { title });
      scheduledMessageState.setEditingTitle(userId, false);
      scheduledMessageState.setEditingMessage(userId, 0);
      await ctx.reply(`✅ عنوان به "${title}" تغییر کرد.`);
      await showPostEditor(ctx, msgId);
      return;
    }

    // ── Content input — save ALL fields from the message ──
    if (isEditingContent) {
      const editMsgId = scheduledMessageState.getEditingMessage(userId);
      const msgId = scheduledMessageState.getEditMode(userId);
      if (!msgId) return next();

      const msg = ctx.message as any;
      const isForward = !!(msg.forward_origin || msg.forward_from_chat || msg.forward_from || msg.forward_date || msg.forward_sender_name);

      if (isForward) {
        // Save as forward type (not extracted text)
        let originChatId: number | null = null;
        let originMessageId: number | null = null;
        const fo = msg.forward_origin;
        if (fo) {
          if (fo.type === 'channel') {
            originChatId = fo.chat?.id ? Number(fo.chat.id) : null;
            originMessageId = fo.message_id || null;
          } else if (fo.type === 'chat') {
            originChatId = fo.sender_chat?.id ? Number(fo.sender_chat.id) : null;
            originMessageId = msg.forward_from_message_id || null;
          }
        } else if (msg.forward_from_chat) {
          originChatId = msg.forward_from_chat.id ? Number(msg.forward_from_chat.id) : null;
          originMessageId = msg.forward_from_message_id || null;
        } else if (msg.forward_from) {
          originChatId = msg.forward_from.id ? Number(msg.forward_from.id) : null;
          originMessageId = msg.forward_from_message_id || null;
        }

        if (originChatId && originMessageId && !isNaN(originChatId) && !isNaN(originMessageId)) {
          // Validate forward source by trying a copy
          try {
            await ctx.telegram.copyMessage(ctx.chat.id, originChatId, originMessageId);
          } catch {
            await ctx.reply('⚠️ منبع پیام فوروارد در دسترس نیست.\nاین پیام را دوباره از منبع ثبت کنید.');
            return;
          }

          const forwardSource = { chatId: originChatId, messageId: originMessageId };

          if (editMsgId === -1) {
            const newMsg = await scheduledMessageService.addMessage(msgId);
            await scheduledMessageService.updateMessage(newMsg.id, { type: 'forward' as any, forwardSource });
          } else if (editMsgId) {
            await scheduledMessageService.updateMessage(editMsgId, { type: 'forward' as any, forwardSource });
          }

          scheduledMessageState.setEditingContent(userId, false);
          scheduledMessageState.setEditingMessage(userId, 0);
          await ctx.reply('✅ پیام فورواردی اضافه شد');
          await showPostEditor(ctx, msgId);
          return;
        }
        // Fall through to regular text save if forward source is invalid
      }

      // Extract all Telegram message data (non-forward path)
      const entities = ctx.message.entities?.map((e: any) => ({
        type: e.type, offset: e.offset, length: e.length,
        url: e.url, user: e.user, language: e.language, custom_emoji_id: e.custom_emoji_id,
      })) || [];
      const replyMarkup = ctx.message.reply_markup || null;

      const updateData: any = { text };

      // Save entities if present
      if (entities.length > 0) {
        updateData.entities = entities;
      }

      // Save inline keyboard if present
      if (replyMarkup?.inline_keyboard) {
        updateData.replyMarkup = replyMarkup;
      }

      if (editMsgId === -1) {
        const newMsg = await scheduledMessageService.addMessage(msgId);
        await scheduledMessageService.updateMessage(newMsg.id, updateData);
      } else if (editMsgId) {
        await scheduledMessageService.updateMessage(editMsgId, updateData);
      }

      scheduledMessageState.setEditingContent(userId, false);
      scheduledMessageState.setEditingMessage(userId, 0);
      await ctx.reply('✅ پیام ذخیره شد.');
      await showPostEditor(ctx, msgId);
      return;
    }

    // ── Command input (Bug #11) ──
    if (scheduleStep === 'command_input') {
      const msgId = scheduledMessageState.getEditMode(userId);
      if (!msgId) return next();
      const cmd = text.trim().toLowerCase().replace(/^\//, '');
      if (!cmd || cmd.length < 1) {
        await ctx.reply('❌ لطفاً یک نام دستور معتبر وارد کنید.');
        return;
      }
      await prisma.scheduledMessage.update({ where: { id: msgId }, data: { slug: cmd } as any });
      scheduledMessageState.setScheduleStep(userId, null as any);
      await ctx.reply(`✅ دستور /${cmd} ثبت شد.`);
      await showPostEditor(ctx, msgId);
      return;
    }

    // ── Custom interval input ──
    if (scheduleStep === 'custom_interval') {
      const hours = parseInt(text, 10);
      if (isNaN(hours) || hours < 1) {
        await ctx.reply('❌ لطفاً یک عدد معتبر وارد کنید (حداقل ۱).');
        return;
      }
      scheduledMessageState.setIntervalHours(userId, hours);
      scheduledMessageState.setScheduleStep(userId, 'start_time');
      // Save intervalMinutes to DB immediately
      const msgId = scheduledMessageState.getSchedulingMode(userId) || scheduledMessageState.getEditMode(userId);
      if (msgId) {
        await scheduledMessageRepository.update(msgId, { intervalMinutes: hours });
        logger.info(`[SchedMsg] Saved intervalMinutes=${hours} to msg=${msgId}`);
      }
      const displayText = hours >= 60 ? `هر ${hours / 60} ساعت` : `هر ${hours} دقیقه`;
      await ctx.reply(`✅ بازه: ${displayText}\n\n⏰ ساعت شروع ارسال را وارد کنید.\nمثال:\n09:00\n14:30\n22:15`);
      return;
    }

    // ── Start time input — save to DB, don't clear all state ──
    if (scheduleStep === 'start_time') {
      const timeRegex = /^([01]?\d|2[0-3]):([0-5]\d)$/;
      if (!timeRegex.test(text)) {
        await ctx.reply('❌ فرمت ساعت نامعتبر است.\nمثال: 09:00 یا 14:30');
        return;
      }
      scheduledMessageState.setStartTime(userId, text);
      scheduledMessageState.setScheduleStep(userId, null as any);

      // Save startTime + intervalMinutes to DB individually
      const msgId = scheduledMessageState.getSchedulingMode(userId) || scheduledMessageState.getEditMode(userId);
      if (msgId) {
        const intervalMinutes = scheduledMessageState.getIntervalHours(userId);
        await scheduledMessageRepository.update(msgId, {
          startTime: text,
          ...(intervalMinutes ? { intervalMinutes } : {}),
        });
        logger.info(`[SchedMsg] Saved startTime=${text} intervalMinutes=${intervalMinutes} to msg=${msgId}`);
      }
      // DON'T clearAll — preserve editMode, schedulingMode, targetGroup etc.
      if (msgId) {
        await ctx.reply('✅ ساعت شروع ذخیره شد.');
        await showPostEditor(ctx, msgId);
      }
      return;
    }

    // ── Group selection via Reply Keyboard (scene-based) ──
    if (scheduleStep === 'select_group' || scheduledMessageState.getBindingScene(userId) === 'SELECT_GROUP') {
      if (text === '❌ لغو') {
        scheduledMessageState.clearBindingScene(userId);
        const editMsgId = scheduledMessageState.getEditMode(userId);
        if (editMsgId) await showPostEditor(ctx, editMsgId);
        return;
      }
      const groups = await prisma.telegramGroup.findMany({
        where: { status: 'APPROVED', botIsAdmin: true },
        orderBy: { addedAt: 'desc' },
      });
      const matched = groups.find((g) => g.title === text);
      if (!matched) return next();

      const chatId = Number(matched.chatId);
      const editMsgId = scheduledMessageState.getEditMode(userId);
      logger.info(`[SchedMsg] GROUP_SELECTED user=${userId} chatId=${chatId} title=${matched.title}`);

      // Verify forum status from Telegram API
      let realIsForum = matched.isForum;
      try {
        const chatInfo = await ctx.telegram.getChat(matched.chatId.toString());
        realIsForum = (chatInfo as any).is_forum ?? false;
        if (realIsForum !== matched.isForum) {
          await prisma.telegramGroup.update({ where: { chatId: matched.chatId }, data: { isForum: realIsForum } });
        }
      } catch (err: any) {
        logger.warn(`[SchedMsg] FORUM_CHECK_FAILED user=${userId} chatId=${chatId} error=${err.message}`);
      }

      // Load existing bindings from DB
      let existingTopics: { topicId: number; topicName: string }[] = [];
      if (editMsgId) {
        const existingBindings = await scheduledMessageRepository.getBindingsByScheduledMessage(editMsgId);
        const groupBindings = existingBindings.filter(b => b.chatId === matched.chatId);
        existingTopics = groupBindings
          .filter(b => b.topicId != null)
          .map(b => ({ topicId: Number(b.topicId), topicName: '' }));
        for (const et of existingTopics) {
          const topic = await prisma.forumTopic.findFirst({ where: { chatId: matched.chatId, topicId: et.topicId } });
          et.topicName = topic?.name || `Topic ${et.topicId}`;
        }
        logger.info(`[SchedMsg] DB_BINDINGS_LOADED user=${userId} chatId=${chatId} existingTopics=${existingTopics.length}`);
      }

      if (!realIsForum) {
        // Non-forum: save group directly
        if (editMsgId) {
          await scheduledMessageRepository.update(editMsgId, { targetChatId: matched.chatId });
        }
        scheduledMessageState.clearBindingScene(userId);
        await ctx.reply(`✅ گروه "${matched.title}" انتخاب شد.`);
        if (editMsgId) await showPostEditor(ctx, editMsgId);
        return;
      }

      // Forum group — sync topics (exclude General topic, topicId=1)
      const topics = (await prisma.forumTopic.findMany({
        where: { chatId: matched.chatId, isClosed: false, NOT: { topicId: 1 } },
        orderBy: { topicId: 'asc' },
      })).filter(t => t.name !== 'General');
      logger.info(`[SchedMsg] TOPIC_SYNC_COMPLETED user=${userId} chatId=${chatId} count=${topics.length}`);

      // Build pending binding with restored topics
      const pending = scheduledMessageState.getPendingBindings(userId);
      const filtered = pending.filter((b: any) => b.chatId !== matched.chatId.toString());
      filtered.push({ chatId: matched.chatId.toString(), chatTitle: matched.title, isForum: true, topics: [...existingTopics] });
      scheduledMessageState.setPendingBindings(userId, filtered);
      scheduledMessageState.setCurrentGroupForTopic(userId, matched.chatId.toString());
      scheduledMessageState.setBindingScene(userId, 'SELECT_TOPIC');

      // ALWAYS show Reply Keyboard with all topics
      logger.info(`[SchedMsg] SHOW_TOPIC_MENU user=${userId} chatId=${chatId} allTopics=${topics.length} existingSelections=${existingTopics.length}`);
      await ctx.reply(`📎 تاپیک‌های «${matched.title}» را انتخاب کنید:`, buildDestinationTopicKeyboard(topics));

      if (existingTopics.length > 0) {
        const statusText = buildTopicStatusText(matched.title, existingTopics);
        const inlineKb = buildTopicStatusInlineKeyboard(existingTopics, 'sched');
        const sent = await ctx.reply(statusText, inlineKb);
        scheduledMessageState.setBindingReviewMsgId(userId, sent.message_id);
      }
      return;
    }

    // ── Topic selection via Reply Keyboard (scene-based) ──
    if (scheduledMessageState.getBindingScene(userId) === 'SELECT_TOPIC') {
      if (text === '❌ لغو') {
        scheduledMessageState.clearBindingScene(userId);
        const editMsgId = scheduledMessageState.getEditMode(userId);
        if (editMsgId) await showPostEditor(ctx, editMsgId);
        return;
      }
      if (text === '⬅️ بازگشت') {
        scheduledMessageState.setBindingScene(userId, 'SELECT_GROUP');
        const groups = await prisma.telegramGroup.findMany({
          where: { status: 'APPROVED', botIsAdmin: true },
          orderBy: { addedAt: 'desc' },
        });
        await ctx.reply('👥 گروه مقصد را انتخاب کنید:', buildDestinationGroupKeyboard(groups));
        return;
      }

      const chatIdStr = scheduledMessageState.getCurrentGroupForTopic(userId);
      if (!chatIdStr) return next();

      const cleanName = text.replace(/^📂 /, '');
      const topic = await prisma.forumTopic.findFirst({
        where: { chatId: BigInt(chatIdStr), name: cleanName, isClosed: false },
      });
      if (!topic) {
        await ctx.reply('❌ تاپیک یافت نشد. دوباره انتخاب کنید.');
        return;
      }

      const pending = scheduledMessageState.getPendingBindings(userId);
      const groupBinding = pending.find((b: any) => b.chatId === chatIdStr);
      if (!groupBinding) return next();

      groupBinding.topics.push({ topicId: topic.topicId, topicName: topic.name });
      scheduledMessageState.setPendingBindings(userId, pending);
      logger.info(`[SchedMsg] TOPIC_SELECTED user=${userId} topicId=${topic.topicId} name=${topic.name}`);

      // Send NEW message each time
      const statusText = buildTopicStatusText(groupBinding.chatTitle, groupBinding.topics);
      const inlineKb = buildTopicStatusInlineKeyboard(groupBinding.topics, 'sched');
      const sent = await ctx.reply(statusText, inlineKb);
      scheduledMessageState.setBindingReviewMsgId(userId, sent.message_id);
      return;
    }

    return next();
  });

  // ─── Media handler — save ALL media data (mirrors Post importFromTelegram) ──
  bot.on(['photo', 'video', 'animation', 'document', 'audio', 'voice', 'video_note', 'sticker'], async (ctx: any, next: any) => {
    const userId = ctx.from.id;
    const isEditingContent = scheduledMessageState.isEditingContent(userId);
    if (!isEditingContent) return next();

    const editMsgId = scheduledMessageState.getEditingMessage(userId);
    const msgId = scheduledMessageState.getEditMode(userId);
    if (!msgId) return next();

    const msg = ctx.message as any;

    // Extract media file_id (same logic as Post)
    let mediaFileId = '';
    let mediaType = '';
    if (msg.photo) { const p = msg.photo[msg.photo.length - 1]; mediaFileId = p.file_id; mediaType = 'photo'; }
    else if (msg.video) { mediaFileId = msg.video.file_id; mediaType = 'video'; }
    else if (msg.animation) { mediaFileId = msg.animation.file_id; mediaType = 'animation'; }
    else if (msg.document) { mediaFileId = msg.document.file_id; mediaType = 'document'; }
    else if (msg.audio) { mediaFileId = msg.audio.file_id; mediaType = 'audio'; }
    else if (msg.voice) { mediaFileId = msg.voice.file_id; mediaType = 'voice'; }
    else if (msg.video_note) { mediaFileId = msg.video_note.file_id; mediaType = 'video_note'; }
    else if (msg.sticker) { mediaFileId = msg.sticker.file_id; mediaType = 'sticker'; }

    if (!mediaFileId) return next();

    // Extract caption and entities (same as Post)
    const caption = msg.caption || '';
    const captionEntities = msg.caption_entities || [];
    const entities = msg.entities || [];
    const replyMarkup = msg.reply_markup || null;

    // ── Forward detection — save as type 'forward' if valid ──
    const isForward = !!(msg.forward_origin || msg.forward_from_chat || msg.forward_from || msg.forward_date || msg.forward_sender_name);
    if (isForward) {
      let originChatId: number | null = null;
      let originMessageId: number | null = null;
      const fo = msg.forward_origin;
      if (fo) {
        if (fo.type === 'channel') {
          originChatId = fo.chat?.id ? Number(fo.chat.id) : null;
          originMessageId = fo.message_id || null;
        } else if (fo.type === 'chat') {
          originChatId = fo.sender_chat?.id ? Number(fo.sender_chat.id) : null;
          originMessageId = msg.forward_from_message_id || null;
        }
      } else if (msg.forward_from_chat) {
        originChatId = msg.forward_from_chat.id ? Number(msg.forward_from_chat.id) : null;
        originMessageId = msg.forward_from_message_id || null;
      } else if (msg.forward_from) {
        originChatId = msg.forward_from.id ? Number(msg.forward_from.id) : null;
        originMessageId = msg.forward_from_message_id || null;
      }

      if (originChatId && originMessageId && !isNaN(originChatId) && !isNaN(originMessageId)) {
        // Validate forward source
        try {
          await ctx.telegram.copyMessage(ctx.chat.id, originChatId, originMessageId);
        } catch {
          await ctx.reply('⚠️ منبع پیام فوروارد در دسترس نیست.\nاین پیام را دوباره از منبع ثبت کنید.');
          return;
        }

        const forwardSource = { chatId: originChatId, messageId: originMessageId };

        if (editMsgId === -1) {
          const newMsg = await scheduledMessageService.addMessage(msgId);
          await scheduledMessageService.updateMessage(newMsg.id, { type: 'forward' as any, forwardSource });
        } else if (editMsgId) {
          await scheduledMessageService.updateMessage(editMsgId, { type: 'forward' as any, forwardSource });
        }

        scheduledMessageState.setEditingContent(userId, false);
        scheduledMessageState.setEditingMessage(userId, 0);
        await ctx.reply('✅ پیام فورواردی اضافه شد');
        await showPostEditor(ctx, msgId);
        return;
      }
      // Fall through to media save if forward source invalid (e.g. hidden_user)
    }

    // Extract media_group_id for album support (same as Post)
    const mediaGroupId = msg.media_group_id || null;

    // Build the full update object (mirrors Post importFromTelegram)
    const update: any = {
      text: caption || msg.text || '',
      type: mediaType,
      mediaFileId,
      caption: caption || undefined,
      captionEntities: captionEntities.length > 0 ? captionEntities : undefined,
      entities: entities.length > 0 ? entities : undefined,
      replyMarkup: replyMarkup || undefined,
      parseMode: 'None',
      forwardSource: undefined,
      mediaGroupId: mediaGroupId || undefined,
    };

    let targetMsgId = editMsgId;
    if (editMsgId === -1) {
      const newMsg = await scheduledMessageService.addMessage(msgId);
      targetMsgId = newMsg.id;
    }

    if (targetMsgId && targetMsgId > 0) {
      await scheduledMessageService.updateMessage(targetMsgId, update);
      logger.info(`[SchedMsgMedia] Saved: msgId=${targetMsgId} type=${mediaType} file_id=${mediaFileId} caption="${caption.substring(0, 50)}" entities=${entities.length} captionEntities=${captionEntities.length} mediaGroup=${mediaGroupId}`);
    }

    scheduledMessageState.setEditingContent(userId, false);
    scheduledMessageState.setEditingMessage(userId, 0);
    await ctx.reply(`✅ ${mediaType} ذخیره شد.`);
    await showPostEditor(ctx, msgId);
  });

  // ─── Callback: View post ────────────────────────────────
  bot.action(/^sched:view:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const id = parseInt(ctx.match[1]);
    scheduledMessageState.setEditMode(ctx.from.id, id);
    scheduledMessageState.setManagementMode(ctx.from.id, true);
    await showPostEditor(ctx, id);
  });

  // ─── Callback: List with pagination ─────────────────────
  bot.action(/^sched:list:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const page = parseInt(ctx.match[1]);
    await sendList(ctx, page);
  });

  // ─── Callback: Schedule config ──────────────────────────
  bot.action(/^sched:schedule:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const id = parseInt(ctx.match[1]);
    scheduledMessageState.setSchedulingMode(ctx.from.id, id);
    scheduledMessageState.setScheduleStep(ctx.from.id, 'interval');
    await ctx.reply('⏰ بازه زمانی ارسال را انتخاب کنید:', scheduleIntervalKeyboard());
  });

  // ─── Callback: Interval selection — save to DB immediately ──
  bot.action(/^sched:interval:(\d+|custom)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const value = ctx.match[1];
    const userId = ctx.from.id;

    if (value === 'custom') {
      scheduledMessageState.setScheduleStep(userId, 'custom_interval');
      await ctx.reply('⏰ زمان سفارشی برحسب ساعت وارد شود.\n\nلطفاً تعداد ساعت موردنظر را ارسال کنید:\nمثال: 1, 5, 12, 48, 72');
      return;
    }

    const hours = parseInt(value);
    scheduledMessageState.setIntervalHours(userId, hours);
    scheduledMessageState.setScheduleStep(userId, 'start_time');

    // Save intervalMinutes to DB immediately
    const msgId = scheduledMessageState.getSchedulingMode(userId) || scheduledMessageState.getEditMode(userId);
    if (msgId) {
      await scheduledMessageRepository.update(msgId, { intervalMinutes: hours });
      logger.info(`[SchedMsg] Saved intervalMinutes=${hours} to msg=${msgId}`);
    }

    const displayText = hours >= 60 ? `هر ${hours / 60} ساعت` : `هر ${hours} دقیقه`;
    await ctx.reply(`✅ بازه: ${displayText}\n\n⏰ ساعت شروع ارسال را وارد کنید.\nمثال:\n09:00\n14:30\n22:15`);
  });

  // ─── Callback: Group selection via inline (for validation goto) ──
  bot.action(/^sched:group:([\-\d]+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const chatId = parseInt(ctx.match[1]);
    const userId = ctx.from.id;
    scheduledMessageState.setTargetGroup(userId, chatId);

    // Save group to DB immediately
    const msgId = scheduledMessageState.getEditMode(userId);
    if (msgId) {
      await scheduledMessageRepository.update(msgId, { targetChatId: BigInt(chatId) });
      logger.info(`[SchedMsg] Saved targetChatId=${chatId} to msg=${msgId}`);
    }

    // Check forum topics from ForumTopic table
    const topics = await forumTopicService.getTopicsForChat(chatId);
    if (topics.length > 0) {
      scheduledMessageState.setScheduleStep(userId, 'select_topic');
      await ctx.reply('📌 تاپیک مقصد را انتخاب کنید:', scheduleTopicReplyKeyboard(topics));
      return;
    }

    if (msgId) {
      await ctx.reply(`✅ گروه انتخاب شد.`);
      await showPostEditor(ctx, msgId);
    }
    scheduledMessageState.clearAll(userId);
  });

  // ─── Callback: Publish ──────────────────────────────────
  bot.action(/^sched:publish:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const id = parseInt(ctx.match[1]);
    // Bug #10: Read from DB directly
    const msg = await scheduledMessageRepository.findById(id);
    if (!msg) return;

    const { ready, missing } = validatePublishReadiness(msg);
    if (!ready) {
      const missingList = missing.map((m) => `❌ ${m.label.replace(/^[^\s]+ /, '')}`).join('\n');
      await ctx.reply(
        `این پست هنوز آماده انتشار نیست.\nبخش‌های تکمیل‌نشده:\n${missingList}`,
        scheduledMessagePublishValidationKeyboard(missing),
      );
      return;
    }

    await scheduledMessageService.publish(id);
    await ctx.reply('✅ پست منتشر شد!');
    await showPostEditor(ctx, id);
  });

  // ─── Topic binding: remove topic from selection ──────────
  bot.action(/^sched:dest:remove_topic:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const topicId = parseInt(ctx.match[1]);
    const pending = scheduledMessageState.getPendingBindings(userId);
    const lastGroup = pending[pending.length - 1];
    if (!lastGroup) return;

    const idx = lastGroup.topics.findIndex((t: any) => t.topicId === topicId);
    if (idx >= 0) {
      const removed = lastGroup.topics.splice(idx, 1)[0];
      scheduledMessageState.setPendingBindings(userId, pending);
      logger.info(`[SchedMsg] TOPIC_REMOVED user=${userId} topicId=${topicId} name=${removed.topicName}`);
    }

    if (lastGroup.topics.length === 0) {
      const statusMsg = `✅ مقصد انتخاب شد\n\nگروه: ${lastGroup.chatTitle}\n(هیچ تاپیکی انتخاب نشده)`;
      const sent = await ctx.reply(statusMsg, Markup.inlineKeyboard([[Markup.button.callback('✅ تایید نهایی', 'sched:dest:final_confirm')]]));
      scheduledMessageState.setBindingReviewMsgId(userId, sent.message_id);
    } else {
      const statusText = buildTopicStatusText(lastGroup.chatTitle, lastGroup.topics);
      const inlineKb = buildTopicStatusInlineKeyboard(lastGroup.topics, 'sched');
      const sent = await ctx.reply(statusText, inlineKb);
      scheduledMessageState.setBindingReviewMsgId(userId, sent.message_id);
    }
  });

  // ─── Topic binding: final confirm → persist to DB ────────
  bot.action('sched:dest:final_confirm', async (ctx: any) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const msgId = scheduledMessageState.getEditMode(userId);
    const pending = scheduledMessageState.getPendingBindings(userId);
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

    await scheduledMessageRepository.bulkCreateBindings(msgId, bindingsData);

    // Also update the ScheduledMessage record's targetChatId/targetTopicId
    // from the first non-global binding (for backward compatibility)
    const firstBinding = bindingsData.find(b => !b.isGlobal);
    if (firstBinding) {
      await scheduledMessageRepository.update(msgId, {
        targetChatId: firstBinding.chatId,
        targetTopicId: firstBinding.topicId != null ? BigInt(firstBinding.topicId) : null,
      });
    } else {
      await scheduledMessageRepository.update(msgId, {
        targetChatId: null,
        targetTopicId: null,
      });
    }

    scheduledMessageState.clearBindingScene(userId);

    logger.info(`[SchedMsg] BINDING_UPDATED user=${userId} msgId=${msgId} total=${bindingsData.length}`);
    await ctx.reply(`✅ ${bindingsData.length} مقصد ذخیره شد.`);
    await showPostEditor(ctx, msgId);
  });

  // ─── Callback: Unpublish ────────────────────────────────
  bot.action(/^sched:unpublish:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const id = parseInt(ctx.match[1]);
    await scheduledMessageService.unpublish(id);
    await ctx.reply('📤 ارسال متوقف شد.');
    await showPostEditor(ctx, id);
  });

  // ─── Callback: Delete ───────────────────────────────────
  bot.action(/^sched:delete:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const id = parseInt(ctx.match[1]);
    const msg = await scheduledMessageRepository.findById(id);
    await ctx.reply(
      `⚠️ آیا از حذف "${msg?.title}" مطمئن هستید؟`,
      scheduledMessageDeleteConfirmKeyboard(id),
    );
  });

  bot.action(/^sched:delete:confirm:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const id = parseInt(ctx.match[1]);
    await scheduledMessageService.delete(id);
    await ctx.reply('🗑 حذف شد.');
    scheduledMessageState.clearAll(ctx.from.id);
    await sendList(ctx, 1);
  });

  // ─── Callback: Message edit — show editor keyboard first ──
  bot.action(/^sched:msg:edit:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const msgId = parseInt(ctx.match[1]);
    // Set editing message but NOT editing content yet
    scheduledMessageState.setEditingMessage(ctx.from.id, msgId);
    // Show the message edit reply keyboard (NOT content editing)
    const msg = await prisma.scheduledMessageMessage.findUnique({ where: { id: msgId } });
    await ctx.reply(
      `📝 پیام ${msg?.order !== undefined ? msg.order + 1 : ''}\n\nمحتوای فعلی:\n${msg?.text || '(خالی)'}`,
      scheduledMessageEditMessageReplyKeyboard(),
    );
  });

  // Content editing — set state to receive new content
  bot.hears('✏️ ویرایش محتوا', async (ctx: any, next) => {
    const msgId = scheduledMessageState.getEditingMessage(ctx.from.id);
    if (!msgId) return next();
    scheduledMessageState.setEditingContent(ctx.from.id, true);
    const msg = await prisma.scheduledMessageMessage.findUnique({ where: { id: msgId } });
    await ctx.reply(
      `📝 محتوای پیام را ویرایش کنید:\n\nمحتوای فعلی:\n${msg?.text || '(خالی)'}`,
      scheduledMessageCancelOnlyKeyboard(),
    );
  });

  bot.hears('📝 ویرایش عنوان', async (ctx: any, next) => {
    const msgId = scheduledMessageState.getEditingMessage(ctx.from.id);
    if (!msgId) return next();
    scheduledMessageState.setEditingTitle(ctx.from.id, true);
    const msg = await scheduledMessageRepository.findById(msgId);
    await ctx.reply(
      `✏ عنوان فعلی: *${msg?.title || ''}*\n\nعنوان جدید را ارسال کنید:`,
      { parse_mode: 'Markdown', ...scheduledMessageCancelOnlyKeyboard() },
    );
  });

  // ─── Button Editor: Enter via Reply Keyboard ──
  bot.hears('🔘 مدیریت دکمه‌ها', async (ctx: any, next) => {
    const userId = ctx.from.id;

    const msgId = scheduledMessageState.getEditingMessage(userId);
    if (!msgId || msgId <= 0) return next();

    const buttons = await scheduledMessageRepository.findButtonsByMessage(msgId);
    const grid = buttonsToGrid(buttons);
    const { text, reply_markup } = renderScheduledButtonEditor(msgId, grid, 'create');
    const sent = await ctx.reply(text, { reply_markup });
    if (sent) scheduledMessageState.setButtonEditorMsgId(userId, sent.message_id);
    scheduledMessageState.setButtonMode(userId, 'create');
  });

  // ─── Button Editor: Enter via inline callback ──
  bot.action(/^sched:msg:btnedit:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const msgId = parseInt(ctx.match[1]);
    logger.info(`[ButtonEditor] Inline Button Clicked msgId=${msgId}`);

    scheduledMessageState.setEditingMessage(userId, msgId);

    logger.info(`[ButtonEditor] Loading buttons for messageId=${msgId}`);
    const buttons = await scheduledMessageRepository.findButtonsByMessage(msgId);
    logger.info(`[ButtonEditor] Buttons Loaded: ${buttons.length}`);

    const grid = buttonsToGrid(buttons);
    const { text, reply_markup } = renderScheduledButtonEditor(msgId, grid, 'create');
    logger.info(`[ButtonEditor] Render Inline Keyboard`);

    const sent = await ctx.reply(text, { reply_markup });
    if (sent) {
      scheduledMessageState.setButtonEditorMsgId(userId, sent.message_id);
      logger.info(`[ButtonEditor] Editor Sent Successfully, editorMsgId=${sent.message_id}`);
    } else {
      logger.error(`[ButtonEditor] Failed to send editor message`);
    }
    scheduledMessageState.setButtonMode(userId, 'create');
  });

  // ─── Callback: Message delete ───────────────────────────
  bot.action(/^sched:msg:delete:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const msgId = parseInt(ctx.match[1]);
    const msg = await prisma.scheduledMessageMessage.findUnique({ where: { id: msgId } });
    if (msg) {
      await scheduledMessageService.deleteMessage(msgId);
      await ctx.reply('🗑 پیام حذف شد.');
      if (msg.scheduledMessageId) {
        await showPostEditor(ctx, msg.scheduledMessageId);
      }
    }
  });

  // ─── Callback: Message move up ──────────────────────────
  bot.action(/^sched:msg:up:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const schedMsgId = parseInt(ctx.match[1]);
    const msgId = parseInt(ctx.match[2]);
    const messages = await scheduledMessageService.listMessages(schedMsgId);
    const idx = messages.findIndex((m: any) => m.id === msgId);
    if (idx > 0) {
      const ids = messages.map((m: any) => m.id);
      [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
      await scheduledMessageService.reorderMessages(schedMsgId, ids);
    }
    await showPostEditor(ctx, schedMsgId);
  });

  // ─── Callback: Message move down ────────────────────────
  bot.action(/^sched:msg:down:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const schedMsgId = parseInt(ctx.match[1]);
    const msgId = parseInt(ctx.match[2]);
    const messages = await scheduledMessageService.listMessages(schedMsgId);
    const idx = messages.findIndex((m: any) => m.id === msgId);
    if (idx < messages.length - 1) {
      const ids = messages.map((m: any) => m.id);
      [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
      await scheduledMessageService.reorderMessages(schedMsgId, ids);
    }
    await showPostEditor(ctx, schedMsgId);
  });

  // ─── Callback: Message add — set state, create on delivery ──
  bot.action(/^sched:msg:add:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    // Don't create message yet — just set state
    scheduledMessageState.setEditingMessage(ctx.from.id, -1);
    scheduledMessageState.setEditingContent(ctx.from.id, true);
    await ctx.reply(
      'پیام جدید را ارسال کنید.\nمی‌توانید متن، عکس، ویدیو، فایل، گیف، پیام فوروارد شده یا هر نوع پیام پشتیبانی‌شده توسط سیستم Post را ارسال کنید.',
      scheduledMessageAddMessageKeyboard(),
    );
  });

  // ─── Callback: Publish validation goto ──────────────────
  bot.action(/^sched:goto:(\w+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const field = ctx.match[1];
    const userId = ctx.from.id;
    const msgId = scheduledMessageState.getEditMode(userId);
    if (!msgId) return;

    if (field === 'schedule') {
      scheduledMessageState.setSchedulingMode(userId, msgId);
      scheduledMessageState.setScheduleStep(userId, 'interval');
      await ctx.reply('⏰ بازه زمانی ارسال را انتخاب کنید:', scheduleIntervalKeyboard());
    } else if (field === 'group') {
      const groups = await prisma.telegramGroup.findMany({
        where: { status: 'APPROVED', botIsAdmin: true },
        orderBy: { addedAt: 'desc' },
      });
      if (!groups.length) {
        await ctx.reply('گروه تأییدشده‌ای وجود ندارد.');
        return;
      }
      scheduledMessageState.setScheduleStep(userId, 'select_group');
      // Bug #4: Use Reply Keyboard for group selection
      await ctx.reply('👥 گروه مقصد را انتخاب کنید:', scheduleGroupReplyKeyboard(groups));
    } else if (field === 'messages') {
      // Don't create message yet — set state for content delivery
      scheduledMessageState.setEditingMessage(userId, -1);
      scheduledMessageState.setEditingContent(userId, true);
      await ctx.reply(
        'پیام جدید را ارسال کنید.\nمی‌توانید متن، عکس، ویدیو، فایل، گیف، پیام فوروارد شده یا هر نوع پیام پشتیبانی‌شده توسط سیستم Post را ارسال کنید.',
        scheduledMessageAddMessageKeyboard(),
      );
    }
  });

  // ─── Callback: Dashboard refresh ────────────────────────
  bot.action('sched:dashboard:refresh', async (ctx: any) => {
    await ctx.answerCbQuery();
    const stats = await scheduledMessageService.getStats();
    const text = [
      '📊 گزارش ارسال خودکار',
      '',
      `🟢 پیام‌های فعال: ${stats.activeMessages}`,
      `📤 ارسال امروز: ${stats.todaySends}`,
      `📤 ارسال هفته: ${stats.weekSends}`,
      `👥 گروه‌های فعال: ${stats.activeGroups}`,
      `❌ خطاها: ${stats.errorCount}`,
    ].join('\n');
    await ctx.reply(text, scheduledMessageDashboardKeyboard());
  });

  // ─── Callback: Menu ─────────────────────────────────────
  bot.action('sched:menu', async (ctx: any) => {
    await ctx.answerCbQuery();
    scheduledMessageState.clearAll(ctx.from.id);
    scheduledMessageState.setManagementMode(ctx.from.id, true);
    const result = await scheduledMessageRepository.findAll({ page: 1, limit: 100 });
    await ctx.reply('📨 پیام‌های خودکار', scheduledMessageMainMenuKeyboard(result.items));
  });

  // ─── Button Editor: Click on a button slot ──
  bot.action(/^smbtn:click:(\d+):(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const msgId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    const col = parseInt(ctx.match[3]);
    const mode = scheduledMessageState.getButtonMode(userId) || 'create';
    logger.info(`[ButtonEditor] Click msgId=${msgId} row=${row} col=${col} mode=${mode}`);

    const buttons = await scheduledMessageRepository.findButtonsByMessage(msgId);
    const grid = buttonsToGrid(buttons);

    if (mode === 'move') {
      scheduledMessageState.setButtonMoveSelected(userId, row, col);
      scheduledMessageState.setButtonMoveActive(userId, true);
      const editorMsgId = scheduledMessageState.getButtonEditorMsgId(userId);
      if (editorMsgId) {
        const { text, reply_markup } = renderScheduledButtonEditor(msgId, grid, 'move', { row, col });
        try { await ctx.telegram.editMessageText(ctx.chat.id, editorMsgId, null, text, { reply_markup }); } catch {}
      }
      const moveKb = buildDynamicMoveKeyboard(grid, row, col);
      await ctx.reply(`🔀 "${grid[row]?.[col]?.text || ''}" انتخاب شد. جهت را انتخاب کنید:`, moveKb);
      return;
    }

    if (mode === 'delete') {
      if (grid[row] && grid[row][col]) {
        const btn = grid[row][col];
        if (btn.id) {
          await scheduledMessageRepository.deleteButton(btn.id);
        }
        scheduledMessageState.setButtonMode(userId, 'create');
        await refreshButtonEditor(ctx, msgId);
      }
      return;
    }

    if (mode === 'edit') {
      const btn = grid[row]?.[col];
      if (!btn) return;
      scheduledMessageState.setButtonRow(userId, row);
      scheduledMessageState.setButtonCol(userId, col);
      scheduledMessageState.setButtonMode(userId, 'edit');
      const typeLabel = btn.type === 'POPUP' ? '🪟 POP-UP' : btn.type === 'COMMAND' ? '⌨️ دستور' : btn.type === 'URL' ? '🔗 لینک' : btn.type;
      const valueLabel = btn.type === 'URL' ? 'آدرس' : btn.type === 'COMMAND' ? 'دستور' : btn.type === 'POPUP' ? 'متن پنجره' : 'مقدار';
      const colorText = btn.style ? `🎨 ${btn.style}` : '⚪ بدون رنگ';
      await ctx.editMessageText(
        `🔧 تنظیمات دکمه\n\nℹ️ مقدار فعلی:\n${typeLabel}\n🏷 ${btn.text}\n${valueLabel}: ${btn.value || '(خالی)'}\n${colorText}`,
        buildSmbtnEditTypeKeyboard(msgId, row, col, btn.style),
      );
      return;
    }

    // Create mode — add placeholder button BELOW clicked button, shift existing buttons down
    const msgRecord = await prisma.scheduledMessageMessage.findUnique({ where: { id: msgId } });

    // Shift existing buttons at row >= (row + 1) down by one to make space
    const existingButtons = await prisma.scheduledMessageButton.findMany({
      where: { messageId: msgId, row: { gte: row + 1 } },
      orderBy: [{ row: 'desc' }, { col: 'desc' }],
    });
    for (const btn of existingButtons) {
      await scheduledMessageRepository.updateButton(btn.id, { row: btn.row + 1 });
    }

    const newBtn = await scheduledMessageRepository.createButton({
      scheduledMessageId: msgRecord?.scheduledMessageId || 0,
      messageId: msgId,
      row: row + 1,
      col: 0,
      text: 'دکمه جدید',
      type: 'URL',
      value: '',
    });
    scheduledMessageState.setButtonRow(userId, row + 1);
    scheduledMessageState.setButtonCol(userId, 0);
    scheduledMessageState.setButtonMode(userId, 'edit');
    await refreshButtonEditor(ctx, msgId);
  });

  // ─── Button Editor: Set mode (create/edit/delete/move) ──
  bot.action(/^smbtn:mode:(create|edit|delete|move):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const mode = ctx.match[1];
    const msgId = parseInt(ctx.match[2]);
    logger.info(`[ButtonEditor] Mode change mode=${mode} msgId=${msgId}`);
    scheduledMessageState.setButtonMode(userId, mode);
    scheduledMessageState.setButtonState(userId, '');
    scheduledMessageState.setButtonRow(userId, 0);
    scheduledMessageState.setButtonCol(userId, 0);
    if (mode === 'move') {
      scheduledMessageState.setButtonMoveActive(userId, false);
    }
    await refreshButtonEditor(ctx, msgId);
  });

  // ─── Button Editor: Select type (url/popup/command) ──
  bot.action(/^smbtn:type:(url|popup|command):(\d+):(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const btnType = ctx.match[1];
    const msgId = parseInt(ctx.match[2]);
    const row = parseInt(ctx.match[3]);
    const col = parseInt(ctx.match[4]);
    logger.info(`[ButtonEditor] Type select type=${btnType} msgId=${msgId} row=${row} col=${col}`);
    const currentMode = scheduledMessageState.getButtonMode(userId) || 'edit';
    scheduledMessageState.setButtonPreviousView(userId, currentMode);
    scheduledMessageState.setButtonType(userId, btnType);
    scheduledMessageState.setButtonState(userId, 'wait_text');
    scheduledMessageState.setButtonRow(userId, row);
    scheduledMessageState.setButtonCol(userId, col);

    const typeLabel = btnType === 'popup' ? '🪟 POP-UP' : btnType === 'command' ? '⌨️ دستور' : '🔗 لینک';
    const prompts: Record<string, string> = {
      url: '🔗 داده‌ها را برای URL وارد کنید:\n\n🏷 عنوان دکمه\n🌐 آدرس اینترنتی',
      popup: '🪟 داده‌ها را برای POP-UP وارد کنید:\n\n⚠️ حداکثر ۲۰۰ کاراکتر\n\n🏷 عنوان دکمه\n📝 متن پنجره',
      command: '⌨️ داده‌ها را برای دستور وارد کنید:\n\n🏷 عنوان دکمه\n⌨️ نام دستور (بدون /)',
    };
    await ctx.editMessageText(prompts[btnType] || `${typeLabel}: متن دکمه را وارد کنید:`, {
      reply_markup: { inline_keyboard: [[Markup.button.callback('❌ لغو', `smbtn:type:cancel:${msgId}`)]] },
    });
  });

  // ─── Button Editor: Cancel type selection ──
  bot.action(/^smbtn:type:cancel:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const msgId = parseInt(ctx.match[1]);
    scheduledMessageState.setButtonState(userId, '');
    scheduledMessageState.setButtonType(userId, '');
    const prevMode = scheduledMessageState.getButtonPreviousView(userId) || 'edit';
    scheduledMessageState.setButtonMode(userId, prevMode);
    await refreshButtonEditor(ctx, msgId);
  });

  // ─── Button Editor: Select color ──
  bot.action(/^smbtn:color:(\d+):(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const msgId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    const col = parseInt(ctx.match[3]);
    const currentMode = scheduledMessageState.getButtonMode(userId) || 'edit';
    scheduledMessageState.setButtonPreviousView(userId, currentMode);
    scheduledMessageState.setButtonState(userId, 'wait_color');
    await ctx.editMessageText('🎨 رنگ دکمه را انتخاب کنید:', buildSmbtnColorKeyboard(msgId, row, col));
  });

  // ─── Button Editor: Set color ──
  bot.action(/^smbtn:color:set:(\d+):(\d+):(\d+):(\w+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const msgId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    const col = parseInt(ctx.match[3]);
    const color = ctx.match[4] === 'default' ? undefined : ctx.match[4];
    const buttons = await scheduledMessageRepository.findButtonsByMessage(msgId);
    const grid = buttonsToGrid(buttons);
    const btn = grid[row]?.[col];
    if (btn?.id) {
      await scheduledMessageRepository.updateButton(btn.id, { style: color || undefined });
    }
    scheduledMessageState.setButtonState(userId, '');
    const prevMode = scheduledMessageState.getButtonPreviousView(userId) || 'edit';
    scheduledMessageState.setButtonMode(userId, prevMode);
    await refreshButtonEditor(ctx, msgId);
  });

  // ─── Button Editor: Text input for button name/value ──
  bot.on('text', async (ctx: any, next) => {
    const userId = ctx.from.id;
    const btnState = scheduledMessageState.getButtonState(userId);
    if (btnState !== 'wait_text') return next();
    logger.info(`[ButtonEditor] Text input received for button, state=wait_text`);

    const rawText = ctx.message.text;
    const msgId = scheduledMessageState.getEditingMessage(userId);
    const row = scheduledMessageState.getButtonRow(userId);
    const col = scheduledMessageState.getButtonCol(userId);
    const btnType = scheduledMessageState.getButtonType(userId);
    if (!msgId || row === undefined || col === undefined) return next();

    // Parse two lines: line 1 = button text (display), line 2 = value (URL/command/popup text)
    const lines = rawText.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
    if (lines.length < 2) {
      await ctx.reply('❌ حداقل دو خط وارد کنید:\nخط اول: عنوان دکمه\nخط دوم: مقدار', {
        reply_markup: { inline_keyboard: [[Markup.button.callback('❌ لغو', `smbtn:type:cancel:${msgId}`)]] },
      });
      return;
    }
    const title = lines[0];
    const value = lines.slice(1).join('\n');

    // Validate value based on type
    if (btnType === 'url') {
      if (!value.startsWith('http') && !value.startsWith('https') && !value.startsWith('t.me/') && !value.startsWith('tg://')) {
        await ctx.reply('❌ آدرس نامعتبر است. باید با http://، https://، t.me/ یا tg:// شروع شود.', {
          reply_markup: { inline_keyboard: [[Markup.button.callback('❌ لغو', `smbtn:type:cancel:${msgId}`)]] },
        });
        return;
      }
    }
    if (btnType === 'command') {
      if (!/^[a-z0-9_]+$/.test(value)) {
        await ctx.reply('❌ دستور نامعتبر است. فقط حروف a-z، اعداد 0-9 و زیرخط (_) مجاز است.', {
          reply_markup: { inline_keyboard: [[Markup.button.callback('❌ لغو', `smbtn:type:cancel:${msgId}`)]] },
        });
        return;
      }
    }
    if (btnType === 'popup') {
      if (value.length > 200) {
        await ctx.reply('❌ متن POP-UP نمی‌تواند بیش از ۲۰۰ کاراکتر باشد.', {
          reply_markup: { inline_keyboard: [[Markup.button.callback('❌ لغو', `smbtn:type:cancel:${msgId}`)]] },
        });
        return;
      }
    }

    const buttons = await scheduledMessageRepository.findButtonsByMessage(msgId);
    const grid = buttonsToGrid(buttons);
    const existingBtn = grid[row]?.[col];

    // Map internal type names to DB type values
    const dbType = btnType === 'url' ? 'URL' : btnType === 'command' ? 'COMMAND' : btnType === 'popup' ? 'POPUP' : 'CALLBACK';

    if (existingBtn?.id) {
      // Update existing button
      await scheduledMessageRepository.updateButton(existingBtn.id, {
        text: title,
        type: dbType,
        value,
      });
    } else {
      // Create new button
      await scheduledMessageRepository.createButton({
        scheduledMessageId: msgId,
        messageId: msgId,
        row,
        col,
        text: title,
        type: dbType,
        value,
      });
    }

    scheduledMessageState.setButtonState(userId, '');
    scheduledMessageState.setButtonType(userId, '');
    scheduledMessageState.setButtonMode(userId, 'create');
    await ctx.reply('✅ دکمه ذخیره شد.');
    await refreshButtonEditor(ctx, msgId);
  });

  // ─── Button Editor: Dynamic move keyboard based on grid position ──
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

  // ─── Button Editor: Move direction handler (shared logic) ──
  async function handleSchedMoveDirection(ctx: any, direction: 'up' | 'down' | 'left' | 'right') {
    try {
      const userId = ctx.from.id;
      if (!scheduledMessageState.isButtonMoveActive(userId)) return;
      const msgId = scheduledMessageState.getEditingMessage(userId);
      if (!msgId) return;
      const moveSel = scheduledMessageState.getButtonMoveSelected(userId);
      if (moveSel.row === undefined || moveSel.col === undefined) return;

      const buttons = await scheduledMessageRepository.findButtonsByMessage(msgId);

      // Find the selected button by the cached row/col, then normalize the grid
      const rawGrid = buttonsToGrid(buttons);
      const rawBtn = rawGrid[moveSel.row]?.[moveSel.col];
      if (!rawBtn?.id) return;
      const btnId = rawBtn.id;

      // Normalize grid (collapse sparse entries caused by deleted buttons)
      let grid = normalizeGrid(rawGrid);

      // Find the button in the normalized grid
      const normPos = findButtonInGrid(grid, btnId);
      if (!normPos) return;
      const btn = grid[normPos.row][normPos.col];
      let curRow = normPos.row;
      let curCol = normPos.col;

      if (direction === 'left') {
        if (curCol <= 0) return;
        [grid[curRow][curCol - 1], grid[curRow][curCol]] = [grid[curRow][curCol], grid[curRow][curCol - 1]];
      } else if (direction === 'right') {
        if (curCol >= grid[curRow].length - 1) return;
        [grid[curRow][curCol], grid[curRow][curCol + 1]] = [grid[curRow][curCol + 1], grid[curRow][curCol]];
      } else if (direction === 'down') {
        const wasSingleton = grid[curRow].length === 1;
        grid[curRow].splice(curCol, 1);
        if (grid[curRow].length === 0) grid.splice(curRow, 1);

        if (!wasSingleton) {
          grid.splice(curRow + 1, 0, [btn]);
        } else {
          if (curRow < grid.length) {
            grid[curRow].unshift(btn);
          } else {
            grid.push([btn]);
          }
        }
      } else if (direction === 'up') {
        const wasSingleton = grid[curRow].length === 1;
        grid[curRow].splice(curCol, 1);
        if (grid[curRow].length === 0) grid.splice(curRow, 1);

        if (!wasSingleton) {
          grid.splice(curRow, 0, [btn]);
        } else {
          if (curRow > 0) {
            grid[curRow - 1].unshift(btn);
          } else {
            grid.unshift([btn]);
          }
        }
      }

      // Normalize grid (collapse sparse entries, renumber rows/cols contiguously)
      grid = normalizeGrid(grid);

      // Persist all button positions to DB
      for (let r = 0; r < grid.length; r++) {
        const row = grid[r];
        for (let c = 0; c < row.length; c++) {
          const b = row[c];
          if (b?.id) {
            await scheduledMessageRepository.updateButton(b.id, { row: r, col: c });
          }
        }
      }

      // Find button's new position in the normalized grid
      const newPos = findButtonInGrid(grid, btnId);
      const newRow = newPos ? newPos.row : 0;
      const newCol = newPos ? newPos.col : 0;

      scheduledMessageState.setButtonMoveSelected(userId, newRow, newCol);
      scheduledMessageState.setButtonRow(userId, newRow);
      scheduledMessageState.setButtonCol(userId, newCol);

      // Refresh inline editor
      await refreshButtonEditor(ctx, msgId);

      // Show dynamic move keyboard with only valid directions
      const { text, reply_markup } = renderScheduledButtonEditor(msgId, grid, 'move', { row: newRow, col: newCol });
      const moveKb = buildDynamicMoveKeyboard(grid, newRow, newCol);
      await ctx.reply(`🔀 "${btn.text || ''}" — جهت را انتخاب کنید:`, moveKb);
    } catch (err: any) {
      logger.error(`[SchedMove] ${direction} error: ${err.message}`);
    }
  }

  bot.hears('⬆️ بالا', async (ctx: any, next) => {
    if (!scheduledMessageState.isButtonMoveActive(ctx.from.id)) return next();
    await handleSchedMoveDirection(ctx, 'up');
  });

  bot.hears('⬇️ پایین', async (ctx: any, next) => {
    if (!scheduledMessageState.isButtonMoveActive(ctx.from.id)) return next();
    await handleSchedMoveDirection(ctx, 'down');
  });

  bot.hears('⬅️ چپ', async (ctx: any, next) => {
    if (!scheduledMessageState.isButtonMoveActive(ctx.from.id)) return next();
    await handleSchedMoveDirection(ctx, 'left');
  });

  bot.hears('➡️ راست', async (ctx: any, next) => {
    if (!scheduledMessageState.isButtonMoveActive(ctx.from.id)) return next();
    await handleSchedMoveDirection(ctx, 'right');
  });

  // ─── Button Editor: Move confirm/cancel/return ──
  bot.hears('✅ تایید جابه‌جایی', async (ctx: any, next) => {
    try {
      const userId = ctx.from.id;
      if (!scheduledMessageState.isButtonMoveActive(userId)) return next();
      const msgId = scheduledMessageState.getEditingMessage(userId);
      if (!msgId) return next();

      scheduledMessageState.setButtonMoveActive(userId, false);
      scheduledMessageState.setButtonMode(userId, 'create');
      scheduledMessageState.setButtonState(userId, '');
      scheduledMessageState.setButtonRow(userId, 0);
      scheduledMessageState.setButtonCol(userId, 0);

      try { await ctx.reply('⌨️', { reply_markup: { remove_keyboard: true } }); } catch {}
      await ctx.reply('✅ جابه‌جایی ذخیره شد.');
      const msg = await scheduledMessageRepository.findById(msgId);
      await ctx.reply(formatScheduledMessageInfo(msg), {
        parse_mode: 'Markdown',
        link_preview_options: { is_disabled: true },
        ...scheduledMessageEditMessageReplyKeyboard(),
      });
      await refreshButtonEditor(ctx, msgId);
    } catch (err: any) {
      logger.error(`[SchedMove] confirm error: ${err.message}`);
    }
  });

  bot.hears('🔄 بازگشت', async (ctx: any, next) => {
    try {
      const userId = ctx.from.id;
      if (!scheduledMessageState.isButtonMoveActive(userId)) return next();
      const msgId = scheduledMessageState.getEditingMessage(userId);

      scheduledMessageState.setButtonMoveActive(userId, false);
      scheduledMessageState.setButtonMode(userId, 'create');
      scheduledMessageState.setButtonState(userId, '');
      scheduledMessageState.setButtonRow(userId, 0);
      scheduledMessageState.setButtonCol(userId, 0);

      try { await ctx.reply('⌨️', { reply_markup: { remove_keyboard: true } }); } catch {}
      await ctx.reply('↩️ بازگشت از حالت جابه‌جایی.');
      if (msgId) {
        const msg = await scheduledMessageRepository.findById(msgId);
        await ctx.reply(formatScheduledMessageInfo(msg), {
          parse_mode: 'Markdown',
          link_preview_options: { is_disabled: true },
          ...scheduledMessageEditMessageReplyKeyboard(),
        });
        await refreshButtonEditor(ctx, msgId);
      }
    } catch (err: any) {
      logger.error(`[SchedMove] return error: ${err.message}`);
    }
  });

  bot.hears('❌ لغو جابجایی', async (ctx: any, next) => {
    try {
      const userId = ctx.from.id;
      if (!scheduledMessageState.isButtonMoveActive(userId)) return next();
      const msgId = scheduledMessageState.getEditingMessage(userId);

      scheduledMessageState.setButtonMoveActive(userId, false);
      scheduledMessageState.setButtonMode(userId, 'create');
      scheduledMessageState.setButtonState(userId, '');
      scheduledMessageState.setButtonRow(userId, 0);
      scheduledMessageState.setButtonCol(userId, 0);

      try { await ctx.reply('⌨️', { reply_markup: { remove_keyboard: true } }); } catch {}
      await ctx.reply('❌ جابه‌جایی لغو شد.');
      if (msgId) {
        const msg = await scheduledMessageRepository.findById(msgId);
        await ctx.reply(formatScheduledMessageInfo(msg), {
          parse_mode: 'Markdown',
          link_preview_options: { is_disabled: true },
          ...scheduledMessageEditMessageReplyKeyboard(),
        });
        await refreshButtonEditor(ctx, msgId);
      }
    } catch (err: any) {
      logger.error(`[SchedMove] cancel error: ${err.message}`);
    }
  });
}

// ─── Helper: Convert DB buttons to 2D grid ──
function buttonsToGrid(buttons: any[]): any[][] {
  const grid: any[][] = [];
  for (const btn of buttons) {
    if (!grid[btn.row]) grid[btn.row] = [];
    grid[btn.row][btn.col] = btn;
  }
  return grid;
}

// ─── Helper: Normalize grid to dense (remove sparse entries, renumber rows/cols) ──
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

// ─── Helper: Find button position in grid by ID ──
function findButtonInGrid(grid: any[][], btnId: number): { row: number; col: number } | null {
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c]?.id === btnId) return { row: r, col: c };
    }
  }
  return null;
}

// ─── Helper: Refresh button editor inline keyboard ──
async function refreshButtonEditor(ctx: any, msgId: number) {
  const userId = ctx.from.id;
  const editorMsgId = scheduledMessageState.getButtonEditorMsgId(userId);
  if (!editorMsgId) return;
  const buttons = await scheduledMessageRepository.findButtonsByMessage(msgId);
  const grid = buttonsToGrid(buttons);
  const mode = scheduledMessageState.getButtonMode(userId) || 'create';
  const moveActive = scheduledMessageState.isButtonMoveActive(userId);
  const moveSel = moveActive ? scheduledMessageState.getButtonMoveSelected(userId) : undefined;
  const selectedPos = moveSel && moveSel.row !== undefined && moveSel.col !== undefined
    ? { row: moveSel.row, col: moveSel.col }
    : undefined;
  const { text, reply_markup } = renderScheduledButtonEditor(msgId, grid, moveActive ? 'move' : mode as any, selectedPos);
  try {
    await ctx.telegram.editMessageText(ctx.chat.id, editorMsgId, null, text, { reply_markup });
  } catch {}
}

// ─── Helper: Show post editor (always read from DB) ──

async function showPostEditor(ctx: any, id: number) {
  const msg = await scheduledMessageRepository.findById(id);
  if (!msg) {
    await ctx.reply('❌ پست یافت نشد.');
    return;
  }

  scheduledMessageState.setEditMode(ctx.from.id, id);
  scheduledMessageState.setManagementMode(ctx.from.id, true);

  // Resolve group name from bindings table (source of truth)
  let groupName = '';
  let topicName = '';
  const bindings = await scheduledMessageRepository.getBindingsByScheduledMessage(id);
  if (bindings.length > 0) {
    const firstBinding = bindings[0];
    if (firstBinding.isGlobal) {
      groupName = '🌍 همه گروه‌ها';
    } else {
      const group = await prisma.telegramGroup.findUnique({ where: { chatId: firstBinding.chatId } });
      groupName = group?.title || String(firstBinding.chatId);
    }
    if (firstBinding.topicId != null) {
      const topic = await prisma.forumTopic.findUnique({
        where: { chatId_topicId: { chatId: firstBinding.chatId, topicId: Number(firstBinding.topicId) } },
      });
      topicName = topic?.name || `Topic ${firstBinding.topicId}`;
    } else {
      topicName = firstBinding.isGlobal ? '' : 'همه تاپیک‌ها';
    }
  } else if (msg.targetChatId) {
    // Fallback to old fields if no bindings exist
    const group = await prisma.telegramGroup.findUnique({ where: { chatId: msg.targetChatId } });
    groupName = group?.title || String(msg.targetChatId);
    if (msg.targetTopicId) {
      const topic = await prisma.forumTopic.findUnique({
        where: { chatId_topicId: { chatId: msg.targetChatId, topicId: Number(msg.targetTopicId) } },
      });
      topicName = topic?.name || `Topic ${msg.targetTopicId}`;
    } else {
      topicName = 'همه تاپیک‌ها';
    }
  }
  (msg as any)._groupName = groupName || '—';
  (msg as any)._topicName = topicName || '—';

  const text = formatScheduledMessageInfo(msg);
  const messages = msg.messages || [];

  // Show each message with inline keyboard
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i] as any;
    const label = `📨 پیام ${i + 1} از ${messages.length}`;
    const keyboard = scheduledMessageSingleMessageInlineKeyboard(id, message, i, messages.length);

    if (message.mediaFileId && message.type !== 'text') {
      // Re-send actual media — same logic as sendToGroup
      const captionExtra: any = { reply_markup: keyboard.reply_markup };
      if (message.captionEntities && Array.isArray(message.captionEntities) && message.captionEntities.length > 0) {
        captionExtra.caption_entities = message.captionEntities;
      }
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
        logger.warn(`[SchedMsgEditor] Failed to re-send media: ${err?.message}`);
        await ctx.reply(`${label}\n\n${graphemeTruncate(message.text || '(رسانه)', 500)}`, { reply_markup: keyboard.reply_markup });
      }
    } else if (message.type === 'forward' && message.forwardSource) {
      // Try to show the actual forwarded message
      const fs = message.forwardSource as any;
      const srcChatId = Number(fs.chatId || fs.originChatId);
      const srcMsgId = Number(fs.messageId || fs.originMessageId);
      if (srcChatId && srcMsgId) {
        try {
          await ctx.telegram.forwardMessage(ctx.chat.id, srcChatId, srcMsgId);
          // Control message with management buttons (forwarded messages can't have inline keyboard)
          await ctx.reply(label, { reply_markup: keyboard.reply_markup });
          continue;
        } catch (forwardErr: any) {
          logger.warn(`[SchedMsgEditor] Failed to forward message for preview: ${forwardErr?.message}`);
        }
      }
      // Fallback: info card when forward fails or source is missing
      const sourceName = fs.originName || fs.sourceTitle || String(fs.chatId || fs.originChatId || 'نامشخص');
      await ctx.reply(`${label}\n\n📨 پیام فوروارد\n✅ نوع پیام: Forward\n📍 مبدأ: ${sourceName}\n⚠️ پیش‌نمایش این پیام قابل نمایش نیست، اما پیام ذخیره شده و هنگام اجرای اتوماسیون به صورت Forward ارسال خواهد شد.`, { reply_markup: keyboard.reply_markup });
    } else {
      // Text message
      await ctx.reply(`${label}\n\n${graphemeTruncate(message.text || '(پیام خالی)', 500)}`, { reply_markup: keyboard.reply_markup });
    }
  }

  // Final info message with reply keyboard
  await ctx.reply(text, {
    parse_mode: 'Markdown',
    link_preview_options: { is_disabled: true },
    ...scheduledMessageEditorReplyKeyboard(msg.isPublished),
  });
}

// ─── Helper: Send list ────────────────────────────────────

async function sendList(ctx: any, _page?: number) {
  const result = await scheduledMessageRepository.findAll({ page: 1, limit: 100 });
  scheduledMessageState.setManagementMode(ctx.from.id, true);
  await ctx.reply('📨 پیام‌های خودکار', scheduledMessageMainMenuKeyboard(result.items));
}
