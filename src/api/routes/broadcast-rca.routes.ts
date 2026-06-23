import { Router } from 'express';
import { broadcastRcaService } from '../../services/broadcast-rca.service';
import { serializeBigInts } from '../../utils/serialize';
import { logger } from '../../utils/logger';

export const broadcastRcaRouter = Router();

function asyncHandler(fn: (req: any, res: any, next: any) => Promise<any>) {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      logger.error('[Broadcast RCA Route] Error:', err);
      res.status(500).json({ success: false, error: 'خطا در Root Cause Analysis' });
    });
  };
}

// آنالیز کامل خطاهای یک Broadcast
broadcastRcaRouter.get('/analyze/:broadcastId', asyncHandler(async (req, res) => {
  const broadcastId = parseInt(req.params.broadcastId);
  if (isNaN(broadcastId)) return res.status(400).json({ success: false, error: 'شناسه نامعتبر' });
  const data = await broadcastRcaService.analyzeBroadcastErrors(broadcastId);
  res.json({ success: true, data: serializeBigInts(data) });
}));

// Data Integrity Report
broadcastRcaRouter.get('/integrity', asyncHandler(async (_req, res) => {
  const data = await broadcastRcaService.getDataIntegrityReport();
  res.json({ success: true, data: serializeBigInts(data) });
}));

// Error Explorer
broadcastRcaRouter.get('/explorer/:broadcastId/:category', asyncHandler(async (req, res) => {
  const broadcastId = parseInt(req.params.broadcastId);
  const category = req.params.category;
  if (isNaN(broadcastId)) return res.status(400).json({ success: false, error: 'شناسه نامعتبر' });
  const data = await broadcastRcaService.getErrorExplorer(broadcastId, category);
  res.json({ success: true, data: serializeBigInts(data) });
}));

// کاربران مشکوک به مشکل سیستمی
broadcastRcaRouter.get('/system-errors', asyncHandler(async (req, res) => {
  const broadcastId = req.query.broadcastId ? parseInt(req.query.broadcastId as string) : undefined;
  const data = await broadcastRcaService.getSystemErrorUsers(broadcastId);
  res.json({ success: true, data: serializeBigInts(data) });
}));
