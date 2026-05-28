// src/api/routes/discount.routes.ts
// API مدیریت کدهای تخفیف

import { Router } from 'express';
import { prisma } from '../../prisma/client';
import { z } from 'zod';
import { cache } from '../../utils/cache';
import { DiscountCategory } from '@prisma/client';

export const discountRouter = Router();

const codeSchema = z.object({
  title: z.string().min(2),
  code: z.string().min(2).toUpperCase(),
  discountPercent: z.number().min(0).max(100),
  propFirmId: z.number().int().positive(),
  affiliateLink: z.string().url().optional(),
  expiresAt: z.string().datetime().optional(),
  isFeatured: z.boolean().default(false),
  isActive: z.boolean().default(true),
  category: z.nativeEnum(DiscountCategory).default('OTHER'),
});

// لیست همه کدها
discountRouter.get('/', async (req, res) => {
  const page = parseInt(req.query.page as string || '1');
  const limit = 10;
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    prisma.discountCode.findMany({
      include: { propFirm: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.discountCode.count(),
  ]);

  res.json({ items, total, pages: Math.ceil(total / limit) });
});

// ایجاد کد جدید
discountRouter.post('/', async (req, res) => {
  const parsed = codeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const code = await prisma.discountCode.create({ data: parsed.data as any });
    cache.delByPrefix('discounts:');
    res.status(201).json(code);
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'این کد تخفیف قبلاً ثبت شده' });
    throw err;
  }
});

// ویرایش کد
discountRouter.put('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const parsed = codeSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const updated = await prisma.discountCode.update({
    where: { id },
    data: parsed.data,
  });
  cache.delByPrefix('discounts:');
  res.json(updated);
});

// حذف کد
discountRouter.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  await prisma.discountCode.delete({ where: { id } });
  cache.delByPrefix('discounts:');
  res.json({ message: 'کد حذف شد' });
});

// ─── پراپ فرم‌ها ──────────────────────────────────────────
discountRouter.get('/prop-firms', async (_req, res) => {
  const firms = await prisma.propFirm.findMany({ orderBy: { name: 'asc' } });
  res.json(firms);
});

discountRouter.post('/prop-firms', async (req, res) => {
  const schema = z.object({
    name: z.string().min(2),
    slug: z.string().min(2),
    description: z.string().optional(),
    logoUrl: z.string().url().optional(),
    websiteUrl: z.string().url().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const firm = await prisma.propFirm.create({ data: parsed.data as any });
  res.status(201).json(firm);
});
