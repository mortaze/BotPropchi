import { Router } from 'express';
import { z } from 'zod';
import { aiSettingsService } from '../../services/ai-settings.service';
import { requireOwner } from '../middlewares/auth.middleware';

export const aiSettingsRouter = Router();

// GET /api/ai-settings -> Get current settings
aiSettingsRouter.get('/', requireOwner, async (_req, res) => {
  try {
    const settings = await aiSettingsService.getSettings();
    // Mask sensitive keys for frontend
    const maskedSettings = {
      ...settings,
      openrouterApiKey: settings.openrouterApiKey ? `${settings.openrouterApiKey.slice(0, 8)}...` : null,
      googlePrivateKey: settings.googlePrivateKey ? '********' : null,
    };
    res.json({ success: true, data: maskedSettings });
  } catch (error) {
    console.error('[AiSettings API] Error getting settings:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// POST /api/ai-settings -> Update settings
const updateSchema = z.object({
  openrouterApiKey: z.string().nullable().optional(),
  selectedModel: z.string().nullable().optional(),
  googleServiceAccountEmail: z.string().nullable().optional(),
  googlePrivateKey: z.string().nullable().optional(),
  googleSheetId: z.string().nullable().optional(),
  googleSheetMapping: z.record(z.string()).nullable().optional(),
});

aiSettingsRouter.post('/', requireOwner, async (req, res) => {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Invalid input' });
    }

    // Do not overwrite with masked values
    const updateData = { ...parsed.data };
    if (updateData.openrouterApiKey?.includes('...')) {
      delete updateData.openrouterApiKey;
    }
    if (updateData.googlePrivateKey === '********') {
      delete updateData.googlePrivateKey;
    }

    await aiSettingsService.updateSettings(updateData);
    res.json({ success: true, message: 'Settings updated successfully' });
  } catch (error) {
    console.error('[AiSettings API] Error updating settings:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/ai-settings/models -> Get available OpenRouter models
aiSettingsRouter.get('/models', requireOwner, async (_req, res) => {
  try {
    const settings = await aiSettingsService.getSettings();
    if (!settings.openrouterApiKey) {
      return res.status(400).json({ success: false, error: 'OpenRouter API Key not configured' });
    }

    const models = await aiSettingsService.getOpenRouterModels(settings.openrouterApiKey);
    res.json({ success: true, data: models });
  } catch (error: any) {
    console.error('[AiSettings API] Error getting models:', error);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

import { aiDataService } from '../../services/ai-data.service';

// GET /api/ai-settings/sheet-headers -> Get headers from Google Sheet
aiSettingsRouter.get('/sheet-headers', requireOwner, async (_req, res) => {
  try {
    const headers = await aiDataService.getSheetHeaders();
    res.json({ success: true, data: headers });
  } catch (error: any) {
    console.error('[AiSettings API] Error getting sheet headers:', error);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});
