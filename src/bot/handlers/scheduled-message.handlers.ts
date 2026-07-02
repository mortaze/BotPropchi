import { Telegraf } from 'telegraf';
import { PostStatus, PostMessageType } from '@prisma/client';
import { scheduledMessageService } from '../../services/scheduled-message.service';
import { scheduledMessageState } from '../../services/scheduled-message-state.service';
import { scheduledMessageRepository } from '../../repositories/scheduled-message.repository';
import { botAdminService } from '../../services/bot-admin.service';
import { groupService } from '../../services/group.service';
import { prisma } from '../../prisma/client';
import { logger } from '../../utils/logger';
import { sanitizeTelegramText, validateDbInput } from '../../utils/unicode';
import {
  scheduledMessageMainMenuKeyboard,
  scheduledMessageListKeyboard,
  scheduledMessageEditorKeyboard,
  scheduledMessageManagerReplyKeyboard,
  scheduledMessageEditReplyKeyboard,
  scheduledMessageCancelOnlyKeyboard,
  scheduledMessageBackKeyboard,
  scheduleIntervalKeyboard,
  scheduleGroupKeyboard,
  scheduleTopicKeyboard,
  scheduledMessageListInlineKeyboard,
  scheduledMessageDeleteConfirmKeyboard,
  scheduledMessagePublishKeyboard,
  scheduledMessageSettingsKeyboard,
  scheduledMessageEmergencyStopConfirmKeyboard,
  scheduledMessageDashboardKeyboard,
} from '../keyboards/scheduled-message-keyboards';

