import { BotAdminRole, BotAdminStatus, BroadcastType, SystemEventType } from '@prisma/client';
import { Context, Markup, Telegraf } from 'telegraf';
import { channelService } from '../../services/channel.service';
import { discountService } from '../../services/discount.service';
import { lotteryService } from '../../services/lottery.service';
import { groupService } from '../../services/group.service';
import { keywordReplyService } from '../../services/keyword-reply.service';
import { referralService } from '../../services/referral.service';
import { leaderboardService } from '../../services/leaderboard.service';
import { analyticsService } from '../../services/analytics.service';
import { botAdminService } from '../../services/bot-admin.service';
import { broadcastService } from '../../services/broadcast.service';
import { systemLogService } from '../../services/system-log.service';
import { settingsService } from '../../services/settings.service';
import { scoringService } from '../../services/scoring.service';
import { userService } from '../../services/user.service';
import { redisClient } from '../../utils/redis';
import { membershipService } from '../../services/membership/membership.service';
import { forcedMembershipSettingsService } from '../../services/membership/forcedMembership.service';
import { requiredChannelsService } from '../../services/requiredChannels.service';
import { wordpressApiClient, WordPressApiClientError } from '../../services/wordpress-api.client';
import { DEFAULT_BOT_USERNAME } from '../../constants';
import { postService } from '../../services/post.service';
import { config } from '../../config';
import { prisma } from '../../prisma/client';
import { cache } from '../../utils/cache';
import { logger } from '../../utils/logger';
import { sanitizeTelegramText, sanitizeTelegramExtra } from '../../utils/unicode';
import {
  propFirmDiscountKeyboard,
  lotteryHistoryKeyboard,
  lotteryKeyboard,
  buildBotAdminPanelKeyboard,
  buildMainMenuKeyboard,
  buildMiniAppProfileKeyboard,
  paginationKeyboard,
  buildForceJoinKeyboard,
} from '../keyboards';
import {
  menuEditorKeyboard,
  menuButtonEditKeyboard,
  menuSwapTargetKeyboard,
} from '../keyboards/post-keyboards';

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
  const features = await settingsService.getFeatureMap();
  // Resolve live post titles from DB (single source of truth)
  const menuLayout = await settingsService.getResolvedMenuLayout(true).catch(() => []);
  const displayMode = await settingsService.getMenuDisplayMode().catch(() => 'always_open' as const);
  return buildMainMenuKeyboard(Boolean(admin), features, menuLayout, displayMode);
}

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

async function sendPostToUser(ctx: any, post: any) {
  await postService.incrementViews(post.id, undefined, BigInt(ctx.from.id));
  const inlineButtons = buildPostInlineKeyboard((post as any).buttons || [], post.id);
  const parseMode = post.parseMode || 'Markdown';
  const rawText = post.content || post.caption || '';
  const { segments } = parseCopyBlocks(rawText);
  const hasCopyBlocks = segments.some(s => s.type === 'copy');

  const textWithoutCopy = sanitizeTelegramText(segments.filter(s => s.type === 'text').map(s => s.content).join('').trim(), 4096);

  if (post.mediaFileId && post.mediaType) {
    const mediaConfig: any = {
      caption: textWithoutCopy || post.caption,
      parse_mode: parseMode,
      link_preview_options: { is_disabled: true },
      ...(inlineButtons.length > 0 ? Markup.inlineKeyboard(inlineButtons) : {}),
    };
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
      await ctx.reply(':', { link_preview_options: { is_disabled: true }, ...Markup.inlineKeyboard(inlineButtons) });
    }
  } else if (textWithoutCopy) {
    try {
      await ctx.reply(textWithoutCopy, {
        parse_mode: parseMode,
        link_preview_options: { is_disabled: true },
        ...(inlineButtons.length > 0 ? Markup.inlineKeyboard(inlineButtons) : {}),
      });
    } catch {
      await ctx.reply(textWithoutCopy, {
        link_preview_options: { is_disabled: true },
        ...(inlineButtons.length > 0 ? Markup.inlineKeyboard(inlineButtons) : {}),
      });
    }
  } else {
    await ctx.reply(post.title, {
      link_preview_options: { is_disabled: true },
      ...(inlineButtons.length > 0 ? Markup.inlineKeyboard(inlineButtons) : {}),
    });
  }

  if (hasCopyBlocks) {
    for (const segment of segments) {
      if (segment.type === 'copy') {
        await ctx.reply(
          `📋 کپی کد`,
          Markup.inlineKeyboard([
            [Markup.button.callback('📋 برای کپی لمس کنید', `post:user:copyblock:${Buffer.from(segment.content).toString('base64')}`)],
          ])
        );
      }
    }
  }
}

