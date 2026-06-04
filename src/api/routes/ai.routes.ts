import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { Telegraf } from 'telegraf';
import { aiService, AiServiceError } from '../../services/ai.service';
import { userService } from '../../services/user.service';
import { channelService } from '../../services/channel.service';
import { settingsService } from '../../services/settings.service';
import { authMiddleware, requireOwner } from '../middlewares/auth.middleware';

export function createAiRouter(bot?: Telegraf) {
  const aiRouter = Router();

const chatLimiter = rateLimit({ windowMs: 60 * 1000, max: 12, standardHeaders: true, legacyHeaders: false, message: { success: false, error: 'درخواست‌های زیادی ارسال شده، کمی بعد دوباره تلاش کنید' } });
const chatSchema = z.object({ message: z.string().trim().min(1).max(4000), telegramId: z.union([z.string(), z.number(), z.bigint()]).optional() });
const settingsSchema = z.object({
  systemPrompt: z.string().trim().min(10).max(8000).optional(),
  allowedSourceUrls: z.array(z.string().trim().url()).max(20).optional(),
  fallbackMessage: z.string().trim().min(1).max(1000).optional(),
  topicFallbackMessage: z.string().trim().min(1).max(1000).optional(),
  sourceFallbackMessage: z.string().trim().min(1).max(1000).optional(),
  model: z.string().trim().min(3).max(80).optional(),
  rateLimitPerHour: z.coerce.number().int().min(1).max(200).optional(),
});
const keyCreateSchema = z.object({ name: z.string().trim().max(120).optional().nullable(), apiKey: z.string().trim().min(8).max(500), isActive: z.boolean().optional() });
const keyUpdateSchema = z.object({ name: z.string().trim().max(120).optional().nullable(), apiKey: z.string().trim().min(8).max(500).optional(), isActive: z.boolean().optional() });

function handleAiError(error: unknown, res: any) {
  if (error instanceof AiServiceError) return res.status(error.status).json({ success: false, error: error.message });
  return res.status(500).json({ success: false, error: 'خطای داخلی سرور' });
}

aiRouter.post('/chat', chatLimiter, async (req, res) => {
  if (!(await settingsService.isFeatureEnabled('ai_assistant'))) return res.status(503).json({ success: false, disabled: true, error: 'این سرویس غیرفعال است' });
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
  try {
    const telegramId = parsed.data.telegramId ? BigInt(parsed.data.telegramId) : undefined;
    if (bot && telegramId && (await settingsService.isFeatureEnabled('force_join'))) {
      const membership = await channelService.checkMembership(bot, telegramId);
      if (!membership.isMember) return res.status(403).json({ success: false, forceJoinRequired: true, error: '⚠️ برای استفاده از ربات باید عضو کانال شوید', channels: membership.notJoined });
    }
    const profile = telegramId ? await userService.getProfile(telegramId).catch(() => null) : null;
    const result = await aiService.chat({ message: parsed.data.message, telegramId, userId: profile?.id, source: 'API' });
    res.json({ success: true, ...result });
  } catch (error) { handleAiError(error, res); }
});

aiRouter.get('/settings', authMiddleware, requireOwner, async (_req, res) => {
  res.json({ success: true, settings: await aiService.getSettings() });
});

aiRouter.patch('/settings', authMiddleware, requireOwner, async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
  res.json({ success: true, settings: await aiService.updateSettings(parsed.data) });
});

aiRouter.get('/keys', authMiddleware, requireOwner, async (_req, res) => {
  res.json({ success: true, items: await aiService.listKeys() });
});

aiRouter.post('/keys', authMiddleware, requireOwner, async (req, res) => {
  const parsed = keyCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
  res.status(201).json({ success: true, item: await aiService.createKey({ apiKey: parsed.data.apiKey, name: parsed.data.name ?? undefined, isActive: parsed.data.isActive }) });
});

aiRouter.patch('/keys/:id', authMiddleware, requireOwner, async (req, res) => {
  const id = Number(req.params.id);
  const parsed = keyUpdateSchema.safeParse(req.body);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ success: false, error: 'شناسه نامعتبر است' });
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
  res.json({ success: true, item: await aiService.updateKey(id, parsed.data) });
});

aiRouter.delete('/keys/:id', authMiddleware, requireOwner, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ success: false, error: 'شناسه نامعتبر است' });
  await aiService.deleteKey(id);
  res.json({ success: true });
});

  return aiRouter;
}

export const aiRouter = createAiRouter();
