// src/services/channel.service.ts
// بررسی و مدیریت عضویت اجباری در کانال‌ها

import { Prisma } from '@prisma/client';
import { Telegraf } from 'telegraf';
import { channelRepository } from '../repositories/channel.repository';
import { logger } from '../utils/logger';

export const channelService = {
  async findAll() {
    return channelRepository.findAll();
  },

  async findActive() {
    return channelRepository.findActive();
  },

  async create(data: Prisma.RequiredChannelCreateInput) {
    return channelRepository.create(data);
  },

  async update(id: number, data: Prisma.RequiredChannelUpdateInput) {
    return channelRepository.update(id, data);
  },

  async delete(id: number) {
    return channelRepository.delete(id);
  },

  // بررسی عضویت کاربر در تمام کانال‌های اجباری
  async checkMembership(bot: Telegraf, telegramId: bigint): Promise<{
    isMember: boolean;
    notJoined: Array<{ title: string; inviteLink: string | null; channelId: string }>;
  }> {
    const channels = await channelRepository.findActive();

    if (channels.length === 0) return { isMember: true, notJoined: [] };

    const notJoined: Array<{ title: string; inviteLink: string | null; channelId: string }> = [];

    for (const channel of channels) {
      try {
        const member = await bot.telegram.getChatMember(channel.channelId, Number(telegramId));
        const isJoined = ['member', 'administrator', 'creator'].includes(member.status);

        if (!isJoined) {
          notJoined.push({
            title: channel.title,
            inviteLink: channel.inviteLink,
            channelId: channel.channelId,
          });
        }
      } catch (err) {
        logger.warn(`خطا در بررسی عضویت کانال ${channel.channelId}:`, err);
        notJoined.push({
          title: channel.title,
          inviteLink: channel.inviteLink,
          channelId: channel.channelId,
        });
      }
    }

    return { isMember: notJoined.length === 0, notJoined };
  },
};
