import { Router } from 'express';
import { z } from 'zod';
import { miniAppService } from '../../services/mini-app.service';

export const miniAppRouter = Router();

const initDataSchema = z.object({ initData: z.string().min(20) });
const profileSchema = initDataSchema.extend({
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().min(2).max(80),
  phoneNumber: z.string().trim().min(6).max(24).optional().nullable(),
});

miniAppRouter.post('/profile', async (req, res) => {
  try {
    const { initData } = initDataSchema.parse(req.body);
    res.json({ success: true, ...(await miniAppService.getOrCreateProfile(initData)) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'خطا در احراز هویت Mini App';
    res.status(401).json({ success: false, error: message });
  }
});

miniAppRouter.patch('/profile', async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });

  try {
    const { initData, firstName, lastName, phoneNumber } = parsed.data;
    res.json({ success: true, ...(await miniAppService.updateProfile(initData, { firstName: firstName!, lastName: lastName!, phoneNumber })) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'خطا در ذخیره اطلاعات کاربری';
    res.status(401).json({ success: false, error: message });
  }
});
