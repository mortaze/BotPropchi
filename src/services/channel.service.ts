import { Prisma, RequiredChannel, RequiredChannelStatus, RequiredChannelType, SystemEventType, SystemLogLevel } from '@prisma/client';
import { Telegraf } from 'telegraf';
import { channelRepository } from '../repositories/channel.repository';
import { prisma } from '../prisma/client';
import { cache } from '../utils/cache';
import { logger } from '../utils/logger';
import { systemLogService } from './system-log.service';

const VALID_MEMBER_STATUSES = ['member', 'administrator', 'creator'];
const LEFT_STATUSES = ['left', 'kicked'];
const MEMBERSHIP_CACHE_TTL_SECONDS = 180;

function normalizeUsername(username?: string | null) {
  return username?.trim().replace(/^@/, '') || null;
}

function normalizeChatId(input?: string | number | bigint | null) {
  const value = String(input ?? '').trim();
  if (!value) return '';
  if (value.startsWith('@')) return value;
  return value;
}

function preferredInviteLink(channel: RequiredChannel) {
  return channel.inviteLink || (channel.username ? `https://t.me/${channel.username}` : null);
}

function getDisplayTitle(channel: RequiredChannel) {
  return channel.displayTitle || channel.title;
}

function getMembershipCacheKey(telegramId: bigint | number | string) {
  return `membership:v2:${telegramId}`;
}

function telegramErrorDetails(error: any) {
  const description = error?.response?.description || error?.description || error?.message || String(error);
  const errorCode = error?.response?.error_code || error?.code;
  const isChatNotFound = /chat not found/i.test(description);
  const isForbidden = /forbidden|not enough rights|administrator|bot was kicked/i.test(description);
  return { description, errorCode, isChatNotFound, isForbidden };
}

