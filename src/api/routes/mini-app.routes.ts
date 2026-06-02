import { Router } from 'express';
import { z } from 'zod';
import { miniAppService, MiniAppValidationError } from '../../services/mini-app.service';
import { miniAppLogService } from '../../services/mini-app-log.service';
import { serializeBigInts } from '../../utils/serialize';

export const miniAppRouter = Router();

const initDataSchema = z.object({ initData: z.string().optional().default('') });
const profileSchema = initDataSchema.extend({
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().min(2).max(80),
  phoneNumber: z.string().trim().min(6).max(24).optional().nullable(),
});
const debugLogSchema = z.object({
  telegramId: z.union([z.string(), z.number(), z.bigint()]).optional().nullable(),
  eventType: z.string().trim().min(1).max(120).default('MINI_APP_CLIENT_DEBUG'),
  message: z.string().trim().min(1).max(2000),
  payload: z.unknown().optional(),
  userAgent: z.string().trim().max(1000).optional().nullable(),
});

function getRequestContext(req: { get: (name: string) => string | undefined; originalUrl?: string; method?: string }) {
  return { userAgent: req.get('user-agent') || null, endpoint: req.originalUrl, method: req.method };
}

function authErrorResponse(error: unknown) {
  if (error instanceof MiniAppValidationError) {
    return { status: error.code === 'MINI_APP_SERVER_ERROR' ? 500 : 401, body: { success: false, error: error.message, code: error.code } };
  }
  return { status: 500, body: { success: false, error: error instanceof Error ? error.message : 'خطا در احراز هویت Mini App', code: 'MINI_APP_SERVER_ERROR' } };
}

miniAppRouter.post('/debug-log', async (req, res) => {
  const parsed = debugLogSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });

  const item = await miniAppLogService.log({
    telegramId: parsed.data.telegramId,
    eventType: parsed.data.eventType,
    message: parsed.data.message,
    payload: parsed.data.payload as any,
    userAgent: parsed.data.userAgent || req.get('user-agent') || null,
  });

  res.json({ success: true, item: item ? serializeBigInts(item) : null });
});

miniAppRouter.post('/profile', async (req, res) => {
  try {
    const { initData } = initDataSchema.parse(req.body);
    res.json({ success: true, ...(await miniAppService.getOrCreateProfile(initData, getRequestContext(req))) });
  } catch (error) {
    const response = authErrorResponse(error);
    res.status(response.status).json(response.body);
  }
});

miniAppRouter.patch('/profile', async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });

  try {
    const { initData, firstName, lastName, phoneNumber } = parsed.data;
    res.json({ success: true, ...(await miniAppService.updateProfile(initData, { firstName: firstName!, lastName: lastName!, phoneNumber }, getRequestContext(req))) });
  } catch (error) {
    const response = authErrorResponse(error);
    res.status(response.status).json(response.body);
  }
});
