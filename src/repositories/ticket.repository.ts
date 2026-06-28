import { Prisma, TicketStatus, TicketSenderType } from '@prisma/client';
import { prisma } from '../prisma/client';

export const ticketRepository = {
  async findById(id: number) {
    return prisma.ticket.findUnique({
      where: { id },
      include: {
        user: true,
        category: true,
        messages: { orderBy: { createdAt: 'asc' }, include: { attachments: true } },
      },
    });
  },

  async findByUserId(userId: number, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where = { userId, status: { not: 'DELETED' as TicketStatus } };

    const [items, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        include: { category: true, messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.ticket.count({ where }),
    ]);

    return { items, total, pages: Math.ceil(total / limit) };
  },

  async findAll(params: { status?: TicketStatus; categoryId?: number; page: number; limit: number; search?: string }) {
    const { status, categoryId, page, limit, search } = params;
    const skip = (page - 1) * limit;
    const where: Prisma.TicketWhereInput = {};

    if (status) where.status = status;
    if (categoryId) where.categoryId = categoryId;
    if (search) {
      where.OR = [
        { user: { firstName: { contains: search, mode: 'insensitive' } } },
        { user: { username: { contains: search, mode: 'insensitive' } } },
        { messages: { some: { text: { contains: search, mode: 'insensitive' } } } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        include: { user: true, category: true, messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.ticket.count({ where }),
    ]);

    return { items, total, pages: Math.ceil(total / limit) };
  },

  async countOpenByUserId(userId: number) {
    return prisma.ticket.count({ where: { userId, status: 'OPEN' } });
  },

  async create(data: { userId: number; categoryId: number }) {
    return prisma.ticket.create({ data });
  },

  async addMessage(data: {
    ticketId: number;
    senderType: TicketSenderType;
    messageType?: any;
    text?: string;
    fileId?: string;
    fileUniqueId?: string;
    mimeType?: string;
    fileSize?: number;
  }) {
    return prisma.ticketMessage.create({
      data: {
        ticketId: data.ticketId,
        senderType: data.senderType,
        messageType: data.messageType ?? 'TEXT',
        text: data.text ?? null,
        fileId: data.fileId ?? null,
        fileUniqueId: data.fileUniqueId ?? null,
        mimeType: data.mimeType ?? null,
        fileSize: data.fileSize ?? null,
      },
    });
  },

  async updateStatus(id: number, status: TicketStatus, extra?: { closedAt?: Date; deletedAt?: Date }) {
    return prisma.ticket.update({
      where: { id },
      data: { status, ...extra },
    });
  },

  async markMessagesRead(ticketId: number, senderType: TicketSenderType) {
    const receiverType = senderType === 'USER' ? 'ADMIN' : 'USER';
    return prisma.ticketMessage.updateMany({
      where: { ticketId, senderType: receiverType, isRead: false },
      data: { isRead: true },
    });
  },
};
