// src/repositories/discount.repository.ts
// کوئری‌های کدهای تخفیف

import { DiscountCategory } from '@prisma/client';
import { prisma } from '../prisma/client';

const ACTIVE_FILTER = {
  isActive: true,
  OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
};

export const discountRepository = {
  // لیست کدها با صفحه‌بندی
  async findAll(page = 1, limit = 5) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      prisma.discountCode.findMany({
        where: ACTIVE_FILTER,
        include: { propFirm: true },
        orderBy: [{ isFeatured: 'desc' }, { usageCount: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.discountCode.count({ where: ACTIVE_FILTER }),
    ]);
    return { items, total, pages: Math.ceil(total / limit) };
  },

  // فیلتر بر اساس دسته‌بندی
  async findByCategory(category: DiscountCategory, page = 1, limit = 5) {
    const skip = (page - 1) * limit;
    const where = { ...ACTIVE_FILTER, category };
    const [items, total] = await Promise.all([
      prisma.discountCode.findMany({
        where,
        include: { propFirm: true },
        orderBy: { usageCount: 'desc' },
        skip,
        take: limit,
      }),
      prisma.discountCode.count({ where }),
    ]);
    return { items, total, pages: Math.ceil(total / limit) };
  },

  // جستجو بر اساس نام پراپ فرم
  async search(query: string, page = 1, limit = 5) {
    const skip = (page - 1) * limit;
    const where = {
      ...ACTIVE_FILTER,
      propFirm: { name: { contains: query, mode: 'insensitive' as const } },
    };
    const [items, total] = await Promise.all([
      prisma.discountCode.findMany({
        where,
        include: { propFirm: true },
        skip,
        take: limit,
      }),
      prisma.discountCode.count({ where }),
    ]);
    return { items, total, pages: Math.ceil(total / limit) };
  },

  async findById(id: number) {
    return prisma.discountCode.findUnique({
      where: { id },
      include: { propFirm: true },
    });
  },

  // ثبت کلیک و افزایش usageCount
  async registerClick(discountCodeId: number, userId: number) {
    return prisma.$transaction([
      prisma.discountCode.update({
        where: { id: discountCodeId },
        data: { usageCount: { increment: 1 } },
      }),
      prisma.clickLog.create({
        data: { discountCodeId, userId },
      }),
    ]);
  },

  // پراپ فرم‌ها
  async getAllPropFirms() {
    return prisma.propFirm.findMany({
      where: { isActive: true },
      include: { _count: { select: { discountCodes: true } } },
      orderBy: { name: 'asc' },
    });
  },
};
