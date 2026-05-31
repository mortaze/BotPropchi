// src/services/discount.service.ts
// منطق تجاری کدهای تخفیف

import { DiscountCategory, Prisma, PointLogType, SystemEventType } from '@prisma/client';
import { discountRepository } from '../repositories/discount.repository';
import { userRepository } from '../repositories/user.repository';
import { cache } from '../utils/cache';
import { systemLogService } from './system-log.service';

const CACHE_KEY = {
  allCodes: (page: number) => `discounts:all:${page}`,
  category: (cat: string, page: number) => `discounts:cat:${cat}:${page}`,
  propFirms: 'prop_firms:all',
};

function clearDiscountCache() {
  cache.delByPrefix('discounts:');
  cache.del(CACHE_KEY.propFirms);
}

export const discountService = {
  async getAll(page = 1, limit = 5) {
    const key = CACHE_KEY.allCodes(page);
    const cached = cache.get(key);
    if (cached) return cached;

    const result = await discountRepository.getAll(page, limit);
    cache.set(key, result);
    return result;
  },

  async getByCategory(category: DiscountCategory, page = 1, limit = 5) {
    const key = CACHE_KEY.category(category, page);
    const cached = cache.get(key);
    if (cached) return cached;

    const result = await discountRepository.getByCategory(category, page, limit);
    cache.set(key, result);
    return result;
  },

  async search(query: string, page = 1, limit = 5) {
    return discountRepository.search(query, page, limit);
  },

  async getDetails(id: number) {
    return discountRepository.getDetails(id);
  },

  async incrementUsage(discountCodeId: number, userId?: number) {
    const result = await discountRepository.incrementUsage(discountCodeId, userId);
    clearDiscountCache();
    return result;
  },

  // وقتی کاربر روی لینک افیلیت کلیک می‌کند
  async handleClick(discountCodeId: number, userId: number) {
    await Promise.all([
      discountRepository.incrementUsage(discountCodeId, userId),
      userRepository.addPoints(userId, 2, PointLogType.LINK_CLICK, 'کلیک روی لینک افیلیت'),
      systemLogService.log({ eventType: SystemEventType.DISCOUNT_CLICK, userId, message: 'Discount code clicked', metadata: { discountCodeId } }),
    ]);

    clearDiscountCache();
  },

  async getPropFirms(activeOnly = true) {
    const cached = cache.get(CACHE_KEY.propFirms);
    if (cached && activeOnly) return cached;

    const result = await discountRepository.getPropFirms(activeOnly);
    if (activeOnly) cache.set(CACHE_KEY.propFirms, result, 600);
    return result;
  },

  async create(data: Prisma.DiscountCodeUncheckedCreateInput) {
    const created = await discountRepository.create(data);
    clearDiscountCache();
    return created;
  },

  async update(id: number, data: Prisma.DiscountCodeUncheckedUpdateInput) {
    const updated = await discountRepository.update(id, data);
    clearDiscountCache();
    return updated;
  },

  async delete(id: number) {
    const deleted = await discountRepository.delete(id);
    clearDiscountCache();
    return deleted;
  },
};
