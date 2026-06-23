import { Router } from 'express';
import { liveTestSend, liveTestGetChat, batchTraceTest, setBotInstanceForTrace } from '../../services/broadcast-trace.service';
import { serializeBigInts } from '../../utils/serialize';
import { logger } from '../../utils/logger';
import { Telegraf } from 'telegraf';

export function createBroadcastTraceRouter(bot?: Telegraf) {
  const router = Router();
  if (bot) setBotInstanceForTrace(bot);

  function asyncHandler(fn: (req: any, res: any, next: any) => Promise<any>) {
    return (req: any, res: any, next: any) => {
      Promise.resolve(fn(req, res, next)).catch((err) => {
        logger.error('[Broadcast Trace Route] Error:', err);
        res.status(500).json({ success: false, error: err.message || 'خطا' });
      });
    };
  }

  // Live test: send real message to a user
  router.post('/live-test/:userId', asyncHandler(async (req, res) => {
    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) return res.status(400).json({ success: false, error: 'شناسه نامعتبر' });
    const result = await liveTestSend(userId);
    res.json({ success: true, data: serializeBigInts(result) });
  }));

  // getChat test: verify user exists on Telegram
  router.post('/get-chat/:userId', asyncHandler(async (req, res) => {
    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) return res.status(400).json({ success: false, error: 'شناسه نامعتبر' });
    const result = await liveTestGetChat(userId);
    res.json({ success: true, data: serializeBigInts(result) });
  }));

  // Batch trace: test 10 success + 10 failed
  router.post('/batch-trace', asyncHandler(async (_req, res) => {
    const result = await batchTraceTest();
    res.json({ success: true, data: serializeBigInts(result) });
  }));

  return router;
}
