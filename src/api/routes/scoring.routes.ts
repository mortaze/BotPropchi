import { Router } from 'express';
import { z } from 'zod';
import { scoringService } from '../../services/scoring.service';

export const scoringRouter = Router();

const schema = z.object({
  startPoints: z.coerce.number().int().min(0).optional(),
  channelJoinPoints: z.coerce.number().int().min(0).optional(),
  futureActivityPoints: z.coerce.number().int().min(0).optional(),
  dailyActivityPoints: z.coerce.number().int().min(0).optional(),
  linkClickPoints: z.coerce.number().int().min(0).optional(),
  referralRewardPoints: z.coerce.number().int().min(0).optional(),
  profileCompletionPoints: z.coerce.number().int().min(0).optional(),
  welcomeMessageText: z.string().min(1).optional(),
  initialPointsMessageText: z.string().min(1).optional(),
  isWelcomeMessageEnabled: z.boolean().optional(),
});

scoringRouter.get('/settings', async (_req, res) => {
  res.json({ success: true, item: await scoringService.getSettings() });
});

scoringRouter.patch('/settings', async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
  res.json({ success: true, item: await scoringService.updateSettings(parsed.data) });
});
