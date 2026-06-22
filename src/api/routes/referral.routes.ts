import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../prisma/client';
import { referralService } from '../../services/referral.service';
import { DEFAULT_BOT_USERNAME } from '../../constants';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { serializeBigInts } from '../../utils/serialize';

export const referralRouter = Router();

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  q: z.string().trim().optional(),
  referrerId: z.coerce.number().int().positive().optional(),
});

const meQuerySchema = z.object({
  userId: z.coerce.number().int().positive().optional(),
  telegramId: z.string().regex(/^\d+$/).optional(),
  botUsername: z.string().trim().min(1).optional(),
}).refine((data) => data.userId || data.telegramId, { message: 'userId یا telegramId الزامی است' });

const settingsSchema = z.object({
  inviteRewardPoints: z.coerce.number().int().min(0).max(100000).optional(),
  isEnabled: z.boolean().optional(),
  referralShareText: z.string().optional(),
}).refine((data) => data.inviteRewardPoints !== undefined || data.isEnabled !== undefined || data.referralShareText !== undefined, {
  message: 'حداقل یکی از فیلدهای تنظیمات باید ارسال شود',
});

referralRouter.get('/me', async (req, res) => {
  try {
    const parsed = meQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });

    const user = parsed.data.userId
      ? await prisma.user.findUnique({ where: { id: parsed.data.userId } })
      : await prisma.user.findUnique({ where: { telegramId: BigInt(parsed.data.telegramId!) } });

    if (!user) return res.status(404).json({ success: false, error: 'کاربر یافت نشد' });

    const result = await referralService.getMe(user.id, parsed.data.botUsername || process.env.BOT_USERNAME || DEFAULT_BOT_USERNAME);
    logger.info(`Referral me requested for userId=${user.id}`);
    return res.json({ success: true, data: serializeBigInts(result) });
  } catch (error: any) {
    logger.error('❌ GET REFERRAL ME ERROR', error);
    return res.status(500).json({ success: false, error: error.message || 'خطا در دریافت اطلاعات دعوت' });
  }
});

referralRouter.get('/share-text', async (_req, res) => {
  try {
    const shareText = await referralService.getShareText();
    return res.json({ success: true, data: { shareText } });
  } catch (error: any) {
    logger.error('❌ GET REFERRAL SHARE TEXT ERROR', error);
    return res.status(500).json({ success: false, error: error.message || 'خطا در دریافت متن اشتراک‌گذاری' });
  }
});

referralRouter.get('/stats', async (_req, res) => {
  try {
    const stats = await referralService.getStats();
    logger.info('Referral stats requested');
    return res.json({ success: true, data: serializeBigInts(stats) });
  } catch (error: any) {
    logger.error('❌ GET REFERRAL STATS ERROR', error);
    return res.status(500).json({ success: false, error: error.message || 'خطا در دریافت آمار دعوت' });
  }
});

referralRouter.get('/leaderboard', async (req, res) => {
  try {
    const limit = z.coerce.number().int().positive().max(100).default(10).parse(req.query.limit ?? 10);
    const leaderboard = await referralService.getLeaderboard(limit);
    logger.info(`Referral leaderboard requested limit=${limit}`);
    return res.json({ success: true, data: serializeBigInts(leaderboard) });
  } catch (error: any) {
    logger.error('❌ GET REFERRAL LEADERBOARD ERROR', error);
    return res.status(500).json({ success: false, error: error.message || 'خطا در دریافت لیدربورد دعوت' });
  }
});

referralRouter.get('/admin', async (req, res) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });

    const result = await referralService.getAdminList(parsed.data);
    logger.info(`Referral admin list requested page=${parsed.data.page}`);
    return res.json({ success: true, ...serializeBigInts(result) });
  } catch (error: any) {
    logger.error('❌ GET REFERRAL ADMIN ERROR', error);
    return res.status(500).json({ success: false, error: error.message || 'خطا در دریافت لیست دعوت‌ها' });
  }
});

referralRouter.patch('/settings', async (req, res) => {
  try {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });

    const settings = await referralService.updateSettings(parsed.data);
    logger.info(`Referral settings updated by admin=${req.admin?.username || 'unknown'}`);
    return res.json({ success: true, settings: serializeBigInts(settings) });
  } catch (error: any) {
    logger.error('❌ PATCH REFERRAL SETTINGS ERROR', error);
    return res.status(500).json({ success: false, error: error.message || 'خطا در ذخیره تنظیمات دعوت' });
  }
});
