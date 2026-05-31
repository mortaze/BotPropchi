import { SystemEventType } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { systemLogService } from '../../services/system-log.service';
import { serializeBigInts } from '../../utils/serialize';
export const systemLogRouter = Router();
systemLogRouter.get('/', async (req, res) => {
  const page = z.coerce.number().int().positive().default(1).parse(req.query.page ?? 1);
  const limit = z.coerce.number().int().positive().max(100).default(20).parse(req.query.limit ?? 20);
  const eventType = req.query.eventType ? z.nativeEnum(SystemEventType).parse(req.query.eventType) : undefined;
  const userId = req.query.userId ? z.coerce.number().int().positive().parse(req.query.userId) : undefined;
  const telegramId = req.query.telegramId ? String(req.query.telegramId) : undefined;
  const from = req.query.from ? new Date(String(req.query.from)) : undefined;
  const to = req.query.to ? new Date(String(req.query.to)) : undefined;
  res.json({ success: true, ...serializeBigInts(await systemLogService.list({ page, limit, eventType, userId, telegramId, from, to })) });
});
