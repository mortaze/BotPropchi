import { Prisma, PostStatus, PostMessageType } from '@prisma/client';
import { prisma } from '../prisma/client';

export const autoReplyRepository = {
  async create(data: {
    title: string;
    status?: PostStatus;
    createdBy?: bigint;
    messages?: { text: string; type: PostMessageType; order: number; mediaFileId?: string; entities?: any; replyMarkup?: any }[];
  }) {
    return prisma.autoReply.create({
      data: {
        title: data.title,
        status: data.status ?? PostStatus.DRAFT,
        createdBy: data.createdBy,
        messages: data.messages ? { createMany: { data: data.messages } } : undefined,
      },
      include: { messages: { orderBy: { order: 'asc' } }, buttons: true, keywords: true },
    });
  },

  async update(id: number, data: Prisma.AutoReplyUpdateInput) {
    return prisma.autoReply.update({ where: { id }, data });
  },

  async delete(id: number) {
    return prisma.autoReply.delete({ where: { id } });
  },

  async findById(id: number) {
    return prisma.autoReply.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { order: 'asc' }, include: { buttons: { orderBy: [{ row: 'asc' }, { col: 'asc' }] } } },
        buttons: { orderBy: [{ row: 'asc' }, { col: 'asc' }] },
        keywords: { orderBy: { createdAt: 'asc' } },
      },
    });
  },

  async findAll(params: { page?: number; limit?: number; status?: PostStatus; search?: string }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const where: Prisma.AutoReplyWhereInput = {};
    if (params.status) where.status = params.status;
    if (params.search) where.title = { contains: params.search, mode: 'insensitive' };
    const [items, total] = await Promise.all([
      prisma.autoReply.findMany({
        where,
        include: { messages: { orderBy: { order: 'asc' } }, keywords: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.autoReply.count({ where }),
    ]);
    return { items, total, pages: Math.ceil(total / limit), page };
  },

  async getPublishedWithKeywords() {
    return prisma.autoReply.findMany({
      where: { isPublished: true, status: PostStatus.PUBLISHED },
      include: {
        messages: { orderBy: { order: 'asc' } },
        keywords: true,
        buttons: { orderBy: [{ row: 'asc' }, { col: 'asc' }] },
      },
    });
  },

  async logDelivery(data: {
    autoReplyId: number;
    targetChatId: bigint;
    targetTopicId?: bigint | null;
    status: string;
    errorMessage?: string;
  }) {
    return prisma.autoReplySendLog.create({ data });
  },

  async getLogs(autoReplyId: number, limit = 50) {
    return prisma.autoReplySendLog.findMany({
      where: { autoReplyId },
      orderBy: { sentAt: 'desc' },
      take: limit,
    });
  },

  async getStats() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);
    const [activeReplies, todaySends, weekSends, errorCount] = await Promise.all([
      prisma.autoReply.count({ where: { isPublished: true, status: PostStatus.PUBLISHED } }),
      prisma.autoReplySendLog.count({ where: { sentAt: { gte: todayStart } } }),
      prisma.autoReplySendLog.count({ where: { sentAt: { gte: weekStart } } }),
      prisma.autoReplySendLog.count({ where: { status: 'FAILED' } }),
    ]);
    const activeGroups = await prisma.autoReply.findMany({
      where: { isPublished: true, status: PostStatus.PUBLISHED },
      distinct: ['targetChatId'],
      select: { targetChatId: true },
    });
    return { activeReplies, todaySends, weekSends, activeGroups: activeGroups.length, errorCount };
  },

  async disableAll() {
    return prisma.autoReply.updateMany({
      where: { isPublished: true },
      data: { isPublished: false, status: PostStatus.DRAFT },
    });
  },

  // ─── Button CRUD ─────────────────────────────────────────

  async createButton(data: {
    autoReplyId: number; messageId?: number; row: number; col: number;
    text: string; type?: string; value?: string; style?: string; payload?: any;
  }) {
    return prisma.autoReplyButton.create({
      data: {
        autoReplyId: data.autoReplyId, messageId: data.messageId, row: data.row, col: data.col,
        text: data.text, type: data.type ?? 'URL', value: data.value, style: data.style, payload: data.payload,
      },
    });
  },

  async updateButton(id: number, data: { text?: string; type?: string; value?: string; style?: string; row?: number; col?: number; payload?: any }) {
    return prisma.autoReplyButton.update({ where: { id }, data });
  },

  async deleteButton(id: number) {
    return prisma.autoReplyButton.delete({ where: { id } });
  },

  async findButtonsByMessage(messageId: number) {
    return prisma.autoReplyButton.findMany({ where: { messageId }, orderBy: [{ row: 'asc' }, { col: 'asc' }] });
  },

  async findButtonsByAutoReply(autoReplyId: number) {
    return prisma.autoReplyButton.findMany({ where: { autoReplyId }, orderBy: [{ row: 'asc' }, { col: 'asc' }] });
  },

  async deleteButtonsByMessage(messageId: number) {
    return prisma.autoReplyButton.deleteMany({ where: { messageId } });
  },

  async deleteButtonsByAutoReply(autoReplyId: number) {
    return prisma.autoReplyButton.deleteMany({ where: { autoReplyId } });
  },

  // ─── Keyword CRUD ────────────────────────────────────────

  async createKeyword(autoReplyId: number, keyword: string) {
    return prisma.autoReplyKeyword.create({ data: { autoReplyId, keyword } });
  },

  async updateKeyword(id: number, keyword: string) {
    return prisma.autoReplyKeyword.update({ where: { id }, data: { keyword } });
  },

  async deleteKeyword(id: number) {
    return prisma.autoReplyKeyword.delete({ where: { id } });
  },

  async findKeywordsByAutoReply(autoReplyId: number) {
    return prisma.autoReplyKeyword.findMany({ where: { autoReplyId }, orderBy: { createdAt: 'asc' } });
  },

  // ─── Binding CRUD ──────────────────────────────────────

  async getBindingsByAutoReply(autoReplyId: number) {
    return prisma.autoReplyBinding.findMany({
      where: { autoReplyId, isActive: true },
      orderBy: [{ chatId: 'asc' }, { topicId: 'asc' }],
    });
  },

  async upsertForumBinding(autoReplyId: number, chatId: bigint, topicId: number) {
    const bigTopicId = BigInt(topicId);
    return prisma.autoReplyBinding.upsert({
      where: { autoReplyId_chatId_topicId: { autoReplyId, chatId, topicId: bigTopicId } },
      create: { autoReplyId, chatId, topicId: bigTopicId, isActive: true },
      update: { isActive: true },
    });
  },

  async upsertNonForumBinding(autoReplyId: number, chatId: bigint) {
    const existing = await prisma.autoReplyBinding.findFirst({
      where: { autoReplyId, chatId, topicId: null },
    });
    if (existing) {
      return prisma.autoReplyBinding.update({ where: { id: existing.id }, data: { isActive: true } });
    }
    return prisma.autoReplyBinding.create({
      data: { autoReplyId, chatId, topicId: null, isActive: true },
    });
  },

  async removeBindingsForGroup(autoReplyId: number, chatId: bigint) {
    return prisma.autoReplyBinding.deleteMany({ where: { autoReplyId, chatId } });
  },

  async removeAllBindings(autoReplyId: number) {
    return prisma.autoReplyBinding.deleteMany({ where: { autoReplyId } });
  },

  async bulkCreateBindings(autoReplyId: number, bindings: { chatId: bigint; topicId: number | null }[]) {
    if (bindings.length === 0) return;
    await prisma.autoReplyBinding.deleteMany({ where: { autoReplyId } });
    for (const b of bindings) {
      if (b.topicId != null) {
        await prisma.autoReplyBinding.create({
          data: { autoReplyId, chatId: b.chatId, topicId: BigInt(b.topicId), isActive: true },
        });
      } else {
        await prisma.autoReplyBinding.create({
          data: { autoReplyId, chatId: b.chatId, topicId: null, isActive: true },
        });
      }
    }
  },

  async getPublishedForGroup(chatId: bigint, topicId: number | null) {
    return prisma.autoReply.findMany({
      where: {
        isPublished: true,
        status: PostStatus.PUBLISHED,
        bindings: {
          some: {
            chatId,
            isActive: true,
            ...(topicId != null
              ? { OR: [{ topicId: BigInt(topicId) }, { topicId: null }] }
              : { topicId: null }),
          },
        },
      },
      include: {
        messages: { orderBy: { order: 'asc' } },
        keywords: true,
        buttons: { orderBy: [{ row: 'asc' }, { col: 'asc' }] },
      },
    });
  },
};
