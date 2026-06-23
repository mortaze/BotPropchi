import { Router } from 'express';
import { userEventService, EVENT_TYPE_LABELS } from '../../services/user-event.service';
import { serializeBigInts } from '../../utils/serialize';
import { logger } from '../../utils/logger';

export const userEventRouter = Router();

function asyncHandler(fn: (req: any, res: any, next: any) => Promise<any>) {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      logger.error('[User Event Route] Error:', err);
      res.status(500).json({ success: false, error: 'خطا' });
    });
  };
}

// رویدادهای کاربر
userEventRouter.get('/:userId/events', asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.userId);
  if (isNaN(userId)) return res.status(400).json({ success: false, error: 'شناسه نامعتبر' });
  const { page, limit, eventType } = req.query;
  const data = await userEventService.getUserEvents(userId, {
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 50,
    eventType,
  });
  res.json({ success: true, data: serializeBigInts(data) });
}));

// پیام‌های کاربر
userEventRouter.get('/:userId/messages', asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.userId);
  if (isNaN(userId)) return res.status(400).json({ success: false, error: 'شناسه نامعتبر' });
  const { page, limit, messageType } = req.query;
  const data = await userEventService.getUserMessages(userId, {
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 50,
    messageType,
  });
  res.json({ success: true, data: serializeBigInts(data) });
}));

// Timeline کاربر
userEventRouter.get('/:userId/timeline', asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.userId);
  if (isNaN(userId)) return res.status(400).json({ success: false, error: 'شناسه نامعتبر' });
  const limit = parseInt(req.query.limit as string) || 100;
  const data = await userEventService.getUserTimeline(userId, limit);
  res.json({ success: true, data: serializeBigInts(data) });
}));

// لیست Event Types
userEventRouter.get('/meta/event-types', asyncHandler(async (_req, res) => {
  res.json({ success: true, data: EVENT_TYPE_LABELS });
}));
