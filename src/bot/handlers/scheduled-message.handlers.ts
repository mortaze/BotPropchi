import { Telegraf, Markup } from 'telegraf';
import { PostStatus, PostMessageType } from '@prisma/client';
import { scheduledMessageService } from '../../services/scheduled-message.service';
import { scheduledMessageState } from '../../services/scheduled-message-state.service';
import { scheduledMessageRepository } from '../../repositories/scheduled-message.repository';
import { botAdminService } from '../../services/bot-admin.service';
import { forumTopicService } from '../../services/forum-topic.service';
import { prisma } from '../../prisma/client';
import { logger } from '../../utils/logger';
import { cache } from '../../utils/cache';
import { validateDbInput } from '../../utils/unicode';
import { graphemeTruncate } from '../../utils/grapheme';
import {
  scheduledMessageMainMenuKeyboard,
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
  buildSmbtnMoveKeyboard,
  buildSmbtnColorKeyboard,
} from '../keyboards/scheduled-message-keyboards';

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

  // ─── Entry: 📢 پیام‌های خودکار ─────────────────────────
  bot.hears('📢 پیام‌های خودکار', async (ctx: any) => {
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    scheduledMessageState.clearAll(ctx.from.id);
    await ctx.reply('📢 سامانه مدیریت پیام‌های خودکار', scheduledMessageMainMenuKeyboard());
  });

  // ─── Back to admin panel ────────────────────────────────
  bot.hears('🔙 بازگشت به پنل ادمین', async (ctx: any, next) => {
    if (!scheduledMessageState.isManagementMode(ctx.from.id)) return next();
    scheduledMessageState.clearAll(ctx.from.id);
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

  bot.hears('🔙 بازگشت به لیست', async (ctx: any) => {
    scheduledMessageState.clearAll(ctx.from.id);
    await sendList(ctx, 1);
  });

  // ─── Editor actions (Reply Keyboard) ────────────────────

  // ─── Add message — only set state, message created on content delivery ──
  bot.hears('➕ افزودن پیام', async (ctx: any) => {
    const msgId = scheduledMessageState.getEditMode(ctx.from.id);
    if (!msgId) return;
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
  bot.hears('👥 انتخاب گروه', async (ctx: any) => {
    const msgId = scheduledMessageState.getEditMode(ctx.from.id);
    if (!msgId) return;
    const groups = await prisma.telegramGroup.findMany({
      where: { status: 'APPROVED', botIsAdmin: true },
      orderBy: { addedAt: 'desc' },
    });
    if (!groups.length) {
      await ctx.reply('گروه تأییدشده‌ای که ربات در آن ادمین باشد وجود ندارد.');
      return;
    }
    scheduledMessageState.setScheduleStep(ctx.from.id, 'select_group');
    await ctx.reply('👥 گروه مقصد را انتخاب کنید:', scheduleGroupReplyKeyboard(groups));
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

  bot.hears('✅ انتشار', async (ctx: any) => {
    const msgId = scheduledMessageState.getEditMode(ctx.from.id);
    logger.info(`[SchedMsg] Publish requested by userId=${ctx.from.id} editMode=${msgId}`);
    if (!msgId) {
      logger.warn(`[SchedMsg] Publish ABORTED: editMode is null`);
      await ctx.reply('❌ پستی انتخاب نشده است.');
      return;
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

  bot.hears('📊 آمار', async (ctx: any) => {
    const msgId = scheduledMessageState.getEditMode(ctx.from.id);
    if (!msgId) return;
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

  bot.hears('🗑 حذف پست', async (ctx: any) => {
    const msgId = scheduledMessageState.getEditMode(ctx.from.id);
    if (!msgId) return;
    const msg = await scheduledMessageRepository.findById(msgId);
    await ctx.reply(
      `⚠️ آیا از حذف "${msg?.title}" مطمئن هستید؟\n\nاین عملیات غیرقابل بازگشت است.`,
      scheduledMessageDeleteConfirmKeyboard(msgId),
    );
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

    // Bug #8: If no state is active, pass through
    if (!isCreating && !isEditingTitle && !isEditingContent && !scheduleStep) {
      return next();
    }

    // Button editor has priority — if wait_text, let button handler process it
    const btnState = scheduledMessageState.getButtonState(userId);
    if (btnState === 'wait_text') {
      return next();
    }

    // Bug #8: If scheduleStep is set but text matches a known button, don't consume it
    const knownButtons = [
      '➕ ایجاد پست جدید', '📋 لیست پست‌ها', '📊 گزارش ارسال',
      '🔙 بازگشت به پنل ادمین', '➕ افزودن پیام', '⏰ تنظیم زمان‌بندی',
      '👥 انتخاب گروه', '📖 دستور', '✅ انتشار', '📊 آمار',
      '🧪 ارسال تستی', '📊 وضعیت Scheduler',
      '🗑 حذف پست', '🔙 بازگشت', '🔙 بازگشت به لیست', '❌ لغو',
      '❌ حذف دستور',
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

    // ── Content input — save, close state, show editor ──
    if (isEditingContent) {
      const editMsgId = scheduledMessageState.getEditingMessage(userId);
      const msgId = scheduledMessageState.getEditMode(userId);
      if (!msgId) return next();

      if (editMsgId === -1) {
        // New message: create it with content
        const newMsg = await scheduledMessageService.addMessage(msgId);
        await scheduledMessageService.updateMessage(newMsg.id, { text });
      } else if (editMsgId) {
        // Existing message: update it
        await scheduledMessageService.updateMessage(editMsgId, { text });
      }

      // Close ALL content editing state
      scheduledMessageState.setEditingContent(userId, false);
      scheduledMessageState.setEditingMessage(userId, 0);
      // Success feedback
      await ctx.reply('✅ پیام ذخیره شد.');
      // Refresh editor from DB
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

    // ── Group selection via Reply Keyboard ──
    if (scheduleStep === 'select_group') {
      const groups = await prisma.telegramGroup.findMany({
        where: { status: 'APPROVED', botIsAdmin: true },
        orderBy: { addedAt: 'desc' },
      });
      const matched = groups.find((g) => g.title === text);
      if (matched) {
        const chatId = Number(matched.chatId);
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

        // No topics — show editor with saved group
        if (msgId) {
          await ctx.reply(`✅ گروه "${matched.title}" انتخاب شد.`);
          await showPostEditor(ctx, msgId);
        }
        return;
      }
      return next();
    }

    // ── Topic selection via Reply Keyboard ──
    if (scheduleStep === 'select_topic') {
      let topicId: number | null = null;
      if (text === '📌 همه تاپیک‌ها') {
        topicId = null;
      } else {
        const targetGroup = scheduledMessageState.getTargetGroup(userId);
        if (targetGroup) {
          const topics = await forumTopicService.getTopicsForChat(targetGroup);
          const topic = topics.find((t) => t.name === text);
          if (topic) {
            topicId = topic.topicId;
          }
        }
      }
      scheduledMessageState.setTargetTopic(userId, topicId);
      scheduledMessageState.setScheduleStep(userId, null as any);

      // Save topic to DB individually
      const msgId = scheduledMessageState.getEditMode(userId);
      if (msgId) {
        await scheduledMessageRepository.update(msgId, {
          targetTopicId: topicId != null ? BigInt(topicId) : null,
        });
        logger.info(`[SchedMsg] Saved targetTopicId=${topicId} to msg=${msgId}`);
        const topicText = text === '📌 همه تاپیک‌ها' ? 'همه تاپیک‌ها' : text;
        await ctx.reply(`✅ تاپیک "${topicText}" انتخاب شد.`);
        await showPostEditor(ctx, msgId);
      }
      return;
    }

    return next();
  });

  // ─── Media handler ──
  bot.on(['photo', 'video', 'document', 'voice', 'audio', 'animation', 'sticker'], async (ctx: any) => {
    const userId = ctx.from.id;
    const isEditingContent = scheduledMessageState.isEditingContent(userId);
    if (!isEditingContent) return;

    const editMsgId = scheduledMessageState.getEditingMessage(userId);
    const msgId = scheduledMessageState.getEditMode(userId);
    if (!msgId) return;

    const media = (ctx.message as any).photo?.pop() || (ctx.message as any).video || (ctx.message as any).document ||
      (ctx.message as any).voice || (ctx.message as any).audio || (ctx.message as any).animation || (ctx.message as any).sticker;

    if (media?.file_id) {
      const type = (ctx.message as any).photo ? 'photo' :
        (ctx.message as any).video ? 'video' :
        (ctx.message as any).document ? 'document' :
        (ctx.message as any).voice ? 'voice' :
        (ctx.message as any).audio ? 'audio' :
        (ctx.message as any).animation ? 'animation' : 'sticker';

      let targetMsgId = editMsgId;
      if (editMsgId === -1) {
        // New message: create it
        const newMsg = await scheduledMessageService.addMessage(msgId);
        targetMsgId = newMsg.id;
      }

      if (targetMsgId && targetMsgId > 0) {
        await scheduledMessageService.updateMessage(targetMsgId, { mediaFileId: media.file_id, type: type as any });
      }

      // Close state
      scheduledMessageState.setEditingContent(userId, false);
      scheduledMessageState.setEditingMessage(userId, 0);
      await ctx.reply('✅ رسانه ذخیره شد.');
      await showPostEditor(ctx, msgId);
    }
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
  bot.action(/^sched:group:(\d+)$/, async (ctx: any) => {
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
  bot.hears('✏️ ویرایش محتوا', async (ctx: any) => {
    const msgId = scheduledMessageState.getEditingMessage(ctx.from.id);
    if (!msgId) return;
    scheduledMessageState.setEditingContent(ctx.from.id, true);
    const msg = await prisma.scheduledMessageMessage.findUnique({ where: { id: msgId } });
    await ctx.reply(
      `📝 محتوای پیام را ویرایش کنید:\n\nمحتوای فعلی:\n${msg?.text || '(خالی)'}`,
      scheduledMessageCancelOnlyKeyboard(),
    );
  });

  bot.hears('📝 ویرایش عنوان', async (ctx: any) => {
    const msgId = scheduledMessageState.getEditingMessage(ctx.from.id);
    if (!msgId) return;
    scheduledMessageState.setEditingTitle(ctx.from.id, true);
    const msg = await scheduledMessageRepository.findById(msgId);
    await ctx.reply(
      `✏ عنوان فعلی: *${msg?.title || ''}*\n\nعنوان جدید را ارسال کنید:`,
      { parse_mode: 'Markdown', ...scheduledMessageCancelOnlyKeyboard() },
    );
  });

  bot.hears('🔘 ویرایش دکمه‌ها', async (ctx: any) => {
    const msgId = scheduledMessageState.getEditingMessage(ctx.from.id);
    if (!msgId) return;
    const buttons = await scheduledMessageRepository.findButtonsByMessage(msgId);
    const grid = buttonsToGrid(buttons);
    const { text, reply_markup } = renderScheduledButtonEditor(msgId, grid, 'create');
    const sent = await ctx.reply(text, { reply_markup });
    if (sent) scheduledMessageState.setButtonEditorMsgId(ctx.from.id, sent.message_id);
    scheduledMessageState.setButtonMode(ctx.from.id, 'create');
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
    await ctx.reply('📢 سامانه مدیریت پیام‌های خودکار', scheduledMessageMainMenuKeyboard());
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
      await ctx.reply(`🔀 "${grid[row]?.[col]?.text || ''}" انتخاب شد. جهت را انتخاب کنید:`, buildSmbtnMoveKeyboard());
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
      const typeLabel = btn.type === 'POPUP' ? '🪟 POP-UP' : btn.type === 'COMMAND' ? '⌨️ دستور' : '🔗 لینک';
      const colorText = btn.style ? `🎨 ${btn.style}` : '⚪ بدون رنگ';
      await ctx.editMessageText(
        `🔧 تنظیمات دکمه\n\nℹ️ مقدار فعلی:\n${typeLabel}\n${btn.text}: ${btn.value || ''}\n${colorText}`,
        buildSmbtnEditTypeKeyboard(msgId, row, col, btn.style),
      );
      return;
    }

    // Create mode — add placeholder button, then enter edit mode
    const msgRecord = await prisma.scheduledMessageMessage.findUnique({ where: { id: msgId } });
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
    await ctx.editMessageText(`📝 متن دکمه (${typeLabel}) را وارد کنید:`, {
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

    const text = ctx.message.text;
    const msgId = scheduledMessageState.getEditingMessage(userId);
    const row = scheduledMessageState.getButtonRow(userId);
    const col = scheduledMessageState.getButtonCol(userId);
    const btnType = scheduledMessageState.getButtonType(userId);
    if (!msgId || row === undefined || col === undefined) return next();

    const buttons = await scheduledMessageRepository.findButtonsByMessage(msgId);
    const grid = buttonsToGrid(buttons);
    const existingBtn = grid[row]?.[col];

    if (existingBtn?.id) {
      // Update existing button
      const updateData: any = { text };
      if (btnType === 'url' || btnType === 'command') {
        // For URL/command, user enters the value in next step — but for simplicity, treat text as both name and value
        updateData.value = text;
        updateData.type = btnType === 'url' ? 'URL' : btnType === 'command' ? 'COMMAND' : 'CALLBACK';
      } else if (btnType === 'popup') {
        updateData.type = 'CALLBACK';
        updateData.value = text;
      }
      await scheduledMessageRepository.updateButton(existingBtn.id, updateData);
    } else {
      // Create new button
      const type = btnType === 'url' ? 'URL' : btnType === 'command' ? 'COMMAND' : btnType === 'popup' ? 'CALLBACK' : 'URL';
      await scheduledMessageRepository.createButton({
        scheduledMessageId: msgId,
        messageId: msgId,
        row,
        col,
        text,
        type,
        value: text,
      });
    }

    scheduledMessageState.setButtonState(userId, '');
    scheduledMessageState.setButtonType(userId, '');
    scheduledMessageState.setButtonMode(userId, 'create');
    await ctx.reply('✅ دکمه ذخیره شد.');
    await refreshButtonEditor(ctx, msgId);
  });

  // ─── Button Editor: Move confirm/cancel ──
  bot.hears('✅ تایید جابه‌جایی و بازگشت', async (ctx: any) => {
    const userId = ctx.from.id;
    if (!scheduledMessageState.isButtonMoveActive(userId)) return;
    const msgId = scheduledMessageState.getEditingMessage(userId);
    if (!msgId) return;

    const moveSel = scheduledMessageState.getButtonMoveSelected(userId);
    const btnRow = scheduledMessageState.getButtonRow(userId);
    const btnCol = scheduledMessageState.getButtonCol(userId);
    if (moveSel.row === undefined || moveSel.col === undefined || btnRow === undefined || btnCol === undefined) return;

    // Swap buttons in DB
    const buttons = await scheduledMessageRepository.findButtonsByMessage(msgId);
    const grid = buttonsToGrid(buttons);
    const btnA = grid[btnRow]?.[btnCol];
    const btnB = grid[moveSel.row]?.[moveSel.col];
    if (btnA?.id && btnB?.id) {
      const tmpRow = btnA.row, tmpCol = btnA.col;
      await scheduledMessageRepository.updateButton(btnA.id, { row: btnB.row, col: btnB.col });
      await scheduledMessageRepository.updateButton(btnB.id, { row: tmpRow, col: tmpCol });
    }

    scheduledMessageState.setButtonMoveActive(userId, false);
    scheduledMessageState.setButtonMode(userId, 'create');
    await ctx.reply('✅ جابه‌جایی انجام شد.');
    await refreshButtonEditor(ctx, msgId!);
  });

  bot.hears('❌ لغو جابجایی', async (ctx: any) => {
    const userId = ctx.from.id;
    if (!scheduledMessageState.isButtonMoveActive(userId)) return;
    const msgId = scheduledMessageState.getEditingMessage(userId);
    scheduledMessageState.setButtonMoveActive(userId, false);
    scheduledMessageState.setButtonMode(userId, 'create');
    await ctx.reply('❌ جابه‌جایی لغو شد.');
    if (msgId) await refreshButtonEditor(ctx, msgId);
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

// ─── Helper: Refresh button editor inline keyboard ──
async function refreshButtonEditor(ctx: any, msgId: number) {
  const userId = ctx.from.id;
  const editorMsgId = scheduledMessageState.getButtonEditorMsgId(userId);
  if (!editorMsgId) return;
  const buttons = await scheduledMessageRepository.findButtonsByMessage(msgId);
  const grid = buttonsToGrid(buttons);
  const mode = scheduledMessageState.getButtonMode(userId) || 'create';
  const moveActive = scheduledMessageState.isButtonMoveActive(userId);
  const { text, reply_markup } = renderScheduledButtonEditor(msgId, grid, moveActive ? 'move' : mode as any);
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

  // Resolve group name from DB
  let groupName = '';
  if (msg.targetChatId) {
    const group = await prisma.telegramGroup.findUnique({ where: { chatId: msg.targetChatId } });
    groupName = group?.title || String(msg.targetChatId);
  }
  (msg as any)._groupName = groupName || '—';

  // Resolve topic name from DB
  let topicName = '';
  if (msg.targetTopicId && msg.targetChatId) {
    const topic = await prisma.forumTopic.findUnique({
      where: { chatId_topicId: { chatId: msg.targetChatId, topicId: Number(msg.targetTopicId) } },
    });
    topicName = topic?.name || `Topic ${msg.targetTopicId}`;
  }
  (msg as any)._topicName = msg.targetTopicId ? topicName : (msg.targetChatId ? 'همه تاپیک‌ها' : '—');

  const text = formatScheduledMessageInfo(msg);
  const messages = msg.messages || [];

  // Show each message with inline keyboard
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const msgText = message.text || '(رسانه)';
    const label = `📨 پیام ${i + 1} از ${messages.length}`;
    const keyboard = scheduledMessageSingleMessageInlineKeyboard(id, message, i, messages.length);
    await ctx.reply(`${label}\n\n${graphemeTruncate(msgText, 500)}`, { reply_markup: keyboard.reply_markup });
  }

  // Final info message with reply keyboard
  await ctx.reply(text, {
    parse_mode: 'Markdown',
    link_preview_options: { is_disabled: true },
    ...scheduledMessageEditorReplyKeyboard(msg.isPublished),
  });
}

// ─── Helper: Send list ────────────────────────────────────

async function sendList(ctx: any, page: number) {
  const result = await scheduledMessageRepository.findAll({ page, limit: 10 });
  if (!result.items.length) {
    await ctx.reply('📋 پست خودکاری وجود ندارد.', scheduledMessageMainMenuKeyboard());
    return;
  }
  await ctx.reply(
    `📋 لیست پست‌ها (${result.total} مورد):`,
    scheduledMessageListInlineKeyboard(result.items, result.page, result.pages),
  );
}
