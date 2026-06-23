import { Router } from 'express';
import { broadcastDiagnosticsService } from '../../services/broadcast-diagnostics.service';
import { serializeBigInts } from '../../utils/serialize';
import { logger } from '../../utils/logger';

export const broadcastDiagnosticsRouter = Router();

function asyncHandler(fn: (req: any, res: any, next: any) => Promise<any>) {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      logger.error('[Broadcast Diagnostics Route] Error:', err);
      res.status(500).json({ success: false, error: 'خطا در دریافت اطلاعات' });
    });
  };
}

// KPIهای کلی
broadcastDiagnosticsRouter.get('/kpis', asyncHandler(async (req, res) => {
  const broadcastId = req.query.broadcastId ? parseInt(req.query.broadcastId) : undefined;
  const data = await broadcastDiagnosticsService.getKPIs(broadcastId);
  res.json({ success: true, data: serializeBigInts(data) });
}));

// تاریخچه Broadcastها
broadcastDiagnosticsRouter.get('/history', asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const data = await broadcastDiagnosticsService.getBroadcastHistory({ page, limit });
  res.json({ success: true, data: serializeBigInts(data) });
}));

// جزئیات یک Broadcast
broadcastDiagnosticsRouter.get('/details/:broadcastId', asyncHandler(async (req, res) => {
  const broadcastId = parseInt(req.params.broadcastId);
  if (isNaN(broadcastId)) return res.status(400).json({ success: false, error: 'شناسه نامعتبر' });
  const data = await broadcastDiagnosticsService.getBroadcastDetails(broadcastId);
  if (!data) return res.status(404).json({ success: false, error: 'Broadcast یافت نشد' });
  res.json({ success: true, data: serializeBigInts(data) });
}));

// Data Integrity Audit
broadcastDiagnosticsRouter.get('/integrity', asyncHandler(async (_req, res) => {
  const data = await broadcastDiagnosticsService.runIntegrityAudit();
  res.json({ success: true, data: serializeBigInts(data) });
}));

// Dry Run
broadcastDiagnosticsRouter.get('/dry-run/:broadcastId', asyncHandler(async (req, res) => {
  const broadcastId = parseInt(req.params.broadcastId);
  if (isNaN(broadcastId)) return res.status(400).json({ success: false, error: 'شناسه نامعتبر' });
  const data = await broadcastDiagnosticsService.dryRun(broadcastId);
  if (!data) return res.status(404).json({ success: false, error: 'Broadcast یافت نشد' });
  res.json({ success: true, data: serializeBigInts(data) });
}));

// Validation: تحلیل نمونه‌های ناموفق
broadcastDiagnosticsRouter.get('/validate/:broadcastId', asyncHandler(async (req, res) => {
  const broadcastId = parseInt(req.params.broadcastId);
  if (isNaN(broadcastId)) return res.status(400).json({ success: false, error: 'شناسه نامعتبر' });
  const data = await broadcastDiagnosticsService.validateFailedSamples(broadcastId);
  res.json({ success: true, data: serializeBigInts(data) });
}));
