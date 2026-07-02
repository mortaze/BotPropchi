import { TelegramGroupStatus } from '@prisma/client';
import { Telegraf } from 'telegraf';
import { prisma } from '../prisma/client';
import { logger } from '../utils/logger';

export const groupService = {
  list() {
    return prisma.telegramGroup.findMany({ orderBy: { addedAt: 'desc' } });
  },

  async upsertFromChat(chat: { id: number | bigint; title?: string; username?: string }) {
    const chatId = BigInt(chat.id);
    return prisma.telegramGroup.upsert({
      where: { chatId },
      update: { title: chat.title || String(chat.id), username: chat.username || null },
      create: { chatId, title: chat.title || String(chat.id), username: chat.username || null, status: TelegramGroupStatus.PENDING },
    });
  },

  async updateStatus(id: number, status: TelegramGroupStatus) {
    const now = new Date();
    return prisma.telegramGroup.update({
      where: { id },
      data: {
        status,
        ...(status === TelegramGroupStatus.APPROVED ? { approvedAt: now, rejectedAt: null, disabledAt: null } : {}),
        ...(status === TelegramGroupStatus.REJECTED ? { rejectedAt: now } : {}),
        ...(status === TelegramGroupStatus.DISABLED ? { disabledAt: now } : {}),
      },
    });
  },

  async refreshBotAdmin(bot: Telegraf, chatId: bigint | number | string) {
    const normalized = BigInt(chatId);
    try {
      const me = await bot.telegram.getMe();
      const member = await bot.telegram.getChatMember(Number(normalized), me.id);
      const botIsAdmin = member.status === 'administrator' || member.status === 'creator';
      return prisma.telegramGroup.update({ where: { chatId: normalized }, data: { botIsAdmin, botAdminCheckedAt: new Date() } });
    } catch (error) {
      logger.warn(`خطا در بررسی ادمین بودن ربات در گروه ${chatId}:`, error);
      return prisma.telegramGroup.update({ where: { chatId: normalized }, data: { botIsAdmin: false, botAdminCheckedAt: new Date() } });
    }
  },

  async canOperateInGroup(bot: Telegraf, chat: { id: number | bigint; title?: string; username?: string }) {
    const group = await this.upsertFromChat(chat);
    if (group.status !== TelegramGroupStatus.APPROVED) return { allowed: false, group };
    const checkedRecently = group.botAdminCheckedAt && Date.now() - group.botAdminCheckedAt.getTime() < 5 * 60_000;
    const current = checkedRecently ? group : await this.refreshBotAdmin(bot, group.chatId);
    return { allowed: current.status === TelegramGroupStatus.APPROVED && current.botIsAdmin, group: current };
  },

  async fetchForumTopics(bot: Telegraf, chatId: number | bigint) {
    try {
      const chat = await bot.telegram.getChat(Number(chatId));
      const isForum = (chat as any).is_forum === true;
      if (!isForum) return null;

      await prisma.telegramGroup.update({
        where: { chatId: BigInt(chatId) },
        data: { isForum: true, forumTopicsFetchedAt: new Date() },
      });

      return { isForum: true };
    } catch (error) {
      logger.error(`[GroupService] Failed to fetch forum info for ${chatId}:`, error);
      return null;
    }
  },
};
