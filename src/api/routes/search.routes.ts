import { Router } from 'express';
import { prisma } from '../../prisma/client';
import { serializeBigInts } from '../../utils/serialize';
import { logger } from '../../utils/logger';
import { Prisma } from '@prisma/client';

export const searchRouter = Router();

function asyncHandler(fn: (req: any, res: any, next: any) => Promise<any>) {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      logger.error('[Search Route] Error:', err);
      res.status(500).json({ success: false, error: 'خطا در جستجو' });
    });
  };
}

function paginate(page?: string, limit?: string) {
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Math.max(1, Number(limit) || 20));
  return { skip: (p - 1) * l, take: l, page: p, limit: l };
}

searchRouter.get('/users', asyncHandler(async (req, res) => {
  const { q, sortKey, sortDir, filter_telegramId, filter_username, filter_firstName, filter_phoneNumber, filter_isBlocked, filter_profileCompleted } = req.query as Record<string, string | undefined>;
  const { skip, take, page, limit } = paginate(req.query.page as string, req.query.limit as string);

  const where: Prisma.UserWhereInput = {};
  const OR: Prisma.UserWhereInput[] = [];

  if (q) {
    try {
      const tid = BigInt(q);
      OR.push({ telegramId: { equals: tid } });
    } catch { /* not a valid BigInt */ }
    OR.push(
      { username: { contains: q, mode: 'insensitive' } },
      { firstName: { contains: q, mode: 'insensitive' } },
      { phoneNumber: { contains: q } },
    );
  }
  if (filter_telegramId) {
    try { where.telegramId = { equals: BigInt(filter_telegramId) }; } catch { /* ignore */ }
  }
  if (filter_username) where.username = { contains: filter_username, mode: 'insensitive' };
  if (filter_firstName) where.firstName = { contains: filter_firstName, mode: 'insensitive' };
  if (filter_phoneNumber) where.phoneNumber = { contains: filter_phoneNumber };
  if (filter_isBlocked === 'true' || filter_isBlocked === 'false') where.isBlocked = filter_isBlocked === 'true';
  if (filter_profileCompleted === 'true' || filter_profileCompleted === 'false') where.profileCompleted = filter_profileCompleted === 'true';

  if (OR.length > 0) where.OR = OR;

  const validSortKeys = ['id', 'telegramId', 'username', 'firstName', 'createdAt', 'points', 'isBlocked'];
  const orderBy: any = validSortKeys.includes(sortKey || '')
    ? { [sortKey!]: sortDir === 'asc' ? 'asc' : 'desc' }
    : { createdAt: 'desc' };

  const [items, total] = await Promise.all([
    prisma.user.findMany({ where, skip, take, orderBy, select: { id: true, telegramId: true, username: true, firstName: true, lastName: true, phoneNumber: true, points: true, isBlocked: true, profileCompleted: true, createdAt: true } }),
    prisma.user.count({ where }),
  ]);

  res.json(serializeBigInts({ success: true, items, total, pages: Math.ceil(total / limit) }));
}));

searchRouter.get('/broadcasts', asyncHandler(async (req, res) => {
  const { q, sortKey, sortDir, filter_title, filter_status } = req.query as Record<string, string | undefined>;
  const { skip, take, page, limit } = paginate(req.query.page as string, req.query.limit as string);

  const where: Prisma.BroadcastWhereInput = {};
  if (q) where.OR = [
    { title: { contains: q, mode: 'insensitive' } },
  ];
  if (filter_title) where.title = { contains: filter_title, mode: 'insensitive' };
  if (filter_status) where.status = filter_status as any;

  const validSortKeys = ['id', 'title', 'status', 'createdAt', 'scheduledAt'];
  const orderBy: any = validSortKeys.includes(sortKey || '')
    ? { [sortKey!]: sortDir === 'asc' ? 'asc' : 'desc' }
    : { createdAt: 'desc' };

  const [items, total] = await Promise.all([
    prisma.broadcast.findMany({ where, skip, take, orderBy }),
    prisma.broadcast.count({ where }),
  ]);
  res.json(serializeBigInts({ success: true, items, total, pages: Math.ceil(total / limit) }));
}));

