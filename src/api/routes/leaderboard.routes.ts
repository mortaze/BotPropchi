import { Router } from 'express';
import { z } from 'zod';
import { leaderboardService } from '../../services/leaderboard.service';
import { logger } from '../../utils/logger';
import { serializeBigInts } from '../../utils/serialize';

export const leaderboardRouter = Router();

leaderboardRouter.get('/seasons', async (_req, res) => {
  try {
    const seasons = await leaderboardService.listSeasons();
    return res.json({ success: true, data: serializeBigInts(seasons) });
  } catch (error: any) {
    logger.error('GET SEASONS ERROR', error);
    return res.status(500).json({ success: false, error: error.message || 'خطا در دریافت فصل‌ها' });
  }
});

leaderboardRouter.get('/seasons/active', async (_req, res) => {
  try {
    const season = await leaderboardService.getActiveSeason();
    return res.json({ success: true, data: serializeBigInts(season) });
  } catch (error: any) {
    logger.error('GET ACTIVE SEASON ERROR', error);
    return res.status(500).json({ success: false, error: error.message || 'خطا در دریافت فصل فعال' });
  }
});

leaderboardRouter.post('/seasons/:id/activate', async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const season = await leaderboardService.activateSeason(id);
    logger.info(`Season #${id} activated by admin`);
    return res.json({ success: true, data: serializeBigInts(season) });
  } catch (error: any) {
    logger.error('ACTIVATE SEASON ERROR', error);
    return res.status(500).json({ success: false, error: error.message || 'خطا در فعال‌سازی فصل' });
  }
});

leaderboardRouter.get('/seasons/:id/search', async (req, res) => {
  try {
    const seasonId = z.coerce.number().int().positive().parse(req.params.id);
    const q = z.string().min(1).max(100).parse(req.query.q);
    const results = await leaderboardService.searchUserInLeaderboard(seasonId, q);
    return res.json({ success: true, data: serializeBigInts(results) });
  } catch (error: any) {
    logger.error('SEARCH LEADERBOARD ERROR', error);
    return res.status(500).json({ success: false, error: error.message || 'خطا در جستجوی لیدربورد' });
  }
});

leaderboardRouter.post('/seasons', async (req, res) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(100),
      startDate: z.coerce.date(),
      endDate: z.coerce.date(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });

    const season = await leaderboardService.createSeason(parsed.data as { name: string; startDate: Date; endDate: Date });
    logger.info(`Season created by admin: #${season.id}`);
    return res.json({ success: true, data: serializeBigInts(season) });
  } catch (error: any) {
    logger.error('CREATE SEASON ERROR', error);
    return res.status(500).json({ success: false, error: error.message || 'خطا در ایجاد فصل' });
  }
});

leaderboardRouter.post('/seasons/:id/end', async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await leaderboardService.endSeason(id);
    logger.info(`Season #${id} ended by admin`);
    return res.json({ success: true, message: 'فصل با موفقیت به پایان رسید' });
  } catch (error: any) {
    logger.error('END SEASON ERROR', error);
    return res.status(500).json({ success: false, error: error.message || 'خطا در پایان فصل' });
  }
});

leaderboardRouter.get('/seasons/:id/leaderboard', async (req, res) => {
  try {
    const seasonId = z.coerce.number().int().positive().parse(req.params.id);
    const limit = z.coerce.number().int().positive().max(100).default(10).parse(req.query.limit ?? 10);
    const [leaderboard, stats] = await Promise.all([
      leaderboardService.getLeaderboard(seasonId, limit),
      leaderboardService.getLeaderboardStats(seasonId),
    ]);
    return res.json({ success: true, data: serializeBigInts({ leaderboard, stats }) });
  } catch (error: any) {
    logger.error('GET SEASON LEADERBOARD ERROR', error);
    return res.status(500).json({ success: false, error: error.message || 'خطا در دریافت لیدربورد فصل' });
  }
});
