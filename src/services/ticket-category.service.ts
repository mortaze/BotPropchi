import { prisma } from '../prisma/client';
import { logger } from '../utils/logger';

class TicketCategoryService {
  async list() {
    return prisma.ticketCategory.findMany({
      where: { enabled: true },
      orderBy: { order: 'asc' },
    });
  }

  async listAll() {
    return prisma.ticketCategory.findMany({
      orderBy: { order: 'asc' },
    });
  }

  async findById(id: number) {
    return prisma.ticketCategory.findUnique({ where: { id } });
  }

  async create(title: string) {
    const last = await prisma.ticketCategory.aggregate({ _max: { order: true } });
    const order = (last._max.order ?? -1) + 1;
    return prisma.ticketCategory.create({ data: { title, order } });
  }

  async update(id: number, data: { title?: string; enabled?: boolean; order?: number }) {
    return prisma.ticketCategory.update({ where: { id }, data });
  }

  async remove(id: number) {
    const ticketCount = await prisma.ticket.count({ where: { categoryId: id } });
    if (ticketCount > 0) {
      await prisma.ticketCategory.update({ where: { id }, data: { enabled: false } });
      logger.info(`[TicketCategory] categoryId=${id} has ${ticketCount} tickets — disabled instead of deleted`);
      return { disabled: true, ticketCount };
    }
    await prisma.ticketCategory.delete({ where: { id } });
    return { disabled: false };
  }

  async reorder(ids: number[]) {
    const tx = ids.map((id, index) =>
      prisma.ticketCategory.update({ where: { id }, data: { order: index } })
    );
    return prisma.$transaction(tx);
  }
}

export const ticketCategoryService = new TicketCategoryService();
