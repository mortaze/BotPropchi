import { Router } from 'express';
import { analyticsService } from '../../services/analytics.service';
import { serializeBigInts } from '../../utils/serialize';
export const analyticsRouter = Router();
analyticsRouter.get('/dashboard', async (_req, res) => res.json({ success: true, data: serializeBigInts(await analyticsService.dashboard()) }));