export const channelService = {
  list() {
    return channelRepository.findAll();
  },

  create(data: { title: string; chatId: string; username?: string | null; type: RequiredChannelType; inviteLink?: string | null; isActive?: boolean; displayTitle?: string | null; buttonText?: string | null }) {
    const normalizedChatId = normalizeChatId(data.chatId);
    const username = normalizeUsername(data.username) || (normalizedChatId.startsWith('@') ? normalizedChatId.slice(1) : null);
    return channelRepository.create({
      title: data.title,
      displayTitle: data.displayTitle?.trim() || data.title,
      chatId: normalizedChatId,
      channelId: normalizedChatId,
      username,
      type: data.type,
      inviteLink: data.inviteLink || (username ? `https://t.me/${username}` : null),
      buttonText: data.buttonText?.trim() || null,
      status: RequiredChannelStatus.APPROVED,
      approvedAt: new Date(),
      isActive: data.isActive ?? true,
    });
  },

  update(id: number, data: Partial<{ title: string; displayTitle: string | null; chatId: string; username?: string | null; type: RequiredChannelType; inviteLink?: string | null; buttonText?: string | null; isActive: boolean; status: RequiredChannelStatus }>) {
    const chatId = data.chatId !== undefined ? normalizeChatId(data.chatId) : undefined;
    const username = data.username !== undefined ? normalizeUsername(data.username) : undefined;
    const updateData: Prisma.RequiredChannelUpdateInput = {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.displayTitle !== undefined ? { displayTitle: data.displayTitle?.trim() || null } : {}),
      ...(chatId !== undefined ? { chatId, channelId: chatId } : {}),
      ...(username !== undefined ? { username } : {}),
      ...(data.type !== undefined ? { type: data.type } : {}),
      ...(data.inviteLink !== undefined ? { inviteLink: data.inviteLink || null } : {}),
      ...(data.buttonText !== undefined ? { buttonText: data.buttonText?.trim() || null } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      ...(data.status !== undefined ? this.statusData(data.status) : {}),
    };
    cache.delByPrefix('membership:');
    return channelRepository.update(id, updateData);
  },

  delete(id: number) {
    cache.delByPrefix('membership:');
    return channelRepository.delete(id);
  },

  statusData(status: RequiredChannelStatus) {
    const now = new Date();
    return {
      status,
      isActive: status === RequiredChannelStatus.APPROVED,
      ...(status === RequiredChannelStatus.APPROVED ? { approvedAt: now, rejectedAt: null, disabledAt: null } : {}),
      ...(status === RequiredChannelStatus.REJECTED ? { rejectedAt: now, isActive: false } : {}),
      ...(status === RequiredChannelStatus.DISABLED ? { disabledAt: now, isActive: false } : {}),
      ...(status === RequiredChannelStatus.PENDING ? { isActive: false } : {}),
    };
  },

  async registerPendingFromChat(chat: { id: number | bigint; title?: string; username?: string; type?: string; inviteLink?: string | null }) {
    const channelId = String(chat.id);
    const type = chat.type === 'group' || chat.type === 'supergroup' ? RequiredChannelType.GROUP : RequiredChannelType.CHANNEL;
    const username = normalizeUsername(chat.username);
    const item = await channelRepository.upsertByChannelId(channelId, {
      channelId,
      chatId: channelId,
      title: chat.title || channelId,
      displayTitle: chat.title || channelId,
      username,
      type,
      inviteLink: chat.inviteLink || (username ? `https://t.me/${username}` : null),
      status: RequiredChannelStatus.PENDING,
      isActive: false,
    });
    await systemLogService.log({ eventType: SystemEventType.FORCE_JOIN, message: 'Required channel discovered by bot', metadata: { channelId, title: chat.title, username, type } });
    return item;
  },

  async refreshBotStatus(bot: Telegraf, id: number) {
    const channel = await channelRepository.findById(id);
    if (!channel) throw new Error('کانال یافت نشد');
    const chatIdentifier = this.resolveChatIdentifier(channel);
    if (!chatIdentifier) throw new Error('chat_id معتبر برای کانال ثبت نشده است');
    try {
      const me = await bot.telegram.getMe();
      const [chat, member] = await Promise.all([
        bot.telegram.getChat(chatIdentifier as any),
        bot.telegram.getChatMember(chatIdentifier as any, me.id),
      ]);
      const botStatus = member.status;
      const isAdmin = botStatus === 'administrator' || botStatus === 'creator';
      const next = await channelRepository.update(id, {
        chatId: String((chat as any).id),
        channelId: String((chat as any).id),
        title: (chat as any).title || channel.title,
        username: normalizeUsername((chat as any).username),
        inviteLink: channel.inviteLink || ((chat as any).username ? `https://t.me/${(chat as any).username}` : undefined),
        botStatus,
        botStatusCheckedAt: new Date(),
        lastError: isAdmin ? null : 'ربات در کانال ادمین نیست یا دسترسی کافی ندارد.',
      });
      await systemLogService.log({ eventType: SystemEventType.FORCE_JOIN, message: 'Required channel bot status refreshed', metadata: { id, chatId: next.chatId, botStatus, isAdmin } });
      return next;
    } catch (error) {
      const details = telegramErrorDetails(error);
      await channelRepository.update(id, { botStatus: 'ERROR', botStatusCheckedAt: new Date(), lastError: details.description });
      await systemLogService.log({ eventType: SystemEventType.ERROR, level: SystemLogLevel.ERROR, message: 'Required channel bot status refresh failed', metadata: { id, chatIdentifier, ...details } as any });
      throw error;
    }
  },

  resolveChatIdentifier(channel: RequiredChannel) {
    const raw = normalizeChatId(channel.chatId || channel.channelId);
    if (!raw) return channel.username ? `@${channel.username}` : '';
    if (raw.startsWith('@')) return channel.username ? `@${channel.username}` : raw;
    return raw;
  },

  async checkMembership(bot: Telegraf, telegramId: bigint, options: { force?: boolean } = {}) {
    const cacheKey = getMembershipCacheKey(telegramId);
    if (!options.force) {
      const cached = cache.get<{ isMember: boolean; notJoined: Array<{ title: string; inviteLink: string | null; channelId: string; buttonText?: string | null }> }>(cacheKey);
      if (cached) return cached;
    }

    const channels = await channelRepository.findActive();
    if (channels.length === 0) return { isMember: true, notJoined: [] };

    const notJoined: Array<{ title: string; inviteLink: string | null; channelId: string; buttonText?: string | null }> = [];
    const checkedAt = new Date();

    for (const channel of channels) {
      const chatIdentifier = this.resolveChatIdentifier(channel);
      if (!chatIdentifier || chatIdentifier.startsWith('@')) {
        const reason = !chatIdentifier ? 'missing_chat_id' : 'username_fallback_not_allowed_for_membership';
        notJoined.push({ title: getDisplayTitle(channel), inviteLink: preferredInviteLink(channel), channelId: chatIdentifier || channel.channelId, buttonText: channel.buttonText });
        await this.persistMembership(telegramId, channel.id, 'ERROR', checkedAt, reason);
        await channelRepository.update(channel.id, { lastError: 'برای بررسی عضویت باید chat_id عددی واقعی کانال ذخیره شود.', botStatusCheckedAt: checkedAt }).catch(logger.error);
        continue;
      }

      try {
        const member = await bot.telegram.getChatMember(chatIdentifier as any, Number(telegramId));
        const status = member.status.toUpperCase();
        await this.persistMembership(telegramId, channel.id, status, checkedAt, null);
        if (!VALID_MEMBER_STATUSES.includes(member.status)) {
          notJoined.push({ title: getDisplayTitle(channel), inviteLink: preferredInviteLink(channel), channelId: chatIdentifier, buttonText: channel.buttonText });
          if (LEFT_STATUSES.includes(member.status)) {
            await systemLogService.log({ eventType: SystemEventType.FORCE_JOIN, level: SystemLogLevel.WARN, telegramId, message: 'User left required channel', metadata: { channelId: channel.id, chatId: chatIdentifier, status: member.status } });
          }
        }
      } catch (err) {
        const details = telegramErrorDetails(err);
        logger.warn(`خطا در بررسی عضویت chatId=${chatIdentifier} user=${telegramId.toString()}: ${details.description}`);
        await this.persistMembership(telegramId, channel.id, 'ERROR', checkedAt, details.description);
        await channelRepository.update(channel.id, { lastError: details.description, botStatus: details.isChatNotFound ? 'CHAT_NOT_FOUND' : details.isForbidden ? 'BOT_ACCESS_DENIED' : 'ERROR', botStatusCheckedAt: checkedAt }).catch(logger.error);
        await systemLogService.log({ eventType: SystemEventType.ERROR, level: SystemLogLevel.ERROR, telegramId, message: 'Telegram getChatMember failed for required channel', metadata: { channelId: channel.id, chatId: chatIdentifier, ...details } as any });
        notJoined.push({ title: getDisplayTitle(channel), inviteLink: preferredInviteLink(channel), channelId: chatIdentifier, buttonText: channel.buttonText });
      }
    }

    const result = { isMember: notJoined.length === 0, notJoined };
    cache.set(cacheKey, result, MEMBERSHIP_CACHE_TTL_SECONDS);
    return result;
  },

  async persistMembership(telegramId: bigint, requiredChannelId: number, status: string, checkedAt: Date, error: string | null) {
    const user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user) return;
    await prisma.userRequiredChannelMembership.upsert({
      where: { userId_requiredChannelId: { userId: user.id, requiredChannelId } },
      update: { status, lastCheckedAt: checkedAt, verifiedAt: VALID_MEMBER_STATUSES.includes(status.toLowerCase()) ? checkedAt : undefined, error },
      create: { userId: user.id, requiredChannelId, status, lastCheckedAt: checkedAt, verifiedAt: VALID_MEMBER_STATUSES.includes(status.toLowerCase()) ? checkedAt : null, error },
    });
  },
};
