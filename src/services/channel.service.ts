import { RequiredChannelStatus, RequiredChannelType } from '@prisma/client';
import { Telegraf } from 'telegraf';
import { channelRepository } from '../repositories/channel.repository';
import { logger } from '../utils/logger';

export const channelService = {
  list() {
    return channelRepository.findAll();
  },

  create(data: { title: string; chatId: string; username?: string | null; type: RequiredChannelType; inviteLink?: string | null; isActive?: boolean }) {
    const normalizedChatId = data.chatId.trim();
    return channelRepository.create({
      title: data.title,
      chatId: normalizedChatId,
      channelId: normalizedChatId,
      username: data.username?.replace('@', '') || (normalizedChatId.startsWith('@') ? normalizedChatId.replace('@', '') : null),
      type: data.type,
      inviteLink: data.inviteLink,
      status: RequiredChannelStatus.APPROVED,
      approvedAt: new Date(),
      isActive: data.isActive ?? true,
    });
  },

  update(id: number, data: Partial<{ title: string; chatId: string; username?: string | null; type: RequiredChannelType; inviteLink?: string | null; isActive: boolean; status: RequiredChannelStatus }>) {
    const chatId = data.chatId?.trim();
    return channelRepository.update(id, {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(chatId !== undefined ? { chatId, channelId: chatId } : {}),
      ...(data.username !== undefined ? { username: data.username?.replace('@', '') || null } : {}),
      ...(data.type !== undefined ? { type: data.type } : {}),
      ...(data.inviteLink !== undefined ? { inviteLink: data.inviteLink } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      ...(data.status !== undefined ? this.statusData(data.status) : {}),
    });
  },

  delete(id: number) {
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
    return channelRepository.upsertByChannelId(channelId, {
      channelId,
      chatId: channelId,
      title: chat.title || channelId,
      username: chat.username?.replace('@', '') || null,
      type,
      inviteLink: chat.inviteLink || (chat.username ? `https://t.me/${chat.username.replace('@', '')}` : null),
      status: RequiredChannelStatus.PENDING,
      isActive: false,
    });
  },

  async checkMembership(bot: Telegraf, telegramId: bigint) {
    const channels = await channelRepository.findActive();
    if (channels.length === 0) return { isMember: true, notJoined: [] };

    const validStatuses = ['member', 'administrator', 'creator'];
    const notJoined: Array<{ title: string; inviteLink: string | null; channelId: string }> = [];

    for (const channel of channels) {
      const chatIdentifier = channel.chatId || channel.channelId || (channel.username ? `@${channel.username}` : '');
      try {
        const member = await bot.telegram.getChatMember(chatIdentifier, Number(telegramId));
        if (!validStatuses.includes(member.status)) {
          notJoined.push({ title: channel.title, inviteLink: channel.inviteLink, channelId: chatIdentifier });
        }
      } catch (err) {
        logger.warn(`خطا در بررسی عضویت ${chatIdentifier}:`, err);
        notJoined.push({ title: channel.title, inviteLink: channel.inviteLink, channelId: chatIdentifier });
      }
    }

    return { isMember: notJoined.length === 0, notJoined };
  },
};