export function registerScheduledMessageHandlers(bot: Telegraf) {

  // ─── Entry: 📢 پیام‌های خودکار ─────────────────────────
  bot.hears('📢 پیام‌های خودکار', async (ctx: any) => {
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    scheduledMessageState.clearAll(ctx.from.id);
    await ctx.reply('📢 پیام‌های خودکار', scheduledMessageMainMenuKeyboard());
  });

  // ─── Back to main menu ──────────────────────────────────
  bot.hears('↩️ بازگشت به پنل ادمین', async (ctx: any) => {
    if (!scheduledMessageState.isManagementMode(ctx.from.id)) return;
    scheduledMessageState.clearAll(ctx.from.id);
  });

  // ─── Create new scheduled post ──────────────────────────
  bot.hears('➕ ایجاد پست جدید', async (ctx: any) => {
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    scheduledMessageState.clearAll(ctx.from.id);
    scheduledMessageState.setCreating(ctx.from.id);

    const msg = await scheduledMessageService.create({ title: 'جدید', createdBy: BigInt(ctx.from.id) });
    scheduledMessageState.setEditingMessage(ctx.from.id, msg.id);
    scheduledMessageState.setEditingTitle(ctx.from.id, true);

    await ctx.reply(
      `📝 عنوان پست را وارد کنید:\n\nعنوان فعلی: *${msg.title}*`,
      { parse_mode: 'Markdown', ...scheduledMessageCancelOnlyKeyboard() }
    );
  });

  // ─── List scheduled messages ────────────────────────────
  bot.hears('📄 لیست پیام‌ها', async (ctx: any) => {
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    scheduledMessageState.clearAll(ctx.from.id);
    await sendList(ctx, 1);
  });

  // ─── Group management ───────────────────────────────────
  bot.hears('👥 مدیریت گروه‌ها', async (ctx: any) => {
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    const groups = await prisma.telegramGroup.findMany({
      where: { status: 'APPROVED' },
      orderBy: { addedAt: 'desc' },
    });
    if (!groups.length) {
      await ctx.reply('گروه تأییدشده‌ای وجود ندارد.', scheduledMessageMainMenuKeyboard());
      return;
    }
    await ctx.reply('👥 یک گروه را انتخاب کنید:', scheduleGroupKeyboard(groups));
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

  // ─── Settings ───────────────────────────────────────────
  bot.hears('⚙️ تنظیمات', async (ctx: any) => {
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    await ctx.reply('⚙️ تنظیمات پیام‌های خودکار:', scheduledMessageSettingsKeyboard());
  });

  // ─── Emergency stop ─────────────────────────────────────
  bot.hears('⛔ توقف همه ارسال‌ها', async (ctx: any) => {
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    await ctx.reply('آیا مطمئن هستید؟ تمام ارسال‌ها متوقف خواهند شد.', scheduledMessageEmergencyStopConfirmKeyboard());
  });

  // ─── Cancel ─────────────────────────────────────────────
  bot.hears('❌ لغو', async (ctx: any) => {
    if (!scheduledMessageState.isCreating(ctx.from.id)) return;
    const msgId = scheduledMessageState.getEditingMessage(ctx.from.id);
    if (msgId) {
      await scheduledMessageService.delete(msgId).catch(() => {});
    }
    scheduledMessageState.clearAll(ctx.from.id);
    await ctx.reply('❌ ایجاد لغو شد.', scheduledMessageMainMenuKeyboard());
  });

  // ─── Back from editing ──────────────────────────────────
  bot.hears('🔙 بازگشت', async (ctx: any) => {
    if (scheduledMessageState.isCreating(ctx.from.id)) {
      const msgId = scheduledMessageState.getEditingMessage(ctx.from.id);
      if (msgId) {
        await sendEditor(ctx, msgId);
      }
      scheduledMessageState.clearAll(ctx.from.id);
      return;
    }
    if (scheduledMessageState.isManagementMode(ctx.from.id)) {
      const msgId = scheduledMessageState.getEditMode(ctx.from.id);
      if (msgId) {
        await sendEditor(ctx, msgId);
      }
    }
  });

  // ─── Edit title ─────────────────────────────────────────
  bot.hears('🏷 ویرایش عنوان', async (ctx: any) => {
    const msgId = scheduledMessageState.getEditMode(ctx.from.id);
    if (!msgId) return;
    scheduledMessageState.setEditingTitle(ctx.from.id, true);
    const msg = await scheduledMessageRepository.findById(msgId);
    await ctx.reply(
      `📝 عنوان جدید را وارد کنید:\n\nعنوان فعلی: *${msg?.title || ''}*`,
      { parse_mode: 'Markdown', ...scheduledMessageCancelOnlyKeyboard() }
    );
  });

  // ─── Edit content ───────────────────────────────────────
  bot.hears('📝 ویرایش محتوا', async (ctx: any) => {
    const msgId = scheduledMessageState.getEditMode(ctx.from.id);
    if (!msgId) return;
    const messages = await scheduledMessageService.listMessages(msgId);
    if (!messages.length) {
      await ctx.reply('پیامی وجود ندارد. ابتدا پیام اضافه کنید.');
      return;
    }
    scheduledMessageState.setEditingMessage(ctx.from.id, messages[0].id);
    scheduledMessageState.setEditingContent(ctx.from.id, true);
    await ctx.reply(
      `📝 محتوای پیام را وارد کنید:\n\nمحتوای فعلی:\n${messages[0].text || '(خالی)'}`,
      scheduledMessageCancelOnlyKeyboard()
    );
  });

  // ─── Add message ────────────────────────────────────────
  bot.hears('➕ افزودن پیام', async (ctx: any) => {
    const msgId = scheduledMessageState.getEditMode(ctx.from.id);
    if (!msgId) return;
    const newMsg = await scheduledMessageService.addMessage(msgId);
    scheduledMessageState.setEditingMessage(ctx.from.id, newMsg.id);
    scheduledMessageState.setEditingContent(ctx.from.id, true);
    await ctx.reply(
      `📝 محتوای پیام جدید را وارد کنید:\n(متن، عکس، ویدیو یا هر نوع رسانه‌ای)`,
      scheduledMessageCancelOnlyKeyboard()
    );
  });

  // ─── Manage messages ────────────────────────────────────
  bot.hears('📋 مدیریت پیام‌ها', async (ctx: any) => {
    const msgId = scheduledMessageState.getEditMode(ctx.from.id);
    if (!msgId) return;
    const messages = await scheduledMessageService.listMessages(msgId);
    if (!messages.length) {
      await ctx.reply('پیامی وجود ندارد.');
      return;
    }
    await ctx.reply('📋 پیام‌ها:', scheduledMessageListInlineKeyboard(messages, msgId));
  });

  // ─── Manage buttons ─────────────────────────────────────
  bot.hears('🔘 ویرایش دکمه‌ها', async (ctx: any) => {
    const msgId = scheduledMessageState.getEditMode(ctx.from.id);
    if (!msgId) return;
    await ctx.reply('🔘 مدیریت دکمه‌ها از اینجا قابل انجام است.\nبرای افزودن دکمه، متن دکمه را ارسال کنید.');
    scheduledMessageState.setButtonEditorMode(ctx.from.id, 'waiting_for_button');
  });

  // ─── Publish toggle ─────────────────────────────────────
  bot.hears('🚀 تغییر وضعیت انتشار', async (ctx: any) => {
    const msgId = scheduledMessageState.getEditMode(ctx.from.id);
    if (!msgId) return;
    const msg = await scheduledMessageRepository.findById(msgId);
    if (!msg) return;

    if (msg.isPublished) {
      await scheduledMessageService.unpublish(msgId);
      await ctx.reply('📤 ارسال متوقف شد.', scheduledMessageMainMenuKeyboard());
    } else {
      if (!msg.targetChatId || !msg.intervalHours || !msg.startTime) {
        await ctx.reply('⚠️ ابتدا زمان‌بندی و گروه مقصد را تنظیم کنید.');
        return;
      }
      await scheduledMessageService.publish(msgId);
      await ctx.reply('🚀 ارسال فعال شد!', scheduledMessageMainMenuKeyboard());
    }
    scheduledMessageState.clearAll(ctx.from.id);
  });

  // ─── Delete post ────────────────────────────────────────
  bot.hears('🗑 حذف پست', async (ctx: any) => {
    const msgId = scheduledMessageState.getEditMode(ctx.from.id);
    if (!msgId) return;
    const msg = await scheduledMessageRepository.findById(msgId);
    await ctx.reply(
      `⚠️ آیا از حذف "${msg?.title}" مطمئن هستید؟\n\nاین عملیات غیرقابل بازگشت است.`,
      scheduledMessageDeleteConfirmKeyboard(msgId)
    );
  });

  // ─── Text input handler (title, content, custom interval, start time) ───
  bot.on('text', async (ctx: any, next) => {
    if (!ctx.from || ctx.chat?.type !== 'private') return next();
    const text = ctx.message.text;
    const userId = ctx.from.id;

    // Check if in scheduled message flow
    const isCreating = scheduledMessageState.isCreating(userId);
    const isEditingTitle = scheduledMessageState.isEditingTitle(userId);
    const isEditingContent = scheduledMessageState.isEditingContent(userId);
    const scheduleStep = scheduledMessageState.getScheduleStep(userId);

    if (!isCreating && !isEditingTitle && !isEditingContent && !scheduleStep) {
      return next();
    }

    const admin = await botAdminService.getActive(userId);
    if (!admin) return next();

    // ── Title input ──
    if (isEditingTitle) {
      const msgId = scheduledMessageState.getEditingMessage(userId);
      if (!msgId) return next();
      const title = validateDbInput(text, 'title');
      await scheduledMessageService.update(msgId, { title });
      scheduledMessageState.setEditingTitle(userId, false);
      await ctx.reply(`✅ عنوان به "${title}" تغییر کرد.`);
      await sendEditor(ctx, msgId);
      return;
    }

    // ── Content input ──
    if (isEditingContent) {
      const msgId = scheduledMessageState.getEditingMessage(userId);
      if (!msgId) return next();
      const msg = await scheduledMessageRepository.findById(msgId);
      if (!msg) return next();
      // Update first message's text
      const firstMsg = msg.messages[0];
      if (firstMsg) {
        await scheduledMessageService.updateMessage(firstMsg.id, { text });
      } else {
        await scheduledMessageService.addMessage(msgId);
        const msgs = await scheduledMessageService.listMessages(msgId);
        if (msgs[0]) await scheduledMessageService.updateMessage(msgs[0].id, { text });
      }
      scheduledMessageState.setEditingContent(userId, false);
      await ctx.reply('✅ محتوا ذخیره شد.');
      await sendEditor(ctx, msgId);
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
      await ctx.reply(
        `✅ بازه: هر ${hours} ساعت\n\n⏰ ساعت شروع ارسال را وارد کنید:\nمثال: 09:00`
      );
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
      scheduledMessageState.setScheduleStep(userId, 'select_group');

      const groups = await prisma.telegramGroup.findMany({
        where: { status: 'APPROVED' },
        orderBy: { addedAt: 'desc' },
      });
      if (!groups.length) {
        await ctx.reply('گروه تأییدشده‌ای وجود ندارد.', scheduledMessageMainMenuKeyboard());
        scheduledMessageState.clearAll(userId);
        return;
      }
      await ctx.reply('👥 گروه مقصد را انتخاب کنید:', scheduleGroupKeyboard(groups));
      return;
    }

    // ── Button name input (in button editor mode) ──
    const btnMode = scheduledMessageState.getButtonEditorMode(userId);
    if (btnMode === 'waiting_for_button') {
      const msgId = scheduledMessageState.getEditMode(userId);
      if (!msgId) return next();
      await scheduledMessageService.addButton(msgId, { text, type: 'URL' });
      await ctx.reply(`✅ دکمه "${text}" اضافه شد.`);
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
      const type = (ctx.message as any).photo ? 'PHOTO' :
        (ctx.message as any).video ? 'VIDEO' :
        (ctx.message as any).document ? 'DOCUMENT' :
        (ctx.message as any).voice ? 'VOICE' :
        (ctx.message as any).audio ? 'AUDIO' :
        (ctx.message as any).animation ? 'ANIMATION' : 'STICKER';

      if (firstMsg) {
        await scheduledMessageService.updateMessage(firstMsg.id, { mediaFileId: media.file_id, type: type as any });
      } else {
        const newMsg = await scheduledMessageService.addMessage(msgId);
        await scheduledMessageService.updateMessage(newMsg.id, { mediaFileId: media.file_id, type: type as any });
      }

      scheduledMessageState.setEditingContent(userId, false);
      await ctx.reply('✅ رسانه ذخیره شد.');
      await sendEditor(ctx, msgId);
    }
  });

  // ─── Callback actions ───────────────────────────────────

  // View a scheduled message
  bot.action(/^sched:view:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const id = parseInt(ctx.match[1]);
    await sendEditor(ctx, id);
  });

  // List with pagination
  bot.action(/^sched:list:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const page = parseInt(ctx.match[1]);
    await sendList(ctx, page);
  });

  // Edit title
  bot.action(/^sched:edit:(\d+):title$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const id = parseInt(ctx.match[1]);
    scheduledMessageState.setEditingTitle(ctx.from.id, true);
    scheduledMessageState.setEditingMessage(ctx.from.id, id);
    const msg = await scheduledMessageRepository.findById(id);
    await ctx.reply(
      `📝 عنوان جدید را وارد کنید:\n\nعنوان فعلی: *${msg?.title || ''}*`,
      { parse_mode: 'Markdown', ...scheduledMessageCancelOnlyKeyboard() }
    );
  });

  // Messages list
  bot.action(/^sched:msgs:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const id = parseInt(ctx.match[1]);
    scheduledMessageState.setEditMode(ctx.from.id, id);
    const messages = await scheduledMessageService.listMessages(id);
    if (!messages.length) {
      await ctx.reply('پیامی وجود ندارد.');
      return;
    }
    await ctx.reply('📋 پیام‌ها:', scheduledMessageListInlineKeyboard(messages, id));
  });

  // Buttons management
  bot.action(/^sched:btns:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const id = parseInt(ctx.match[1]);
    scheduledMessageState.setEditMode(ctx.from.id, id);
    const buttons = await scheduledMessageService.listButtons(id);
    if (!buttons.length) {
      await ctx.reply('🔘 دکمه‌ای وجود ندارد.\nمتن دکمه را ارسال کنید تا اضافه شود.');
      scheduledMessageState.setButtonEditorMode(ctx.from.id, 'waiting_for_button');
      return;
    }
    const rows: any[][] = buttons.map((b: any) => [
      Markup.button.callback(`${b.text}`, `sched:btn:edit:${b.id}`),
      Markup.button.callback('🗑', `sched:btn:del:${b.id}`),
    ]);
    rows.push([Markup.button.callback('↩️ بازگشت', `sched:view:${id}`)]);
    await ctx.reply('🔘 دکمه‌ها:', Markup.inlineKeyboard(rows));
  });

  // Schedule configuration
  bot.action(/^sched:schedule:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const id = parseInt(ctx.match[1]);
    scheduledMessageState.setSchedulingMode(ctx.from.id, id);
    scheduledMessageState.setScheduleStep(ctx.from.id, 'interval');
    await ctx.reply('⏰ بازه زمانی ارسال را انتخاب کنید:', scheduleIntervalKeyboard());
  });

  // Interval selection
  bot.action(/^sched:interval:(\d+|custom)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const value = ctx.match[1];
    const userId = ctx.from.id;

    if (value === 'custom') {
      scheduledMessageState.setScheduleStep(userId, 'custom_interval');
      await ctx.reply(
        '⏰ زمان سفارشی برحسب ساعت وارد شود.\n\nلطفاً تعداد ساعت موردنظر را ارسال کنید:\nمثال: 1, 5, 12, 48, 72'
      );
      return;
    }

    const hours = parseInt(value);
    scheduledMessageState.setIntervalHours(userId, hours);
    scheduledMessageState.setScheduleStep(userId, 'start_time');
    await ctx.reply(
      `✅ بازه: هر ${hours} ساعت\n\n⏰ ساعت شروع ارسال را وارد کنید:\nمثال: 09:00`
    );
  });

  // Group selection
  bot.action(/^sched:group:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const chatId = parseInt(ctx.match[1]);
    const userId = ctx.from.id;
    scheduledMessageState.setTargetGroup(userId, chatId);

    // Check if forum
    const group = await prisma.telegramGroup.findUnique({ where: { chatId: BigInt(chatId) } });
    if (group?.isForum && group.forumTopics) {
      const topics = group.forumTopics as any[];
      if (topics.length > 0) {
        scheduledMessageState.setScheduleStep(userId, 'select_topic');
        await ctx.reply('📌 تاپیک مقصد را انتخاب کنید:', scheduleTopicKeyboard(topics));
        return;
      }
    }

    // No topics — save schedule and confirm
    await saveScheduleAndConfirm(ctx, userId);
  });

  // Topic selection
  bot.action(/^sched:topic:(all|\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const value = ctx.match[1];
    const userId = ctx.from.id;

    if (value === 'all') {
      scheduledMessageState.setTargetTopic(userId, null);
    } else {
      scheduledMessageState.setTargetTopic(userId, parseInt(value));
    }

    await saveScheduleAndConfirm(ctx, userId);
  });

  // Publish
  bot.action(/^sched:publish:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const id = parseInt(ctx.match[1]);
    try {
      await scheduledMessageService.publish(id);
      await ctx.reply('🚀 ارسال فعال شد!');
      await sendEditor(ctx, id);
    } catch (error: any) {
      await ctx.reply(`❌ ${error.message}`);
    }
  });

  // Unpublish
  bot.action(/^sched:unpublish:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const id = parseInt(ctx.match[1]);
    await scheduledMessageService.unpublish(id);
    await ctx.reply('📤 ارسال متوقف شد.');
    await sendEditor(ctx, id);
  });

  // Delete confirmation
  bot.action(/^sched:delete:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const id = parseInt(ctx.match[1]);
    const msg = await scheduledMessageRepository.findById(id);
    await ctx.reply(
      `⚠️ آیا از حذف "${msg?.title}" مطمئن هستید؟`,
      scheduledMessageDeleteConfirmKeyboard(id)
    );
  });

  bot.action(/^sched:delete:confirm:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const id = parseInt(ctx.match[1]);
    await scheduledMessageService.delete(id);
    await ctx.reply('🗑 حذف شد.');
    await sendList(ctx, 1);
  });

  // Message actions
  bot.action(/^sched:msg:edit:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const msgId = parseInt(ctx.match[1]);
    scheduledMessageState.setEditingMessage(ctx.from.id, msgId);
    scheduledMessageState.setEditingContent(ctx.from.id, true);
    const msg = await prisma.scheduledMessageMessage.findUnique({ where: { id: msgId } });
    await ctx.reply(
      `📝 محتوای پیام را ویرایش کنید:\n\nمحتوای فعلی:\n${msg?.text || '(خالی)'}`,
      scheduledMessageCancelOnlyKeyboard()
    );
  });

  bot.action(/^sched:msg:del:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const msgId = parseInt(ctx.match[1]);
    const msg = await prisma.scheduledMessageMessage.findUnique({ where: { id: msgId } });
    if (msg) {
      await scheduledMessageService.deleteMessage(msgId);
      await ctx.reply('🗑 پیام حذف شد.');
      if (msg.scheduledMessageId) {
        const messages = await scheduledMessageService.listMessages(msg.scheduledMessageId);
        if (messages.length) {
          await ctx.reply('📋 پیام‌ها:', scheduledMessageListInlineKeyboard(messages, msg.scheduledMessageId));
        }
      }
    }
  });

  bot.action(/^sched:msg:add:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const schedMsgId = parseInt(ctx.match[1]);
    const newMsg = await scheduledMessageService.addMessage(schedMsgId);
    scheduledMessageState.setEditingMessage(ctx.from.id, newMsg.id);
    scheduledMessageState.setEditingContent(ctx.from.id, true);
    await ctx.reply(
      '📝 محتوای پیام جدید را وارد کنید:\n(متن، عکس، ویدیو یا هر نوع رسانه‌ای)',
      scheduledMessageCancelOnlyKeyboard()
    );
  });

  // Button actions
  bot.action(/^sched:btn:edit:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const btnId = parseInt(ctx.match[1]);
    await ctx.reply(`📝 متن جدید دکمه را وارد کنید:`);
    // TODO: implement button text editing flow
  });

  bot.action(/^sched:btn:del:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const btnId = parseInt(ctx.match[1]);
    await scheduledMessageService.deleteButton(btnId);
    await ctx.reply('🗑 دکمه حذف شد.');
  });

  // Settings
  bot.action('sched:settings', async (ctx: any) => {
    await ctx.answerCbQuery();
    await ctx.reply('⚙️ تنظیمات پیام‌های خودکار:', scheduledMessageSettingsKeyboard());
  });

  // Emergency stop
  bot.action('sched:emergency_stop', async (ctx: any) => {
    await ctx.answerCbQuery();
    await ctx.reply('آیا مطمئن هستید؟ تمام ارسال‌ها متوقف خواهند شد.', scheduledMessageEmergencyStopConfirmKeyboard());
  });

  bot.action('sched:emergency_stop:confirm', async (ctx: any) => {
    await ctx.answerCbQuery();
    await scheduledMessageService.emergencyStop();
    await ctx.reply('⛔ تمام ارسال‌ها متوقف شد.');
    await ctx.reply('📢 پیام‌های خودکار', scheduledMessageMainMenuKeyboard());
  });

  // Dashboard refresh
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

  // Menu
  bot.action('sched:menu', async (ctx: any) => {
    await ctx.answerCbQuery();
    scheduledMessageState.clearAll(ctx.from.id);
    await ctx.reply('📢 پیام‌های خودکار', scheduledMessageMainMenuKeyboard());
  });
}

