// src/repositories/channel.repository.ts
// کوئری‌های کانال‌های عضویت اجباری

import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';

export const channelRepository = {
  async findAll() {
    return prisma.requiredChannel.findMany({ orderBy: { createdAt: 'desc' } });
  },

  async findActive() {
    return prisma.requiredChannel.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  },

  async create(data: Prisma.RequiredChannelCreateInput) {
    return prisma.requiredChannel.create({ data });
  },

  async update(id: number, data: Prisma.RequiredChannelUpdateInput) {
    return prisma.requiredChannel.update({ where: { id }, data });
  },

  async delete(id: number) {
    return prisma.requiredChannel.delete({ where: { id } });
  },
};
