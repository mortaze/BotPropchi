import { Router } from 'express';
import { z } from 'zod';
import { forceJoinService } from '../../services/forceJoin.service';
import { authMiddleware, requireOwner } from '../middlewares/auth.middleware';

const settingsSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  welcomeMessage: z.string().trim().min(1).max(2000).optional(),
  notJoinedMessage: z.string().trim().min(1).max(2000).optional(),
  joinButtonText: z.string().trim().min(1).max(200).optional(),
  checkMembershipButtonText: z.string().trim().min(1).max(200).optional(),
  successJoinMessage: z.string().trim().min(1).max(2000).optional(),
  errorMessage: z.string().trim().min(1).max(2000).optional(),
  retryMessage: z.string().trim().min(1).max(2000).optional(),
  emptyChannelsMessage: z.string().trim().min(1).max(2000).optional(),
});

export const forceJoinRouter = Router();

forceJoinRouter.use(authMiddleware);

forceJoinRouter.get('/settings', async (_req, res) => {
  try {
    const settings = await forceJoinService.getSettings();
    res.json({ success: true, data: settings });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch force join settings' });
  }
});

forceJoinRouter.put('/settings', requireOwner, async (req, res) => {
  try {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const settings = await forceJoinService.updateSettings(parsed.data);
    forceJoinService.invalidateCache();
    res.json({ success: true, data: settings });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to update force join settings' });
  }
});

forceJoinRouter.post('/settings/reset', requireOwner, async (_req, res) => {
  try {
    const settings = await forceJoinService.resetToDefaults();
    forceJoinService.invalidateCache();
    res.json({ success: true, data: settings });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to reset settings' });
  }
});
