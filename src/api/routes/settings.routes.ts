import { Router } from 'express';
import { z } from 'zod';
import { settingsService } from '../../services/settings.service';
import { requireOwner } from '../middlewares/auth.middleware';

export const settingsRouter = Router();

settingsRouter.get('/menus', async (req, res) => {
  const menus = await settingsService.getMenus(req.admin?.role);
  res.json({ success: true, items: menus });
});

settingsRouter.put('/menus/order', requireOwner, async (req, res) => {
  const parsed = z.object({ keys: z.array(z.string()).min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
  const menus = await settingsService.reorderMenus(parsed.data.keys);
  res.json({ success: true, items: menus });
});

settingsRouter.get('/mini-app', requireOwner, async (_req, res) => {
  res.json({ success: true, settings: await settingsService.getMiniAppContentSettings() });
});

settingsRouter.patch('/mini-app', requireOwner, async (req, res) => {
  const parsed = z.object({
    siteUrl: z.union([z.string().url(), z.literal('')]).optional(),
    aboutText: z.string().trim().max(5000).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
  res.json({ success: true, settings: await settingsService.updateMiniAppContentSettings(parsed.data) });
});

settingsRouter.get('/features', requireOwner, async (_req, res) => {
  res.json({ success: true, items: await settingsService.getFeatures() });
});

settingsRouter.patch('/features/:key', requireOwner, async (req, res) => {
  const parsed = z.object({ isEnabled: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
  res.json({ success: true, item: await settingsService.setFeature(req.params.key, parsed.data.isEnabled) });
});
