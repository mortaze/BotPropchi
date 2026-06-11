import { Router } from 'express';
import { z } from 'zod';
import { settingsService } from '../../services/settings.service';
import { postService } from '../../services/post.service';
import { logger } from '../../utils/logger';

export const menuRouter = Router();

const layoutSchema = z.array(z.array(z.object({
  ref: z.string(),
  text: z.string(),
  type: z.string().optional(),
  visible: z.boolean().optional(),
})));

menuRouter.get('/layout', async (_req, res) => {
  const layout = await settingsService.getMenuLayout();
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
  const version = await settingsService.getSetting('menu_layout_version') || 0;
  res.json({ success: true, layout: parsed.data, version: Number(version) });
});

menuRouter.post('/sync-posts', async (_req, res) => {
  try {
    const posts = await postService.getPublished();
    let added = 0;
    for (const post of posts) {
      const layout = await settingsService.getMenuLayout();
      const ref = `post:${post.id}`;
      const exists = layout.some(row => row.some((btn: any) => btn.ref === ref));
      if (!exists) {
        layout.push([{ ref, text: post.title, visible: false }]);
        added++;
      }
    }
    if (added > 0) {
      await settingsService.saveMenuLayout(await settingsService.getMenuLayout());
    }
    const version = await settingsService.getSetting('menu_layout_version') || 0;
    res.json({ success: true, message: `${added} پست به منو اضافه شد`, version: Number(version) });
  } catch (err) {
    logger.error('[MenuRouter] sync-posts error:', err);
    res.status(500).json({ success: false, error: 'خطا در همگام‌سازی' });
  }
});

menuRouter.post('/add-post', async (req, res) => {
  const schema = z.object({ postId: z.number(), title: z.string() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
  await settingsService.addPostToMenu(parsed.data.postId, parsed.data.title);
  const layout = await settingsService.getMenuLayout();
  res.json({ success: true, layout });
});

menuRouter.post('/remove-post', async (req, res) => {
  const schema = z.object({ postId: z.number() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
  await settingsService.removePostFromMenu(parsed.data.postId);
  const layout = await settingsService.getMenuLayout();
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
