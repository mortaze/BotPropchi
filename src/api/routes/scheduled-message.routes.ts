import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { scheduledMessageRepository } from '../../repositories/scheduled-message.repository';
import { scheduledMessageService } from '../../services/scheduled-message.service';

const router = Router();

// List scheduled messages
router.get('/', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string | undefined;
    const result = await scheduledMessageRepository.findAll({ page, limit, status: status as any });
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Dashboard stats
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await scheduledMessageService.getStats();
    res.json({ success: true, stats });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single scheduled message
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const msg = await scheduledMessageRepository.findById(id);
    if (!msg) return res.status(404).json({ success: false, error: 'یافت نشد' });
    res.json({ success: true, message: msg });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get delivery logs
router.get('/:id/logs', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const limit = parseInt(req.query.limit as string) || 50;
    const logs = await scheduledMessageService.getLogs(id, limit);
    res.json({ success: true, logs });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create
router.post('/', async (req: Request, res: Response) => {
  try {
    const schema = z.object({ title: z.string().min(1) });
    const data = schema.parse(req.body);
    const msg = await scheduledMessageService.create({ title: data.title });
    res.json({ success: true, message: msg });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Update
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const schema = z.object({ title: z.string().min(1).optional() });
    const data = schema.parse(req.body);
    const msg = await scheduledMessageService.update(id, data);
    res.json({ success: true, message: msg });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Delete
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    await scheduledMessageService.delete(id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Toggle publish
router.patch('/:id/toggle', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const msg = await scheduledMessageRepository.findById(id);
    if (!msg) return res.status(404).json({ success: false, error: 'یافت نشد' });

    if (msg.isPublished) {
      await scheduledMessageService.unpublish(id);
    } else {
      await scheduledMessageService.publish(id);
    }

    const updated = await scheduledMessageRepository.findById(id);
    res.json({ success: true, message: updated });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Emergency stop
router.post('/emergency-stop', async (req: Request, res: Response) => {
  try {
    await scheduledMessageService.emergencyStop();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export { router as scheduledMessageRoutes };
