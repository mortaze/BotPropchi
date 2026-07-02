import { Telegraf } from 'telegraf';
import { PostStatus, PostMessageType } from '@prisma/client';
import { scheduledMessageService } from '../../services/scheduled-message.service';
import { scheduledMessageState } from '../../services/scheduled-message-state.service';
import { scheduledMessageRepository } from '../../repositories/scheduled-message.repository';
import { botAdminService } from '../../services/bot-admin.service';
import { prisma } from '../../prisma/client';
import { logger } from '../../utils/logger';
import { cache } from '../../utils/cache';
import { sanitizeTelegramText, validateDbInput } from '../../utils/unicode';
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
  scheduleGroupKeyboard,
  scheduleTopicKeyboard,
  scheduledMessagePublishValidationKeyboard,
  scheduledMessageDeleteConfirmKeyboard,
  scheduledMessageDashboardKeyboard,
} from '../keyboards/scheduled-message-keyboards';

function formatScheduledMessageInfo(msg: any): string {
  const status = msg.isPublished ? '🟢 فعال' : '⚪ غیرفعال';
  const interval = msg.intervalHours ? `هر ${msg.intervalHours} ساعت` : 'تعریف نشده';
  const startTime = msg.startTime || 'تعریف نشده';
  const targetGroup = msg.targetChatId ? String(msg.targetChatId) : 'تعریف نشده';
  const topic = msg.targetTopicId ? `تاپیک ${msg.targetTopicId}` : 'همه تاپیک‌ها';
  const msgCount = msg.messages?.length || 0;
  const sendCount = msg.sendCount || 0;

  return [
    `📝 *${msg.title}*`,
    '',
    `📨 پیام‌ها: ${msgCount}`,
    `📤 وضعیت: ${status}`,
    `⏰ زمان‌بندی: ${interval}`,
    `🕐 ساعت شروع: ${startTime}`,
    `👥 گروه: ${targetGroup}`,
    `📌 تاپیک: ${topic}`,
    `🔢 دفعات ارسال: ${sendCount}`,
  ].join('\n');
}

