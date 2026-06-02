import { BotAdminRole, BotAdminStatus, BroadcastType, SystemEventType } from '@prisma/client';
import { Context, Markup, Telegraf } from 'telegraf';
import { channelService } from '../../services/channel.service';
import { discountService } from '../../services/discount.service';
import { lotteryService } from '../../services/lottery.service';
import { groupService } from '../../services/group.service';
import { keywordReplyService } from '../../services/keyword-reply.service';
import { referralService } from '../../services/referral.service';
import { analyticsService } from '../../services/analytics.service';
import { botAdminService } from '../../services/bot-admin.service';
import { broadcastService } from '../../services/broadcast.service';
import { systemLogService } from '../../services/system-log.service';
import { settingsService } from '../../services/settings.service';
import { scoringService } from '../../services/scoring.service';
import { userService } from '../../services/user.service';
import { cache } from '../../utils/cache';
import { logger } from '../../utils/logger';
import {
  propFirmDiscountKeyboard,
  lotteryHistoryKeyboard,
  lotteryKeyboard,
  joinChannelsKeyboard,
  buildBotAdminPanelKeyboard,
  buildMainMenuKeyboard,
  paginationKeyboard,
} from '../keyboards';

type PaginatedResult<T> = { items: T[]; total: number; pages: number };

function formatDiscount(d: any, index?: number): string {
  const prefix = index !== undefined ? `${index + 1}. ` : '';
  const expired = d.expiresAt ? `\n⏳ انقضا: ${new Date(d.expiresAt).toLocaleDateString('fa-IR')}` : '';

  return (
    `${prefix}🏢 *${d.propFirm?.name || 'Unknown'}*\n` +
    `📌 ${d.title}\n` +
    `💸 تخفیف: *${d.discountPercent}%*\n` +
    `🔑 کد: \`${d.code}\`` +
    expired +
    `\n👆 استفاده: ${d.usageCount || 0} بار`
  );
}

async function getDiscountPage(propFirmId: number, page: number) {
  return (await discountService.getByPropFirm(propFirmId, page)) as PaginatedResult<any>;
}


function formatDuration(ms: number) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes ? `${minutes} دقیقه و ${rest} ثانیه` : `${rest} ثانیه`;
}

async function adminReplyOptions(telegramId?: number) {
  const admin = telegramId ? await botAdminService.getActive(telegramId).catch(() => null) : null;
  return buildMainMenuKeyboard(Boolean(admin), await settingsService.getFeatureMap());
}

type PendingBroadcast = {
  sourceChatId: number | string;
  messageIds: number[];
  messageType: BroadcastType;
  deliveryMethod: 'copy' | 'forward';
  createdBy: string;
};

const mediaGroupBuffers = new Map<string, { timer: NodeJS.Timeout; ctx: any; messageIds: number[] }>();

function canUseBroadcast(admin: { role: BotAdminRole }) {
  return admin.role === BotAdminRole.OWNER || admin.role === BotAdminRole.ADMIN;
}

function isForwardedMessage(message: any) {
  return Boolean(message.forward_origin || message.forward_date || message.forward_from || message.forward_from_chat || message.forward_sender_name);
}

function detectBroadcastType(message: any): BroadcastType {
  if (isForwardedMessage(message)) return BroadcastType.FORWARD_MESSAGE;
  if (message.media_group_id) return BroadcastType.MEDIA_GROUP;
  if (message.text) return BroadcastType.TEXT;
  if (message.photo) return BroadcastType.PHOTO;
  if (message.video) return BroadcastType.VIDEO;
  if (message.audio) return BroadcastType.AUDIO;
  if (message.voice) return BroadcastType.VOICE;
  if (message.animation) return BroadcastType.ANIMATION;
  if (message.document) return BroadcastType.DOCUMENT;
  if (message.sticker) return BroadcastType.STICKER;
  if (message.contact) return BroadcastType.CONTACT;
  if (message.location) return BroadcastType.LOCATION;
  if (message.poll) return BroadcastType.POLL;
  return BroadcastType.COPY_MESSAGE;
}

