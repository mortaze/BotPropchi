import { RequiredChannelType } from '@prisma/client';
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
      isActive: data.isActive ?? true,
    });
  },

  update(id: number, data: Partial<{ title: string; chatId: string; username?: string | null; type: RequiredChannelType; inviteLink?: string | null; isActive: boolean }>) {
    const chatId = data.chatId?.trim();
    return channelRepository.update(id, {
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(chatId !== undefined ? { chatId, channelId: chatId } : {}),
      ...(data.username !== undefined ? { username: data.username?.replace('@', '') || null } : {}),
      ...(data.type !== undefined ? { type: data.type } : {}),
      ...(data.inviteLink !== undefined ? { inviteLink: data.inviteLink } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    });
  },

  delete(id: number) {
    return channelRepository.delete(id);
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
