import { AdminRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../prisma/client';

export const adminUserRouter = Router();

const baseSchema = z.object({
  firstName: z.string().min(1).optional().nullable(),
  lastName: z.string().min(1).optional().nullable(),
  username: z.string().min(3).optional(),
  email: z.string().email().optional().nullable(),
  password: z.string().min(6).optional(),
  role: z.enum(['OWNER', 'ADMIN']).optional(),
  isActive: z.boolean().optional(),
});

const select = { id: true, firstName: true, lastName: true, username: true, email: true, role: true, isActive: true, lastLoginAt: true, createdAt: true, updatedAt: true };

adminUserRouter.get('/', async (_req, res) => {
  const items = await prisma.admin.findMany({ select, orderBy: [{ role: 'desc' }, { createdAt: 'asc' }] });
  res.json({ success: true, items });
});

adminUserRouter.post('/', async (req, res) => {
  const parsed = baseSchema.extend({ username: z.string().min(3), password: z.string().min(6), role: z.enum(['OWNER', 'ADMIN']).default('ADMIN'), isActive: z.boolean().default(true) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
  const ownerCount = await prisma.admin.count({ where: { role: AdminRole.OWNER } });
  if (parsed.data.role === 'OWNER' && ownerCount > 0) return res.status(409).json({ success: false, error: 'Owner فقط یک نفر می‌تواند باشد' });
  const { password, ...data } = parsed.data;
  const item = await prisma.admin.create({ data: { ...data, passwordHash: await bcrypt.hash(password, 12) } as any, select });
  res.status(201).json({ success: true, item });
});

adminUserRouter.patch('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const parsed = baseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
  const current = await prisma.admin.findUnique({ where: { id } });
  if (!current) return res.status(404).json({ success: false, error: 'ادمین پیدا نشد' });
  if (parsed.data.role === 'OWNER') {
    const owner = await prisma.admin.findFirst({ where: { role: AdminRole.OWNER, NOT: { id } } });
    if (owner) return res.status(409).json({ success: false, error: 'Owner فقط یک نفر می‌تواند باشد' });
  }
  const { password, ...rest } = parsed.data;
  const data: any = { ...rest };
  if (password) data.passwordHash = await bcrypt.hash(password, 12);
  const item = await prisma.admin.update({ where: { id }, data, select });
  res.json({ success: true, item });
});

adminUserRouter.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const current = await prisma.admin.findUnique({ where: { id } });
  if (!current) return res.status(404).json({ success: false, error: 'ادمین پیدا نشد' });
  if (current.role === AdminRole.OWNER) return res.status(403).json({ success: false, error: 'حذف Owner مجاز نیست' });
  await prisma.admin.delete({ where: { id } });
  res.json({ success: true });
});
