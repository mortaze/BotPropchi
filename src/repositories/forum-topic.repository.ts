import { prisma } from '../prisma/client';

export const forumTopicRepository = {
  async upsert(data: { chatId: bigint; topicId: number; name: string; isClosed?: boolean; isHidden?: boolean }) {
    return prisma.forumTopic.upsert({
      where: { chatId_topicId: { chatId: data.chatId, topicId: data.topicId } },
      update: {
        name: data.name,
        isClosed: data.isClosed ?? false,
        isHidden: data.isHidden ?? false,
        lastSeenAt: new Date(),
      },
      create: {
        chatId: data.chatId,
        topicId: data.topicId,
        name: data.name,
        isClosed: data.isClosed ?? false,
        isHidden: data.isHidden ?? false,
      },
    });
  },

  async findByChatId(chatId: bigint) {
    return prisma.forumTopic.findMany({
      where: { chatId, isClosed: false, isHidden: false },
      orderBy: { name: 'asc' },
    });
  },

  async findAllByChatId(chatId: bigint) {
    return prisma.forumTopic.findMany({
      where: { chatId },
      orderBy: { name: 'asc' },
    });
  },

  async closeTopic(chatId: bigint, topicId: number) {
    return prisma.forumTopic.updateMany({
      where: { chatId, topicId },
      data: { isClosed: true, lastSeenAt: new Date() },
    });
  },

  async reopenTopic(chatId: bigint, topicId: number) {
    return prisma.forumTopic.updateMany({
      where: { chatId, topicId },
      data: { isClosed: false, lastSeenAt: new Date() },
    });
  },

  async hideTopic(chatId: bigint, topicId: number) {
    return prisma.forumTopic.updateMany({
      where: { chatId, topicId },
      data: { isHidden: true, lastSeenAt: new Date() },
    });
  },

  async renameTopic(chatId: bigint, topicId: number, name: string) {
    return prisma.forumTopic.updateMany({
      where: { chatId, topicId },
      data: { name, lastSeenAt: new Date() },
    });
  },

  async countActive(chatId: bigint) {
    return prisma.forumTopic.count({
      where: { chatId, isClosed: false, isHidden: false },
    });
  },
};
