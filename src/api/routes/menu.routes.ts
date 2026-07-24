import { Router } from 'express';
import { z } from 'zod';
import { settingsService } from '../../services/settings.service';
import { postService } from '../../services/post.service';
import { logger } from '../../utils/logger';

export const menuRouter = Router();

const menuButtonSchema = z.object({
  id: z.string().optional(),
  ref: z.string().min(1),
  text: z.string().default(''),
  title: z.string().optional(),
  label: z.string().optional(),
  type: z.string().optional(),
  visible: z.boolean().optional(),
  rowIndex: z.number().optional(),
  position: z.number().optional(),
}).passthrough().superRefine((button, ctx) => {
  const displayText = button.text || button.label || button.title;
  const isPostRef = button.ref.startsWith('post:') || button.ref.startsWith('post_');
  if (!isPostRef && (!displayText || !displayText.trim())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['text'], message: 'Button text is required for system buttons' });
  }
  if ([button.text, button.label, button.title].some((value) => typeof value === 'string' && value.includes('???'))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['text'], message: 'Malformed button text is not accepted' });
  }
});

const layoutSchema = z.array(z.array(menuButtonSchema).max(8));

menuRouter.get('/layout', async (_req, res) => {
  // Return resolved layout with current post titles from DB (admin mode: show all entries)
  const layout = await settingsService.getResolvedMenuLayout(false);
  const version = await settingsService.getSetting('menu_layout_version') || 0;
  res.json({ success: true, layout, version: Number(version) });
});

menuRouter.put('/layout', async (req, res) => {
  const parsed = layoutSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: 'فرمت لایه‌اوت نامعتبر', details: parsed.error.flatten() });
  }
  const validation = settingsService.validateMenuLayout(parsed.data);
  if (!validation.valid) {
    return res.status(400).json({ success: false, error: validation.reason });
  }
  await settingsService.saveMenuLayout(parsed.data);
  const layout = await settingsService.getResolvedMenuLayout(false);
  const version = await settingsService.getSetting('menu_layout_version') || 0;
  res.json({ success: true, layout, version: Number(version) });
});

menuRouter.post('/sync-posts', async (_req, res) => {
  try {
    const result = await settingsService.syncMenuWithPosts();
    const version = await settingsService.getSetting('menu_layout_version') || 0;
    res.json({
      success: true,
      message: `${result.added} پست اضافه شد، ${result.removed} ارجاع نامعتبر حذف شد، ${result.madeVisible} پست قابل مشاهده شد`,
      version: Number(version),
      result,
    });
  } catch (err) {
    logger.error('[MenuRouter] sync-posts error:', err);
    res.status(500).json({ success: false, error: 'خطا در همگام‌سازی' });
  }
});

menuRouter.post('/delete-button', async (req, res) => {
  const schema = z.object({ buttonId: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
  try {
    await settingsService.removeButtonFromLayout(parsed.data.buttonId);
    const layout = await settingsService.getResolvedMenuLayout(false);
    const version = await settingsService.getSetting('menu_layout_version') || 0;
    res.json({ success: true, message: 'دکمه حذف شد', layout, version: Number(version) });
  } catch (err) {
    logger.error('[MenuRouter] delete-button error:', err);
    res.status(500).json({ success: false, error: 'خطا در حذف دکمه' });
  }
});

menuRouter.post('/add-post', async (req, res) => {
  const schema = z.object({ postId: z.number(), title: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
  await settingsService.addPostToMenu(parsed.data.postId, parsed.data.title);
  const layout = await settingsService.getResolvedMenuLayout(false);
  res.json({ success: true, layout });
});

menuRouter.post('/remove-post', async (req, res) => {
  const schema = z.object({ postId: z.number() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
  await settingsService.removePostFromMenu(parsed.data.postId);
  const layout = await settingsService.getResolvedMenuLayout(false);
  res.json({ success: true, layout });
});

menuRouter.get('/snapshot', async (_req, res) => {
  const snapshot = await settingsService.getSetting('menu_layout_snapshot');
  res.json({ success: true, snapshot: snapshot || null });
});

menuRouter.post('/rollback', async (_req, res) => {
  const snapshot = await settingsService.getSetting('menu_layout_snapshot');
  if (!snapshot) {
    return res.status(400).json({ success: false, error: 'اسنپ‌شاتی برای بازگشت وجود ندارد' });
  }
  const parsed = typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot;
  const validation = settingsService.validateMenuLayout(parsed);
  if (!validation.valid) {
    return res.status(400).json({ success: false, error: `اسنپ‌شات نامعتبر: ${validation.reason}` });
  }
  await settingsService.saveMenuLayout(parsed);
  res.json({ success: true, message: 'بازگشت به اسنپ‌شات انجام شد', layout: parsed });
});

menuRouter.get('/undo-history', async (_req, res) => {
  const version = await settingsService.getSetting('menu_layout_version') || 0;
  res.json({ success: true, currentVersion: Number(version) });
});
