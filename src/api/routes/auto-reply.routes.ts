import { Router, Request, Response } from 'express';
import { autoReplyRepository } from '../../repositories/auto-reply.repository';
import { autoReplyService } from '../../services/auto-reply.service';
import { serializeBigInts } from '../../utils/serialize';

const router = Router();

// List auto replies
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const result = await autoReplyRepository.findAll({ page, limit });
    res.json({ success: true, ...serializeBigInts(result) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Dashboard stats
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await autoReplyService.getStats();
    res.json({ success: true, stats: serializeBigInts(stats) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single auto reply
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const ar = await autoReplyRepository.findById(id);
    if (!ar) return res.status(404).json({ success: false, error: 'یافت نشد' });
    res.json({ success: true, item: serializeBigInts(ar) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get delivery logs
router.get('/:id/logs', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const limit = parseInt(req.query.limit as string) || 50;
    const logs = await autoReplyService.getLogs(id, limit);
    res.json({ success: true, logs: serializeBigInts(logs) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export { router as autoReplyRoutes };
