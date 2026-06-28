import { Router } from 'express';
import { Telegraf } from 'telegraf';
import { z } from 'zod';
import { miniAppService, MiniAppValidationError } from '../../services/mini-app.service';
import { miniAppLogService } from '../../services/mini-app-log.service';
import { serializeBigInts } from '../../utils/serialize';
import { channelService } from '../../services/channel.service';
import { settingsService } from '../../services/settings.service';
import { forcedMembershipSettingsService } from '../../services/membership/forcedMembership.service';



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
    return { status: error.code === 'MINI_APP_SERVER_ERROR' ? 500 : error.code === 'MINI_APP_INVALID_PROFILE' ? 400 : 401, body: { success: false, error: error.message, code: error.code } };
  }
  return { status: 500, body: { success: false, error: error instanceof Error ? error.message : 'خطا در احراز هویت Mini App', code: 'MINI_APP_SERVER_ERROR' } };
}

export function createMiniAppRouter(bot?: Telegraf) {
  const miniAppRouter = Router();

  const requireFeature = (featureKey: string) => async (_req: any, res: any, next: any) => {
    if (!(await settingsService.isFeatureEnabled(featureKey))) {
      return res.status(503).json({ success: false, disabled: true, error: 'این سرویس غیرفعال است' });
    }
    next();
  };

  const requireMembership = async (req: any, res: any, next: any) => {
    if (!bot) return next();
    if (!(await settingsService.isFeatureEnabled('force_join'))) return next();
    try {
      const initData = typeof req.body?.initData === 'string' ? req.body.initData : '';
      const telegramUser = await miniAppService.verifyInitData(initData, getRequestContext(req));
      const [result, settings] = await Promise.all([
        channelService.checkMembership(bot, BigInt(telegramUser.id)),
        forcedMembershipSettingsService.getSettings(),
      ]);
      if (result.isMember) return next();
      return res.status(403).json({ success: false, forceJoinRequired: true, error: settings.notJoinedMessage, joinButtonText: settings.joinButtonText, channels: result.notJoined });
    } catch (error) {
      const response = authErrorResponse(error);
      return res.status(response.status).json(response.body);
    }
  };

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

  miniAppRouter.post('/app-data', requireMembership, async (_req, res) => {
    res.json({ success: true, ...(await miniAppService.getAppData()) });
  });

  miniAppRouter.get('/app-data', async (_req, res) => {
    res.status(401).json({ success: false, error: 'InitData تلگرام دریافت نشد' });
  });

  miniAppRouter.post('/profile', requireMembership, async (req, res) => {
  try {
    const { initData } = initDataSchema.parse(req.body);
    res.json({ success: true, ...(await miniAppService.getOrCreateProfile(initData, getRequestContext(req))) });
  } catch (error) {
    const response = authErrorResponse(error);
    res.status(response.status).json(response.body);
  }
});

  miniAppRouter.patch('/profile', requireMembership, async (req, res) => {
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

  return miniAppRouter;
}

export const miniAppRouter = createMiniAppRouter();