function pendingBroadcastKey(telegramId: number) {
  return `admin_broadcast_pending:${telegramId}`;
}

async function showBroadcastPreview(ctx: any, messageIds: number[]) {
  const messageType = detectBroadcastType(ctx.message);
  const deliveryMethod: 'copy' | 'forward' = messageType === BroadcastType.FORWARD_MESSAGE ? 'forward' : 'copy';
  const pending: PendingBroadcast = {
    sourceChatId: ctx.chat.id,
    messageIds,
    messageType,
    deliveryMethod,
    createdBy: `telegram:${ctx.from.id}`,
  };
  cache.set(pendingBroadcastKey(ctx.from.id), pending, 600);
  cache.del(`admin_broadcast:${ctx.from.id}`);

  await ctx.reply('👁 پیش‌نمایش پیام همگانی:');
  for (const messageId of messageIds) {
    if (deliveryMethod === 'forward') {
      await ctx.telegram.forwardMessage(ctx.chat.id, ctx.chat.id, messageId);
    } else {
      await ctx.telegram.copyMessage(ctx.chat.id, ctx.chat.id, messageId);
    }
  }

  await ctx.reply('آیا این پیام برای همه کاربران ارسال شود؟', Markup.inlineKeyboard([
    [Markup.button.callback('✅ ارسال همگانی', 'broadcast:confirm')],
    [Markup.button.callback('❌ لغو', 'broadcast:cancel')],
  ]));
}

async function finalizeBotBroadcast(ctx: any, pending: PendingBroadcast) {
  const startedAt = Date.now();
  const broadcast = await broadcastService.createTelegramMessageBroadcast({
    title: `Bot panel broadcast ${new Date().toISOString()}`,
    sourceChatId: pending.sourceChatId,
    messageIds: pending.messageIds,
    messageType: pending.messageType,
    deliveryMethod: pending.deliveryMethod,
    createdBy: pending.createdBy,
  });
  if (!broadcast) return ctx.reply('❌ خطا در ایجاد ارسال همگانی رخ داد.');
  const summary = await broadcastService.summarizeDelivery(broadcast.id);
  const total = summary.broadcast?.totalRecipients ?? 0;
  const success = summary.broadcast?.successCount ?? 0;
  const failed = summary.broadcast?.failedCount ?? 0;
  await ctx.reply([
    '📊 گزارش پیام همگانی',
    '',
    `کل کاربران: ${total}`,
    `ارسال موفق: ${success}`,
    `ارسال ناموفق: ${failed}`,
    `بلاک کرده‌اند: ${summary.blocked}`,
    `اکانت حذف شده: ${summary.deleted}`,
    `مدت زمان ارسال: ${formatDuration(Date.now() - startedAt)}`,
  ].join('\n'));
}

