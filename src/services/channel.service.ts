// src/services/channel.service.ts
// بررسی عضویت اجباری در کانال‌ها

import { Telegraf } from 'telegraf';
import { prisma } from '../prisma/client';
import { logger } from '../utils/logger';

export const channelService = {
  // بررسی عضویت کاربر در تمام کانال‌های اجباری
  async checkMembership(bot: Telegraf, telegramId: bigint): Promise<{
    isMember: boolean;
    notJoined: Array<{ title: string; inviteLink: string | null; channelId: string }>;
  }> {
    const channels = await prisma.requiredChannel.findMany({
      where: { isActive: true },
    });

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
      }
    }

    return { isMember: notJoined.length === 0, notJoined };
  },
};
