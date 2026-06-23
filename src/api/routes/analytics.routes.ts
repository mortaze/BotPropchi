import { Router } from 'express';
import { analyticsService } from '../../services/analytics.service';
import { serializeBigInts } from '../../utils/serialize';
import { logger } from '../../utils/logger';

export const analyticsRouter = Router();

function asyncHandler(fn: (req: any, res: any, next: any) => Promise<any>) {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      logger.error('[Analytics Route] Error:', err);
      res.status(500).json({ success: false, error: 'خطا در دریافت آمار' });
    });
  };
}

analyticsRouter.get('/dashboard', asyncHandler(async (_req, res) => {
  const data = serializeBigInts(await analyticsService.dashboard());
  res.json({ success: true, data });
}));

analyticsRouter.get('/users', asyncHandler(async (req, res) => {
  const { startDate, endDate, compareStart, compareEnd } = req.query as Record<string, string | undefined>;
  const now = new Date();
  const sDate = startDate || new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const eDate = endDate || now.toISOString().slice(0, 10);
  const data = await analyticsService.userAnalytics({
    startDate: sDate,
    endDate: eDate,
    compareStart,
    compareEnd,
  });
  res.json({ success: true, data: serializeBigInts(data) });
}));

analyticsRouter.get('/acquisition', asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query as Record<string, string | undefined>;
  const now = new Date();
  const sDate = startDate || new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const eDate = endDate || now.toISOString().slice(0, 10);
  const data = await analyticsService.acquisitionSources({
    startDate: sDate,
    endDate: eDate,
  });
  res.json({ success: true, data: serializeBigInts(data) });
}));

analyticsRouter.get('/heatmap', asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query as Record<string, string | undefined>;
  const now = new Date();
  const sDate = startDate || new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const eDate = endDate || now.toISOString().slice(0, 10);
  const data = await analyticsService.activityHeatmap({
    startDate: sDate,
    endDate: eDate,
  });
  res.json({ success: true, data: serializeBigInts(data) });
}));

analyticsRouter.post('/invalidate-cache', asyncHandler(async (_req, res) => {
  await analyticsService.invalidateCache();
  res.json({ success: true, message: 'Cache invalidated' });
}));
