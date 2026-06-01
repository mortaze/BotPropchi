// src/api/routes/discount.routes.ts
// API مدیریت کدهای تخفیف

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../prisma/client';
import { discountService } from '../../services/discount.service';

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

function serializeBigInts(value: any): any {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(serializeBigInts);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializeBigInts(item)]));
  }
  return value;
}

// GET /api/discounts?propFirmId=1&q=ftmo&page=1&limit=10
discountRouter.get('/', async (req, res) => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 10);
  const propFirmId = req.query.propFirmId ? Number(req.query.propFirmId) : undefined;
  const query = req.query.q as string | undefined;

  if (query) return res.json(serializeBigInts(await discountService.search(query, page, limit)));
  if (propFirmId) return res.json(serializeBigInts(await discountService.getByPropFirm(propFirmId, page, limit)));

  return res.json(serializeBigInts(await discountService.getAll(page, limit)));
});

discountRouter.get('/prop-firms', async (req, res) => {
  const activeOnly = req.query.activeOnly !== 'false';
  const firms = await discountService.getPropFirms(activeOnly);
  res.json(serializeBigInts(firms));
});

discountRouter.post('/prop-firms', async (req, res) => {
  const schema = z.object({
    name: z.string().min(2),
    slug: z.string().min(2),
    description: z.string().optional().nullable(),
    logoUrl: optionalUrl,
    websiteUrl: optionalUrl,
    reviewLink: optionalUrl,
    isActive: z.boolean().default(true),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });

  const firm = await prisma.propFirm.create({ data: parsed.data as any });
  res.status(201).json(serializeBigInts(firm));
});



discountRouter.patch('/prop-firms/:id', async (req, res) => {
  const schema = z.object({
    name: z.string().min(2).optional(),
    slug: z.string().min(2).optional(),
    description: z.string().optional().nullable(),
    logoUrl: optionalUrl,
    websiteUrl: optionalUrl,
    reviewLink: optionalUrl,
    isActive: z.boolean().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });

  const firm = await prisma.propFirm.update({ where: { id: Number(req.params.id) }, data: parsed.data as any });
  res.json(serializeBigInts(firm));
});

discountRouter.get('/:id', async (req, res) => {
  const discount = await discountService.getDetails(Number(req.params.id));
  if (!discount) return res.status(404).json({ success: false, error: 'کد تخفیف یافت نشد' });
  res.json(serializeBigInts(discount));
});

discountRouter.post('/', async (req, res) => {
  const parsed = codeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });

  try {
    const code = await discountService.create(parsed.data as any);
    res.status(201).json(serializeBigInts(code));
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(409).json({ success: false, error: 'این کد تخفیف قبلاً ثبت شده' });
    throw err;
  }
});

discountRouter.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const parsed = codeSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });

  const updated = await discountService.update(id, parsed.data as any);
  res.json(serializeBigInts(updated));
});

discountRouter.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  await discountService.delete(id);
  res.json({ success: true, message: 'کد حذف شد' });
});
