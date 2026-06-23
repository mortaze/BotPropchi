import { Router } from 'express';
import { systemIntegrityService } from '../../services/system-integrity.service';
import { serializeBigInts } from '../../utils/serialize';
import { logger } from '../../utils/logger';

export const systemIntegrityRouter = Router();

function asyncHandler(fn: (req: any, res: any, next: any) => Promise<any>) {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      logger.error('[System Integrity Route] Error:', err);
      res.status(500).json({ success: false, error: 'خطا در دریافت گزارش' });
    });
  };
}

systemIntegrityRouter.get('/health', asyncHandler(async (_req, res) => {
  const data = await systemIntegrityService.getHealthReport();
  res.json({ success: true, data: serializeBigInts(data) });
}));

systemIntegrityRouter.get('/debug', asyncHandler(async (_req, res) => {
  const data = await systemIntegrityService.getDebugReport();
  res.json({ success: true, data: serializeBigInts(data) });
}));
