import { Router } from 'express';
import { z } from 'zod';
import { forcedMembershipSettingsService } from '../../services/membership/forcedMembership.service';
import { membershipService } from '../../services/membership/membership.service';
import { authMiddleware } from '../middlewares/auth.middleware';
import { requireOwner } from '../middlewares/auth.middleware';

const settingsSchema = z.object({
  enabled: z.boolean().optional(),
  channelId: z.string().trim().optional(),
  warningMessage: z.string().trim().min(1).max(2000).optional(),
  helpMessage: z.string().trim().min(1).max(2000).optional(),
  joinButtonText: z.string().trim().min(1).max(100).optional(),
});

export const forcedMembershipRouter = Router();

forcedMembershipRouter.use(authMiddleware);

forcedMembershipRouter.get('/settings', async (_req, res) => {
  try {
    const settings = await forcedMembershipSettingsService.getSettings();
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch settings' });
  }
});

forcedMembershipRouter.post('/settings', requireOwner, async (req, res) => {
  try {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const settings = await forcedMembershipSettingsService.updateSettings(parsed.data);
    forcedMembershipSettingsService.invalidateCache();
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to update settings' });
  }
});

forcedMembershipRouter.put('/settings', requireOwner, async (req, res) => {
  try {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const settings = await forcedMembershipSettingsService.updateSettings(parsed.data);
    forcedMembershipSettingsService.invalidateCache();
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to update settings' });
  }
});

forcedMembershipRouter.post('/invalidate-cache', requireOwner, async (_req, res) => {
  try {
    await membershipService.invalidateAllCache();
    forcedMembershipSettingsService.invalidateCache();
    res.json({ success: true, message: 'Cache invalidated' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to invalidate cache' });
  }
});
