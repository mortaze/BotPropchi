import { BotAdminRole, BotAdminStatus, BroadcastType, SystemEventType } from '@prisma/client';
import { Context, Markup, Telegraf } from 'telegraf';
import { channelService } from '../../services/channel.service';
import { lotteryService } from '../../services/lottery.service';
import { groupService } from '../../services/group.service';
import { keywordReplyService } from '../../services/keyword-reply.service';
import { autoReplyService } from '../../services/auto-reply.service';
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
import { DEFAULT_BOT_USERNAME } from '../../constants';
import { postService } from '../../services/post.service';
import { config } from '../../config';
import { prisma } from '../../prisma/client';
import { cache } from '../../utils/cache';
import { logger } from '../../utils/logger';
import { setBotInstance } from '../notifications';
import { setTicketBotInstance } from '../ticket-notification.service';
import { buildPostDebugSnapshot, comparePostNativeRoundtrip } from '../../services/post-renderer.service';
import { deliveryDebugService } from '../../services/renderer/delivery-debug.service';
import { safeEdit, sendPostToUser } from '../shared';
import {
  lotteryHistoryKeyboard,
  lotteryKeyboard,
  buildBotAdminPanelKeyboard,
  buildMainMenuKeyboard,
  buildMiniAppProfileKeyboard,
  paginationKeyboard,
  buildForceJoinKeyboard,
  buildReferralShareKeyboard,
  buildReferralMenuKeyboard,
  injectServiceButtons,
} from '../keyboards';
import {
  buildMenuEditorReplyKeyboard,
  buildMenuItemEditKeyboard,
  buildCancelOnlyReplyKeyboard,
} from '../keyboards/post-keyboards';
import { clearAllPostStates } from './post-handlers';

type PaginatedResult<T> = { items: T[]; total: number; pages: number };


function findButtonNewPosition(layout: any[][], buttonId: string): { row: number; col: number } | null {
  for (let r = 0; r < layout.length; r++) {
    for (let c = 0; c < layout[r].length; c++) {
      if (layout[r][c]?.id === buttonId) return { row: r, col: c };
    }
  }
  return null;
}

function isSelectedKeyValid(layout: any[][], key: { row: number; col: number }): boolean {
  return (
    key.row >= 0 &&
    key.row < layout.length &&
    layout[key.row] != null &&
    key.col >= 0 &&
    key.col < layout[key.row].length &&
    layout[key.row][key.col] != null
  );
}

function buildSafeMenuEditorKeyboard(layout: any[][], selectedKey?: { row: number; col: number } | null) {
  try {
    const keyboard = buildMenuEditorReplyKeyboard(layout, selectedKey);
    return keyboard;
  } catch (error) {
    logger.error('[MenuEditor] Failed to build Reply Keyboard, using fallback', error);
    return Markup.keyboard([['🔙 بازگشت']]).resize().persistent();
  }
}

function resolveSelectedPosition(ctx: any, layout: any[][]): { row: number; col: number; button: any } | null {
  const selected = cache.get<{ row: number; col: number; buttonId?: string }>(`menu:selected:${ctx.from.id}`);
  if (!selected) return null;
  if (isSelectedKeyValid(layout, selected)) {
    const button = layout[selected.row]?.[selected.col];
    if (button) {
      // If we have a stored buttonId, verify it matches (prevents stale position after moves)
      if (selected.buttonId && button.id !== selected.buttonId) {
        // Button moved — find by ID in current layout
        for (let r = 0; r < layout.length; r++) {
          for (let c = 0; c < (layout[r]?.length || 0); c++) {
            if (layout[r][c]?.id === selected.buttonId) {
              cache.setPermanent(`menu:selected:${ctx.from.id}`, { row: r, col: c, buttonId: selected.buttonId });
              return { row: r, col: c, button: layout[r][c] };
            }
          }
        }
        cache.del(`menu:selected:${ctx.from.id}`);
        return null;
      }
      return { row: selected.row, col: selected.col, button };
    }
  }
  cache.del(`menu:selected:${ctx.from.id}`);
  return null;
}

