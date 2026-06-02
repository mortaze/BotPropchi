import { Router } from 'express';
import { z } from 'zod';
import { miniAppLogService } from '../../services/mini-app-log.service';
import { serializeBigInts } from '../../utils/serialize';

export const miniAppLogRouter = Router();

miniAppLogRouter.get('/', async (req, res) => {
  const page = z.coerce.number().int().positive().default(1).parse(req.query.page ?? 1);
  const limit = z.coerce.number().int().positive().max(100).default(50).parse(req.query.limit ?? 50);
  const eventType = req.query.eventType ? String(req.query.eventType) : undefined;
  const telegramId = req.query.telegramId ? String(req.query.telegramId) : undefined;
  const from = req.query.from ? new Date(String(req.query.from)) : undefined;
  const to = req.query.to ? new Date(String(req.query.to)) : undefined;
  res.json({ success: true, ...serializeBigInts(await miniAppLogService.list({ page, limit, eventType, telegramId, from, to })) });
});

miniAppLogRouter.get('/report', async (_req, res) => {
  res.json({ success: true, data: serializeBigInts(await miniAppLogService.report()) });
});