searchRouter.get('/feature-toggles', asyncHandler(async (req, res) => {
  const { q, sortKey, sortDir, filter_key, filter_label } = req.query as Record<string, string | undefined>;
  const { skip, take, page, limit } = paginate(req.query.page as string, req.query.limit as string);

  const where: Prisma.FeatureToggleWhereInput = {};
  if (q) where.OR = [
    { key: { contains: q, mode: 'insensitive' } },
    { label: { contains: q, mode: 'insensitive' } },
  ];
  if (filter_key) where.key = { contains: filter_key, mode: 'insensitive' };
  if (filter_label) where.label = { contains: filter_label, mode: 'insensitive' };

  const validSortKeys = ['id', 'key', 'label', 'isEnabled'];
  const orderBy: any = validSortKeys.includes(sortKey || '')
    ? { [sortKey!]: sortDir === 'asc' ? 'asc' : 'desc' }
    : { id: 'asc' };

  const [items, total] = await Promise.all([
    prisma.featureToggle.findMany({ where, skip, take, orderBy }),
    prisma.featureToggle.count({ where }),
  ]);
  res.json({ success: true, items, total, pages: Math.ceil(total / limit) });
}));

searchRouter.get('/settings', asyncHandler(async (req, res) => {
  const { q, sortKey, sortDir, filter_key, filter_value } = req.query as Record<string, string | undefined>;
  const { skip, take, page, limit } = paginate(req.query.page as string, req.query.limit as string);

  const where: Prisma.SystemSettingWhereInput = {};
  if (q) where.OR = [
    { key: { contains: q, mode: 'insensitive' } },
  ];
  if (filter_key) where.key = { contains: filter_key, mode: 'insensitive' };

  const validSortKeys = ['id', 'key'];
  const orderBy: any = validSortKeys.includes(sortKey || '')
    ? { [sortKey!]: sortDir === 'asc' ? 'asc' : 'desc' }
    : { id: 'asc' };

  const [items, total] = await Promise.all([
    prisma.systemSetting.findMany({ where, skip, take, orderBy }),
    prisma.systemSetting.count({ where }),
  ]);
  res.json({ success: true, items, total, pages: Math.ceil(total / limit) });
}));

searchRouter.get('/posts', asyncHandler(async (req, res) => {
  const { q, sortKey, sortDir, filter_title, filter_status } = req.query as Record<string, string | undefined>;
  const { skip, take, page, limit } = paginate(req.query.page as string, req.query.limit as string);

  const where: Prisma.PostWhereInput = {};
  if (q) where.OR = [
    { title: { contains: q, mode: 'insensitive' } },
    { slug: { contains: q, mode: 'insensitive' } },
  ];
  if (filter_title) where.title = { contains: filter_title, mode: 'insensitive' };
  if (filter_status) where.status = filter_status as any;

  const validSortKeys = ['id', 'title', 'status', 'createdAt', 'sortOrder'];
  const orderBy: any = validSortKeys.includes(sortKey || '')
    ? { [sortKey!]: sortDir === 'asc' ? 'asc' : 'desc' }
    : { createdAt: 'desc' };

  const [items, total] = await Promise.all([
    prisma.post.findMany({ where, skip, take, orderBy, select: { id: true, title: true, slug: true, status: true, isPublished: true, createdAt: true, updatedAt: true } }),
    prisma.post.count({ where }),
  ]);
  res.json({ success: true, items, total, pages: Math.ceil(total / limit) });
}));

searchRouter.get('/referrals', asyncHandler(async (req, res) => {
  const { q, sortKey, sortDir } = req.query as Record<string, string | undefined>;
  const { skip, take, page, limit } = paginate(req.query.page as string, req.query.limit as string);

  const where: Prisma.ReferralWhereInput = {};
  if (q) {
    where.OR = [
      { referrer: { username: { contains: q, mode: 'insensitive' } } },
      { referredUser: { username: { contains: q, mode: 'insensitive' } } },
      { referrer: { firstName: { contains: q, mode: 'insensitive' } } },
      { referredUser: { firstName: { contains: q, mode: 'insensitive' } } },
    ];
  }

  const validSortKeys = ['id', 'createdAt', 'rewardPoints'];
  const orderBy: any = validSortKeys.includes(sortKey || '')
    ? { [sortKey!]: sortDir === 'asc' ? 'asc' : 'desc' }
    : { createdAt: 'desc' };

  const [items, total] = await Promise.all([
    prisma.referral.findMany({
      where, skip, take, orderBy,
      include: {
        referrer: { select: { id: true, telegramId: true, username: true, firstName: true, lastName: true } },
        referredUser: { select: { id: true, telegramId: true, username: true, firstName: true, lastName: true } },
      },
    }),
    prisma.referral.count({ where }),
  ]);
  res.json(serializeBigInts({ success: true, items, total, pages: Math.ceil(total / limit) }));
}));

