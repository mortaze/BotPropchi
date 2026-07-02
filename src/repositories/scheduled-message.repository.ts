import { Prisma, PostStatus, PostMessageType } from '@prisma/client';
import { prisma } from '../prisma/client';

export const scheduledMessageRepository = {
  async create(data: {
    title: string;
    slug?: string;
    status?: PostStatus;
    createdBy?: bigint;
    messages?: { text: string; type: PostMessageType; order: number; mediaFileId?: string; entities?: any; replyMarkup?: any }[];
  }) {
    return prisma.scheduledMessage.create({
      data: {
        title: data.title,
        slug: data.slug,
        status: data.status ?? PostStatus.DRAFT,
        createdBy: data.createdBy,
        messages: data.messages ? { createMany: { data: data.messages } } : undefined,
      },
      include: { messages: { orderBy: { order: 'asc' } }, buttons: true },
    });
  },

  async update(id: number, data: Prisma.ScheduledMessageUpdateInput) {
    return prisma.scheduledMessage.update({ where: { id }, data });
  },

  async delete(id: number) {
    return prisma.scheduledMessage.delete({ where: { id } });
  },

  async findById(id: number) {
    return prisma.scheduledMessage.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { order: 'asc' } },
        buttons: { orderBy: [{ row: 'asc' }, { col: 'asc' }] },
      },
    });
  },

  async findAll(params: { page?: number; limit?: number; status?: PostStatus; search?: string }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const where: Prisma.ScheduledMessageWhereInput = {};
    if (params.status) where.status = params.status;
    if (params.search) where.title = { contains: params.search, mode: 'insensitive' };

    const [items, total] = await Promise.all([
      prisma.scheduledMessage.findMany({
        where,
        include: { messages: { orderBy: { order: 'asc' } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.scheduledMessage.count({ where }),
    ]);

    return { items, total, pages: Math.ceil(total / limit), page };
  },

  async getPublished() {
    return prisma.scheduledMessage.findMany({
      where: { isPublished: true, status: PostStatus.PUBLISHED },
      include: { messages: { orderBy: { order: 'asc' } } },
    });
  },

  async findDueForSending() {
    return prisma.scheduledMessage.findMany({
      where: {
        isPublished: true,
        status: PostStatus.PUBLISHED,
        nextSendAt: { lte: new Date() },
        intervalHours: { not: null },
        targetChatId: { not: null },
      },
      include: { messages: { orderBy: { order: 'asc' } }, buttons: true },
    });
  },

  async logDelivery(data: {
    scheduledMessageId: number;
    targetChatId: bigint;
    targetTopicId?: bigint | null;
    status: string;
    errorMessage?: string;
  }) {
    return prisma.scheduledPostLog.create({ data });
  },

  async getLogs(scheduledMessageId: number, limit = 50) {
    return prisma.scheduledPostLog.findMany({
      where: { scheduledMessageId },
      orderBy: { sentAt: 'desc' },
      take: limit,
    });
  },

  async getStats() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);

    const [activeMessages, todaySends, weekSends, errorCount] = await Promise.all([
      prisma.scheduledMessage.count({ where: { isPublished: true, status: PostStatus.PUBLISHED } }),
      prisma.scheduledPostLog.count({ where: { sentAt: { gte: todayStart } } }),
      prisma.scheduledPostLog.count({ where: { sentAt: { gte: weekStart } } }),
      prisma.scheduledPostLog.count({ where: { status: 'FAILED' } }),
    ]);

    const activeGroups = await prisma.scheduledMessage.findMany({
      where: { isPublished: true, status: PostStatus.PUBLISHED },
      distinct: ['targetChatId'],
      select: { targetChatId: true },
    });

    return {
      activeMessages,
      todaySends,
      weekSends,
      activeGroups: activeGroups.length,
      errorCount,
    };
  },

  async disableAll() {
    return prisma.scheduledMessage.updateMany({
      where: { isPublished: true },
      data: { isPublished: false, status: PostStatus.DRAFT, nextSendAt: null },
    });
  },
};