function validatePublishReadiness(msg: any): { ready: boolean; missing: { key: string; label: string }[] } {
  const missing: { key: string; label: string }[] = [];
  if (!msg.intervalHours) missing.push({ key: 'schedule', label: '⏰ تنظیم زمان‌بندی' });
  if (!msg.targetChatId) missing.push({ key: 'group', label: '👥 انتخاب گروه' });
  if (!msg.startTime) missing.push({ key: 'schedule', label: '⏰ تنظیم ساعت شروع' });
  const msgCount = msg.messages?.length || 0;
  if (msgCount === 0) missing.push({ key: 'messages', label: '➕ افزودن پیام' });
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
  bot.hears('🔙 بازگشت به پنل ادمین', async (ctx: any) => {
    if (!scheduledMessageState.isManagementMode(ctx.from.id)) return;
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
    const creating = scheduledMessageState.isCreating(ctx.from.id);
    if (creating) {
      const msgId = scheduledMessageState.getEditingMessage(ctx.from.id);
      if (msgId) await scheduledMessageService.delete(msgId).catch(() => {});
      scheduledMessageState.clearAll(ctx.from.id);
      await ctx.reply('❌ ایجاد پست لغو شد.', scheduledMessageMainMenuKeyboard());
      return;
    }
    return next();
  });

  // ─── Back buttons ───────────────────────────────────────
  bot.hears('🔙 بازگشت', async (ctx: any, next) => {
    if (!ctx.from) return next();
    const editingMsgId = scheduledMessageState.getEditMode(ctx.from.id);
    if (editingMsgId) {
      await showPostEditor(ctx, editingMsgId);
      return;
    }
    return next();
  });

  bot.hears('🔙 بازگشت به لیست', async (ctx: any) => {
    scheduledMessageState.clearAll(ctx.from.id);
    await sendList(ctx, 1);
  });

  // ─── Editor actions (Reply Keyboard) ────────────────────
  bot.hears('➕ افزودن پیام', async (ctx: any) => {
    const msgId = scheduledMessageState.getEditMode(ctx.from.id);
    if (!msgId) return;
    const newMsg = await scheduledMessageService.addMessage(msgId);
    scheduledMessageState.setEditingMessage(ctx.from.id, newMsg.id);
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
    await ctx.reply('👥 گروه مقصد را انتخاب کنید:', scheduleGroupKeyboard(groups));
  });

  bot.hears('📖 دستور', async (ctx: any) => {
    const msgId = scheduledMessageState.getEditMode(ctx.from.id);
    if (!msgId) return;
    await ctx.reply('🔗 نام دستور را ارسال کنید (بدون /):\nمثال: schedule/my-post');
  });

  bot.hears('✅ انتشار', async (ctx: any) => {
    const msgId = scheduledMessageState.getEditMode(ctx.from.id);
    if (!msgId) return;
    const msg = await scheduledMessageRepository.findById(msgId);
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

    await scheduledMessageService.publish(msgId);
    await ctx.reply('✅ پست منتشر شد و ارسال خودکار فعال شد!');
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

  bot.hears('🗑 حذف پست', async (ctx: any) => {
    const msgId = scheduledMessageState.getEditMode(ctx.from.id);
    if (!msgId) return;
    const msg = await scheduledMessageRepository.findById(msgId);
    await ctx.reply(
      `⚠️ آیا از حذف "${msg?.title}" مطمئن هستید؟\n\nاین عملیات غیرقابل بازگشت است.`,
      scheduledMessageDeleteConfirmKeyboard(msgId),
    );
  });

  // ─── Text input handler ─────────────────────────────────
  bot.on('text', async (ctx: any, next) => {
    if (!ctx.from || ctx.chat?.type !== 'private') return next();
    const text = ctx.message.text;
    const userId = ctx.from.id;

    const isCreating = scheduledMessageState.isCreating(userId);
    const isEditingTitle = scheduledMessageState.isEditingTitle(userId);
    const isEditingContent = scheduledMessageState.isEditingContent(userId);
    const scheduleStep = scheduledMessageState.getScheduleStep(userId);

    if (!isCreating && !isEditingTitle && !isEditingContent && !scheduleStep) {
      return next();
    }

    const admin = await botAdminService.getActive(userId);
    if (!admin) return next();

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
      await ctx.reply(`✅ عنوان به "${title}" تغییر کرد.`);
      await showPostEditor(ctx, msgId);
      return;
    }

    // ── Content input ──
    if (isEditingContent) {
      const msgId = scheduledMessageState.getEditingMessage(userId);
      if (!msgId) return next();
      const msg = await scheduledMessageRepository.findById(msgId);
      if (!msg) return next();
      const firstMsg = msg.messages[0];
      if (firstMsg) {
        await scheduledMessageService.updateMessage(firstMsg.id, { text });
      }
      scheduledMessageState.setEditingContent(userId, false);
      await ctx.reply('✅ محتوا ذخیره شد.');
      const messages = await scheduledMessageService.listMessages(msgId);
      await showPostEditorWithMessages(ctx, msgId, messages);
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
      await ctx.reply(`✅ بازه: هر ${hours} ساعت\n\n⏰ ساعت شروع ارسال را وارد کنید:\nمثال: 09:00`);
      return;
    }

    // ── Start time input ──
    if (scheduleStep === 'start_time') {
      const timeRegex = /^([01]?\d|2[0-3]):([0-5]\d)$/;
      if (!timeRegex.test(text)) {
        await ctx.reply('❌ فرمت ساعت نامعتبر است.\nمثال: 09:00 یا 14:30');
        return;
      }
      scheduledMessageState.setStartTime(userId, text);
      scheduledMessageState.setScheduleStep(userId, null as any);

      const msgId = scheduledMessageState.getSchedulingMode(userId);
      if (msgId) {
        const intervalHours = scheduledMessageState.getIntervalHours(userId);
        const targetGroup = scheduledMessageState.getTargetGroup(userId);
        const targetTopic = scheduledMessageState.getTargetTopic(userId);
        if (intervalHours && targetGroup) {
          await scheduledMessageService.setSchedule(msgId, intervalHours, text, targetGroup, targetTopic);
          await ctx.reply(`✅ زمان‌بندی ذخیره شد.\n⏰ بازه: هر ${intervalHours} ساعت\n🕐 شروع: ${text}`);
        }
      }
      scheduledMessageState.clearAll(userId);
      if (msgId) await showPostEditor(ctx, msgId);
      return;
    }

    return next();
  });

  // ─── Media handler ──────────────────────────────────────
  bot.on(['photo', 'video', 'document', 'voice', 'audio', 'animation', 'sticker'], async (ctx: any) => {
    const userId = ctx.from.id;
    const isEditingContent = scheduledMessageState.isEditingContent(userId);
    if (!isEditingContent) return;

    const msgId = scheduledMessageState.getEditingMessage(userId);
    if (!msgId) return;

    const msg = await scheduledMessageRepository.findById(msgId);
    if (!msg) return;

    const media = (ctx.message as any).photo?.pop() || (ctx.message as any).video || (ctx.message as any).document ||
      (ctx.message as any).voice || (ctx.message as any).audio || (ctx.message as any).animation || (ctx.message as any).sticker;

    if (media?.file_id) {
      const firstMsg = msg.messages[0];
      const type = (ctx.message as any).photo ? 'photo' :
        (ctx.message as any).video ? 'video' :
        (ctx.message as any).document ? 'document' :
        (ctx.message as any).voice ? 'voice' :
        (ctx.message as any).audio ? 'audio' :
        (ctx.message as any).animation ? 'animation' : 'sticker';

      if (firstMsg) {
        await scheduledMessageService.updateMessage(firstMsg.id, { mediaFileId: media.file_id, type: type as any });
      }

      scheduledMessageState.setEditingContent(userId, false);
      await ctx.reply('✅ رسانه ذخیره شد.');
      const messages = await scheduledMessageService.listMessages(msgId);
      await showPostEditorWithMessages(ctx, msgId, messages);
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

  // ─── Callback: Interval selection ───────────────────────
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
    await ctx.reply(`✅ بازه: هر ${hours} ساعت\n\n⏰ ساعت شروع ارسال را وارد کنید:\nمثال: 09:00`);
  });

  // ─── Callback: Group selection ──────────────────────────
  bot.action(/^sched:group:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const chatId = parseInt(ctx.match[1]);
    const userId = ctx.from.id;
    scheduledMessageState.setTargetGroup(userId, chatId);

    const group = await prisma.telegramGroup.findUnique({ where: { chatId: BigInt(chatId) } });
    if (group?.isForum && group.forumTopics) {
      const topics = group.forumTopics as any[];
      if (topics.length > 0) {
        scheduledMessageState.setScheduleStep(userId, 'select_topic');
        await ctx.reply('📌 تاپیک مقصد را انتخاب کنید:', scheduleTopicKeyboard(topics));
        return;
      }
    }

    const msgId = scheduledMessageState.getEditMode(userId) || scheduledMessageState.getSchedulingMode(userId);
    if (msgId) {
      await scheduledMessageService.setSchedule(msgId, scheduledMessageState.getIntervalHours(userId) || 24, scheduledMessageState.getStartTime(userId) || '09:00', chatId);
      await ctx.reply(`✅ گروه انتخاب شد.`);
      await showPostEditor(ctx, msgId);
    }
    scheduledMessageState.clearAll(userId);
  });

  // ─── Callback: Topic selection ──────────────────────────
  bot.action(/^sched:topic:(all|\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const value = ctx.match[1];
    const userId = ctx.from.id;

    scheduledMessageState.setTargetTopic(userId, value === 'all' ? null : parseInt(value));

    const msgId = scheduledMessageState.getEditMode(userId) || scheduledMessageState.getSchedulingMode(userId);
    if (msgId) {
      const topicText = value === 'all' ? 'همه تاپیک‌ها' : `تاپیک ${value}`;
      await ctx.reply(`✅ تاپیک انتخاب شد: ${topicText}`);
      await showPostEditor(ctx, msgId);
    }
    scheduledMessageState.clearAll(userId);
  });

  // ─── Callback: Publish ──────────────────────────────────
  bot.action(/^sched:publish:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const id = parseInt(ctx.match[1]);
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

  // ─── Callback: Message edit ─────────────────────────────
  bot.action(/^sched:msg:edit:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const msgId = parseInt(ctx.match[1]);
    scheduledMessageState.setEditingMessage(ctx.from.id, msgId);
    scheduledMessageState.setEditingContent(ctx.from.id, true);
    const msg = await prisma.scheduledMessageMessage.findUnique({ where: { id: msgId } });
    await ctx.reply(
      `📝 محتوای پیام را ویرایش کنید:\n\nمحتوای فعلی:\n${msg?.text || '(خالی)'}`,
      scheduledMessageEditMessageReplyKeyboard(),
    );
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

  // ─── Callback: Message add ──────────────────────────────
  bot.action(/^sched:msg:add:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const schedMsgId = parseInt(ctx.match[1]);
    const newMsg = await scheduledMessageService.addMessage(schedMsgId);
    scheduledMessageState.setEditingMessage(ctx.from.id, newMsg.id);
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
      await ctx.reply('👥 گروه مقصد را انتخاب کنید:', scheduleGroupKeyboard(groups));
    } else if (field === 'messages') {
      const newMsg = await scheduledMessageService.addMessage(msgId);
      scheduledMessageState.setEditingMessage(userId, newMsg.id);
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
}

// ─── Helper: Show post editor (inline info + reply keyboard) ──

async function showPostEditor(ctx: any, id: number) {
  const msg = await scheduledMessageRepository.findById(id);
  if (!msg) {
    await ctx.reply('❌ پست یافت نشد.');
    return;
  }

  scheduledMessageState.setEditMode(ctx.from.id, id);
  scheduledMessageState.setManagementMode(ctx.from.id, true);

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

// ─── Helper: Show post editor with messages ───────────────

async function showPostEditorWithMessages(ctx: any, id: number, messages: any[]) {
  const msg = await scheduledMessageRepository.findById(id);
  if (!msg) return;

  // Show each message with inline keyboard
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const msgText = message.text || '(رسانه)';
    const label = `📨 پیام ${i + 1} از ${messages.length}`;
    const keyboard = scheduledMessageSingleMessageInlineKeyboard(id, message, i, messages.length);
    await ctx.reply(`${label}\n\n${graphemeTruncate(msgText, 500)}`, { reply_markup: keyboard.reply_markup });
  }

  const text = formatScheduledMessageInfo(msg);
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