searchRouter.get('/bot-admins', asyncHandler(async (req, res) => {
  const { q, sortKey, sortDir, filter_username, filter_role } = req.query as Record<string, string | undefined>;
  const { skip, take, page, limit } = paginate(req.query.page as string, req.query.limit as string);

  const where: Prisma.BotAdminWhereInput = {};
  if (q) where.OR = [
    { username: { contains: q, mode: 'insensitive' } },
    { firstName: { contains: q, mode: 'insensitive' } },
  ];
  if (filter_username) where.username = { contains: filter_username, mode: 'insensitive' };
  if (filter_role) where.role = filter_role as any;

  const validSortKeys = ['id', 'username', 'role', 'status', 'createdAt'];
  const orderBy: any = validSortKeys.includes(sortKey || '')
    ? { [sortKey!]: sortDir === 'asc' ? 'asc' : 'desc' }
    : { createdAt: 'desc' };

  const [items, total] = await Promise.all([
    prisma.botAdmin.findMany({ where, skip, take, orderBy }),
    prisma.botAdmin.count({ where }),
  ]);
  res.json(serializeBigInts({ success: true, items, total, pages: Math.ceil(total / limit) }));
}));

searchRouter.get('/prop-firms', asyncHandler(async (req, res) => {
  const { q, sortKey, sortDir } = req.query as Record<string, string | undefined>;
  const { skip, take, page, limit } = paginate(req.query.page as string, req.query.limit as string);

  const where: Prisma.PropFirmWhereInput = {};
  if (q) where.OR = [
    { name: { contains: q, mode: 'insensitive' } },
    { slug: { contains: q, mode: 'insensitive' } },
  ];

  const validSortKeys = ['id', 'name', 'isActive', 'createdAt'];
  const orderBy: any = validSortKeys.includes(sortKey || '')
    ? { [sortKey!]: sortDir === 'asc' ? 'asc' : 'desc' }
    : { name: 'asc' };

  const [items, total] = await Promise.all([
    prisma.propFirm.findMany({ where, skip, take, orderBy, include: { _count: { select: { discountCodes: true } } } }),
    prisma.propFirm.count({ where }),
  ]);
  res.json({ success: true, items, total, pages: Math.ceil(total / limit) });
}));

searchRouter.get('/lotteries', asyncHandler(async (req, res) => {
  const { q, sortKey, sortDir, filter_status } = req.query as Record<string, string | undefined>;
  const { skip, take, page, limit } = paginate(req.query.page as string, req.query.limit as string);

  const where: Prisma.LotteryWhereInput = {};
  if (q) where.OR = [
    { title: { contains: q, mode: 'insensitive' } },
    { prize: { contains: q, mode: 'insensitive' } },
  ];
  if (filter_status === 'active') where.isActive = true;
  else if (filter_status === 'completed') where.isCompleted = true;
  else if (filter_status === 'inactive') where.isActive = false;

  const validSortKeys = ['id', 'title', 'startAt', 'endAt', 'createdAt'];
  const orderBy: any = validSortKeys.includes(sortKey || '')
    ? { [sortKey!]: sortDir === 'asc' ? 'asc' : 'desc' }
    : { createdAt: 'desc' };

  const [items, total] = await Promise.all([
    prisma.lottery.findMany({ where, skip, take, orderBy, include: { _count: { select: { entries: true, winners: true } } } }),
    prisma.lottery.count({ where }),
  ]);
  res.json({ success: true, items, total, pages: Math.ceil(total / limit) });
}));