export function registerHandlers(bot: Telegraf<Context>) {
  bot.on('my_chat_member', async (ctx: any, next) => {
    const chat = ctx.update.my_chat_member?.chat;
    const newStatus = ctx.update.my_chat_member?.new_chat_member?.status;
    if (chat && newStatus !== 'left' && newStatus !== 'kicked') {
      if (chat.type === 'group' || chat.type === 'supergroup') {
        await groupService.upsertFromChat({ id: chat.id, title: chat.title, username: chat.username });
        await groupService.refreshBotAdmin(bot, chat.id).catch(logger.error);
      }
      if (chat.type === 'channel' || chat.type === 'group' || chat.type === 'supergroup') {
        await channelService.registerPendingFromChat({ id: chat.id, title: chat.title, username: chat.username, type: chat.type }).catch(logger.error);
        await systemLogService.log({ eventType: SystemEventType.GROUP_INTEGRATION, message: 'Bot added to chat and queued for force-join approval', metadata: { chat } as any });
      }
    }
    return next();
  });

  bot.on('new_chat_members', async (ctx: any, next) => {
    const me = await bot.telegram.getMe();
    const added = ctx.message.new_chat_members?.some((member: any) => member.id === me.id);
    if (added && ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup')) {
      await groupService.upsertFromChat({ id: ctx.chat.id, title: ctx.chat.title, username: ctx.chat.username });
      await groupService.refreshBotAdmin(bot, ctx.chat.id).catch(logger.error);
    }
    return next();
  });
  bot.start(async (ctx) => {
    const name = ctx.from?.first_name || 'کاربر';
    const scoring = await scoringService.getSettings();

    if (scoring.isWelcomeMessageEnabled) {
      await ctx.reply(
        scoringService.formatTemplate(scoring.welcomeMessageText, { name, points: scoring.startPoints }),
        { parse_mode: 'Markdown', ...(await adminReplyOptions(ctx.from?.id)) }
      );
      const profile = await userService.getProfile(BigInt(ctx.from!.id));
      const isFirstEntrance = profile?.createdAt && Date.now() - new Date(profile.createdAt).getTime() < 120_000;
      if (scoring.startPoints > 0 && isFirstEntrance) {
        await ctx.reply(scoringService.formatTemplate(scoring.initialPointsMessageText, { name, points: scoring.startPoints }));
      }
      return;
    }

    await ctx.reply('از منوی زیر انتخاب کنید:', await adminReplyOptions(ctx.from?.id));
  });



  bot.hears('👨‍💼 پنل ادمین', async (ctx) => {
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    const canBroadcast = admin.role === BotAdminRole.OWNER || admin.role === BotAdminRole.ADMIN;
    await ctx.reply('⚙️ پنل مدیریت ربات', buildBotAdminPanelKeyboard(canBroadcast));
  });

  bot.hears('↩️ بازگشت به منوی اصلی', async (ctx) => {
    await ctx.reply('منوی اصلی', await adminReplyOptions(ctx.from.id));
  });

  bot.hears('📢 پیام همگانی', async (ctx) => {
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin || (admin.role !== BotAdminRole.OWNER && admin.role !== BotAdminRole.ADMIN)) return;
    cache.set(`admin_broadcast:${ctx.from.id}`, true, 600);
    await ctx.reply([
      'پیام مورد نظر خود را ارسال کنید.',
      'می‌توانید متن، عکس، ویدیو، فایل، گیف، استیکر یا پیام فورواردی ارسال نمایید.',
    ].join('\n'));
  });

  bot.hears('👥 مدیریت ادمین‌ها', async (ctx) => {
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    const admins = await botAdminService.list();
    const text = admins.map((item) => `${item.status === 'ACTIVE' ? '✅' : '⏸'} ${item.role} — ${item.telegramId.toString()} ${item.username ? '@' + item.username : ''}`).join('\n') || 'ادمینی ثبت نشده است.';
    await ctx.reply(`👥 مدیریت ادمین‌ها\n\nبرای افزودن ادمین پیام را به شکل زیر ارسال کنید:\n/admin_add TELEGRAM_ID ROLE\nمثال: /admin_add 123456 ADMIN\n\n${text}`);
  });

  bot.command('admin_add', async (ctx: any) => {
    if (!(await botAdminService.canManage(ctx.from.id))) return;
    const [, telegramId, role = 'ADMIN'] = ctx.message.text.split(/\s+/);
    if (!telegramId || !['OWNER', 'SUPER_ADMIN', 'ADMIN', 'MODERATOR'].includes(role)) return ctx.reply('فرمت صحیح: /admin_add TELEGRAM_ID ROLE');
    const item = await botAdminService.upsert({ telegramId, role: role as BotAdminRole, status: BotAdminStatus.ACTIVE });
    await systemLogService.log({ eventType: SystemEventType.ADMIN_ACTION, telegramId: ctx.from.id, message: 'Bot admin added from bot', metadata: { targetTelegramId: item.telegramId.toString(), role: item.role } });
    await ctx.reply(`✅ ادمین ثبت شد: ${item.telegramId.toString()} (${item.role})`);
  });

  bot.command('admin_suspend', async (ctx: any) => {
    const [, id] = ctx.message.text.split(/\s+/);
    if (!(await botAdminService.canManage(ctx.from.id))) return;
    await botAdminService.update(Number(id), { status: BotAdminStatus.SUSPENDED });
    await ctx.reply('⏸ ادمین تعلیق شد.');
  });

  bot.command('admin_activate', async (ctx: any) => {
    const [, id] = ctx.message.text.split(/\s+/);
    if (!(await botAdminService.canManage(ctx.from.id))) return;
    await botAdminService.update(Number(id), { status: BotAdminStatus.ACTIVE });
    await ctx.reply('✅ ادمین فعال شد.');
  });

  bot.command('admin_delete', async (ctx: any) => {
    const [, id] = ctx.message.text.split(/\s+/);
    if (!(await botAdminService.canManage(ctx.from.id))) return;
    const admins = await botAdminService.list();
    const target = admins.find((item) => item.id === Number(id));
    if (target?.role === 'OWNER' && !(await botAdminService.canManage(ctx.from.id, BotAdminRole.OWNER))) return ctx.reply('❌ حذف Owner مجاز نیست.');
    await botAdminService.delete(Number(id));
    await systemLogService.log({ eventType: SystemEventType.ADMIN_ACTION, telegramId: ctx.from.id, message: 'Bot admin deleted from bot', metadata: { id } });
    await ctx.reply('🗑 ادمین حذف شد.');
  });

  bot.hears('📊 گزارشات', async (ctx) => {
    if (!(await settingsService.isFeatureEnabled('reports'))) return ctx.reply('⛔ این سرویس در حال حاضر غیرفعال است.');
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    const report = await analyticsService.dashboard();
    await ctx.reply([
      '📊 گزارشات',
      `👥 کل کاربران: ${report.users.totalUsers}`,
      `🟢 فعال امروز: ${report.users.activeToday}`,
      `📅 فعال هفته: ${report.users.activeWeek}`,
      `🆕 کاربران جدید ماه: ${report.users.newUsers}`,
      `👥 دعوت‌ها: ${report.referrals.totalInvites} | موفق: ${report.referrals.successful} | نرخ تبدیل: ${report.referrals.conversionRate}%`,
      `📢 عضویت اجباری: ${report.forceJoin.channels} کانال | ${report.forceJoin.groups} گروه`,
      `🎰 قرعه‌کشی: ${report.lotteries.participants} شرکت‌کننده | ${report.lotteries.ticketsSold} بلیت`,
    ].join('\n'));
  });

  bot.hears('⚙️ تنظیمات', async (ctx) => {
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    await ctx.reply('⚙️ تنظیمات مدیریتی از پنل وب و دستورات ادمین قابل مدیریت است.');
  });

  bot.action('broadcast:confirm', async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin || !canUseBroadcast(admin)) return;
    const pending = cache.get<PendingBroadcast>(pendingBroadcastKey(ctx.from.id));
    if (!pending) return ctx.reply('❌ پیام همگانی در انتظار تایید یافت نشد. دوباره پیام را ارسال کنید.');
    cache.del(pendingBroadcastKey(ctx.from.id));
    await ctx.reply('⏳ ارسال همگانی شروع شد...');
    await finalizeBotBroadcast(ctx, pending);
  });

  bot.action('broadcast:cancel', async (ctx: any) => {
    await ctx.answerCbQuery();
    const pending = cache.get<PendingBroadcast>(pendingBroadcastKey(ctx.from.id));
    cache.del(pendingBroadcastKey(ctx.from.id));
    cache.del(`admin_broadcast:${ctx.from.id}`);
    await systemLogService.log({
      eventType: SystemEventType.BROADCAST,
      telegramId: ctx.from.id,
      message: 'ADMIN_BROADCAST_CANCELLED',
      metadata: pending ? { sourceChatId: pending.sourceChatId, messageIds: pending.messageIds, messageType: pending.messageType } : undefined,
    });
    await ctx.reply('❌ ارسال همگانی لغو شد.');
  });

  bot.on('message', async (ctx: any, next) => {
    if (!ctx.from || !cache.get<boolean>(`admin_broadcast:${ctx.from.id}`)) return next();
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin || !canUseBroadcast(admin)) return next();
    const mediaGroupId = ctx.message.media_group_id;
    if (mediaGroupId) {
      const key = `admin_media_group:${ctx.chat.id}:${mediaGroupId}`;
      const existing = mediaGroupBuffers.get(key);
      if (existing) {
        existing.messageIds.push(ctx.message.message_id);
        clearTimeout(existing.timer);
        existing.timer = setTimeout(() => {
          const buffered = mediaGroupBuffers.get(key);
          if (buffered) {
            mediaGroupBuffers.delete(key);
            showBroadcastPreview(buffered.ctx, buffered.messageIds).catch(logger.error);
          }
        }, 1200);
      } else {
        const timer = setTimeout(() => {
          const buffered = mediaGroupBuffers.get(key);
          if (buffered) {
            mediaGroupBuffers.delete(key);
            showBroadcastPreview(buffered.ctx, buffered.messageIds).catch(logger.error);
          }
        }, 1200);
        mediaGroupBuffers.set(key, { timer, ctx, messageIds: [ctx.message.message_id] });
      }
      return ctx.reply('📦 مدیا گروه دریافت شد؛ پیش‌نمایش تا چند لحظه دیگر نمایش داده می‌شود.');
    }
    await showBroadcastPreview(ctx, [ctx.message.message_id]);
  });

  bot.hears('🎯 کدهای تخفیف', async (ctx) => {
    if (!(await settingsService.isFeatureEnabled('discount_codes'))) return ctx.reply('⛔ این سرویس در حال حاضر غیرفعال است.');
    const firms = (await discountService.getPropFirms()) as any[];

    if (!firms.length) {
      return ctx.reply('❌ هنوز کد تخفیف فعالی برای پراپ فرم‌ها ثبت نشده است.');
    }

    await ctx.reply('🏢 ابتدا پراپ فرم مورد نظر را انتخاب کنید:', propFirmDiscountKeyboard(firms));
  });

  bot.action('back:discounts', async (ctx) => {
    await ctx.answerCbQuery();
    const firms = (await discountService.getPropFirms()) as any[];
    await ctx.editMessageText('🏢 ابتدا پراپ فرم مورد نظر را انتخاب کنید:', propFirmDiscountKeyboard(firms));
  });

  bot.action(/^firm:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();

    const propFirmId = parseInt(ctx.match[1]);
    const page = 1;
    const result = await getDiscountPage(propFirmId, page);

    if (!result.items || result.items.length === 0) {
      return ctx.editMessageText('❌ برای این پراپ فرم کد تخفیف فعالی یافت نشد.');
    }

    const firmName = result.items[0]?.propFirm?.name || 'پراپ فرم';
    const text = result.items.map((d: any, i: number) => formatDiscount(d, i)).join('\n\n─────────\n\n');
    const callbackPrefix = `firmPage:${propFirmId}`;

    await ctx.editMessageText(`📋 *کدهای تخفیف ${firmName}* (${result.total} کد)\n\n${text}`, {
      parse_mode: 'Markdown',
      ...(result.pages > 1 ? paginationKeyboard(page, result.pages, callbackPrefix) : {}),
    });
  });

  bot.action(/^firmPage:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();

    const propFirmId = parseInt(ctx.match[1]);
    const page = parseInt(ctx.match[2]);
    const result = await getDiscountPage(propFirmId, page);

    if (!result.items || result.items.length === 0) {
      return ctx.editMessageText('❌ صفحه‌ای یافت نشد.');
    }

    const firmName = result.items[0]?.propFirm?.name || 'پراپ فرم';
    const text = result.items.map((d: any, i: number) => formatDiscount(d, i)).join('\n\n─────────\n\n');
    const callbackPrefix = `firmPage:${propFirmId}`;

    await ctx.editMessageText(`📋 *کدهای تخفیف ${firmName}* — صفحه ${page}\n\n${text}`, {
      parse_mode: 'Markdown',
      ...paginationKeyboard(page, result.pages, callbackPrefix),
    });
  });

  bot.action(/^copy:(\d+)$/, async (ctx: any) => {
    const id = parseInt(ctx.match[1]);
    const discount = await discountService.getDetails(id);

    if (!discount) {
      return ctx.answerCbQuery('کد یافت نشد');
    }

    const user = await userService.getProfile(BigInt(ctx.from.id));

    if (user) {
      await discountService.handleClick(id, user.id).catch(logger.error);
    }

    await ctx.answerCbQuery(`کد کپی شد: ${discount.code}`, { show_alert: true });
  });

  bot.hears('🏢 پراپ فرم‌ها', async (ctx) => {
    if (!(await settingsService.isFeatureEnabled('prop_firms'))) return ctx.reply('⛔ این سرویس در حال حاضر غیرفعال است.');
    const firms = (await discountService.getPropFirms()) as any[];

    if (!firms || firms.length === 0) {
      return ctx.reply('❌ هنوز پراپ فرمی ثبت نشده.');
    }

    await ctx.reply('📋 *پراپ فرم‌های موجود:*', { parse_mode: 'Markdown' });

    for (const firm of firms) {
      const buttons: any[][] = [];
      if (firm.websiteUrl) buttons.push([Markup.button.url('🛒 خرید', firm.websiteUrl)]);
      buttons.push([Markup.button.callback('🎯 کد تخفیف', `firm:${firm.id}`)]);
      if (firm.reviewLink) buttons.push([Markup.button.callback('🔎 بررسی پراپ', `propReview:${firm.id}`)]);

      await ctx.reply(`🏢 *${firm.name}* — ${firm._count?.discountCodes || 0} کد تخفیف`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons),
      });
    }
  });

  bot.action(/^propReview:(\d+)$/, async (ctx: any) => {
    const firmId = Number(ctx.match[1]);
    const firms = (await discountService.getPropFirms(false)) as any[];
    const firm = firms.find((item) => item.id === firmId);
    if (!firm?.reviewLink) return ctx.answerCbQuery('لینک بررسی برای این پراپ ثبت نشده است.');
    await ctx.answerCbQuery();
    return ctx.reply(`🔎 لینک بررسی ${firm.name}:\n${firm.reviewLink}`);
  });

  bot.hears('🔍 جستجو', async (ctx) => {
    if (!(await settingsService.isFeatureEnabled('discount_codes'))) return ctx.reply('⛔ این سرویس در حال حاضر غیرفعال است.');
    await ctx.reply('🔍 نام پراپ فرم مورد نظر را بنویسید:');
    cache.set(`search_mode:${ctx.from?.id}`, true, 60);
  });

  bot.on('text', async (ctx: any, next) => {
    if (ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup') {
      const group = (ctx.state as any).telegramGroup;
      if (group) {
        const handled = await keywordReplyService.handleGroupText(ctx, group.id);
        if (handled) return;
      }
      return next();
    }

    const isSearchMode = cache.get<boolean>(`search_mode:${ctx.from.id}`);

    if (!isSearchMode) {
      return next();
    }

    cache.del(`search_mode:${ctx.from.id}`);

    const query = ctx.message.text;
    const result: PaginatedResult<any> = await discountService.search(query);

    if (!result.items || result.items.length === 0) {
      return ctx.reply(`❌ نتیجه‌ای برای "*${query}*" یافت نشد.`, { parse_mode: 'Markdown' });
    }

    const text = result.items.map((d: any, i: number) => formatDiscount(d, i)).join('\n\n─────────\n\n');

    await ctx.reply(`🔍 نتایج جستجو برای "*${query}*":\n\n${text}`, { parse_mode: 'Markdown' });
  });

  bot.hears('🎰 قرعه‌کشی', async (ctx) => {
    if (!(await settingsService.isFeatureEnabled('lottery'))) return ctx.reply('⛔ این سرویس در حال حاضر غیرفعال است.');
    const lottery: any = await lotteryService.getActiveLottery();

    if (!lottery) {
      const history: any[] = await lotteryService.getHistory();

      if (!history || history.length === 0) {
        return ctx.reply('❌ در حال حاضر قرعه‌کشی فعالی وجود ندارد.');
      }

      const last = history[0];
      const winners = last.winners?.map((w: any) => w.winnerFirstName).join('، ') || 'ثبت نشده';

      return ctx.reply(`❌ قرعه‌کشی فعالی وجود ندارد.\n\n🏆 آخرین برندگان: ${winners}`, lotteryHistoryKeyboard());
    }

    const userEntry = await lotteryService.getUserEntry(BigInt(ctx.from.id), lottery.id);
    const entriesCount = await lotteryService.getEntriesCount(lottery.id);
    const totalTickets = await lotteryService.getTicketsCount(lottery.id);
    const endDate = new Date(lottery.endAt).toLocaleString('fa-IR');

    await ctx.reply(
      `🎰 *${lottery.title}*\n\n` +
        `🏆 جایزه: ${lottery.prize}\n` +
        `👥 شرکت‌کنندگان: ${entriesCount} نفر\n` +
        `🎟 کل بلیت‌ها: ${totalTickets}\n` +
        `🎫 بلیت‌های شما: ${userEntry?.ticketCount ?? 0}\n` +
        `⭐️ حداقل امتیاز: ${lottery.minPoints}\n` +
        `🎟 هزینه هر بلیت: ${lottery.entryCost} امتیاز\n` +
        `⏳ پایان: ${endDate}`,
      { parse_mode: 'Markdown', ...lotteryKeyboard(lottery.id, userEntry?.ticketCount ?? 0) }
    );
  });

  bot.action(/^lottery:enter:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const lotteryId = parseInt(ctx.match[1]);
    const options = await lotteryService.getTicketOptions(BigInt(ctx.from.id), lotteryId);
    if (!options.success) return ctx.reply(options.message);
    await ctx.reply(options.message, {
      ...Markup.inlineKeyboard(options.options.map((count: number) => [Markup.button.callback(`🎟 ${count} بلیت`, `lottery:buy:${lotteryId}:${count}`)])),
    });
  });

  bot.action(/^lottery:buy:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const lotteryId = parseInt(ctx.match[1]);
    const tickets = parseInt(ctx.match[2]);
    const result = await lotteryService.enterLottery(BigInt(ctx.from.id), lotteryId, tickets);
    await ctx.reply(result.message);
  });

  bot.action(/^lottery:winners:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();

    const lotteryId = parseInt(ctx.match[1]);
    const winners: any[] = await lotteryService.getWinners(lotteryId);

    if (!winners.length) {
      return ctx.reply('🏆 هنوز برنده‌ای برای این قرعه‌کشی ثبت نشده است.');
    }

    const text = winners
      .map((w, index) => `${index + 1}. ${w.winnerFirstName} ${w.winnerLastName || ''} — 🎁 ${w.prize}`)
      .join('\n');

    await ctx.reply(`🏆 *برندگان قرعه‌کشی:*\n\n${text}`, { parse_mode: 'Markdown' });
  });

  bot.action('lottery:history', async (ctx) => {
    await ctx.answerCbQuery();

    const history: any[] = await lotteryService.getHistory(10);

    if (!history.length) {
      return ctx.reply('📜 هنوز قرعه‌کشی تکمیل‌شده‌ای وجود ندارد.');
    }

    const text = history
      .map((lottery) => {
        const winners = lottery.winners?.map((w: any) => w.winnerFirstName).join('، ') || 'بدون برنده';
        return `🎰 ${lottery.title}\n🎁 ${lottery.prize}\n🏆 ${winners}`;
      })
      .join('\n\n─────────\n\n');

    await ctx.reply(`📜 *تاریخچه قرعه‌کشی‌ها*\n\n${text}`, { parse_mode: 'Markdown' });
  });

  bot.hears('⭐️ امتیاز من', async (ctx) => {
    if (!(await settingsService.isFeatureEnabled('points'))) return ctx.reply('⛔ این سرویس در حال حاضر غیرفعال است.');
    const profile: any = await userService.getProfile(BigInt(ctx.from.id));

    if (!profile) {
      return ctx.reply('❌ خطا در دریافت اطلاعات');
    }

    const profileStatus = profile.profileCompleted ? '✅ پروفایل تکمیل شده' : '❌ پروفایل ناقص است';

    await ctx.reply(
      `👤 *پروفایل شما*\n\n` +
        `🏅 امتیاز: *${profile.points}*\n` +
        `🏆 رتبه: *${profile.rank}*\n` +
        `👥 دعوت‌شدگان: *${profile.totalReferrals}* نفر\n` +
        `${profileStatus}`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.hears('🏆 لیدربورد', async (ctx) => {
    if (!(await settingsService.isFeatureEnabled('leaderboard'))) return ctx.reply('⛔ این سرویس در حال حاضر غیرفعال است.');
    const board: any[] = await userService.getLeaderboard();
    const medals = ['🥇', '🥈', '🥉'];
    const text = board.map((u: any, i: number) => `${medals[i] || `${i + 1}.`} ${u.firstName} — ${u.points} امتیاز`).join('\n');

    await ctx.reply(`🏆 *برترین کاربران:*\n\n${text}`, { parse_mode: 'Markdown' });
  });

 bot.hears('👥 دعوت دوستان', async (ctx) => {
    if (!(await settingsService.isFeatureEnabled('referrals'))) return ctx.reply('⛔ این سرویس در حال حاضر غیرفعال است.');
  try {
    const botInfo = await bot.telegram.getMe();

    const profile: any = await userService.getProfile(
      BigInt(ctx.from.id)
    );

    if (!profile) {
      return ctx.reply(
        '❌ اطلاعات کاربری شما یافت نشد'
      );
    }

    const referralStats =
      await userService.getReferralStats(
        profile.id,
        botInfo.username || 'BotPropchiBot'
      );

    const link =
      referralStats?.referralLink ||
      (await userService.getReferralLink(
        profile.id,
        botInfo.username || 'BotPropchiBot'
      ));

    const referralSettings =
      await referralService.getSettings();

    const rewardPoints =
      referralSettings?.inviteRewardPoints ?? 0;

    const totalReferrals =
      referralStats?.inviteCount ??
      profile.totalReferrals ??
      0;

    const totalRewardPoints =
      referralStats?.totalRewardPoints ?? 0;

    await ctx.reply(
      [
        '👥 لینک دعوت اختصاصی شما:',
        '',
        link,
        '',
        `✅ پاداش هر دعوت موفق: ${rewardPoints} امتیاز`,
        `👤 دعوت‌شدگان تا کنون: ${totalReferrals} نفر`,
        `🎁 مجموع امتیاز دعوت‌ها: ${totalRewardPoints}`,
      ].join('\n')
    );
  } catch (error) {
    logger.error(
      'Referral Handler Error:',
      error
    );

    await ctx.reply(
      '❌ خطا در دریافت اطلاعات دعوت دوستان'
    );
  }
});

  bot.action('check:membership', async (ctx) => {
    cache.del(`membership:v2:${ctx.from?.id}`);
    await ctx.answerCbQuery('در حال بررسی...');
    const result = await channelService.checkMembership(bot, BigInt(ctx.from!.id), { force: true });
    if (!result.isMember) {
      await userService.markMembershipUnverified(BigInt(ctx.from!.id), 'manual_recheck_failed').catch(logger.error);
      return ctx.reply('شما از کانال اجباری خارج شده‌اید.\nبرای ادامه استفاده از ربات مجدداً عضو شوید.', joinChannelsKeyboard(result.notJoined));
    }
    cache.set(`membership:v2:${ctx.from?.id}`, { isMember: true, notJoined: [] }, 180);
    await userService.markMembershipVerified(BigInt(ctx.from!.id)).catch((err) => logger.error('خطا در ذخیره تأیید عضویت:', err));
    await userService.processPendingReferral(BigInt(ctx.from!.id)).catch((err) => logger.error('خطا در ثبت رفرال پس از تأیید عضویت:', err));
    await ctx.reply('✅ عضویت شما تایید شد. حالا می‌توانید از امکانات ربات استفاده کنید.', await adminReplyOptions(ctx.from?.id));
  });

  bot.action('noop', async (ctx) => {
    await ctx.answerCbQuery();
  });

  logger.info('✅ تمام هندلرهای ربات ثبت شدند');
}
