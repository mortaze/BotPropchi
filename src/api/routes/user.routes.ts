// src/api/routes/user.routes.ts
// API مدیریت کاربران

import { PointLogType } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../prisma/client';
import { userRepository } from '../../repositories/user.repository';

export const userRouter = Router();

function serializeBigInts(value: any): any {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(serializeBigInts);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializeBigInts(item)]));
  }
  return value;
}

// لیست کاربران: GET /api/users
userRouter.get('/', async (req, res) => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 20);
  const result = await userRepository.list(page, limit);

  res.json(serializeBigInts(result));
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

// پروفایل: GET /api/users/:id
userRouter.get('/:id', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      pointLogs: { orderBy: { createdAt: 'desc' }, take: 50 },
      sentReferrals: {
        include: { referredUser: { select: { id: true, telegramId: true, username: true, firstName: true, lastName: true, createdAt: true } } },
        orderBy: { createdAt: 'desc' },
      },
      receivedReferral: {
        include: { referrer: { select: { id: true, telegramId: true, username: true, firstName: true, lastName: true } } },
      },
      referredBy: { select: { id: true, telegramId: true, username: true, firstName: true, lastName: true } },
      lotteryEntries: { include: { lottery: true }, orderBy: { createdAt: 'desc' } },
      lotteryWins: { include: { lottery: true }, orderBy: { wonAt: 'desc' } },
      clickLogs: { include: { discountCode: true }, orderBy: { createdAt: 'desc' }, take: 50 },
    },
  });

  if (!user) return res.status(404).json({ success: false, error: 'کاربر یافت نشد' });

  const referralAggregate = await prisma.referral.aggregate({
    where: { referrerId: user.id },
    _count: true,
    _sum: { rewardPoints: true },
  });

  res.json(
    serializeBigInts({
      ...user,
      totalReferrals: referralAggregate._count,
      referralCount: referralAggregate._count,
      referralRewardPoints: referralAggregate._sum.rewardPoints || 0,
    })
  );
});

// بلاک: POST /api/users/:id/block
userRouter.post('/:id/block', async (req, res) => {
  const user = await userRepository.block(Number(req.params.id));
  res.json(serializeBigInts({ id: user.id, isBlocked: user.isBlocked }));
});

// آنبلاک: POST /api/users/:id/unblock
userRouter.post('/:id/unblock', async (req, res) => {
  const user = await userRepository.unblock(Number(req.params.id));
  res.json(serializeBigInts({ id: user.id, isBlocked: user.isBlocked }));
});

// مسیر قدیمی برای سازگاری
userRouter.patch('/:id/block', async (req, res) => {
  const id = Number(req.params.id);
  const { isBlocked } = z.object({ isBlocked: z.boolean() }).parse(req.body);
  const user = isBlocked ? await userRepository.block(id) : await userRepository.unblock(id);
  res.json(serializeBigInts({ id: user.id, isBlocked: user.isBlocked }));
});

// امتیاز دستی: POST /api/users/:id/grant
userRouter.post('/:id/grant', async (req, res) => {
  const id = Number(req.params.id);
  const { amount, description } = z
    .object({ amount: z.number().int(), description: z.string().optional() })
    .parse(req.body);

  await userRepository.addPoints(id, amount, PointLogType.ADMIN_GRANT, description || 'اعطای امتیاز دستی توسط ادمین');
  res.json({ success: true, message: `${amount} امتیاز برای کاربر ${id} ثبت شد` });
});

// مسیر قدیمی برای سازگاری
userRouter.post('/:id/points', async (req, res) => {
  const id = Number(req.params.id);
  const { amount, description } = z
    .object({ amount: z.number().int(), description: z.string().optional() })
    .parse(req.body);

  await userRepository.addPoints(id, amount, PointLogType.ADMIN_GRANT, description);
  res.json({ success: true, message: `${amount} امتیاز به کاربر ${id} داده شد` });
});
