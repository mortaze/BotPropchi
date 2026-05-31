// src/repositories/channel.repository.ts
// کوئری‌های کانال‌های عضویت اجباری

import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';

export const channelRepository = {
  async findAll() {
    return prisma.requiredChannel.findMany({ orderBy: { createdAt: 'desc' } });
  },

  async findById(id: number) {
    return prisma.requiredChannel.findUnique({ where: { id } });
  },

  async findActive() {
    return prisma.requiredChannel.findMany({
      where: { isActive: true, status: 'APPROVED' },
      orderBy: { createdAt: 'desc' },
    });
  },

  async create(data: Prisma.RequiredChannelCreateInput) {
    return prisma.requiredChannel.create({ data });
  },

  async upsertByChannelId(channelId: string, data: Prisma.RequiredChannelCreateInput) {
    return prisma.requiredChannel.upsert({
      where: { channelId },
      update: {
        title: data.title,
        chatId: data.chatId,
        username: data.username,
        type: data.type,
        inviteLink: data.inviteLink,
      },
      create: data,
    });
  },

  async update(id: number, data: Prisma.RequiredChannelUpdateInput) {
    return prisma.requiredChannel.update({ where: { id }, data });
  },

  async delete(id: number) {
    return prisma.requiredChannel.delete({ where: { id } });
  },
};
