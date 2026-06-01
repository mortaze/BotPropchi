// src/repositories/discount.repository.ts
// کوئری‌های کدهای تخفیف بر اساس پراپ فرم

import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';

function activeFilter() {
  return {
    isActive: true,
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
  } satisfies Prisma.DiscountCodeWhereInput;
}

export const discountRepository = {
  async getAll(page = 1, limit = 5, activeOnly = true) {
    const skip = (page - 1) * limit;
    const where = activeOnly ? activeFilter() : {};

    const [items, total] = await Promise.all([
      prisma.discountCode.findMany({
        where,
        include: { propFirm: true },
        orderBy: [{ isFeatured: 'desc' }, { usageCount: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.discountCode.count({ where }),
    ]);

    return { items, total, pages: Math.ceil(total / limit) };
  },

  async getByPropFirm(propFirmId: number, page = 1, limit = 5) {
    const skip = (page - 1) * limit;
    const where = { ...activeFilter(), propFirmId };

    const [items, total] = await Promise.all([
      prisma.discountCode.findMany({
        where,
        include: { propFirm: true },
        orderBy: [{ isFeatured: 'desc' }, { usageCount: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.discountCode.count({ where }),
    ]);

    return { items, total, pages: Math.ceil(total / limit) };
  },

  async search(query: string, page = 1, limit = 5) {
    const skip = (page - 1) * limit;
    const where = {
      ...activeFilter(),
      OR: [
        { title: { contains: query, mode: 'insensitive' as const } },
        { code: { contains: query, mode: 'insensitive' as const } },
        { propFirm: { name: { contains: query, mode: 'insensitive' as const } } },
      ],
    };

    const [items, total] = await Promise.all([
      prisma.discountCode.findMany({
        where,
        include: { propFirm: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.discountCode.count({ where }),
    ]);

    return { items, total, pages: Math.ceil(total / limit) };
  },

  async getDetails(id: number) {
    return prisma.discountCode.findUnique({ where: { id }, include: { propFirm: true } });
  },

  async incrementUsage(discountCodeId: number, userId?: number) {
    if (!userId) {
      return prisma.discountCode.update({ where: { id: discountCodeId }, data: { usageCount: { increment: 1 } } });
    }

    return prisma.$transaction([
      prisma.discountCode.update({ where: { id: discountCodeId }, data: { usageCount: { increment: 1 } } }),
      prisma.clickLog.create({ data: { discountCodeId, userId } }),
    ]);
  },

  async getPropFirms(activeOnly = true) {
    return prisma.propFirm.findMany({
      where: activeOnly
        ? { isActive: true, discountCodes: { some: { isActive: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } } }
        : {},
      include: { _count: { select: { discountCodes: true } } },
      orderBy: { name: 'asc' },
    });
  },

  async create(data: Prisma.DiscountCodeUncheckedCreateInput) {
    return prisma.discountCode.create({ data, include: { propFirm: true } });
  },

  async update(id: number, data: Prisma.DiscountCodeUncheckedUpdateInput) {
    return prisma.discountCode.update({ where: { id }, data, include: { propFirm: true } });
  },

  async delete(id: number) {
    return prisma.discountCode.delete({ where: { id } });
  },

  findAll(page = 1, limit = 5) {
    return this.getAll(page, limit);
  },

  findByPropFirm(propFirmId: number, page = 1, limit = 5) {
    return this.getByPropFirm(propFirmId, page, limit);
  },

  findById(id: number) {
    return this.getDetails(id);
  },

  registerClick(discountCodeId: number, userId: number) {
    return this.incrementUsage(discountCodeId, userId);
  },

  getAllPropFirms() {
    return this.getPropFirms();
  },
};
