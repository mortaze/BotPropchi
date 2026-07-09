import { Router, Request, Response } from 'express';
import { automationService } from '../../services/automation.service';

const router = Router();

router.get('/dashboard', async (_req: Request, res: Response) => {
  try {
    const stats = await automationService.getDashboardStats();
    res.json({ success: true, data: stats });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/activity', async (req: Request, res: Response) => {
  try {
    const result = await automationService.getActivityLog({
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 50,
      eventType: req.query.eventType as string,
      source: req.query.source as string,
      status: req.query.status as string,
      from: req.query.from as string,
      to: req.query.to as string,
      search: req.query.search as string,
    });
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/analytics', async (_req: Request, res: Response) => {
  try {
    const data = await automationService.getAnalyticsSummary();
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export { router as automationRouter };