async function assertMenuTextPreserved(before: any[][], after: any[][], operation: string) {
  const beforeTexts = before.flat().map((button: any) => button?.text || button?.label || button?.title || button?.ref || '');
  const afterTexts = after.flat().map((button: any) => button?.text || button?.label || button?.title || button?.ref || '');
  if (beforeTexts.some((text: string) => text.includes('???')) || afterTexts.some((text: string) => text.includes('???'))) {
    logger.error(`[MenuEditor] Corrupted placeholder detected during ${operation}`, { beforeTexts, afterTexts });
  }
  logger.info(`[MenuEditor] ${operation}: before=${beforeTexts.length} after=${afterTexts.length}`);
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
  cache.setPermanent(pendingBroadcastKey(ctx.from.id), pending);
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
  setBotInstance(bot);
  setTicketBotInstance(bot);
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
    const userId = ctx.from!.id;

    userService.processPendingReferral(BigInt(userId)).catch(() => {});

    // ─── HARD RESET: Clear ALL runtime/session/navigation state ──
    clearAllPostStates(userId);

    logger.info({ action: 'START_HARD_RESET', telegramId: userId, cleared: true });

    const profile = await userService.getProfile(BigInt(userId));

    // ─── Send Start message (single message with Reply Keyboard) ──
    const startPost = await postService.getOrCreateStartPost();
    if (startPost) {
      const vars = {
        first_name: ctx.from?.first_name || '',
        last_name: ctx.from?.last_name || '',
        username: ctx.from?.username || '',
        user_id: String(ctx.from?.id || ''),
        join_date: profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString('fa-IR') : '',
        bot_name: DEFAULT_BOT_USERNAME || 'ربات',
      };
      const adminOpts = await adminReplyOptions(ctx.from?.id);
      await sendPostToUser(ctx, { id: startPost.id }, vars, adminOpts.reply_markup);
      logger.info({ action: 'START_RENDER', startPostSent: true, extraMessageBlocked: true, telegramId: userId });
      return;
    }

    // ─── Default welcome (only when no custom Start post) ──
    const adminOpts = await adminReplyOptions(ctx.from?.id);
    if (!scoring.startOnlyMode && scoring.isWelcomeMessageEnabled) {
      await ctx.reply(
        scoringService.formatTemplate(scoring.welcomeMessageText, { name, points: scoring.startPoints }),
        { parse_mode: 'Markdown', link_preview_options: { is_disabled: true }, ...adminOpts }
      );
      const isFirstEntrance = profile?.createdAt && Date.now() - new Date(profile.createdAt).getTime() < 120_000;
      if (scoring.startPoints > 0 && isFirstEntrance) {
        await ctx.reply(scoringService.formatTemplate(scoring.initialPointsMessageText, { name, points: scoring.startPoints }), { link_preview_options: { is_disabled: true } });
      }
      return;
    }

    if (!scoring.startOnlyMode) {
      await ctx.reply('از منوی زیر انتخاب کنید:', { link_preview_options: { is_disabled: true }, ...adminOpts });
    }
  });



  bot.hears('👨‍💼 پنل ادمین', async (ctx) => {
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    clearAllPostStates(ctx.from.id);
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
    clearAllPostStates(ctx.from.id);
    cache.del(`menu:selected:${ctx.from.id}`);
    cache.del(`menu:renaming:${ctx.from.id}`);
    settingsService.invalidateMenuLayoutCache();
    await settingsService.getMenuLayout();
    settingsService.startEditSession(ctx.from.id);
    const features = await settingsService.getFeatureMap();
    const draftLayout = settingsService.getEditableLayout(ctx.from.id);
    const injected = injectServiceButtons(draftLayout, features);
    settingsService.updateDraftLayout(ctx.from.id, injected);
    const resolvedDraft = await settingsService.getResolvedEditableLayout(ctx.from.id, false);
    cache.setPermanent(`menu:edit_mode:${ctx.from.id}`, true);
    await ctx.reply('🎛 ویرایشگر منوی اصلی\nروی دکمه ضربه بزنید:', buildMenuEditorReplyKeyboard(resolvedDraft));
  });

  bot.action('menu:item:back', async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    cache.del(`menu:selected:${ctx.from.id}`);
    cache.del(`menu:renaming:${ctx.from.id}`);
    cache.del(`menu:edit_mode:${ctx.from.id}`);
    await settingsService.cancelEditSession(ctx.from.id, false);
    const canBroadcast = admin.role === BotAdminRole.OWNER || admin.role === BotAdminRole.ADMIN;
    await safeEdit(ctx, '⚙️ پنل مدیریت ربات', buildBotAdminPanelKeyboard(canBroadcast));
  });

  bot.action('menu:preview', async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    // Preview from session draft if editing, otherwise from cache
    let layout: any[][];
    if (settingsService.hasActiveSession(ctx.from.id)) {
      layout = settingsService.getEditableLayout(ctx.from.id);
    } else {
      settingsService.invalidateMenuLayoutCache();
      layout = await settingsService.getMenuLayout();
    }
    await ctx.reply('👁 پیش‌نمایش منوی اصلی:', buildMainMenuKeyboard(true, {}, layout));
  });

  // ─── Helper: update inline + reply after item action ──────────
  async function updateAfterItemAction(ctx: any, buttonId: string) {
    // Use session's draft layout for immediate UI update (committed state via cache)
    let layout: any[][];
    let resolvedLayout: any[][];
    if (settingsService.hasActiveSession(ctx.from.id)) {
      layout = settingsService.getEditableLayout(ctx.from.id);
      resolvedLayout = await settingsService.getResolvedEditableLayout(ctx.from.id, false);
    } else {
      settingsService.invalidateMenuLayoutCache();
      layout = await settingsService.getMenuLayout();
      resolvedLayout = await settingsService.getResolvedMenuLayout(false);
    }
    const newPos = findButtonNewPosition(layout, buttonId);
    if (!newPos) {
      cache.del(`menu:selected:${ctx.from.id}`);
      cache.del(`menu:renaming:${ctx.from.id}`);
      await ctx.reply('🎛 ویرایشگر منوی اصلی:', buildSafeMenuEditorKeyboard(resolvedLayout));
      return;
    }
    cache.setPermanent(`menu:selected:${ctx.from.id}`, newPos);
    const button = layout[newPos.row]?.[newPos.col];
    const btnText = button?.text || button?.label || button?.title || button?.ref || 'دکمه';
    try {
      await ctx.editMessageText(`ویرایش دکمه: ${btnText}`, buildMenuItemEditKeyboard(newPos.row, newPos.col, button, layout));
    } catch (e: any) {
      logger.debug(`[MenuEditor] editMessageText failed in updateAfterItemAction: ${e?.description || e?.message}`);
    }
    await ctx.reply('🎛 ویرایشگر منوی اصلی:', buildSafeMenuEditorKeyboard(resolvedLayout, newPos));
  }

  // ─── Menu Item: Move Left ──────────────────────────────
  bot.action(/^menu:item:left:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    const layout = settingsService.getEditableLayout(ctx.from.id);
    const pos = resolveSelectedPosition(ctx, layout);
    if (!pos || pos.col === 0) return;
    const btnId = pos.button.id;
    [layout[pos.row][pos.col - 1], layout[pos.row][pos.col]] = [layout[pos.row][pos.col], layout[pos.row][pos.col - 1]];
    await settingsService.saveMenuLayout(layout);
    settingsService.notifySessionChanged(ctx.from.id, 'left');
    await updateAfterItemAction(ctx, btnId);
  });

  // ─── Menu Item: Move Right ─────────────────────────────
  bot.action(/^menu:item:right:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    const layout = settingsService.getEditableLayout(ctx.from.id);
    const pos = resolveSelectedPosition(ctx, layout);
    if (!pos || pos.col >= layout[pos.row].length - 1) return;
    const btnId = pos.button.id;
    [layout[pos.row][pos.col], layout[pos.row][pos.col + 1]] = [layout[pos.row][pos.col + 1], layout[pos.row][pos.col]];
    await settingsService.saveMenuLayout(layout);
    settingsService.notifySessionChanged(ctx.from.id, 'right');
    await updateAfterItemAction(ctx, btnId);
  });

  // ─── Menu Item: Move Up ────────────────────────────────
  bot.action(/^menu:item:up:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    const layout = settingsService.getEditableLayout(ctx.from.id);
    const pos = resolveSelectedPosition(ctx, layout);
    if (!pos) return;
    const button = pos.button;
    const btnId = button.id;

    if (layout[pos.row].length > 1) {
      layout[pos.row].splice(pos.col, 1);
      layout.splice(pos.row, 0, [button]);
    } else {
      if (pos.row === 0) return;
      layout[pos.row].splice(pos.col, 1);
      layout[pos.row - 1].push(button);
      const cleaned = layout.filter((r: any[]) => r.length > 0);
      await settingsService.saveMenuLayout(cleaned);
      settingsService.notifySessionChanged(ctx.from.id, 'up');
      await updateAfterItemAction(ctx, btnId);
      return;
    }
    await settingsService.saveMenuLayout(layout);
    settingsService.notifySessionChanged(ctx.from.id, 'up');
    await updateAfterItemAction(ctx, btnId);
  });

  // ─── Menu Item: Move Down ──────────────────────────────
  bot.action(/^menu:item:down:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    const layout = settingsService.getEditableLayout(ctx.from.id);
    const pos = resolveSelectedPosition(ctx, layout);
    if (!pos) return;
    const button = pos.button;
    const btnId = button.id;

    if (layout[pos.row].length > 1) {
      layout[pos.row].splice(pos.col, 1);
      layout.splice(pos.row + 1, 0, [button]);
    } else {
      if (pos.row >= layout.length - 1) return;
      layout[pos.row].splice(pos.col, 1);
      layout[pos.row + 1].push(button);
      const cleaned = layout.filter((r: any[]) => r.length > 0);
      await settingsService.saveMenuLayout(cleaned);
      settingsService.notifySessionChanged(ctx.from.id, 'down');
      await updateAfterItemAction(ctx, btnId);
      return;
    }
    await settingsService.saveMenuLayout(layout);
    settingsService.notifySessionChanged(ctx.from.id, 'down');
    await updateAfterItemAction(ctx, btnId);
  });

  // ─── Menu Item: Toggle Visibility ──────────────────────
  bot.action(/^menu:item:toggle:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    const layout = settingsService.getEditableLayout(ctx.from.id);
    const pos = resolveSelectedPosition(ctx, layout);
    if (pos) {
      pos.button.visible = pos.button.visible === false ? true : false;
      await settingsService.saveMenuLayout(layout);
      settingsService.notifySessionChanged(ctx.from.id, 'toggle');
      await updateAfterItemAction(ctx, pos.button.id);
    }
  });

  // ─── Menu Item: Rename ─────────────────────────────────
  bot.action(/^menu:item:rename:(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    const layout = settingsService.getEditableLayout(ctx.from.id);
    const pos = resolveSelectedPosition(ctx, layout);
    if (!pos) return;
    cache.setPermanent(`menu:renaming:${ctx.from.id}`, { row: pos.row, col: pos.col });
    const btnText = pos.button.text || pos.button.label || pos.button.title || pos.button.ref || 'دکمه';
    try {
      await ctx.editMessageText(`✏️ لطفاً نام جدید را برای "${btnText}" وارد کنید:`, { reply_markup: undefined });
    } catch {
      await ctx.reply(`✏️ لطفاً نام جدید را برای "${btnText}" وارد کنید:`);
    }
    await ctx.reply('برای لغو عملیات، دکمه زیر را بزنید:', buildCancelOnlyReplyKeyboard());
  });

  // ─── Dynamic Post Button Routing (ALL users — must be BEFORE admin-only handler) ───
  // This intercepts main menu post button clicks for regular users and sends the post.
  bot.on('text', async (ctx: any, next) => {
    if (!ctx.from || ctx.chat?.type !== 'private') return next();
    const text = ctx.message.text;
    if (!text || text.startsWith('/')) return next();

    // Skip known system button texts
    const knownTexts = [
      '🎯 کدهای تخفیف', '🏢 پراپ فرم‌ها', '🎰 قرعه‌کشی', '⭐️ امتیاز من',
      '🏆 لیدربورد', '👥 دعوت دوستان', '🤖 هوش مصنوعی پراپ هاب',
      '🔍 جستجو', '🚀 پروفایل من', '👨‍💼 پنل ادمین',
      '↩️ بازگشت به منوی اصلی', '📢 پیام همگانی', '📝 پست‌ها',
      '🎛 ویرایش منو', '👥 مدیریت ادمین‌ها', '📊 گزارشات', '⚙️ تنظیمات',
      '➕ ایجاد پست', '📋 مدیریت پست‌ها', '📦 پیش‌نویس‌ها',
      '👻 پست‌های مخفی', '👁 پیش​‌نمایش', '📤 انتشار',
      '🔎 جستجو', '🔍 بررسی سلامت',
      '↩️ بازگشت به پنل ادمین',
      '📢 پیام‌های خودکار',
    ];
    if (knownTexts.includes(text)) return next();

    // Skip if admin is in Post Management, Menu Editor, or Multi-Message Editor mode
    if (cache.get(`post_mgmt_mode:${ctx.from.id}`) || cache.get(`menu:edit_mode:${ctx.from.id}`) || cache.get(`post:editor:${ctx.from.id}:active`)) {
      return next();
    }

    try {
      const layout = await settingsService.getResolvedMenuLayout(false);
      const textMap = settingsService.getMenuButtonTextMap(layout);
      const match = textMap.get(text);
      if (match && match.ref.startsWith('post:')) {
        const postId = parseInt(match.ref.replace('post:', ''));
        const post = await postService.getPostMeta(postId);
        if (post && post.status === 'PUBLISHED' && post.isPublished) {
          await sendPostToUser(ctx, post);
          return;
        }
      }
    } catch (e: any) {
      logger.debug(`[DynamicPostButton] lookup failed for text="${text}": ${e?.message}`);
    }
    return next();
  });

  // ─── Menu Editor (Reply Keyboard) ─────────────────────────
  // Handles Reply Keyboard interactions for the menu editor.
  bot.on('text', async (ctx: any, next) => {
    if (!ctx.from || ctx.chat?.type !== 'private') return next();
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return next();
    const text = ctx.message.text;
    if (!text || text.startsWith('/')) return next();

    // ── Rename mode ──────────────────────────────────────
    const renameData = cache.get<{ row: number; col: number }>(`menu:renaming:${ctx.from.id}`);
    if (renameData) {
      if (text === '❌ لغو') {
        cache.del(`menu:renaming:${ctx.from.id}`);
        const btnData = cache.get<{ row: number; col: number }>(`menu:selected:${ctx.from.id}`);
        const layout = settingsService.getEditableLayout(ctx.from.id);
        const resolvedLayout = await settingsService.getResolvedEditableLayout(ctx.from.id, false);
        if (btnData && isSelectedKeyValid(layout, btnData)) {
          const btn = layout[btnData.row][btnData.col];
          await ctx.reply('🎛 ویرایشگر منوی اصلی:', buildSafeMenuEditorKeyboard(resolvedLayout, btnData));
          await ctx.reply(`ویرایش دکمه: ${btn.text || btn.label || btn.title || btn.ref || 'دکمه'}`, buildMenuItemEditKeyboard(btnData.row, btnData.col, btn, layout));
        } else {
          cache.del(`menu:selected:${ctx.from.id}`);
          await ctx.reply('🎛 ویرایشگر منوی اصلی:', buildSafeMenuEditorKeyboard(resolvedLayout));
        }
        return;
      }
      // New name received
      const layout = settingsService.getEditableLayout(ctx.from.id);
      const button = layout[renameData.row]?.[renameData.col];
      let buttonId: string | undefined;
      if (button) {
        buttonId = button.id;
        const ref = button.ref || '';
        if (ref.startsWith('post:')) {
          const postId = parseInt(ref.replace('post:', ''));
          await postService.update(postId, { title: text });
        } else {
          button.text = text;
          button.label = text;
        }
        await settingsService.saveMenuLayout(layout);
        settingsService.notifySessionChanged(ctx.from.id, 'rename');
      }
      cache.del(`menu:renaming:${ctx.from.id}`);
      const resolvedLayout = await settingsService.getResolvedEditableLayout(ctx.from.id, false);
      const newLayout = settingsService.getEditableLayout(ctx.from.id);
      if (buttonId) {
        const newPos = findButtonNewPosition(newLayout, buttonId);
        if (newPos) {
    cache.setPermanent(`menu:selected:${ctx.from.id}`, { ...newPos, buttonId });
          const btn = newLayout[newPos.row][newPos.col];
          await ctx.reply('🎛 ویرایشگر منوی اصلی:', buildSafeMenuEditorKeyboard(resolvedLayout, newPos));
          await ctx.reply(`ویرایش دکمه: ${text}`, buildMenuItemEditKeyboard(newPos.row, newPos.col, btn, newLayout));
          return;
        }
      }
      cache.del(`menu:selected:${ctx.from.id}`);
      await ctx.reply(`✅ نام به "${text}" تغییر کرد.\n\n🎛 ویرایشگر منوی اصلی:`, buildSafeMenuEditorKeyboard(resolvedLayout));
      return;
    }

    // ── Check if user is in main menu editor mode ────────────
    const inMenuEditor = cache.get<boolean>(`menu:edit_mode:${ctx.from.id}`);
    if (inMenuEditor) {
      let selectedKey = cache.get<{ row: number; col: number }>(`menu:selected:${ctx.from.id}`);

      // Validate selectedKey after possible deploy (use session draft)
      if (selectedKey) {
        const validationLayout = settingsService.getEditableLayout(ctx.from.id);
        if (!isSelectedKeyValid(validationLayout, selectedKey)) {
          logger.warn(`[MenuEditor] Stale selectedKey detected for user ${ctx.from.id}, clearing`);
          cache.del(`menu:selected:${ctx.from.id}`);
          selectedKey = undefined;
        }
      }

      if (text === '🔙 بازگشت') {
        if (selectedKey) {
          cache.del(`menu:selected:${ctx.from.id}`);
          const resolvedLayout = await settingsService.getResolvedEditableLayout(ctx.from.id, false);
          await ctx.reply('🎛 ویرایشگر منوی اصلی:', buildSafeMenuEditorKeyboard(resolvedLayout));
          return;
        }
        // Exit menu editor — keep persisted changes
        cache.del(`menu:edit_mode:${ctx.from.id}`);
        cache.del(`menu:selected:${ctx.from.id}`);
        await settingsService.cancelEditSession(ctx.from.id, false);
        const canBroadcast = admin.role === BotAdminRole.OWNER || admin.role === BotAdminRole.ADMIN;
        await ctx.reply('⚙️ پنل مدیریت ربات', buildBotAdminPanelKeyboard(canBroadcast));
        return;
      }

      // Match text to a menu button → select for editing
      const resolvedLayout = await settingsService.getResolvedEditableLayout(ctx.from.id, false);
      const rawLayout = settingsService.getEditableLayout(ctx.from.id);
      const matchText = text.replace(/^\{|\}$/g, '');
      let matched = false;
      for (let r = 0; r < resolvedLayout.length; r++) {
        for (let c = 0; c < resolvedLayout[r].length; c++) {
          const btn = resolvedLayout[r][c];
          if (!btn) continue;
          const btnText = btn.text || btn.label || btn.title || btn.ref || 'بدون عنوان';
          const prefix = btn.visible === false ? '🙈 ' : '';
          const displayText = `${prefix}${btnText}`;
          if (displayText === matchText) {
            const rawButton = rawLayout[r]?.[c];
            cache.setPermanent(`menu:selected:${ctx.from.id}`, { row: r, col: c, buttonId: btn.id });
            await ctx.reply('🎛 ویرایشگر منوی اصلی:', buildSafeMenuEditorKeyboard(resolvedLayout, { row: r, col: c }));
            await ctx.reply(`ویرایش دکمه: ${btnText}`, buildMenuItemEditKeyboard(r, c, rawButton || btn, rawLayout));
            matched = true;
            break;
          }
        }
        if (matched) break;
      }
      if (matched) return;
      return next();
    }

    return next();
  });

  bot.hears('↩️ بازگشت به منوی اصلی', async (ctx) => {
    clearAllPostStates(ctx.from.id);
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
    clearAllPostStates(ctx.from.id);
    cache.setPermanent(`admin_broadcast:${ctx.from.id}`, true);
    await ctx.reply([
      'پیام مورد نظر خود را ارسال کنید.',
      'می‌توانید متن، عکس، ویدیو، فایل، گیف، استیکر یا پیام فورواردی ارسال نمایید.',
    ].join('\n'));
  });

  bot.hears('👤 ادمین‌ها', async (ctx) => {
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    clearAllPostStates(ctx.from.id);
    const admins = await botAdminService.list();
    const text = admins.length
      ? admins.map((item) =>
          `${item.status === 'ACTIVE' ? '✅' : '⏸'} ${item.role} — ${item.telegramId.toString()} ${item.username ? '@' + item.username : ''}`
        ).join('\n')
      : 'ادمینی ثبت نشده است.';
    const ticketRows = admins.map((item) => [
      {
        text: `${(item as any).receiveTickets !== false ? '🔔' : '🔕'} تیکت: ${item.username ? '@' + item.username : item.telegramId.toString()}`,
        callback_data: `admin:toggle_ticket:${item.id}`,
      },
    ]);
    await ctx.reply(
      `👥 مدیریت ادمین\u200cها\n\nبرای افزودن ادمین:\n/admin_add TELEGRAM_ID ROLE\n\n${text}\n\n─────────────\n🔔 = دریافت تیکت فعال | 🔕 = غیرفعال`,
      { reply_markup: { inline_keyboard: ticketRows } }
    );
  });

  bot.action(/^admin:toggle_ticket:(\d+)$/, async (ctx: any) => {
    const admin = await botAdminService.getActive(ctx.from?.id);
    if (!admin) return ctx.answerCbQuery('⛔ دسترسی ندارید');
    const targetId = parseInt(ctx.match[1]);
    const target = await prisma.botAdmin.findUnique({ where: { id: targetId } });
    if (!target) return ctx.answerCbQuery('❌ ادمین یافت نشد');
    const newValue = !(target as any).receiveTickets;
    await prisma.botAdmin.update({
      where: { id: targetId },
      data: { receiveTickets: newValue } as any,
    });
    const name = target.username ? `@${target.username}` : target.telegramId.toString();
    await ctx.answerCbQuery(
      newValue ? `🔔 ${name} — دریافت تیکت فعال شد` : `🔕 ${name} — دریافت تیکت غیرفعال شد`,
      { show_alert: true }
    );
    const admins = await botAdminService.list();
    const ticketRows = admins.map((item) => [
      {
        text: `${(item as any).receiveTickets !== false ? '🔔' : '🔕'} تیکت: ${item.username ? '@' + item.username : item.telegramId.toString()}`,
        callback_data: `admin:toggle_ticket:${item.id}`,
      },
    ]);
    try {
      await ctx.editMessageReplyMarkup({ inline_keyboard: ticketRows });
    } catch (e: any) {
      logger.debug(`[AdminToggle] editMessageReplyMarkup failed: ${e?.description || e?.message}`);
    }
  });

  bot.command('debug_post_render', async (ctx: any) => {
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    const [, rawPostId] = ctx.message.text.split(/\s+/);
    const postId = Number(rawPostId);
    if (!Number.isInteger(postId)) return ctx.reply('فرمت صحیح: /debug_post_render <postId>');
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    const debug = buildPostDebugSnapshot(post);
    logger.info(`[PostRender] debug command requested by ${ctx.from.id} for post ${postId}`);
    logger.info(`[TelegramPayload] debug post=${postId} ${JSON.stringify(debug.telegramPayload)}`);
    logger.info(`[TelegramEntities] debug post=${postId} ${JSON.stringify(debug.entities)}`);
    logger.info(`[TelegramSend] debug post=${postId} ${JSON.stringify(debug.finalTelegramApiRequest)}`);
    const body = JSON.stringify(debug, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2);
    const chunks = body.match(/[\s\S]{1,3500}/g) || ['{}'];
    await ctx.reply(`🧪 debug_post_render ${postId}`);
    for (const chunk of chunks) await ctx.reply(`<pre>${chunk.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`, { parse_mode: 'HTML' });
  });


  bot.command('debug_compare_post', async (ctx: any) => {
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    const [, rawPostId] = ctx.message.text.split(/\s+/);
    const postId = Number(rawPostId);
    if (!Number.isInteger(postId)) return ctx.reply('فرمت صحیح: /debug_compare_post <postId>');
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    const comparison = comparePostNativeRoundtrip(post);
    logger.info(`[PostRender] compare command requested by ${ctx.from.id} for post ${postId}`);
    logger.info(`[TelegramSnapshot] compare post=${postId} ${JSON.stringify(comparison.originalTelegramSnapshot)}`);
    logger.info(`[TelegramSend] compare post=${postId} ${JSON.stringify(comparison.renderedOutput)}`);
    logger.info(`[TelegramEntities] compare post=${postId} ${JSON.stringify(comparison.differences)}`);
    const body = JSON.stringify(comparison, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2);
    const chunks = body.match(/[\s\S]{1,3500}/g) || ['{}'];
    await ctx.reply(`🧪 debug_compare_post ${postId}`);
    for (const chunk of chunks) await ctx.reply(`<pre>${chunk.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`, { parse_mode: 'HTML' });
  });

  bot.command('debug_delivery', async (ctx: any) => {
    const admin = await botAdminService.getActive(ctx.from.id);
    if (!admin) return;
    const [, rawPostId] = ctx.message.text.split(/\s+/);
    const postId = Number(rawPostId);
    if (!Number.isInteger(postId)) return ctx.reply('فرمت صحیح: /debug_delivery <postId>');
    const post = await postService.findById(postId);
    if (!post) return ctx.reply('❌ پست یافت نشد.');
    const debug = deliveryDebugService.getFullPipelineDebug(post);
    logger.info(`[DebugDelivery] post=${postId} full pipeline requested`);
    for (const line of debug.pipeline) logger.info(line);
    const body = JSON.stringify(debug, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2);
    const chunks = body.match(/[\s\S]{1,3500}/g) || ['{}'];
    await ctx.reply(`🧪 debug_delivery ${postId}`);
    for (const chunk of chunks) await ctx.reply(`<pre>${chunk.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`, { parse_mode: 'HTML' });
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
    clearAllPostStates(ctx.from.id);
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
    clearAllPostStates(ctx.from.id);
    await ctx.reply('⚙️ تنظیمات مدیریتی از پنل وب و دستورات ادمین قابل مدیریت است.');
  });

  // ─── Post: User View by ID (via command routing) ────────
  bot.action(/^post:user:view:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    if (!(await settingsService.isFeatureEnabled('posts'))) return;
    const postId = parseInt(ctx.match[1]);
    const post = await postService.getPostMeta(postId);
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
    if (['start', 'admin_add', 'admin_suspend', 'admin_activate', 'admin_delete', 'debug_post_render', 'debug_compare_post', 'debug_delivery'].includes(cmd)) return next();
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
    } catch (e: any) {
      logger.debug(`[PostCmdRoute] command resolution failed for /${cmd}: ${e?.message}`);
    }
    return next();
  });

  // ─── Post Button Click Dispatch ────────────────────────────
  // Handles post:user:click callbacks. Logs analytics, then checks if the
  // original button was COMMAND type — if so, dispatches via resolveCommand.
  bot.action(/^post:user:click:(.+)$/, async (ctx: any) => {
    const t0 = Date.now();
    await ctx.answerCbQuery();
    try {
      const raw = ctx.match[1];
      let postId: number | undefined;
      let row: number | undefined;
      let col: number | undefined;
      let buttonText: string | undefined;
      let buttonType: string | undefined;

      if (raw.startsWith('{')) {
        const data = JSON.parse(raw);
        postId = data.postId;
        buttonText = data.text;
        buttonType = data.type;
      } else {
        const parts = raw.split(':');
        postId = parseInt(parts[0]);
        row = parts.length >= 3 ? parseInt(parts[1]) : undefined;
        col = parts.length >= 3 ? parseInt(parts[2]) : undefined;
      }

      logger.info(`[PostClick] t=${t0} postId=${postId} row=${row} col=${col} text="${buttonText}" type="${buttonType}"`);

      // ── Analytics: log the click ──
      if (postId) {
        await postService.logClick({
          postId,
          telegramId: BigInt(ctx.from.id),
          buttonText: buttonText || 'unknown',
          buttonType: buttonType || 'CALLBACK',
        });
      }

      // ── Resolve button type from post_keyboards ──
      let resolvedType: string | null = null;
      let resolvedValue: string | null = null;

      if (postId && row !== undefined && col !== undefined) {
        // Look up the button in post_keyboards to find its original type
        const keyboard = await prisma.postKeyboard.findFirst({
          where: { postId, row, col },
          select: { type: true, value: true, payload: true },
        });
        if (keyboard) {
          // Check payload.type first (stored during button creation), fallback to db type
          resolvedType = (keyboard.payload as any)?.type || keyboard.type;
          resolvedValue = keyboard.value;
          logger.info(`[PostClick] t=${Date.now()} keyboard lookup: dbType="${keyboard.type}" payloadType="${(keyboard.payload as any)?.type}" resolvedType="${resolvedType}" value="${resolvedValue}"`);
        } else {
          logger.info(`[PostClick] t=${Date.now()} no keyboard entry found for postId=${postId} row=${row} col=${col}`);
        }
      } else if (buttonType) {
        // Fallback: use type from callback_data (old format)
        resolvedType = buttonType;
      }

      // ── COMMAND dispatch: route to command resolver ──
      if (resolvedType === 'COMMAND' && resolvedValue) {
        logger.info(`[PostClick] t=${Date.now()} COMMAND dispatch: value="${resolvedValue}" → resolveCommand...`);
        try {
          const post = await postService.resolveCommand(resolvedValue);
          if (post && post.status === 'PUBLISHED' && post.isPublished) {
            logger.info(`[PostClick] t=${Date.now()} ✅ COMMAND resolved: post #${post.id} "${post.title}"`);
            await postService.incrementViews(post.id, undefined, BigInt(ctx.from.id));
            await sendPostToUser(ctx, post);
            logger.info(`[PostClick] t=${Date.now()} ✅ COMMAND dispatched totalMs=${Date.now()-t0}`);
          } else {
            logger.warn(`[PostClick] t=${Date.now()} ❌ COMMAND not resolved: value="${resolvedValue}"`);
          }
        } catch (cmdErr: any) {
          logger.error(`[PostClick] t=${Date.now()} ❌ COMMAND dispatch error: ${cmdErr.message}`);
        }
        return;
      }

      // ── URL / CALLBACK / other types: analytics only, no dispatch ──
      logger.info(`[PostClick] t=${Date.now()} type="${resolvedType}" — no dispatch needed (analytics only)`);
    } catch (e: any) {
      logger.debug(`[PostClick] logClick failed: ${e?.message}`);
    }
  });

  // ─── Post INTERNAL_NAV routing ──────────────────────────
  bot.action(/^post:nav:(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    if (!(await settingsService.isFeatureEnabled('posts'))) return;
    const postId = parseInt(ctx.match[1]);
    const post = await postService.getPostMeta(postId);
    if (!post || post.status !== 'PUBLISHED' || !post.isPublished) {
      return ctx.reply('❌ Post not found.');
    }
    await sendPostToUser(ctx, post);
  });

  // ─── Post INTERNAL_NAV routing (from renderer) ───────────
  bot.action(/^post:user:nav:(\d+):(\d+):(\d+)$/, async (ctx: any) => {
    await ctx.answerCbQuery();
    if (!(await settingsService.isFeatureEnabled('posts'))) return;
    const postId = parseInt(ctx.match[1]);
    const post = await postService.getPostMeta(postId);
    if (!post || post.status !== 'PUBLISHED' || !post.isPublished) {
      return ctx.reply('❌ Post not found.');
    }
    await sendPostToUser(ctx, post);
  });

  // ─── Post Command Button routing ─────────────────────────
  bot.action(/^post:user:cmd:(.+)$/, async (ctx: any) => {
    const t0 = Date.now();
    logger.info(`[CMD_BTN] t=${t0} ▶ CALLBACK RECEIVED callback_data="${ctx.callbackData}" from user=${ctx.from?.id}`);
    await ctx.answerCbQuery();
    logger.info(`[CMD_BTN] t=${Date.now()} answerCbQuery done`);
    if (!(await settingsService.isFeatureEnabled('posts'))) {
      logger.warn(`[CMD_BTN] t=${Date.now()} BLOCKED: posts feature disabled`);
      return;
    }
    const raw = ctx.match[1].trim().replace(/\s+/g, ' ');
    const normalized = raw.startsWith('/') ? raw : `/${raw}`;
    const cmdName = normalized.slice(1).toLowerCase();
    logger.info(`[CMD_BTN] t=${Date.now()} parsed: raw="${raw}" normalized="${normalized}" cmdName="${cmdName}"`);

    try {
      logger.info(`[CMD_BTN] t=${Date.now()} BEFORE resolveCommand("${cmdName}")`);
      const post = await postService.resolveCommand(cmdName);
      logger.info(`[CMD_BTN] t=${Date.now()} AFTER resolveCommand: ${post ? `HIT post#${post.id} "${post.title}" status=${post.status} isPublished=${post.isPublished}` : 'NULL'}`);

      if (post && post.status === 'PUBLISHED' && post.isPublished) {
        logger.info(`[CMD_BTN] t=${Date.now()} SENDING post#${post.id}...`);
        await postService.incrementViews(post.id, undefined, BigInt(ctx.from.id));
        await sendPostToUser(ctx, post);
        logger.info(`[CMD_BTN] t=${Date.now()} ✅ SENT post#${post.id} totalMs=${Date.now()-t0}`);
      } else if (post) {
        logger.warn(`[CMD_BTN] t=${Date.now()} ❌ POST NOT PUBLISHED: postId=${post.id} status=${post.status} isPublished=${post.isPublished}`);
      } else {
        logger.warn(`[CMD_BTN] t=${Date.now()} ❌ COMMAND NOT FOUND: cmdName="${cmdName}" totalMs=${Date.now()-t0}`);
      }
    } catch (err: any) {
      logger.error(`[CMD_BTN] t=${Date.now()} ❌ ERROR: ${err.message}`, err);
    }
  });

  // ─── Popup button lookup: single source of truth ─────────
  function findPopupButton(post: any, row: number, col: number, messages: any[]): any {
    const raw = (post as any).buttons;
    if (raw && typeof raw === 'object' && raw.messages) {
      const msgKeys = Object.keys(raw.messages).sort((a, b) => Number(a) - Number(b));
      for (const key of msgKeys) {
        const msgBtns = raw.messages[key];
        if (Array.isArray(msgBtns)) {
          const btn = msgBtns[row]?.[col];
          if (btn) {
            logger.debug(`[PostPopup] findPopup key=${key} row=${row} col=${col} type=${btn.type} value=${(btn.value||'').substring(0,30)}`);
            if (btn.type === 'POPUP') return btn;
          }
        }
      }
    }
    if (Array.isArray(raw)) {
      const btn = raw[row]?.[col];
      if (btn) {
        logger.debug(`[PostPopup] findPopup array row=${row} col=${col} type=${btn.type}`);
        if (btn.type === 'POPUP') return btn;
      }
    }
    for (const msg of messages) {
      const rm = msg.replyMarkup;
      if (Array.isArray(rm) && rm[row]?.[col]?.type === 'POPUP') {
        return rm[row][col];
      }
    }
    return null;
  }

  // ─── Find ANY button at position (fail-safe fallback) ────
  function findAnyButtonAtPosition(post: any, row: number, col: number, messages: any[]): any {
    const raw = (post as any).buttons;
    if (raw && typeof raw === 'object' && raw.messages) {
      const msgKeys = Object.keys(raw.messages).sort((a, b) => Number(a) - Number(b));
      for (const key of msgKeys) {
        const msgBtns = raw.messages[key];
        if (Array.isArray(msgBtns) && msgBtns[row]?.[col]) return msgBtns[row][col];
      }
    }
    if (Array.isArray(raw) && raw[row]?.[col]) return raw[row][col];
    for (const msg of messages) {
      const rm = msg.replyMarkup;
      if (Array.isArray(rm) && rm[row]?.[col]) return rm[row][col];
    }
    return null;
  }

  // ─── Post POPUP Button routing ─────────────────────────
  // ─── Post POPUP Button routing ─────────────────────────
  bot.action(/^post:user:popup:(\d+):(\d+):(\d+)$/, async (ctx: any) => {
    const postId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    const col = parseInt(ctx.match[3]);
    logger.info(`[POPUP_TRACE] Handler=PostPopup Regex=/^post:user:popup:(\\d+):(\\d+):(\\d+)$/ CallbackData=${ctx.callbackQuery?.data} Matched=true`);
    if (!(await settingsService.isFeatureEnabled('posts'))) {
      return ctx.answerCbQuery('⛔ سرویس پست غیرفعال است.', { show_alert: true });
    }
    try {
      const post = await postService.findById(postId);
      if (!post) {
        return ctx.answerCbQuery('❌ پست یافت نشد.', { show_alert: true });
      }
      const rawButtons = (post as any).buttons;
      const messages = (post as any).messages || [];
      const btn = findPopupButton(post, row, col, messages);
      if (!btn || btn.type !== 'POPUP') {
        const anyBtn = findAnyButtonAtPosition(post, row, col, messages);
        if (anyBtn) {
          return ctx.answerCbQuery(anyBtn.value || anyBtn.text || '✅', { show_alert: true });
        }
        return ctx.answerCbQuery('❌ دکمه یافت نشد.', { show_alert: true });
      }
      await ctx.answerCbQuery(btn.value || '✅', { show_alert: true });
    } catch (err) {
      logger.error(`[PostPopup] FAILED postId=${postId}:`, err);
      await ctx.answerCbQuery('❌ خطا', { show_alert: true });
    }
  });

  // ─── Scheduled Message POPUP Button routing ──────────────
  bot.action(/^sched:user:popup:(\d+):(\d+):(\d+)$/, async (ctx: any) => {
    const schedMsgId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    const col = parseInt(ctx.match[3]);
    logger.info(`[POPUP_TRACE] Handler=SchedPopup Regex=/^sched:user:popup:(\\d+):(\\d+):(\\d+)$/ CallbackData=${ctx.callbackQuery?.data} Matched=true`);
    try {
      const buttons = await prisma.scheduledMessageButton.findMany({
        where: { scheduledMessageId: schedMsgId },
        orderBy: [{ row: 'asc' }, { col: 'asc' }],
      });
      const grid: any[][] = [];
      for (const btn of buttons) {
        const r = btn.row ?? 0;
        const c = btn.col ?? 0;
        if (!grid[r]) grid[r] = [];
        grid[r][c] = btn;
      }
      const btn = grid[row]?.[col];
      if (btn && (btn.type || '').toUpperCase() === 'POPUP') {
        await ctx.answerCbQuery(btn.value || '✅', { show_alert: true });
      } else if (btn) {
        await ctx.answerCbQuery(btn.value || btn.text || '✅', { show_alert: true });
      } else {
        await ctx.answerCbQuery('❌ دکمه یافت نشد.', { show_alert: true });
      }
    } catch (err) {
      logger.error(`[SchedPopup] FAILED schedMsgId=${schedMsgId}:`, err);
      await ctx.answerCbQuery('❌ خطا', { show_alert: true });
    }
  });

  // ─── Auto Reply POPUP Button routing ────────────────────────
  bot.action(/^ar:user:popup:(\d+):(\d+):(\d+)$/, async (ctx: any) => {
    const autoReplyId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    const col = parseInt(ctx.match[3]);
    logger.info(`[POPUP_TRACE] Handler=ArPopup Regex=/^ar:user:popup:(\\d+):(\\d+):(\\d+)$/ CallbackData=${ctx.callbackQuery?.data} Matched=true`);
    try {
      const buttons = await prisma.autoReplyButton.findMany({
        where: { autoReplyId },
        orderBy: [{ row: 'asc' }, { col: 'asc' }],
      });
      const grid: any[][] = [];
      for (const btn of buttons) {
        const r = btn.row ?? 0;
        const c = btn.col ?? 0;
        if (!grid[r]) grid[r] = [];
        grid[r][c] = btn;
      }
      const btn = grid[row]?.[col];
      if (btn && (btn.type || '').toUpperCase() === 'POPUP') {
        await ctx.answerCbQuery(btn.value || '✅', { show_alert: true });
      } else if (btn) {
        await ctx.answerCbQuery(btn.value || btn.text || '✅', { show_alert: true });
      } else {
        await ctx.answerCbQuery('❌ دکمه یافت نشد.', { show_alert: true });
      }
    } catch (err) {
      logger.error(`[ArPopup] FAILED autoReplyId=${autoReplyId}:`, err);
      await ctx.answerCbQuery('❌ خطا', { show_alert: true });
    }
  });

  // ─── Scheduled Message Command Button routing ─────────────
  bot.action(/^sched:user:cmd:(.+)$/, async (ctx: any) => {
    const t0 = Date.now();
    logger.info(`[SchedCMD_BTN] t=${t0} ▶ CALLBACK RECEIVED callback_data="${ctx.callbackData}" from user=${ctx.from?.id}`);
    await ctx.answerCbQuery();
    const raw = ctx.match[1].trim().replace(/\s+/g, ' ');
    const normalized = raw.startsWith('/') ? raw : `/${raw}`;
    const cmdName = normalized.slice(1).toLowerCase();
    logger.info(`[SchedCMD_BTN] t=${Date.now()} parsed: raw="${raw}" normalized="${normalized}" cmdName="${cmdName}"`);
    try {
      const post = await postService.resolveCommand(cmdName);
      if (post && post.status === 'PUBLISHED' && post.isPublished) {
        logger.info(`[SchedCMD_BTN] t=${Date.now()} SENDING post#${post.id}...`);
        await postService.incrementViews(post.id, undefined, BigInt(ctx.from.id));
        await sendPostToUser(ctx, post);
        logger.info(`[SchedCMD_BTN] t=${Date.now()} ✅ SENT post#${post.id} totalMs=${Date.now()-t0}`);
      } else if (post) {
        logger.warn(`[SchedCMD_BTN] t=${Date.now()} POST NOT PUBLISHED: postId=${post.id} status=${post.status}`);
      } else {
        logger.warn(`[SchedCMD_BTN] t=${Date.now()} COMMAND NOT FOUND: cmdName="${cmdName}"`);
      }
    } catch (err: any) {
      logger.error(`[SchedCMD_BTN] t=${Date.now()} ERROR: ${err.message}`, err);
    }
  });

  // ─── Scheduled Message Click Button routing ───────────────
  bot.action(/^sched:user:click:(\d+):(\d+):(\d+)$/, async (ctx: any) => {
    const schedMsgId = parseInt(ctx.match[1]);
    const row = parseInt(ctx.match[2]);
    const col = parseInt(ctx.match[3]);
    logger.info(`[SchedClick] HIT schedMsgId=${schedMsgId} row=${row} col=${col}`);
    try {
      const buttons = await prisma.scheduledMessageButton.findMany({
        where: { scheduledMessageId: schedMsgId },
        orderBy: [{ row: 'asc' }, { col: 'asc' }],
      });
      const grid: any[][] = [];
      for (const btn of buttons) {
        const r = btn.row ?? 0;
        const c = btn.col ?? 0;
        if (!grid[r]) grid[r] = [];
        grid[r][c] = btn;
      }
      const btn = grid[row]?.[col];
      if (btn) {
        // If it's a COMMAND type, resolve the command
        if ((btn.type || '').toUpperCase() === 'COMMAND') {
          const cmdName = (btn.value || '').replace(/^\//, '').toLowerCase();
          const post = await postService.resolveCommand(cmdName);
          if (post && post.status === 'PUBLISHED' && post.isPublished) {
            await postService.incrementViews(post.id, undefined, BigInt(ctx.from.id));
            await sendPostToUser(ctx, post);
          }
          return;
        }
        // If it has a URL, open it
        if (btn.value && btn.value.startsWith('http')) {
          await ctx.answerCbQuery();
          return;
        }
        await ctx.answerCbQuery(btn.value || '✅');
      } else {
        await ctx.answerCbQuery();
      }
    } catch (err) {
      logger.error(`[SchedClick] FAILED schedMsgId=${schedMsgId}:`, err);
      await ctx.answerCbQuery();
    }
  });

  // ─── Scheduled Message Copy Button routing ────────────────
  bot.action(/^sched:user:copy:(.+)$/, async (ctx: any) => {
    const text = ctx.match[1];
    logger.info(`[SchedCopy] HIT text="${text.substring(0, 50)}"`);
    await ctx.answerCbQuery('✅ کپی شد', { show_alert: true });
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

  bot.on('text', async (ctx: any, next) => {
    if (ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup') {
      const group = (ctx.state as any).telegramGroup;
      if (group) {
        const handled = await keywordReplyService.handleGroupText(ctx, group.id);
        if (handled) return;
        const arHandled = await autoReplyService.handleGroupMessage(ctx, group.id);
        if (arHandled) return;
      }
      return next();
    }

    const isSearchMode = cache.get<boolean>(`search_mode:${ctx.from.id}`);

    if (!isSearchMode) {
      return next();
    }

    cache.del(`search_mode:${ctx.from.id}`);

    await ctx.reply('🔍 قابلیت جستجو در حال حاضر غیرفعال است.');
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

  const pointsHandler = async (ctx: any) => {
    if (!(await settingsService.isFeatureEnabled('leaderboard'))) return ctx.reply('⛔ این سرویس در حال حاضر غیرفعال است.');
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
  };
  bot.hears('🏆 امتیازهای من', pointsHandler);
  bot.hears('⭐️ امتیاز من', pointsHandler);

  bot.hears('🏆 لیدربورد', async (ctx) => {
    if (!(await settingsService.isFeatureEnabled('leaderboard'))) return ctx.reply('⛔ این سرویس در حال حاضر غیرفعال است.');
    try {
      const season = await leaderboardService.getActiveSeason();
      if (!season) {
        return ctx.reply('🏆 در حال حاضر هیچ فصل فعالی برای لیدربورد وجود ندارد.\nبه محض شروع فصل جدید، دعوت‌های شما در لیدربورد ثبت خواهند شد.');
      }

      const [leaderboard, stats, userRank] = await Promise.all([
        leaderboardService.getLeaderboard(season.id, 15),
        leaderboardService.getLeaderboardStats(season.id),
        (async () => {
          const profile = await userService.getProfile(BigInt(ctx.from.id));
          return profile ? leaderboardService.getUserRank(season.id, profile.id) : null;
        })(),
      ]);

      if (leaderboard.length === 0) {
        return ctx.reply(
          `🏆 *لیدربورد فصل ${season.name}*\n\n` +
          'هنوز دعوتی در این فصل ثبت نشده. اولین نفر باش!',
          { parse_mode: 'Markdown' }
        );
      }

      const medal = (rank: number) => rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;

      const lines = leaderboard.map((entry) =>
        `${medal(entry.rank)} ${entry.firstName || entry.username || `کاربر ${entry.userId}`}\n` +
        `📊 ${entry.inviteCount} دعوت`
      );

      const header = `🏆 *لیدربورد فصل ${season.name}*\n\n`;
      const footer = `\n📊 کل دعوت‌ها: ${stats.totalReferrals} | شرکت‌کنندگان: ${stats.totalInviters}`;

      let rankLine = '';
      if (userRank && userRank.rank > 15) {
        rankLine = `\n\n👤 رتبه شما: #${userRank.rank}\n🎯 تعداد دعوت: ${userRank.score}`;
      } else if (userRank) {
        rankLine = `\n\n🎯 تعداد دعوت شما: ${userRank.score}`;
      }

      await ctx.reply(header + lines.join('\n\n') + footer + rankLine, { parse_mode: 'Markdown' });
    } catch (error) {
      logger.error('Leaderboard Handler Error:', error);
      await ctx.reply('❌ خطا در دریافت لیدربورد');
    }
  });

 bot.hears('👥 دعوت دوستان', async (ctx) => {
    if (!(await settingsService.isFeatureEnabled('referrals'))) return ctx.reply('⛔ این سرویس در حال حاضر غیرفعال است.');
  try {
    const botInfo = await bot.telegram.getMe();
    const botUsername = botInfo.username || DEFAULT_BOT_USERNAME;

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
        botUsername
      );

    const link =
      referralStats?.referralLink ||
      (await userService.getReferralLink(
        profile.id,
        botUsername
      ));

    const referralSettings =
      await referralService.getSettings();

    const rewardPoints =
      referralSettings?.inviteRewardPoints ?? 0;

    // Season-aware stats: only show current season invites
    const season = await leaderboardService.getActiveSeason();
    let seasonInvites = 0;
    let seasonPoints = 0;
    if (season) {
      const userRank = await leaderboardService.getUserRank(season.id, profile.id);
      if (userRank) {
        seasonInvites = userRank.score;
        // Calculate season points from referral logs
        const seasonLogs = await prisma.referralLog.findMany({
          where: { inviterId: profile.id, seasonId: season.id },
          select: { referredId: true },
        });
        const referredIds = seasonLogs.map(l => l.referredId);
        if (referredIds.length > 0) {
          const rewards = await prisma.referral.aggregate({
            where: { referredUserId: { in: referredIds } },
            _sum: { rewardPoints: true },
          });
          seasonPoints = rewards._sum.rewardPoints || 0;
        }
      }
    }

    const shareText = await referralService.getShareText();
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(shareText)}`;

    await ctx.reply(
      [
        '🎁 لینک دعوت اختصاصی شما:',
        '',
        link,
        '',
        `🏆 پاداش هر دعوت موفق: ${rewardPoints} امتیاز`,
        season ? `👥 دعوت‌شدگان این فصل: ${seasonInvites} نفر` : `👥 دعوت‌شدگان تاکنون: ${referralStats?.inviteCount ?? 0} نفر`,
        season ? `⭐ مجموع امتیاز دعوت‌ها: ${seasonPoints}` : `⭐ مجموع امتیاز دعوت‌ها: ${referralStats?.totalRewardPoints ?? 0}`,
      ].join('\n'),
      {
        link_preview_options: { is_disabled: true },
        ...Markup.inlineKeyboard([
          [Markup.button.url('📤 دعوت در تلگرام', shareUrl)],
          [Markup.button.callback('🏆 لیدربورد', 'referral:show_leaderboard')],
        ]),
      }
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

  bot.action('referral:copy', async (ctx: any) => {
    await ctx.answerCbQuery();
    try {
      const botInfo = await bot.telegram.getMe();
      const botUsername = botInfo.username || DEFAULT_BOT_USERNAME;
      const shareText = await referralService.getShareText();
      const cleanLink = await referralService.getCleanReferralLink(botUsername);
      const fullText = `${shareText}\n\n${cleanLink}`;

      await ctx.reply(fullText, { link_preview_options: { is_disabled: true } });
      await ctx.reply('✅ متن آماده شد. برای کافی، متن بالا را لمس و نگه دارید سپس گزینه Copy را انتخاب کنید.');
    } catch (error) {
      logger.error('Referral Copy Handler Error:', error);
      await ctx.reply('❌ خطا در آماده‌سازی متن اشتراک‌گذاری');
    }
  });

  bot.action('referral:show_leaderboard', async (ctx: any) => {
    await ctx.answerCbQuery();
    try {
      const season = await leaderboardService.getActiveSeason();
      if (!season) {
        return ctx.reply('🏆 در حال حاضر هیچ فصل فعالی برای لیدربورد وجود ندارد.');
      }

      const [leaderboard, stats] = await Promise.all([
        leaderboardService.getLeaderboard(season.id, 15),
        leaderboardService.getLeaderboardStats(season.id),
      ]);

      if (leaderboard.length === 0) {
        return ctx.reply(
          `🏆 *لیدربورد فصل ${season.name}*\n\n` +
          'هنوز دعوتی در این فصل ثبت نشده. اولین نفر باش!',
          { parse_mode: 'Markdown' }
        );
      }

      const medal = (rank: number) => rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;

      const lines = leaderboard.map((entry) =>
        `${medal(entry.rank)} ${entry.firstName || entry.username || `کاربر ${entry.userId}`}\n` +
        `📊 ${entry.inviteCount} دعوت`
      );

      const header = `🏆 *لیدربورد فصل ${season.name}*\n\n`;
      const footer = `\n📊 کل دعوت‌ها: ${stats.totalReferrals} | شرکت‌کنندگان: ${stats.totalInviters}`;

      await ctx.reply(header + lines.join('\n\n') + footer, { parse_mode: 'Markdown' });
    } catch (error) {
      logger.error('Referral Leaderboard Action Error:', error);
      await ctx.reply('❌ خطا در دریافت لیدربورد');
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

        userService.processPendingReferral(BigInt(telegramId)).catch(() => {});
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
    if (!(await settingsService.isFeatureEnabled('leaderboard'))) return ctx.reply('⛔ این سرویس در حال حاضر غیرفعال است.');
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

  // ─── Register Ticket Handlers ──────────────────────────
  const { registerTicketUserHandlers } = require('./ticket-user.handler');
  const { registerTicketAdminHandlers } = require('./ticket-admin.handler');
  registerTicketUserHandlers(bot);
  registerTicketAdminHandlers(bot);

  // ─── Register Post Management Handlers ─────────────────
  const { registerPostHandlers } = require('./post-handlers');
  registerPostHandlers(bot);

  // ─── Anonymous Message Fallback (LAST handler) ──────────
  // When a regular user sends any unrecognized message/command in private chat,
  // and no other handler/state/wizard matched, send the system anonymous post.
  bot.on('message', async (ctx: any, next) => {
    if (!ctx.from) return next();
    if (ctx.chat?.type !== 'private') return next();

    const admin = await botAdminService.getActive(ctx.from.id).catch(() => null);
    if (admin) return next();

    const userId = ctx.from.id;
    const hasPostState = cache.get<number>(`post:pending:${userId}:selected_post`) ||
      cache.get<string>(`post:pending:${userId}:editing_field`) ||
      cache.get<number>(`post:editor:${userId}:active`) ||
      cache.get<string>(`post:editor:${userId}:mode`) ||
      cache.get<boolean>(`post_mgmt_mode:${userId}`) ||
      cache.get<boolean>(`admin_broadcast:${userId}`) ||
      cache.get<boolean>(`menu:edit_mode:${userId}`) ||
      cache.get<boolean>(`search_mode:${userId}`);
    if (hasPostState) return next();

    const anonPost = await postService.getOrCreateAnonymousPost().catch(() => null);
    if (!anonPost) return next();

    await sendPostToUser(ctx, { id: anonPost.id }).catch(() => {});
  });

  logger.info('✅ تمام هندلرهای ربات ثبت شدند');
}
