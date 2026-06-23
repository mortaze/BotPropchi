import { Router } from 'express';
import { attributionService } from '../../services/attribution.service';
import { serializeBigInts } from '../../utils/serialize';
import { logger } from '../../utils/logger';

export const attributionRouter = Router();

function asyncHandler(fn: (req: any, res: any, next: any) => Promise<any>) {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      logger.error('[Attribution Route] Error:', err);
      res.status(500).json({ success: false, error: 'خطا در دریافت اطلاعات Attribution' });
    });
  };
}

// دریافت Attribution یک کاربر
attributionRouter.get('/user/:userId', asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.userId);
  if (isNaN(userId)) return res.status(400).json({ success: false, error: 'شناسه کاربر نامعتبر' });
  const attribution = await attributionService.getUserAttribution(userId);
  if (!attribution) return res.status(404).json({ success: false, error: 'Attribution یافت نشد' });
  res.json({ success: true, data: serializeBigInts(attribution) });
}));

// دریافت Attribution با TelegramId
attributionRouter.get('/telegram/:telegramId', asyncHandler(async (req, res) => {
  const telegramId = BigInt(req.params.telegramId);
  const attribution = await attributionService.getUserAttributionByTelegramId(telegramId);
  if (!attribution) return res.status(404).json({ success: false, error: 'Attribution یافت نشد' });
  res.json({ success: true, data: serializeBigInts(attribution) });
}));

// اعتبارسنجی Attribution
attributionRouter.get('/validate/:userId', asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.userId);
  if (isNaN(userId)) return res.status(400).json({ success: false, error: 'شناسه کاربر نامعتبر' });
  const validation = await attributionService.validateAttribution(userId);
  res.json({ success: true, data: validation });
}));

// لیست کاربران با Attribution کم اعتماد
attributionRouter.get('/low-confidence', asyncHandler(async (req, res) => {
  const minConfidence = parseInt(req.query.minConfidence as string) || 80;
  const limit = parseInt(req.query.limit as string) || 50;
  const users = await attributionService.getLowConfidenceUsers(minConfidence, limit);
  res.json({ success: true, data: serializeBigInts(users) });
}));
