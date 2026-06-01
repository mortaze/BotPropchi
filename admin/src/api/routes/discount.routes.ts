// src/api/routes/discount.routes.ts
// API مدیریت کدهای تخفیف بر اساس پراپ فرم

import { Router } from 'express';
import { prisma } from '../../prisma/client';
import { z } from 'zod';
import { cache } from '../../utils/cache';

export const discountRouter = Router();

const optionalUrl = z.string().url().optional().nullable();
const codeSchema = z.object({
  title: z.string().min(2),
  code: z.string().min(2).transform((value) => value.toUpperCase()),
  discountPercent: z.coerce.number().min(0).max(100),
  propFirmId: z.coerce.number().int().positive(),
  affiliateLink: optionalUrl,
  expiresAt: z.coerce.date().optional().nullable(),
  isFeatured: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

const activeFilter = () => ({ isActive: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] });

function serializeBigInts(value: any): any {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(serializeBigInts);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializeBigInts(item)]));
  return value;
}

discountRouter.get('/prop-firms', async (req, res) => {
  const activeOnly = req.query.activeOnly !== 'false';
  const firms = await prisma.propFirm.findMany({
    where: activeOnly ? { isActive: true, discountCodes: { some: activeFilter() } } : {},
    include: { _count: { select: { discountCodes: true } } },
    orderBy: { name: 'asc' },
  });
  res.json(serializeBigInts(firms));
});

discountRouter.post('/prop-firms', async (req, res) => {
  const schema = z.object({ name: z.string().min(2), slug: z.string().min(2), description: z.string().optional().nullable(), logoUrl: optionalUrl, websiteUrl: optionalUrl, isActive: z.boolean().default(true) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const firm = await prisma.propFirm.create({ data: parsed.data as any });
  cache.delByPrefix('discounts:');
  res.status(201).json(serializeBigInts(firm));
});

// لیست همه کدها یا کدهای یک پراپ فرم
discountRouter.get('/', async (req, res) => {
  const page = parseInt((req.query.page as string) || '1');
  const limit = parseInt((req.query.limit as string) || '10');
  const skip = (page - 1) * limit;
  const q = req.query.q as string | undefined;
  const propFirmId = req.query.propFirmId ? Number(req.query.propFirmId) : undefined;
  const where: any = {
    ...(q ? { OR: [{ title: { contains: q, mode: 'insensitive' } }, { code: { contains: q, mode: 'insensitive' } }, { propFirm: { name: { contains: q, mode: 'insensitive' } } }] } : {}),
    ...(propFirmId ? { propFirmId } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.discountCode.findMany({ where, include: { propFirm: true }, orderBy: [{ isFeatured: 'desc' }, { usageCount: 'desc' }, { createdAt: 'desc' }], skip, take: limit }),
    prisma.discountCode.count({ where }),
  ]);

  res.json(serializeBigInts({ items, total, pages: Math.ceil(total / limit) }));
});

discountRouter.get('/:id', async (req, res) => {
  const item = await prisma.discountCode.findUnique({ where: { id: Number(req.params.id) }, include: { propFirm: true } });
  if (!item) return res.status(404).json({ error: 'کد تخفیف یافت نشد' });
  res.json(serializeBigInts(item));
});

discountRouter.post('/', async (req, res) => {
  const parsed = codeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const code = await prisma.discountCode.create({ data: parsed.data as any, include: { propFirm: true } });
    cache.delByPrefix('discounts:');
    res.status(201).json(serializeBigInts(code));
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'این کد تخفیف قبلاً ثبت شده' });
    throw err;
  }
});

discountRouter.put('/:id', async (req, res) => {
  const parsed = codeSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const updated = await prisma.discountCode.update({ where: { id: Number(req.params.id) }, data: parsed.data as any, include: { propFirm: true } });
  cache.delByPrefix('discounts:');
  res.json(serializeBigInts(updated));
});

discountRouter.delete('/:id', async (req, res) => {
  await prisma.discountCode.delete({ where: { id: Number(req.params.id) } });
  cache.delByPrefix('discounts:');
  res.json({ message: 'کد حذف شد' });
});
