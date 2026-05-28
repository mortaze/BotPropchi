// src/api/routes/user.routes.ts
// API مدیریت کاربران

import { Router } from 'express';
import { prisma } from '../../prisma/client';
import { userRepository } from '../../repositories/user.repository';
import { PointLogType } from '@prisma/client';
import { z } from 'zod';

export const userRouter = Router();

// لیست کاربران
userRouter.get('/', async (req, res) => {
  const page = parseInt(req.query.page as string || '1');
  const limit = 20;
  const skip = (page - 1) * limit;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true, telegramId: true, firstName: true,
        username: true, points: true, totalReferrals: true,
        isBlocked: true, createdAt: true,
      },
    }),
    prisma.user.count(),
  ]);

  res.json({ users: users.map(u => ({...u, telegramId: u.telegramId.toString()})), total });
});

// آمار کلی
userRouter.get('/stats', async (_req, res) => {
  const [total, today, totalPoints] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
    prisma.user.aggregate({ _sum: { points: true } }),
  ]);
  res.json({ total, today, totalPoints: totalPoints._sum.points || 0 });
});

// بلاک/آنبلاک کاربر
userRouter.patch('/:id/block', async (req, res) => {
  const id = parseInt(req.params.id);
  const { isBlocked } = req.body;
  const user = await prisma.user.update({ where: { id }, data: { isBlocked } });
  res.json({ id: user.id, isBlocked: user.isBlocked });
});

// اعطای امتیاز به صورت دستی
userRouter.post('/:id/points', async (req, res) => {
  const id = parseInt(req.params.id);
  const { amount, description } = z.object({
    amount: z.number().int(),
    description: z.string().optional(),
  }).parse(req.body);

  await userRepository.addPoints(id, amount, PointLogType.ADMIN_GRANT, description);
  res.json({ message: `${amount} امتیاز به کاربر ${id} داده شد` });
});