// ─── Helper: Send editor view ─────────────────────────────

import { Markup } from 'telegraf';

async function sendEditor(ctx: any, id: number) {
  const msg = await scheduledMessageRepository.findById(id);
  if (!msg) {
    await ctx.reply('❌ پیام یافت نشد.');
    return;
  }

  const status = msg.isPublished ? '🟢 فعال' : '⚪ غیرفعال';
  const interval = msg.intervalHours ? `هر ${msg.intervalHours} ساعت` : 'تعریف نشده';
  const startTime = msg.startTime || 'تعریف نشده';
  const targetGroup = msg.targetChatId ? String(msg.targetChatId) : 'تعریف نشده';
  const msgCount = msg.messages?.length || 0;
  const btnCount = msg.buttons?.length || 0;
  const sendCount = msg.sendCount || 0;

  const text = [
    `📝 *${msg.title}*`,
    '',
    `وضعیت: ${status}`,
    `زمان‌بندی: ${interval}`,
    `ساعت شروع: ${startTime}`,
    `گروه مقصد: ${targetGroup}`,
    `پیام‌ها: ${msgCount}`,
    `دکمه‌ها: ${btnCount}`,
    `دفعات ارسال: ${sendCount}`,
  ].join('\n');

  scheduledMessageState.setEditMode(ctx.from.id, id);
  await ctx.reply(text, {
    parse_mode: 'Markdown',
    ...scheduledMessageEditorKeyboard(id, msg.isPublished),
  });
}

