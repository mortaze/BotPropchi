import { Router } from 'express';
import { z } from 'zod';
import { settingsService } from '../../services/settings.service';
import { requireOwner } from '../middlewares/auth.middleware';

export const settingsRouter = Router();

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

settingsRouter.get('/services', requireOwner, async (_req, res) => {
  res.json({ success: true, items: await settingsService.getServices() });
});

settingsRouter.patch('/features/:key', requireOwner, async (req, res) => {
  const parsed = z.object({ isEnabled: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
  res.json({ success: true, item: await settingsService.setFeature(req.params.key, parsed.data.isEnabled) });
});

settingsRouter.patch('/services/:key', requireOwner, async (req, res) => {
  const parsed = z.object({ isEnabled: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
  res.json({ success: true, item: await settingsService.setFeature(req.params.key, parsed.data.isEnabled) });
});

settingsRouter.get('/menu-display-mode', requireOwner, async (_req, res) => {
  const mode = await settingsService.getMenuDisplayMode();
  res.json({ success: true, mode });
});

settingsRouter.put('/menu-display-mode', requireOwner, async (req, res) => {
  const parsed = z.object({ mode: z.enum(['always_open', 'toggle_allowed']) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
  await settingsService.setMenuDisplayMode(parsed.data.mode);
  res.json({ success: true, mode: parsed.data.mode });
});
