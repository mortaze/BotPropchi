// src/services/discount.service.ts
// منطق تجاری کدهای تخفیف

import { DiscountCategory } from '@prisma/client';
import { discountRepository } from '../repositories/discount.repository';
import { userRepository } from '../repositories/user.repository';
import { PointLogType } from '@prisma/client';
import { cache } from '../utils/cache';

const CACHE_KEY = {
  allCodes: (page: number) => `discounts:all:${page}`,
  category: (cat: string, page: number) => `discounts:cat:${cat}:${page}`,
  propFirms: 'prop_firms:all',
};

export const discountService = {
  async getAll(page = 1) {
    const key = CACHE_KEY.allCodes(page);
    const cached = cache.get(key);
    if (cached) return cached;
    const result = await discountRepository.findAll(page);
    cache.set(key, result);
    return result;
  },

  async getByCategory(category: DiscountCategory, page = 1) {
    const key = CACHE_KEY.category(category, page);
    const cached = cache.get(key);
    if (cached) return cached;
    const result = await discountRepository.findByCategory(category, page);
    cache.set(key, result);
    return result;
  },

  async search(query: string, page = 1) {
    // جستجو کش نمی‌شود چون متنوع است
    return discountRepository.search(query, page);
  },

  async getDetails(id: number) {
    return discountRepository.findById(id);
  },

  // وقتی کاربر روی لینک افیلیت کلیک می‌کند
  async handleClick(discountCodeId: number, userId: number) {
    await Promise.all([
      discountRepository.registerClick(discountCodeId, userId),
      userRepository.addPoints(userId, 2, PointLogType.LINK_CLICK, 'کلیک روی لینک افیلیت'),
    ]);
    cache.delByPrefix('discounts:');
  },

  async getPropFirms() {
    const cached = cache.get(CACHE_KEY.propFirms);
    if (cached) return cached;
    const result = await discountRepository.getAllPropFirms();
    cache.set(CACHE_KEY.propFirms, result, 600);
    return result;
  },
};