function buildPostInlineKeyboard(buttons: any[], postId?: number): any[][] {
  if (!buttons || buttons.length === 0) return [];
  return buttons.map((row: any[]) =>
    row.map((btn: any) => {
      if (!btn) return null;
      const safeText = sanitizeTelegramText(btn.text || 'Link', 128);
      switch (btn.type) {
        case 'URL': return Markup.button.url(safeText, btn.value || '');
        case 'CALLBACK': {
          const clickData = JSON.stringify({ postId, text: btn.text, type: btn.type });
          return Markup.button.callback(safeText, `post:user:click:${clickData}`);
        }
        case 'OPEN_MINI_APP': return Markup.button.webApp(safeText, btn.value || '');
        case 'COPY_TEXT': return Markup.button.callback(safeText, `post:user:copy:${sanitizeTelegramText(btn.value || '', 64)}`);
        case 'SEND_COMMAND': return Markup.button.switchToChat(safeText, btn.value || '');
        case 'INTERNAL_NAV': return Markup.button.callback(safeText, `post:user:nav:${sanitizeTelegramText(btn.value || 'noop', 64)}`);
        default: return Markup.button.url(safeText, btn.value || '');
      }
    }).filter(Boolean)
  );
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

// ─── Single-message editing: edit if possible, reply as fallback ───
async function safeEdit(ctx: any, text: string, extra?: any): Promise<void> {
  const safeText = sanitizeTelegramText(text, 4096);
  const safeExtra = sanitizeTelegramExtra(extra);
  if (ctx.callbackQuery?.message) {
    try {
      await ctx.editMessageText(safeText, safeExtra);
      return;
    } catch (e: any) {
      // EditMessage might fail if message is media, too old, or content unchanged
      logger.debug('[safeEdit] Fallback to reply:', e.description || e.message);
    }
  }
  await ctx.reply(safeText, safeExtra).catch(() => {});
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

    const profile = await userService.getProfile(BigInt(ctx.from!.id));
    const isNewUser = !profile || (profile?.createdAt && Date.now() - new Date(profile.createdAt).getTime() < 10_000);

    if (isNewUser) {
      const totalUsers = await prisma.user.count();
      const adminList = await botAdminService.list();
      const activeAdmins = adminList.filter(a => a.status === 'ACTIVE');
      const now = new Date().toLocaleString('fa-IR');
      for (const admin of activeAdmins) {
        try {
          await bot.telegram.sendMessage(
            Number(admin.telegramId),
            [
              '🎉 کاربر جدید وارد شد',
              '',
              `👤 نام: ${ctx.from?.first_name || 'نامشخص'} ${ctx.from?.last_name || ''}`,
              `🆔 آیدی عددی: ${ctx.from?.id}`,
              `📛 یوزرنیم: @${ctx.from?.username || 'ندارد'}`,
              `📈 تعداد کل کاربران: ${totalUsers}`,
              `📅 زمان: ${now}`,
            ].join('\n'),
            {
              link_preview_options: { is_disabled: true },
              ...Markup.inlineKeyboard([
                [Markup.button.callback('📊 آمار', `admin:stats:${ctx.from?.id}`)],
              ]),
            }
          );
        } catch {}
      }
    }

    if (scoring.isWelcomeMessageEnabled) {
      await ctx.reply(
        scoringService.formatTemplate(scoring.welcomeMessageText, { name, points: scoring.startPoints }),
        { parse_mode: 'Markdown', link_preview_options: { is_disabled: true }, ...(await adminReplyOptions(ctx.from?.id)) }
      );
      const isFirstEntrance = profile?.createdAt && Date.now() - new Date(profile.createdAt).getTime() < 120_000;
      if (scoring.startPoints > 0 && isFirstEntrance) {
        await ctx.reply(scoringService.formatTemplate(scoring.initialPointsMessageText, { name, points: scoring.startPoints }), { link_preview_options: { is_disabled: true } });
      }
      return;
    }

    await ctx.reply('از منوی زیر انتخاب کنید:', { link_preview_options: { is_disabled: true }, ...(await adminReplyOptions(ctx.from?.id)) });
  });



  bot.hears('👨‍💼 پنل ادمین', async (ctx) => {
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    const canBroadcast = admin.role === BotAdminRole.OWNER || admin.role === BotAdminRole.ADMIN;
    await ctx.reply('⚙️ پنل مدیریت ربات', buildBotAdminPanelKeyboard(canBroadcast));
  });

  // ─── Admin: Statistics (from new user notification) ─────────────
  bot.action(/^admin:stats:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;

    try {
      const now = new Date();
      const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const startMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [
        totalUsers,
        usersToday,
        usersThisWeek,
        usersThisMonth,
        activeUsers,
        blockedUsers,
        returningUsers,
        totalReferrals,
        totalPosts,
        publishedPosts,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { createdAt: { gte: startToday } } }),
        prisma.user.count({ where: { createdAt: { gte: startWeek } } }),
        prisma.user.count({ where: { createdAt: { gte: startMonth } } }),
        prisma.user.count({ where: { updatedAt: { gte: startWeek } } }),
        prisma.user.count({ where: { isBlocked: true } }),
        prisma.user.count({ where: { updatedAt: { gte: startMonth }, createdAt: { lt: startMonth } } }),
        prisma.referral.count(),
        prisma.post.count(),
        prisma.post.count({ where: { status: 'PUBLISHED', isPublished: true } }),
      ]);

      const growthPercent = totalUsers > 0 ? ((usersThisMonth / totalUsers) * 100).toFixed(1) : '0.0';

      const message = [
        '📊 *آمار جامع سیستم*',
        '',
        '👥 *کاربران*',
        `• کل کاربران: ${totalUsers.toLocaleString('fa-IR')}`,
        `• امروز: ${usersToday.toLocaleString('fa-IR')}`,
        `• این هفته: ${usersThisWeek.toLocaleString('fa-IR')}`,
        `• این ماه: ${usersThisMonth.toLocaleString('fa-IR')}`,
        `• کاربران فعال (هفته): ${activeUsers.toLocaleString('fa-IR')}`,
        `• کاربران مسدود: ${blockedUsers.toLocaleString('fa-IR')}`,
        `• بازگشتی‌ها (ماه): ${returningUsers.toLocaleString('fa-IR')}`,
        `• نرخ رشد ماهانه: ${growthPercent}%`,
        '',
        '📄 *محتوا*',
        `• کل پست‌ها: ${totalPosts.toLocaleString('fa-IR')}`,
        `• پست‌های منتشر شده: ${publishedPosts.toLocaleString('fa-IR')}`,
        '',
        '🔗 *دعوت دوستان*',
        `• کل دعوت‌ها: ${totalReferrals.toLocaleString('fa-IR')}`,
      ].join('\n');

      const userId = Number(ctx.match[1]);
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🔄 بروزرسانی', `admin:stats:${userId}`)],
      ]);

      if (ctx.callbackQuery?.message) {
        try {
          await ctx.editMessageText(message, { parse_mode: 'Markdown', link_preview_options: { is_disabled: true }, ...keyboard });
        } catch {
          await ctx.reply(message, { parse_mode: 'Markdown', link_preview_options: { is_disabled: true }, ...keyboard });
        }
      } else {
        await ctx.reply(message, { parse_mode: 'Markdown', link_preview_options: { is_disabled: true }, ...keyboard });
      }
    } catch (err) {
      logger.error('[AdminStats] Error:', err);
      await ctx.reply('❌ خطا در دریافت آمار').catch(() => {});
    }
  });

  // ─── Menu Builder (only rearrange, no creation, no auto-sync) ───

  bot.hears('🎛 ویرایش منو', async (ctx: any) => {
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    // Editor mode: resolve titles from DB but show all entries (including unpublished)
    const layout = await settingsService.getResolvedMenuLayout(false);
    await ctx.reply('🎛 ویرایشگر منوی اصلی\nروی دکمه ضربه بزنید تا جابجا/مرتب کنید:', menuEditorKeyboard(layout));
  });

  bot.action('menu:editor', async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    const layout = await settingsService.getResolvedMenuLayout(false);
    try {
      await ctx.editMessageText('🎛 ویرایشگر منوی اصلی\nروی دکمه ضربه بزنید تا جابجا/مرتب کنید:', menuEditorKeyboard(layout));
    } catch {
      await ctx.reply('🎛 ویرایشگر منوی اصلی\nروی دکمه ضربه بزنید تا جابجا/مرتب کنید:', menuEditorKeyboard(layout));
    }
  });

  bot.action('menu:preview', async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    const layout = await settingsService.getMenuLayout();
    await ctx.reply('👁 پیش‌نمایش منوی اصلی:', buildMainMenuKeyboard(true, {}, layout));
  });

  bot.action('menu:back', async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    const canBroadcast = admin.role === BotAdminRole.OWNER || admin.role === BotAdminRole.ADMIN;
    await safeEdit(ctx, '⚙️ پنل مدیریت ربات', buildBotAdminPanelKeyboard(canBroadcast));
  });

  bot.action(/^menu:edit:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    const row = parseInt(ctx.match[1]);
    const col = parseInt(ctx.match[2]);
    const layout = await settingsService.getMenuLayout();
    const button = layout[row]?.[col];
    if (!button) {
      await safeEdit(ctx, 'دکمه‌ای یافت نشد.', menuEditorKeyboard(layout));
      return;
    }
    const ref = button.ref || '';
    const isPost = ref.startsWith('post:');
    const postId = isPost ? parseInt(ref.replace('post:', '')) : null;
    const label = isPost ? `📄 ${button.text || 'پست'}` : `${button.text || 'دکمه'}`;
    await safeEdit(
      ctx,
      `${label}\n${isPost ? `🆔 پست: ${postId}` : `🔗 ارجاع: ${ref}`}\n${button.visible !== false ? '👁 قابل مشاهده' : '🙈 مخفی'}`,
      menuButtonEditKeyboard(row, col, button)
    );
  });

  bot.action(/^menu:btnleft:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    const row = parseInt(ctx.match[1]);
    const col = parseInt(ctx.match[2]);
    if (col === 0) return safeEdit(ctx, 'هم‌اکنون در چپ‌ترین است.');
    const layout = await settingsService.getMenuLayout();
    if (!layout[row]) return;
    [layout[row][col - 1], layout[row][col]] = [layout[row][col], layout[row][col - 1]];
    await settingsService.saveMenuLayout(layout);
    await safeEdit(ctx, '✅ دکمه به چپ منتقل شد.\n\n🎛 ویرایشگر منوی اصلی:', menuEditorKeyboard(layout));
  });

  bot.action(/^menu:btnright:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    const row = parseInt(ctx.match[1]);
    const col = parseInt(ctx.match[2]);
    const layout = await settingsService.getMenuLayout();
    if (!layout[row] || col >= layout[row].length - 1) return safeEdit(ctx, 'هم‌اکنون در راست‌ترین است.');
    [layout[row][col], layout[row][col + 1]] = [layout[row][col + 1], layout[row][col]];
    await settingsService.saveMenuLayout(layout);
    await safeEdit(ctx, '✅ دکمه به راست منتقل شد.\n\n🎛 ویرایشگر منوی اصلی:', menuEditorKeyboard(layout));
  });

  bot.action(/^menu:rowup:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    const row = parseInt(ctx.match[1]);
    if (row === 0) return safeEdit(ctx, 'هم‌اکنون در بالاست.');
    const layout = await settingsService.getMenuLayout();
    [layout[row - 1], layout[row]] = [layout[row], layout[row - 1]];
    await settingsService.saveMenuLayout(layout);
    await safeEdit(ctx, '✅ سطر به بالا منتقل شد.\n\n🎛 ویرایشگر منوی اصلی:', menuEditorKeyboard(layout));
  });

  bot.action(/^menu:rowdown:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    const row = parseInt(ctx.match[1]);
    const layout = await settingsService.getMenuLayout();
    if (row >= layout.length - 1) return safeEdit(ctx, 'هم‌اکنون در پایین‌ترین جایگاه است.');
    [layout[row], layout[row + 1]] = [layout[row + 1], layout[row]];
    await settingsService.saveMenuLayout(layout);
    await safeEdit(ctx, '✅ سطر به پایین منتقل شد.\n\n🎛 ویرایشگر منوی اصلی:', menuEditorKeyboard(layout));
  });

  bot.action(/^menu:swap:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    const row = parseInt(ctx.match[1]);
    const layout = await settingsService.getMenuLayout();
    await safeEdit(ctx, '🔄 سطر مقصد را برای جابجایی انتخاب کنید:', menuSwapTargetKeyboard(row, layout.length));
  });

  bot.action(/^menu:swapto:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    const rowA = parseInt(ctx.match[1]);
    const rowB = parseInt(ctx.match[2]);
    if (rowA === rowB) return;
    const layout = await settingsService.getMenuLayout();
    [layout[rowA], layout[rowB]] = [layout[rowB], layout[rowA]];
    await settingsService.saveMenuLayout(layout);
    await safeEdit(ctx, '🔄 سطرها جابجا شدند.\n\n🎛 ویرایشگر منوی اصلی:', menuEditorKeyboard(layout));
  });

  bot.action(/^menu:btnup:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    const row = parseInt(ctx.match[1]);
    const col = parseInt(ctx.match[2]);
    const layout = await settingsService.getMenuLayout();
    if (row === 0) return safeEdit(ctx, 'هم‌اکنون در بالاترین سطر است.');
    const button = layout[row]?.splice(col, 1)[0];
    if (button) {
      layout[row - 1].push(button);
      await settingsService.saveMenuLayout(layout);
      await safeEdit(ctx, `✅ دکمه به سطر ${row} منتقل شد.\n\n🎛 ویرایشگر منوی اصلی:`, menuEditorKeyboard(layout));
    }
  });

  bot.action(/^menu:btndown:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    const row = parseInt(ctx.match[1]);
    const col = parseInt(ctx.match[2]);
    const layout = await settingsService.getMenuLayout();
    const button = layout[row]?.splice(col, 1)[0];
    if (button) {
      const targetRow = row + 1;
      if (targetRow >= layout.length) {
        layout.push([]);
      }
      layout[targetRow].push(button);
      await settingsService.saveMenuLayout(layout);
      await safeEdit(ctx, `✅ دکمه به سطر ${targetRow + 1} منتقل شد.\n\n🎛 ویرایشگر منوی اصلی:`, menuEditorKeyboard(layout));
    }
  });

  bot.action(/^menu:toggle:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    const row = parseInt(ctx.match[1]);
    const col = parseInt(ctx.match[2]);
    const layout = await settingsService.getMenuLayout();
    if (layout[row]?.[col]) {
      layout[row][col].visible = layout[row][col].visible === false ? true : false;
      await settingsService.saveMenuLayout(layout);
      const status = layout[row][col].visible !== false ? 'نمایش داده می‌شود' : 'مخفی شد';
      await safeEdit(ctx, `👁 دکمه ${status}.\n\n🎛 ویرایشگر منوی اصلی:`, menuEditorKeyboard(layout));
    }
  });

  // ─── Dynamic Post Button Routing ──────────────────────────
  // Uses menu_layout text → ref mapping, NEVER queries published posts by title.
  bot.on('text', async (ctx: any, next) => {
    if (!ctx.from || ctx.chat?.type !== 'private') return next();
    const text = ctx.message.text;
    if (!text || text.startsWith('/')) return next();
    const knownTexts = [
      '🎯 کدهای تخفیف', '🏢 پراپ فرم‌ها', '🎰 قرعه‌کشی', '⭐️ امتیاز من',
      '🏆 لیدربورد', '👥 دعوت دوستان', '🤖 هوش مصنوعی پراپ هاب',
      '🔍 جستجو', '🚀 پروفایل من', '👨‍💼 پنل ادمین',
      '↩️ بازگشت به منوی اصلی', '📢 پیام همگانی', '📝 پست‌ها',
      '🎛 ویرایش منو', '👥 مدیریت ادمین‌ها', '📊 گزارشات', '⚙️ تنظیمات',
      '➕ ایجاد پست', '📋 مدیریت پست‌ها', '📦 پیش‌نویس‌ها',
      '👻 پست‌های مخفی', '👁 پیش‌نمایش', '📤 انتشار',
      '🔎 جستجو', '📊 آمار پست', '📊 آمار کلی', '🔍 بررسی سلامت',
      '↩️ بازگشت به پنل ادمین',
    ];
    if (knownTexts.includes(text)) return next();
    try {
      // Resolve layout from DB so post titles are current (single source of truth)
      const layout = await settingsService.getResolvedMenuLayout(false);
      const textMap = settingsService.getMenuButtonTextMap(layout);
      const match = textMap.get(text);
      if (match && match.ref.startsWith('post:')) {
        const postId = parseInt(match.ref.replace('post:', ''));
        const post = await postService.findById(postId);
        if (post && post.status === 'PUBLISHED' && post.isPublished) {
          await sendPostToUser(ctx, post);
          return;
        }
      }
    } catch {}
    return next();
  });

  bot.hears('↩️ بازگشت به منوی اصلی', async (ctx) => {
    cache.del(`ai_mode:${ctx.from.id}`);
    await ctx.reply('منوی اصلی', await adminReplyOptions(ctx.from.id));
  });

  bot.hears('🚀 پروفایل من', async (ctx) => {
    if (!config.miniApp.url) {
      logger.warn('[MiniApp] Mini App URL is not configured', { telegramId: ctx.from?.id });
      await ctx.reply('آدرس Mini App هنوز تنظیم نشده است. لطفاً با پشتیبانی تماس بگیرید.');
      return;
    }
    if (ctx.chat?.type !== 'private') {
      await ctx.reply('برای احراز هویت امن Mini App، لطفاً پروفایل را از چت خصوصی ربات باز کنید.');
      return;
    }
    await ctx.reply(
      'برای بارگذاری امن پروفایل، دکمه زیر را باز کنید.',
      buildMiniAppProfileKeyboard(),
    );
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

  // ─── Post: User View by ID (via command routing) ────────
  bot.action(/^post:user:view:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    if (!(await settingsService.isFeatureEnabled('posts'))) return;
    const postId = parseInt(ctx.match[1]);
    const post = await postService.findById(postId);
    if (!post || post.status !== 'PUBLISHED' || !post.isPublished) {
      return ctx.reply('❌ پست یافت نشد.');
    }
    await sendPostToUser(ctx, post);
  });

  bot.action(/^post:user:copy:(.+)$/, async (ctx: any) => {
    await ctx.answerCbQuery(`📋 کپی شد: ${ctx.match[1]}`, { show_alert: true });
  });

  bot.action(/^post:user:copyblock:(.+)$/, async (ctx: any) => {
    try {
      const content = Buffer.from(ctx.match[1], 'base64').toString('utf-8');
      await ctx.answerCbQuery();
      await ctx.reply(content, { parse_mode: undefined });
      await ctx.reply('📋 برای کپی لمس کنید', Markup.inlineKeyboard([
        [Markup.button.callback('📋 کپی', `post:user:copy:${content}`)],
      ]));
    } catch {
      await ctx.answerCbQuery('❌ خطا در پردازش', { show_alert: true });
    }
  });

  // ─── Post Command Routing ─────────────────────────────────
  bot.on('text', async (ctx: any, next) => {
    if (ctx.chat?.type !== 'private') return next();
    const text = ctx.message.text;
    if (!text.startsWith('/')) return next();
    const cmd = text.slice(1).split(' ')[0].toLowerCase();
    if (['start', 'admin_add', 'admin_suspend', 'admin_activate', 'admin_delete'].includes(cmd)) return next();
    try {
      const post = await postService.resolveCommand(cmd);
      if (post && post.status === 'PUBLISHED' && post.isPublished) {
        await postService.incrementViews(post.id, undefined, BigInt(ctx.from.id));
        await sendPostToUser(ctx, post);
        await systemLogService.log({
          eventType: SystemEventType.ADMIN_ACTION,
          message: `Post Command Executed: /${cmd} -> "${post.title}"`,
          telegramId: ctx.from.id,
          metadata: { postId: post.id, command: cmd } as any,
        });
        return;
      }
    } catch {}
    return next();
  });

  // ─── Post Button Click Logging ───────────────────────────
  bot.action(/^post:user:click:(.+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    try {
      const data = JSON.parse(ctx.match[1]);
      await postService.logClick({
        postId: data.postId,
        telegramId: BigInt(ctx.from.id),
        buttonText: data.text,
        buttonType: data.type,
      });
    } catch {}
  });

  // ─── Post INTERNAL_NAV routing ──────────────────────────
  bot.action(/^post:nav:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    if (!(await settingsService.isFeatureEnabled('posts'))) return;
    const postId = parseInt(ctx.match[1]);
    const post = await postService.findById(postId);
    if (!post || post.status !== 'PUBLISHED' || !post.isPublished) {
      return ctx.reply('❌ Post not found.');
    }
    await sendPostToUser(ctx, post);
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

    await ctx.reply('📋 *پراپ فرم‌های موجود:*', { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } });

    const propFirmCheckEnabled = await settingsService.isFeatureEnabled('prop_firm_check');
    for (const firm of firms) {
      const buttons: any[][] = [];
      if (firm.websiteUrl) buttons.push([Markup.button.url('🛒 خرید', firm.websiteUrl)]);
      buttons.push([Markup.button.callback('🎯 کد تخفیف', `firm:${firm.id}`)]);
      if (propFirmCheckEnabled && firm.reviewLink) buttons.push([Markup.button.callback('🔎 بررسی پراپ', `propReview:${firm.id}`)]);

      await ctx.reply(`🏢 *${firm.name}* — ${firm._count?.discountCodes || 0} کد تخفیف`, {
        parse_mode: 'Markdown',
        link_preview_options: { is_disabled: true },
        ...Markup.inlineKeyboard(buttons),
      });
    }
  });

  bot.action(/^propReview:(\d+)$/, async (ctx: any) => {
    if (!(await settingsService.isFeatureEnabled('prop_firm_check'))) return ctx.answerCbQuery('⛔ این سرویس در حال حاضر غیرفعال است.', { show_alert: true });
    const firmId = Number(ctx.match[1]);
    const firms = (await discountService.getPropFirms(false)) as any[];
    const firm = firms.find((item) => item.id === firmId);
    if (!firm?.reviewLink) return ctx.answerCbQuery('لینک بررسی برای این پراپ ثبت نشده است.');
    await ctx.answerCbQuery();
    return ctx.reply(`🔎 لینک بررسی ${firm.name}:\n${firm.reviewLink}`, { link_preview_options: { is_disabled: true } });
  });

  bot.hears('🔍 جستجو', async (ctx) => {
    if (!(await settingsService.isFeatureEnabled('discount_codes'))) return ctx.reply('⛔ این سرویس در حال حاضر غیرفعال است.');
    await ctx.reply('🔍 نام پراپ فرم مورد نظر را بنویسید:');
    cache.set(`search_mode:${ctx.from?.id}`, true, 60);
  });

  bot.hears('🤖 هوش مصنوعی پراپ هاب', async (ctx) => {
    if (!(await settingsService.isFeatureEnabled('ai_assistant'))) return ctx.reply('⛔ این سرویس در حال حاضر غیرفعال است.');
    cache.set(`ai_mode:${ctx.from?.id}`, true, 600);
    await ctx.reply('🤖 سوال خود را درباره پراپ فرم‌ها، قوانین حساب، قوانین تریدینگ یا کدهای تخفیف بنویسید.\nبرای خروج «↩️ بازگشت به منوی اصلی» را بزنید.');
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

    const isAiMode = cache.get<boolean>(`ai_mode:${ctx.from.id}`);
    if (isAiMode) {
      const text = ctx.message.text;
      if (text === '↩️ بازگشت به منوی اصلی') {
        cache.del(`ai_mode:${ctx.from.id}`);
        return ctx.reply('منوی اصلی', await adminReplyOptions(ctx.from.id));
      }
      await ctx.reply('⏳ در حال بررسی سوال شما...');
      try {
        const result = await wordpressApiClient.sendMessage({
          telegramId: BigInt(ctx.from.id),
          message: text,
          userData: {
            username: ctx.from.username,
            firstName: ctx.from.first_name,
            lastName: ctx.from.last_name,
            languageCode: ctx.from.language_code,
            chatId: ctx.chat?.id,
          },
        });
        cache.set(`ai_mode:${ctx.from.id}`, true, 600);
        return ctx.reply(result.response, { link_preview_options: { is_disabled: true } });
      } catch (error) {
        const message = error instanceof WordPressApiClientError ? error.message : 'این سوال خارج از محدوده سیستم است.';
        return ctx.reply(message, { link_preview_options: { is_disabled: true } });
      }
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

    await ctx.reply(`🔍 نتایج جستجو برای "*${query}*":\n\n${text}`, { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } });
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
        botInfo.username || DEFAULT_BOT_USERNAME
      );

    const link =
      referralStats?.referralLink ||
      (await userService.getReferralLink(
        profile.id,
        botInfo.username || DEFAULT_BOT_USERNAME
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
      ].join('\n'),
      { link_preview_options: { is_disabled: true } }
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
    const telegramId = ctx.from!.id;
    await ctx.answerCbQuery().catch(() => {});

    try {
      await membershipService.invalidateAll(telegramId);
      const channels = requiredChannelsService.getChannels();
      if (channels.length === 0) {
        await ctx.answerCbQuery('همه کانال‌ها عضو هستید.');
        return;
      }

      const result = await membershipService.checkMembershipConcurrent(telegramId, channels);

      if (result.isMember) {
        const settings = await forcedMembershipSettingsService.getSettings();
        try {
          await ctx.editMessageText(settings.verifiedMessage, { reply_markup: undefined });
        } catch {
          await ctx.reply(settings.verifiedMessage, await adminReplyOptions(ctx.from?.id));
        }
        await ctx.answerCbQuery('✅').catch(() => {});
      } else {
        const settings = await forcedMembershipSettingsService.getSettings();
        await ctx.answerCbQuery(settings.retryMessage, { show_alert: true });
      }
    } catch {
      const settings = await forcedMembershipSettingsService.getSettings().catch(() => null);
      await ctx.answerCbQuery(settings?.errorMessage || 'خطا در بررسی عضویت', { show_alert: true });
    }
  });

  bot.action('noop', async (ctx) => {
    await ctx.answerCbQuery();
  });

  bot.command('leaderboard', async (ctx) => {
    try {
      const season = await leaderboardService.getActiveSeason();
      if (!season) {
        await ctx.reply('🏆 در حال حاضر هیچ فصل لیدربوردی فعال نیست.');
        return;
      }

      const leaderboard = await leaderboardService.getLeaderboard(season.id, 10);
      const stats = await leaderboardService.getLeaderboardStats(season.id);

      if (leaderboard.length === 0) {
        await ctx.reply(
          `🏆 فصل ${season.name}\n` +
          `📅 ${season.startDate.toLocaleDateString('fa-IR')} — ${season.endDate.toLocaleDateString('fa-IR')}\n\n` +
          'هنوز دعوتی ثبت نشده. اولین نفر باش!'
        );
        return;
      }

      const medal = (rank: number) => rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `  ${rank}.`;

      const safeName = (entry: typeof leaderboard[0]) => {
        const raw = entry.firstName || entry.username || `کاربر ${entry.userId}`;
        return `\u2068${raw}\u2069`;
      };

      const lines: string[] = [];
      for (const entry of leaderboard) {
        lines.push(`${medal(entry.rank)} ${safeName(entry)}`);
        lines.push(`🎯 ${entry.inviteCount} دعوت`);
        lines.push('');
      }

      const header =
        `🏆 *لیدربورد فصل: ${season.name}*\n` +
        `📅 ${season.startDate.toLocaleDateString('fa-IR')} — ${season.endDate.toLocaleDateString('fa-IR')}\n`;
      const footer = `📊 مجموع دعوت\u200cها: ${stats.totalReferrals} | شرکت\u200cکنندگان: ${stats.totalInviters}`;

      await ctx.reply([header, ...lines, footer].join('\n'), { parse_mode: 'Markdown' });
    } catch (err) {
      logger.error('[LeaderboardCommand] Error:', err);
      await ctx.reply('❌ خطا در دریافت لیدربورد.');
    }
  });

  // ─── Register Post Management Handlers ─────────────────
  const { registerPostHandlers } = require('./post-handlers');
  registerPostHandlers(bot);

  logger.info('✅ تمام هندلرهای ربات ثبت شدند');
}
