import { Router } from 'express';
import { analyticsService } from '../../services/analytics.service';
import { serializeBigInts } from '../../utils/serialize';
export const analyticsRouter = Router();
analyticsRouter.get('/dashboard', async (_req, res) => res.json({ success: true, data: serializeBigInts(await analyticsService.dashboard()) }));

analyticsRouter.get('/users', async (req, res) => {
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
});