// ─── Helper: Send list ────────────────────────────────────

async function sendList(ctx: any, page: number) {
  const result = await scheduledMessageRepository.findAll({ page, limit: 10 });
  if (!result.items.length) {
    await ctx.reply('📋 پیام خودکاری وجود ندارد.', scheduledMessageMainMenuKeyboard());
    return;
  }
  await ctx.reply(
    `📋 لیست پیام‌ها (${result.total} مورد):`,
    scheduledMessageListKeyboard(result.items, result.page, result.pages)
  );
}

// ─── Helper: Save schedule and confirm ────────────────────

async function saveScheduleAndConfirm(ctx: any, userId: number) {
  const msgId = scheduledMessageState.getSchedulingMode(userId);
  if (!msgId) return;

  const intervalHours = scheduledMessageState.getIntervalHours(userId);
  const startTime = scheduledMessageState.getStartTime(userId);
  const targetGroup = scheduledMessageState.getTargetGroup(userId);
  const targetTopic = scheduledMessageState.getTargetTopic(userId);

  if (!intervalHours || !startTime || !targetGroup) {
    await ctx.reply('❌ اطلاعات ناقص است.');
    return;
  }

  await scheduledMessageService.setSchedule(msgId, intervalHours, startTime, targetGroup, targetTopic);

  const topicText = targetTopic ? `تاپیک ${targetTopic}` : 'همه تاپیک‌ها';
  await ctx.reply(
    `✅ زمان‌بندی ذخیره شد:\n\n⏰ بازه: هر ${intervalHours} ساعت\n🕐 شروع: ${startTime}\n👥 گروه: ${targetGroup}\n📌 تاپیک: ${topicText}`,
    scheduledMessageMainMenuKeyboard()
  );

  scheduledMessageState.clearAll(userId);
}
