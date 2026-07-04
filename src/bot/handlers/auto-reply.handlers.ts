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
import {
  autoReplyMainMenuKeyboard,
  autoReplyListInlineKeyboard,
  autoReplyNewPostManagerReplyKeyboard,
  autoReplyEditorReplyKeyboard,
  autoReplyCancelOnlyKeyboard,
  autoReplyAddMessageKeyboard,
  autoReplyEditMessageReplyKeyboard,
  autoReplySingleMessageInlineKeyboard,
  autoReplyIntervalKeyboard,
  autoReplyGroupReplyKeyboard,
  autoReplyTopicReplyKeyboard,
  autoReplyPublishValidationKeyboard,
  autoReplyDeleteConfirmKeyboard,
  autoReplyDashboardKeyboard,
  renderAutoReplyButtonEditor,
  buildArbtnEditTypeKeyboard,
  buildArbtnColorKeyboard,
} from '../keyboards/auto-reply-keyboards';

function formatAutoReplyInfo(msg: any): string {
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
  if (!msg.intervalMinutes) missing.push({ key: 'schedule', label: '⏰ زمان‌بندی پاسخ' });
  if (!msg.targetChatId) missing.push({ key: 'group', label: '👥 گروه پاسخ' });
  if (!msg.startTime) missing.push({ key: 'schedule', label: '⏰ ساعت شروع پاسخ' });
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

  // ─── Back to admin panel ────────────────────────────────
  bot.hears('🔙 بازگشت به پنل', async (ctx: any, next) => {
    if (!autoReplyState.isManagementMode(ctx.from.id)) return next();
    autoReplyState.clearAll(ctx.from.id);
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

  // ─── Reports ────────────────────────────────────────────
  bot.hears('📊 گزارش پاسخ‌ها', async (ctx: any) => {
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    const stats = await autoReplyService.getStats();
    const text = [
      '📊 گزارش ارسال خودکار',
      '',
      `🟢 پیام‌های فعال: ${stats.activeReplies}`,
      `📤 ارسال امروز: ${stats.todaySends}`,
      `📤 ارسال هفته: ${stats.weekSends}`,
      `👥 گروه‌های فعال: ${stats.activeGroups}`,
      `❌ خطاها: ${stats.errorCount}`,
    ].join('\n');
    await ctx.reply(text, autoReplyDashboardKeyboard());
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
      if (msgId) {
        await showAutoReplyEditor(ctx, msgId);
      }
      return;
    }
    if (autoReplyState.isEditingTitle(userId)) {
      autoReplyState.setEditingTitle(userId, false);
      autoReplyState.setEditingMessage(userId, 0);
      const msgId = autoReplyState.getEditMode(userId);
      if (msgId) {
        await showAutoReplyEditor(ctx, msgId);
      }
      return;
    }
    if (autoReplyState.getScheduleStep(userId)) {
      autoReplyState.setScheduleStep(userId, null as any);
      const msgId = autoReplyState.getEditMode(userId);
      if (msgId) {
        await showAutoReplyEditor(ctx, msgId);
      }
      return;
    }
    return next();
  });

  // ─── Back buttons ──
  bot.hears('🔙 بازگشت به پنل', async (ctx: any, next) => {
    if (!ctx.from) return next();
    const userId = ctx.from.id;
    autoReplyState.setEditingContent(userId, false);
    autoReplyState.setEditingTitle(userId, false);
    const editMsgId = autoReplyState.getEditingMessage(userId);
    if (editMsgId) {
      autoReplyState.setEditingMessage(userId, 0);
    }
    autoReplyState.setScheduleStep(userId, null as any);
    const msgId = autoReplyState.getEditMode(userId);
    if (msgId) {
      await showAutoReplyEditor(ctx, msgId);
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

  bot.hears('⏰ زمان‌بندی پاسخ', async (ctx: any) => {
    const msgId = autoReplyState.getEditMode(ctx.from.id);
    if (!msgId) return;
    autoReplyState.setSchedulingMode(ctx.from.id, msgId);
    autoReplyState.setScheduleStep(ctx.from.id, 'interval');
    await ctx.reply('⏰ بازه زمانی ارسال را انتخاب کنید:', autoReplyIntervalKeyboard());
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
    autoReplyState.setScheduleStep(ctx.from.id, 'select_group');
    await ctx.reply('👥 گروه مقصد را انتخاب کنید:', autoReplyGroupReplyKeyboard(groups));
  });

  bot.hears('📖 دستور پاسخ', async (ctx: any) => {
    const msgId = autoReplyState.getEditMode(ctx.from.id);
    if (!msgId) return;
    autoReplyState.setScheduleStep(ctx.from.id, 'command_input');
    const msg = await autoReplyRepository.findById(msgId);
    const currentCmd = (msg as any)?.command || '';
    const hint = currentCmd ? `\n\nدستور فعلی: ${currentCmd}\n\nبرای حذف دستور: ❌ حذف دستور` : '';
    await ctx.reply(`نام دستور را ارسال کنید.\nبدون علامت /\nمثال: start, help, vip${hint}`, autoReplyCancelOnlyKeyboard());
  });

  bot.hears('❌ حذف دستور پاسخ', async (ctx: any) => {
    const msgId = autoReplyState.getEditMode(ctx.from.id);
    if (!msgId) return;
    autoReplyState.setScheduleStep(ctx.from.id, null as any);
    await prisma.autoReply.update({ where: { id: msgId }, data: { slug: null } as any }).catch(() => {});
    await ctx.reply('🗑 دستور حذف شد.');
    await showAutoReplyEditor(ctx, msgId);
  });

  bot.hears('✅ انتشار پاسخ', async (ctx: any) => {
    const msgId = autoReplyState.getEditMode(ctx.from.id);
    logger.info(`[AutoReply] Publish requested by userId=${ctx.from.id} editMode=${msgId}`);
    if (!msgId) {
      logger.warn(`[AutoReply] Publish ABORTED: editMode is null`);
      await ctx.reply('❌ پستی انتخاب نشده است.');
      return;
    }
    const msg = await autoReplyRepository.findById(msgId);
    if (!msg) {
      logger.warn(`[AutoReply] Publish ABORTED: msg=${msgId} not found in DB`);
      return;
    }

    logger.info(`[AutoReply] Publish pre-check msg=${msgId} interval=${msg.intervalMinutes}min startTime=${msg.startTime} chatId=${msg.targetChatId} topicId=${msg.targetTopicId} isPublished=${msg.isPublished} status=${msg.status} messages=${msg.messages?.length}`);

    const { ready, missing } = validatePublishReadiness(msg);
    if (!ready) {
      logger.warn(`[AutoReply] Publish ABORTED: not ready. Missing: ${missing.map(m => m.key).join(', ')}`);
      const missingList = missing.map((m) => `❌ ${m.label.replace(/^[^\s]+ /, '')}`).join('\n');
      await ctx.reply(
        `این پست هنوز آماده انتشار نیست.\nبخش‌های تکمیل‌نشده:\n${missingList}`,
        autoReplyPublishValidationKeyboard(missing),
      );
      return;
    }

    try {
      await autoReplyService.publish(msgId);
      const verify = await autoReplyRepository.findById(msgId);
      logger.info(`[AutoReply] Publish SUCCESS msg=${msgId} isPublished=${verify?.isPublished} status=${verify?.status} nextSendAt=${verify?.nextSendAt?.toISOString()} interval=${verify?.intervalMinutes}min startTime=${verify?.startTime} chatId=${verify?.targetChatId}`);
      await ctx.reply('✅ پست منتشر شد و ارسال خودکار فعال شد!');
      await showAutoReplyEditor(ctx, msgId);
    } catch (err: any) {
      logger.error(`[AutoReply] Publish FAILED msg=${msgId}: ${err.message}`);
      await ctx.reply(`❌ خطا در انتشار: ${err.message}`);
    }
  });

  bot.hears('🧪 تست پاسخ', async (ctx: any) => {
    const msgId = autoReplyState.getEditMode(ctx.from.id);
    if (!msgId) {
      await ctx.reply('❌ پستی انتخاب نشده.');
      return;
    }
    const msg = await autoReplyRepository.findById(msgId);
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

    try {
      await autoReplyService.testSend(msgId);
      await ctx.reply('✅ ارسال تستی انجام شد. نتیجه را در لاگ بررسی کنید.');
    } catch (err: any) {
      await ctx.reply(`❌ خطا در ارسال تستی: ${err.message}`);
    }

    await showAutoReplyEditor(ctx, msgId);
  });

  bot.hears('📊 آمار پاسخ‌ها', async (ctx: any) => {
    const msgId = autoReplyState.getEditMode(ctx.from.id);
    if (!msgId) return;
    const msg = await autoReplyRepository.findById(msgId);
    if (!msg) return;
    const logs = await autoReplyService.getLogs(msgId, 5);
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

  bot.hears('📊 وضعیت زمان‌بند پاسخ', async (ctx: any) => {
    const msgId = autoReplyState.getEditMode(ctx.from.id);
    if (!msgId) {
      await ctx.reply('❌ پستی انتخاب نشده.');
      return;
    }
    const status = await autoReplyService.getSchedulerStatus(msgId);
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

  bot.hears('🗑 حذف پاسخ', async (ctx: any) => {
    const msgId = autoReplyState.getEditMode(ctx.from.id);
    if (!msgId) return;
    const msg = await autoReplyRepository.findById(msgId);
    await ctx.reply(
      `⚠️ آیا از حذف "${msg?.title}" مطمئن هستید؟\n\nاین عملیات غیرقابل بازگشت است.`,
      autoReplyDeleteConfirmKeyboard(msgId),
    );
  });

  // ─── Text input handler ───
  bot.on('text', async (ctx: any, next) => {
    if (!ctx.from || ctx.chat?.type !== 'private') return next();
    const text = ctx.message.text;
    const userId = ctx.from.id;

    const admin = await botAdminService.getActive(userId);
    if (!admin) return next();

    const isCreating = autoReplyState.isCreating(userId);
    const isEditingTitle = autoReplyState.isEditingTitle(userId);
    const isEditingContent = autoReplyState.isEditingContent(userId);
    const scheduleStep = autoReplyState.getScheduleStep(userId);

    if (autoReplyState.isButtonMoveActive(userId)) {
      return next();
    }

    if (!isCreating && !isEditingTitle && !isEditingContent && !scheduleStep) {
      if (autoReplyState.isManagementMode(userId) && !autoReplyState.getEditMode(userId)) {
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
      return next();
    }

    const btnState = autoReplyState.getButtonState(userId);
    if (btnState === 'wait_text') {
      return next();
    }

    const knownButtons = [
      '➕ ایجاد پاسخ جدید', '📋 لیست پاسخ‌ها',
      '🔙 بازگشت به پنل', '➕ افزودن پیام پاسخ', '⏰ زمان‌بندی پاسخ',
      '👥 گروه پاسخ', '📖 دستور پاسخ', '✅ انتشار پاسخ', '📊 آمار پاسخ‌ها',
      '🧪 تست پاسخ', '📊 وضعیت زمان‌بند پاسخ',
      '🗑 حذف پاسخ', '🔙 بازگشت به لیست پاسخ', '❌ لغو پاسخ',
      '❌ حذف دستور پاسخ', '🔘 دکمه‌های پاسخ',
      '✏️ ویرایش محتوای پاسخ', '📝 ویرایش عنوان پاسخ',
      '⬆️ بالا پاسخ', '⬇️ پایین پاسخ', '⬅️ چپ پاسخ', '➡️ راست پاسخ',
      '✅ تایید جابه‌جایی پاسخ', '❌ لغو جابجایی پاسخ',
    ];
    if (scheduleStep && knownButtons.includes(text)) {
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
      if (!msgId) return next();
      const title = validateDbInput(text, 'title');
      await autoReplyService.update(msgId, { title });
      autoReplyState.setEditingTitle(userId, false);
      autoReplyState.setEditingMessage(userId, 0);
      await ctx.reply(`✅ عنوان به "${title}" تغییر کرد.`);
      await showAutoReplyEditor(ctx, msgId);
      return;
    }

    if (isEditingContent) {
      const editMsgId = autoReplyState.getEditingMessage(userId);
      const msgId = autoReplyState.getEditMode(userId);
      if (!msgId) return next();

      const msg = ctx.message as any;
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
          try {
            await ctx.telegram.copyMessage(ctx.chat.id, originChatId, originMessageId);
          } catch {
            await ctx.reply('⚠️ منبع پیام فوروارد در دسترس نیست.\nاین پیام را دوباره از منبع ثبت کنید.');
            return;
          }

          const forwardSource = { chatId: originChatId, messageId: originMessageId };

          if (editMsgId === -1) {
            const newMsg = await autoReplyService.addMessage(msgId);
            await autoReplyService.updateMessage(newMsg.id, { type: 'forward' as any, forwardSource });
          } else if (editMsgId) {
            await autoReplyService.updateMessage(editMsgId, { type: 'forward' as any, forwardSource });
          }

          autoReplyState.setEditingContent(userId, false);
          autoReplyState.setEditingMessage(userId, 0);
          await ctx.reply('✅ پیام فورواردی اضافه شد');
          await showAutoReplyEditor(ctx, msgId);
          return;
        }
      }

      const entities = ctx.message.entities?.map((e: any) => ({
        type: e.type, offset: e.offset, length: e.length,
        url: e.url, user: e.user, language: e.language, custom_emoji_id: e.custom_emoji_id,
      })) || [];
      const replyMarkup = ctx.message.reply_markup || null;

      const updateData: any = { text };

      if (entities.length > 0) {
        updateData.entities = entities;
      }

      if (replyMarkup?.inline_keyboard) {
        updateData.replyMarkup = replyMarkup;
      }

      if (editMsgId === -1) {
        const newMsg = await autoReplyService.addMessage(msgId);
        await autoReplyService.updateMessage(newMsg.id, updateData);
      } else if (editMsgId) {
        await autoReplyService.updateMessage(editMsgId, updateData);
      }

      autoReplyState.setEditingContent(userId, false);
      autoReplyState.setEditingMessage(userId, 0);
      await ctx.reply('✅ پیام ذخیره شد.');
      await showAutoReplyEditor(ctx, msgId);
      return;
    }

    if (scheduleStep === 'command_input') {
      const msgId = autoReplyState.getEditMode(userId);
      if (!msgId) return next();
      const cmd = text.trim().toLowerCase().replace(/^\//, '');
      if (!cmd || cmd.length < 1) {
        await ctx.reply('❌ لطفاً یک نام دستور معتبر وارد کنید.');
        return;
      }
      await prisma.autoReply.update({ where: { id: msgId }, data: { slug: cmd } as any });
      autoReplyState.setScheduleStep(userId, null as any);
      await ctx.reply(`✅ دستور /${cmd} ثبت شد.`);
      await showAutoReplyEditor(ctx, msgId);
      return;
    }

    if (scheduleStep === 'custom_interval') {
      const hours = parseInt(text, 10);
      if (isNaN(hours) || hours < 1) {
        await ctx.reply('❌ لطفاً یک عدد معتبر وارد کنید (حداقل ۱).');
        return;
      }
      autoReplyState.setIntervalHours(userId, hours);
      autoReplyState.setScheduleStep(userId, 'start_time');
      const msgId = autoReplyState.getSchedulingMode(userId) || autoReplyState.getEditMode(userId);
      if (msgId) {
        await autoReplyRepository.update(msgId, { intervalMinutes: hours });
        logger.info(`[AutoReply] Saved intervalMinutes=${hours} to msg=${msgId}`);
      }
      const displayText = hours >= 60 ? `هر ${hours / 60} ساعت` : `هر ${hours} دقیقه`;
      await ctx.reply(`✅ بازه: ${displayText}\n\n⏰ ساعت شروع ارسال را وارد کنید.\nمثال:\n09:00\n14:30\n22:15`);
      return;
    }

    if (scheduleStep === 'start_time') {
      const timeRegex = /^([01]?\d|2[0-3]):([0-5]\d)$/;
      if (!timeRegex.test(text)) {
        await ctx.reply('❌ فرمت ساعت نامعتبر است.\nمثال: 09:00 یا 14:30');
        return;
      }
      autoReplyState.setStartTime(userId, text);
      autoReplyState.setScheduleStep(userId, null as any);

      const msgId = autoReplyState.getSchedulingMode(userId) || autoReplyState.getEditMode(userId);
      if (msgId) {
        const intervalMinutes = autoReplyState.getIntervalHours(userId);
        await autoReplyRepository.update(msgId, {
          startTime: text,
          ...(intervalMinutes ? { intervalMinutes } : {}),
        });
        logger.info(`[AutoReply] Saved startTime=${text} intervalMinutes=${intervalMinutes} to msg=${msgId}`);
      }
      if (msgId) {
        await ctx.reply('✅ ساعت شروع ذخیره شد.');
        await showAutoReplyEditor(ctx, msgId);
      }
      return;
    }

    if (scheduleStep === 'select_group') {
      const groups = await prisma.telegramGroup.findMany({
        where: { status: 'APPROVED', botIsAdmin: true },
        orderBy: { addedAt: 'desc' },
      });
      const matched = groups.find((g) => g.title === text);
      if (matched) {
        const chatId = Number(matched.chatId);
        autoReplyState.setTargetGroup(userId, chatId);

        const msgId = autoReplyState.getEditMode(userId);
        if (msgId) {
          await autoReplyRepository.update(msgId, { targetChatId: BigInt(chatId) });
          logger.info(`[AutoReply] Saved targetChatId=${chatId} to msg=${msgId}`);
        }

        const topics = await forumTopicService.getTopicsForChat(chatId);
        if (topics.length > 0) {
          autoReplyState.setScheduleStep(userId, 'select_topic');
          await ctx.reply('📌 تاپیک مقصد را انتخاب کنید:', autoReplyTopicReplyKeyboard(topics));
          return;
        }

        if (msgId) {
          await ctx.reply(`✅ گروه "${matched.title}" انتخاب شد.`);
          await showAutoReplyEditor(ctx, msgId);
        }
        return;
      }
      return next();
    }

    if (scheduleStep === 'select_topic') {
      let topicId: number | null = null;
      if (text === '📌 همه تاپیک‌ها') {
        topicId = null;
      } else {
        const targetGroup = autoReplyState.getTargetGroup(userId);
        if (targetGroup) {
          const topics = await forumTopicService.getTopicsForChat(targetGroup);
          const topic = topics.find((t) => t.name === text);
          if (topic) {
            topicId = topic.topicId;
          }
        }
      }
      autoReplyState.setTargetTopic(userId, topicId);
      autoReplyState.setScheduleStep(userId, null as any);

      const msgId = autoReplyState.getEditMode(userId);
      if (msgId) {
        await autoReplyRepository.update(msgId, {
          targetTopicId: topicId != null ? BigInt(topicId) : null,
        });
        logger.info(`[AutoReply] Saved targetTopicId=${topicId} to msg=${msgId}`);
        const topicText = text === '📌 همه تاپیک‌ها' ? 'همه تاپیک‌ها' : text;
        await ctx.reply(`✅ تاپیک "${topicText}" انتخاب شد.`);
        await showAutoReplyEditor(ctx, msgId);
      }
      return;
    }

    return next();
  });

  // ─── Media handler ──
  bot.on(['photo', 'video', 'animation', 'document', 'audio', 'voice', 'video_note', 'sticker'], async (ctx: any) => {
    const userId = ctx.from.id;
    const isEditingContent = autoReplyState.isEditingContent(userId);
    if (!isEditingContent) return;

    const editMsgId = autoReplyState.getEditingMessage(userId);
    const msgId = autoReplyState.getEditMode(userId);
    if (!msgId) return;

    const msg = ctx.message as any;

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

    if (!mediaFileId) return;

    const caption = msg.caption || '';
    const captionEntities = msg.caption_entities || [];
    const entities = msg.entities || [];
    const replyMarkup = msg.reply_markup || null;

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
        try {
          await ctx.telegram.copyMessage(ctx.chat.id, originChatId, originMessageId);
        } catch {
          await ctx.reply('⚠️ منبع پیام فوروارد در دسترس نیست.\nاین پیام را دوباره از منبع ثبت کنید.');
          return;
        }

        const forwardSource = { chatId: originChatId, messageId: originMessageId };

        if (editMsgId === -1) {
          const newMsg = await autoReplyService.addMessage(msgId);
          await autoReplyService.updateMessage(newMsg.id, { type: 'forward' as any, forwardSource });
        } else if (editMsgId) {
          await autoReplyService.updateMessage(editMsgId, { type: 'forward' as any, forwardSource });
        }

        autoReplyState.setEditingContent(userId, false);
        autoReplyState.setEditingMessage(userId, 0);
        await ctx.reply('✅ پیام فورواردی اضافه شد');
        await showAutoReplyEditor(ctx, msgId);
        return;
      }
    }

    const mediaGroupId = msg.media_group_id || null;

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
      const newMsg = await autoReplyService.addMessage(msgId);
      targetMsgId = newMsg.id;
    }

    if (targetMsgId && targetMsgId > 0) {
      await autoReplyService.updateMessage(targetMsgId, update);
      logger.info(`[AutoReplyMedia] Saved: msgId=${targetMsgId} type=${mediaType} file_id=${mediaFileId} caption="${caption.substring(0, 50)}" entities=${entities.length} captionEntities=${captionEntities.length} mediaGroup=${mediaGroupId}`);
    }

    autoReplyState.setEditingContent(userId, false);
    autoReplyState.setEditingMessage(userId, 0);
    await ctx.reply(`✅ ${mediaType} ذخیره شد.`);
    await showAutoReplyEditor(ctx, msgId);
  });

  // ─── Callbacks ──────────────────────────────────────────

  bot.action(/^ar:view:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const id = parseInt(ctx.match[1]);
    autoReplyState.setEditMode(ctx.from.id, id);
    autoReplyState.setManagementMode(ctx.from.id, true);
    await showAutoReplyEditor(ctx, id);
  });

  bot.action(/^ar:list:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const page = parseInt(ctx.match[1]);
    await sendList(ctx, page);
  });

  bot.action(/^ar:schedule:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const id = parseInt(ctx.match[1]);
    autoReplyState.setSchedulingMode(ctx.from.id, id);
    autoReplyState.setScheduleStep(ctx.from.id, 'interval');
    await ctx.reply('⏰ بازه زمانی ارسال را انتخاب کنید:', autoReplyIntervalKeyboard());
  });

  bot.action(/^ar:interval:(\d+|custom)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const value = ctx.match[1];
    const userId = ctx.from.id;

    if (value === 'custom') {
      autoReplyState.setScheduleStep(userId, 'custom_interval');
      await ctx.reply('⏰ زمان سفارشی برحسب ساعت وارد شود.\n\nلطفاً تعداد ساعت موردنظر را ارسال کنید:\nمثال: 1, 5, 12, 48, 72');
      return;
    }

    const hours = parseInt(value);
    autoReplyState.setIntervalHours(userId, hours);
    autoReplyState.setScheduleStep(userId, 'start_time');

    const msgId = autoReplyState.getSchedulingMode(userId) || autoReplyState.getEditMode(userId);
    if (msgId) {
      await autoReplyRepository.update(msgId, { intervalMinutes: hours });
      logger.info(`[AutoReply] Saved intervalMinutes=${hours} to msg=${msgId}`);
    }

    const displayText = hours >= 60 ? `هر ${hours / 60} ساعت` : `هر ${hours} دقیقه`;
    await ctx.reply(`✅ بازه: ${displayText}\n\n⏰ ساعت شروع ارسال را وارد کنید.\nمثال:\n09:00\n14:30\n22:15`);
  });

  bot.action(/^ar:group:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const chatId = parseInt(ctx.match[1]);
    const userId = ctx.from.id;
    autoReplyState.setTargetGroup(userId, chatId);

    const msgId = autoReplyState.getEditMode(userId);
    if (msgId) {
      await autoReplyRepository.update(msgId, { targetChatId: BigInt(chatId) });
      logger.info(`[AutoReply] Saved targetChatId=${chatId} to msg=${msgId}`);
    }

    const topics = await forumTopicService.getTopicsForChat(chatId);
    if (topics.length > 0) {
      autoReplyState.setScheduleStep(userId, 'select_topic');
      await ctx.reply('📌 تاپیک مقصد را انتخاب کنید:', autoReplyTopicReplyKeyboard(topics));
      return;
    }

    if (msgId) {
      await ctx.reply(`✅ گروه انتخاب شد.`);
      await showAutoReplyEditor(ctx, msgId);
    }
    autoReplyState.clearAll(userId);
  });

  bot.action(/^ar:publish:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const id = parseInt(ctx.match[1]);
    const msg = await autoReplyRepository.findById(id);
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

    await autoReplyService.publish(id);
    await ctx.reply('✅ پست منتشر شد!');
    await showAutoReplyEditor(ctx, id);
  });

  bot.action(/^ar:unpublish:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const id = parseInt(ctx.match[1]);
    await autoReplyService.unpublish(id);
    await ctx.reply('📤 ارسال متوقف شد.');
    await showAutoReplyEditor(ctx, id);
  });

  bot.action(/^ar:delete:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const id = parseInt(ctx.match[1]);
    const msg = await autoReplyRepository.findById(id);
    await ctx.reply(
      `⚠️ آیا از حذف "${msg?.title}" مطمئن هستید؟`,
      autoReplyDeleteConfirmKeyboard(id),
    );
  });

  bot.action(/^ar:delete:confirm:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const id = parseInt(ctx.match[1]);
    await autoReplyService.delete(id);
    await ctx.reply('🗑 حذف شد.');
    autoReplyState.clearAll(ctx.from.id);
    await sendList(ctx, 1);
  });

  bot.action(/^ar:msg:edit:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const msgId = parseInt(ctx.match[1]);
    autoReplyState.setEditingMessage(ctx.from.id, msgId);
    const msg = await prisma.autoReplyMessage.findUnique({ where: { id: msgId } });
    await ctx.reply(
      `📝 پیام ${msg?.order !== undefined ? msg.order + 1 : ''}\n\nمحتوای فعلی:\n${msg?.text || '(خالی)'}`,
      autoReplyEditMessageReplyKeyboard(),
    );
  });

  bot.hears('✏️ ویرایش محتوای پاسخ', async (ctx: any) => {
    const msgId = autoReplyState.getEditingMessage(ctx.from.id);
    if (!msgId) return;
    autoReplyState.setEditingContent(ctx.from.id, true);
    const msg = await prisma.autoReplyMessage.findUnique({ where: { id: msgId } });
    await ctx.reply(
      `📝 محتوای پیام را ویرایش کنید:\n\nمحتوای فعلی:\n${msg?.text || '(خالی)'}`,
      autoReplyCancelOnlyKeyboard(),
    );
  });

  bot.hears('📝 ویرایش عنوان پاسخ', async (ctx: any) => {
    const msgId = autoReplyState.getEditingMessage(ctx.from.id);
    if (!msgId) return;
    autoReplyState.setEditingTitle(ctx.from.id, true);
    const msg = await autoReplyRepository.findById(msgId);
    await ctx.reply(
      `✏ عنوان فعلی: *${msg?.title || ''}*\n\nعنوان جدید را ارسال کنید:`,
      { parse_mode: 'Markdown', ...autoReplyCancelOnlyKeyboard() },
    );
  });

  // ─── Button Editor ──
  bot.hears('🔘 دکمه‌های پاسخ', async (ctx: any) => {
    const userId = ctx.from.id;
    logger.info(`[ARButtonEditor] Reply Button Clicked userId=${userId}`);

    let msgId = autoReplyState.getEditingMessage(userId);
    logger.info(`[ARButtonEditor] editingMessage=${msgId}`);

    if (!msgId || msgId <= 0) {
      const editMode = autoReplyState.getEditMode(userId);
      logger.info(`[ARButtonEditor] editMode fallback=${editMode}`);
      if (editMode) {
        const msgs = await autoReplyService.listMessages(editMode);
        if (msgs.length > 0) {
          msgId = msgs[0].id;
          autoReplyState.setEditingMessage(userId, msgId);
        }
      }
    }

    if (!msgId || msgId <= 0) {
      logger.warn(`[ARButtonEditor] No message to edit buttons for userId=${userId}`);
      await ctx.reply('❌ ابتدا یک پیام انتخاب کنید.');
      return;
    }

    logger.info(`[ARButtonEditor] Auto Reply Loaded, Loading buttons for messageId=${msgId}`);
    const buttons = await autoReplyRepository.findButtonsByMessage(msgId);
    logger.info(`[ARButtonEditor] Buttons Loaded: ${buttons.length}`);

    const grid = buttonsToGrid(buttons);
    const { text, reply_markup } = renderAutoReplyButtonEditor(msgId, grid, 'create');
    logger.info(`[ARButtonEditor] Render Inline Keyboard`);

    const sent = await ctx.reply(text, { reply_markup });
    if (sent) {
      autoReplyState.setButtonEditorMsgId(userId, sent.message_id);
      logger.info(`[ARButtonEditor] Editor Sent Successfully, editorMsgId=${sent.message_id}`);
    } else {
      logger.error(`[ARButtonEditor] Failed to send editor message`);
    }
    autoReplyState.setButtonMode(userId, 'create');
  });

  bot.action(/^ar:msg:btnedit:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const msgId = parseInt(ctx.match[1]);
    logger.info(`[ARButtonEditor] Inline Button Clicked msgId=${msgId}`);

    autoReplyState.setEditingMessage(userId, msgId);

    logger.info(`[ARButtonEditor] Loading buttons for messageId=${msgId}`);
    const buttons = await autoReplyRepository.findButtonsByMessage(msgId);
    logger.info(`[ARButtonEditor] Buttons Loaded: ${buttons.length}`);

    const grid = buttonsToGrid(buttons);
    const { text, reply_markup } = renderAutoReplyButtonEditor(msgId, grid, 'create');
    logger.info(`[ARButtonEditor] Render Inline Keyboard`);

    const sent = await ctx.reply(text, { reply_markup });
    if (sent) {
      autoReplyState.setButtonEditorMsgId(userId, sent.message_id);
      logger.info(`[ARButtonEditor] Editor Sent Successfully, editorMsgId=${sent.message_id}`);
    } else {
      logger.error(`[ARButtonEditor] Failed to send editor message`);
    }
    autoReplyState.setButtonMode(userId, 'create');
  });

  bot.action(/^ar:msg:delete:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const msgId = parseInt(ctx.match[1]);
    const msg = await prisma.autoReplyMessage.findUnique({ where: { id: msgId } });
    if (msg) {
      await autoReplyService.deleteMessage(msgId);
      await ctx.reply('🗑 پیام حذف شد.');
      if (msg.autoReplyId) {
        await showAutoReplyEditor(ctx, msg.autoReplyId);
      }
    }
  });

  bot.action(/^ar:msg:up:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const arMsgId = parseInt(ctx.match[1]);
    const msgId = parseInt(ctx.match[2]);
    const messages = await autoReplyService.listMessages(arMsgId);
    const idx = messages.findIndex((m: any) => m.id === msgId);
    if (idx > 0) {
      const ids = messages.map((m: any) => m.id);
      [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
      await autoReplyService.reorderMessages(arMsgId, ids);
    }
    await showAutoReplyEditor(ctx, arMsgId);
  });

  bot.action(/^ar:msg:down:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const arMsgId = parseInt(ctx.match[1]);
    const msgId = parseInt(ctx.match[2]);
    const messages = await autoReplyService.listMessages(arMsgId);
    const idx = messages.findIndex((m: any) => m.id === msgId);
    if (idx < messages.length - 1) {
      const ids = messages.map((m: any) => m.id);
      [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
      await autoReplyService.reorderMessages(arMsgId, ids);
    }
    await showAutoReplyEditor(ctx, arMsgId);
  });

  bot.action(/^ar:msg:add:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    autoReplyState.setEditingMessage(ctx.from.id, -1);
    autoReplyState.setEditingContent(ctx.from.id, true);
    await ctx.reply(
      'پیام جدید را ارسال کنید.\nمی‌توانید متن، عکس، ویدیو، فایل، گیف، پیام فوروارد شده یا هر نوع پیام پشتیبانی‌شده توسط سیستم Post را ارسال کنید.',
      autoReplyAddMessageKeyboard(),
    );
  });

  bot.action(/^ar:goto:(\w+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const field = ctx.match[1];
    const userId = ctx.from.id;
    const msgId = autoReplyState.getEditMode(userId);
    if (!msgId) return;

    if (field === 'schedule') {
      autoReplyState.setSchedulingMode(userId, msgId);
      autoReplyState.setScheduleStep(userId, 'interval');
      await ctx.reply('⏰ بازه زمانی ارسال را انتخاب کنید:', autoReplyIntervalKeyboard());
    } else if (field === 'group') {
      const groups = await prisma.telegramGroup.findMany({
        where: { status: 'APPROVED', botIsAdmin: true },
        orderBy: { addedAt: 'desc' },
      });
      if (!groups.length) {
        await ctx.reply('گروه تأییدشده‌ای وجود ندارد.');
        return;
      }
      autoReplyState.setScheduleStep(userId, 'select_group');
      await ctx.reply('👥 گروه مقصد را انتخاب کنید:', autoReplyGroupReplyKeyboard(groups));
    } else if (field === 'messages') {
      autoReplyState.setEditingMessage(userId, -1);
      autoReplyState.setEditingContent(userId, true);
      await ctx.reply(
        'پیام جدید را ارسال کنید.\nمی‌توانید متن، عکس، ویدیو، فایل، گیف، پیام فوروارد شده یا هر نوع پیام پشتیبانی‌شده توسط سیستم Post را ارسال کنید.',
        autoReplyAddMessageKeyboard(),
      );
    }
  });

  bot.action('ar:dashboard:refresh', async (ctx: any) => {
    await ctx.answerCbQuery();
    const stats = await autoReplyService.getStats();
    const text = [
      '📊 گزارش ارسال خودکار',
      '',
      `🟢 پیام‌های فعال: ${stats.activeReplies}`,
      `📤 ارسال امروز: ${stats.todaySends}`,
      `📤 ارسال هفته: ${stats.weekSends}`,
      `👥 گروه‌های فعال: ${stats.activeGroups}`,
      `❌ خطاها: ${stats.errorCount}`,
    ].join('\n');
    await ctx.reply(text, autoReplyDashboardKeyboard());
  });

  bot.action('ar:menu', async (ctx: any) => {
    await ctx.answerCbQuery();
    autoReplyState.clearAll(ctx.from.id);
    autoReplyState.setManagementMode(ctx.from.id, true);
    const result = await autoReplyRepository.findAll({ page: 1, limit: 100 });
    await ctx.reply('💬 پاسخ‌های خودکار', autoReplyMainMenuKeyboard(result.items));
  });

  // ─── Button Editor callbacks ──
  bot.action(/^arbtn:click:(\d+):(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const msgId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    const col = parseInt(ctx.match[3]);
    const mode = autoReplyState.getButtonMode(userId) || 'create';
    logger.info(`[ARButtonEditor] Click msgId=${msgId} row=${row} col=${col} mode=${mode}`);

    const buttons = await autoReplyRepository.findButtonsByMessage(msgId);
    const grid = buttonsToGrid(buttons);

    if (mode === 'move') {
      autoReplyState.setButtonMoveSelected(userId, row, col);
      autoReplyState.setButtonMoveActive(userId, true);
      const editorMsgId = autoReplyState.getButtonEditorMsgId(userId);
      if (editorMsgId) {
        const { text, reply_markup } = renderAutoReplyButtonEditor(msgId, grid, 'move', { row, col });
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
          await autoReplyRepository.deleteButton(btn.id);
        }
        autoReplyState.setButtonMode(userId, 'create');
        await refreshButtonEditor(ctx, msgId);
      }
      return;
    }

    if (mode === 'edit') {
      const btn = grid[row]?.[col];
      if (!btn) return;
      autoReplyState.setButtonRow(userId, row);
      autoReplyState.setButtonCol(userId, col);
      autoReplyState.setButtonMode(userId, 'edit');
      const typeLabel = btn.type === 'POPUP' ? '🪟 POP-UP' : btn.type === 'COMMAND' ? '⌨️ دستور' : btn.type === 'URL' ? '🔗 لینک' : btn.type;
      const valueLabel = btn.type === 'URL' ? 'آدرس' : btn.type === 'COMMAND' ? 'دستور' : btn.type === 'POPUP' ? 'متن پنجره' : 'مقدار';
      const colorText = btn.style ? `🎨 ${btn.style}` : '⚪ بدون رنگ';
      await ctx.editMessageText(
        `🔧 تنظیمات دکمه\n\nℹ️ مقدار فعلی:\n${typeLabel}\n🏷 ${btn.text}\n${valueLabel}: ${btn.value || '(خالی)'}\n${colorText}`,
        buildArbtnEditTypeKeyboard(msgId, row, col, btn.style),
      );
      return;
    }

    const msgRecord = await prisma.autoReplyMessage.findUnique({ where: { id: msgId } });
    const newBtn = await autoReplyRepository.createButton({
      autoReplyId: msgRecord?.autoReplyId || 0,
      messageId: msgId,
      row: row + 1,
      col: 0,
      text: 'دکمه جدید',
      type: 'URL',
      value: '',
    });
    autoReplyState.setButtonRow(userId, row + 1);
    autoReplyState.setButtonCol(userId, 0);
    autoReplyState.setButtonMode(userId, 'edit');
    await refreshButtonEditor(ctx, msgId);
  });

  bot.action(/^arbtn:mode:(create|edit|delete|move):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const mode = ctx.match[1];
    const msgId = parseInt(ctx.match[2]);
    logger.info(`[ARButtonEditor] Mode change mode=${mode} msgId=${msgId}`);
    autoReplyState.setButtonMode(userId, mode);
    autoReplyState.setButtonState(userId, '');
    autoReplyState.setButtonRow(userId, 0);
    autoReplyState.setButtonCol(userId, 0);
    if (mode === 'move') {
      autoReplyState.setButtonMoveActive(userId, false);
    }
    await refreshButtonEditor(ctx, msgId);
  });

  bot.action(/^arbtn:type:(url|popup|command):(\d+):(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const btnType = ctx.match[1];
    const msgId = parseInt(ctx.match[2]);
    const row = parseInt(ctx.match[3]);
    const col = parseInt(ctx.match[4]);
    logger.info(`[ARButtonEditor] Type select type=${btnType} msgId=${msgId} row=${row} col=${col}`);
    const currentMode = autoReplyState.getButtonMode(userId) || 'edit';
    autoReplyState.setButtonPreviousView(userId, currentMode);
    autoReplyState.setButtonType(userId, btnType);
    autoReplyState.setButtonState(userId, 'wait_text');
    autoReplyState.setButtonRow(userId, row);
    autoReplyState.setButtonCol(userId, col);

    const typeLabel = btnType === 'popup' ? '🪟 POP-UP' : btnType === 'command' ? '⌨️ دستور' : '🔗 لینک';
    const prompts: Record<string, string> = {
      url: '🔗 داده‌ها را برای URL وارد کنید:\n\n🏷 عنوان دکمه\n🌐 آدرس اینترنتی',
      popup: '🪟 داده‌ها را برای POP-UP وارد کنید:\n\n⚠️ حداکثر ۲۰۰ کاراکتر\n\n🏷 عنوان دکمه\n📝 متن پنجره',
      command: '⌨️ داده‌ها را برای دستور وارد کنید:\n\n🏷 عنوان دکمه\n⌨️ نام دستور (بدون /)',
    };
    await ctx.editMessageText(prompts[btnType] || `${typeLabel}: متن دکمه را وارد کنید:`, {
      reply_markup: { inline_keyboard: [[Markup.button.callback('❌ لغو', `arbtn:type:cancel:${msgId}`)]] },
    });
  });

  bot.action(/^arbtn:type:cancel:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const msgId = parseInt(ctx.match[1]);
    autoReplyState.setButtonState(userId, '');
    autoReplyState.setButtonType(userId, '');
    const prevMode = autoReplyState.getButtonPreviousView(userId) || 'edit';
    autoReplyState.setButtonMode(userId, prevMode);
    await refreshButtonEditor(ctx, msgId);
  });

  bot.action(/^arbtn:color:(\d+):(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const msgId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    const col = parseInt(ctx.match[3]);
    const currentMode = autoReplyState.getButtonMode(userId) || 'edit';
    autoReplyState.setButtonPreviousView(userId, currentMode);
    autoReplyState.setButtonState(userId, 'wait_color');
    await ctx.editMessageText('🎨 رنگ دکمه را انتخاب کنید:', buildArbtnColorKeyboard(msgId, row, col));
  });

  bot.action(/^arbtn:color:set:(\d+):(\d+):(\d+):(\w+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const msgId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    const col = parseInt(ctx.match[3]);
    const color = ctx.match[4] === 'default' ? undefined : ctx.match[4];
    const buttons = await autoReplyRepository.findButtonsByMessage(msgId);
    const grid = buttonsToGrid(buttons);
    const btn = grid[row]?.[col];
    if (btn?.id) {
      await autoReplyRepository.updateButton(btn.id, { style: color || undefined });
    }
    autoReplyState.setButtonState(userId, '');
    const prevMode = autoReplyState.getButtonPreviousView(userId) || 'edit';
    autoReplyState.setButtonMode(userId, prevMode);
    await refreshButtonEditor(ctx, msgId);
  });

  // ─── Button text input ──
  bot.on('text', async (ctx: any, next) => {
    const userId = ctx.from.id;
    const btnState = autoReplyState.getButtonState(userId);
    if (btnState !== 'wait_text') return next();
    logger.info(`[ARButtonEditor] Text input received for button, state=wait_text`);

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

    const dbType = btnType === 'url' ? 'URL' : btnType === 'command' ? 'COMMAND' : 'CALLBACK';

    if (existingBtn?.id) {
      await autoReplyRepository.updateButton(existingBtn.id, {
        text: title,
        type: dbType,
        value,
      });
    } else {
      await autoReplyRepository.createButton({
        autoReplyId: msgId,
        messageId: msgId,
        row,
        col,
        text: title,
        type: dbType,
        value,
      });
    }

    autoReplyState.setButtonState(userId, '');
    autoReplyState.setButtonType(userId, '');
    autoReplyState.setButtonMode(userId, 'create');
    await ctx.reply('✅ دکمه ذخیره شد.');
    await refreshButtonEditor(ctx, msgId);
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

      grid = normalizeGrid(grid);

      for (let r = 0; r < grid.length; r++) {
        const row = grid[r];
        for (let c = 0; c < row.length; c++) {
          const b = row[c];
          if (b?.id) {
            await autoReplyRepository.updateButton(b.id, { row: r, col: c });
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

      const { text, reply_markup } = renderAutoReplyButtonEditor(msgId, grid, 'move', { row: newRow, col: newCol });
      const moveKb = buildDynamicMoveKeyboard(grid, newRow, newCol);
      await ctx.reply(`🔀 "${btn.text || ''}" — جهت را انتخاب کنید:`, moveKb);
    } catch (err: any) {
      logger.error(`[ARMove] ${direction} error: ${err.message}`);
    }
  }

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
    try {
      const userId = ctx.from.id;
      if (!autoReplyState.isButtonMoveActive(userId)) return;
      const msgId = autoReplyState.getEditingMessage(userId);
      if (!msgId) return;

      autoReplyState.setButtonMoveActive(userId, false);
      autoReplyState.setButtonMode(userId, 'create');
      autoReplyState.setButtonState(userId, '');
      autoReplyState.setButtonRow(userId, 0);
      autoReplyState.setButtonCol(userId, 0);

      try { await ctx.reply('⌨️', { reply_markup: { remove_keyboard: true } }); } catch {}
      await ctx.reply('✅ جابه‌جایی ذخیره شد.');
      const msg = await autoReplyRepository.findById(msgId);
      await ctx.reply(formatAutoReplyInfo(msg), {
        parse_mode: 'Markdown',
        link_preview_options: { is_disabled: true },
        ...autoReplyEditMessageReplyKeyboard(),
      });
      await refreshButtonEditor(ctx, msgId);
    } catch (err: any) {
      logger.error(`[ARMove] confirm error: ${err.message}`);
    }
  });

  bot.hears('↩️ پایان جابه‌جایی', async (ctx: any) => {
    try {
      const userId = ctx.from.id;
      if (!autoReplyState.isButtonMoveActive(userId)) return;
      const msgId = autoReplyState.getEditingMessage(userId);

      autoReplyState.setButtonMoveActive(userId, false);
      autoReplyState.setButtonMode(userId, 'create');
      autoReplyState.setButtonState(userId, '');
      autoReplyState.setButtonRow(userId, 0);
      autoReplyState.setButtonCol(userId, 0);

      try { await ctx.reply('⌨️', { reply_markup: { remove_keyboard: true } }); } catch {}
      await ctx.reply('↩️ بازگشت از حالت جابه‌جایی.');
      if (msgId) {
        const msg = await autoReplyRepository.findById(msgId);
        await ctx.reply(formatAutoReplyInfo(msg), {
          parse_mode: 'Markdown',
          link_preview_options: { is_disabled: true },
          ...autoReplyEditMessageReplyKeyboard(),
        });
        await refreshButtonEditor(ctx, msgId);
      }
    } catch (err: any) {
      logger.error(`[ARMove] return error: ${err.message}`);
    }
  });

  bot.hears('❌ لغو جابجایی پاسخ', async (ctx: any) => {
    try {
      const userId = ctx.from.id;
      if (!autoReplyState.isButtonMoveActive(userId)) return;
      const msgId = autoReplyState.getEditingMessage(userId);

      autoReplyState.setButtonMoveActive(userId, false);
      autoReplyState.setButtonMode(userId, 'create');
      autoReplyState.setButtonState(userId, '');
      autoReplyState.setButtonRow(userId, 0);
      autoReplyState.setButtonCol(userId, 0);

      try { await ctx.reply('⌨️', { reply_markup: { remove_keyboard: true } }); } catch {}
      await ctx.reply('❌ جابه‌جایی لغو شد.');
      if (msgId) {
        const msg = await autoReplyRepository.findById(msgId);
        await ctx.reply(formatAutoReplyInfo(msg), {
          parse_mode: 'Markdown',
          link_preview_options: { is_disabled: true },
          ...autoReplyEditMessageReplyKeyboard(),
        });
        await refreshButtonEditor(ctx, msgId);
      }
    } catch (err: any) {
      logger.error(`[ARMove] cancel error: ${err.message}`);
    }
  });
}

// ─── Helpers ──

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

async function refreshButtonEditor(ctx: any, msgId: number) {
  const userId = ctx.from.id;
  const editorMsgId = autoReplyState.getButtonEditorMsgId(userId);
  if (!editorMsgId) return;
  const buttons = await autoReplyRepository.findButtonsByMessage(msgId);
  const grid = buttonsToGrid(buttons);
  const mode = autoReplyState.getButtonMode(userId) || 'create';
  const moveActive = autoReplyState.isButtonMoveActive(userId);
  const moveSel = moveActive ? autoReplyState.getButtonMoveSelected(userId) : undefined;
  const selectedPos = moveSel && moveSel.row !== undefined && moveSel.col !== undefined
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
        logger.warn(`[AutoReplyEditor] Failed to re-send media: ${err?.message}`);
        await ctx.reply(`${label}\n\n${graphemeTruncate(message.text || '(رسانه)', 500)}`, { reply_markup: keyboard.reply_markup });
      }
    } else if (message.type === 'forward' && message.forwardSource) {
      const fs = message.forwardSource as any;
      const srcChatId = Number(fs.chatId || fs.originChatId);
      const srcMsgId = Number(fs.messageId || fs.originMessageId);
      if (srcChatId && srcMsgId) {
        try {
          await ctx.telegram.forwardMessage(ctx.chat.id, srcChatId, srcMsgId);
          await ctx.reply(label, { reply_markup: keyboard.reply_markup });
          continue;
        } catch (forwardErr: any) {
          logger.warn(`[AutoReplyEditor] Failed to forward message for preview: ${forwardErr?.message}`);
        }
      }
      const sourceName = fs.originName || fs.sourceTitle || String(fs.chatId || fs.originChatId || 'نامشخص');
      await ctx.reply(`${label}\n\n📨 پیام فوروارد\n✅ نوع پیام: Forward\n📍 مبدأ: ${sourceName}\n⚠️ پیش‌نمایش این پیام قابل نمایش نیست، اما پیام ذخیره شده و هنگام اجرای اتوماسیون به صورت Forward ارسال خواهد شد.`, { reply_markup: keyboard.reply_markup });
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
