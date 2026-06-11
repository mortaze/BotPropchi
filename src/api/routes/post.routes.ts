import { Router } from 'express';
import { z } from 'zod';
import { PostStatus } from '@prisma/client';
import { postService } from '../../services/post.service';
import { settingsService } from '../../services/settings.service';

export const postRouter = Router();

function serializeBigInts(value: any): any {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(serializeBigInts);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializeBigInts(item)]));
  }
  return value;
}

const createSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  content: z.string().optional(),
  caption: z.string().optional(),
  mediaFileId: z.string().optional(),
  mediaType: z.string().optional(),
  albumMediaIds: z.array(z.string()).optional(),
  parseMode: z.enum(['Markdown', 'HTML']).default('Markdown'),
  buttons: z.any().optional(),
  command: z.string().optional(),
  status: z.nativeEnum(PostStatus).default(PostStatus.DRAFT),
  sortOrder: z.number().default(0),
});

const updateSchema = createSchema.partial();

postRouter.get('/', async (req, res) => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 20);
  const status = req.query.status as PostStatus | undefined;
  const isPublished = req.query.isPublished !== undefined ? req.query.isPublished === 'true' : undefined;
  const search = req.query.search as string | undefined;
  const result = await postService.findAll({ page, limit, status, isPublished, search });
  res.json(serializeBigInts(result));
});

postRouter.get('/global-analytics', async (_req, res) => {
  const analytics = await postService.getGlobalAnalytics();
  res.json(serializeBigInts(analytics));
});

postRouter.get('/published', async (_req, res) => {
  const posts = await postService.getPublished();
  res.json(serializeBigInts(posts));
});

postRouter.get('/drafts', async (_req, res) => {
  const posts = await postService.getDrafts();
  res.json(serializeBigInts(posts));
});

postRouter.get('/hidden', async (_req, res) => {
  const posts = await postService.getHidden();
  res.json(serializeBigInts(posts));
});

postRouter.get('/top', async (req, res) => {
  const limit = Number(req.query.limit || 5);
  const posts = await postService.getTopPosts(limit);
  res.json(serializeBigInts(posts));
});

postRouter.get('/:id', async (req, res) => {
  const post = await postService.findById(Number(req.params.id));
  if (!post) return res.status(404).json({ success: false, error: 'پست یافت نشد' });
  res.json(serializeBigInts(post));
});

postRouter.get('/:id/analytics', async (req, res) => {
  const analytics = await postService.getAnalytics(Number(req.params.id));
  res.json(serializeBigInts(analytics));
});

postRouter.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
  try {
    const post = await postService.create(parsed.data as any);
    res.status(201).json(serializeBigInts(post));
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(409).json({ success: false, error: 'این slug قبلاً استفاده شده' });
    throw err;
  }
});

postRouter.put('/:id', async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
  const post = await postService.update(Number(req.params.id), parsed.data as any);
  if (!post) return res.status(404).json({ success: false, error: 'پست یافت نشد' });
  res.json(serializeBigInts(post));
});

postRouter.delete('/:id', async (req, res) => {
  const post = await postService.delete(Number(req.params.id));
  if (!post) return res.status(404).json({ success: false, error: 'پست یافت نشد' });
  await settingsService.removePostFromMenu(Number(req.params.id));
  res.json({ success: true, message: 'پست حذف شد' });
});

postRouter.post('/:id/publish', async (req, res) => {
  const post = await postService.publish(Number(req.params.id));
  res.json(serializeBigInts(post));
});

postRouter.post('/:id/unpublish', async (req, res) => {
  const post = await postService.unpublish(Number(req.params.id));
  res.json(serializeBigInts(post));
});

postRouter.post('/:id/hide', async (req, res) => {
  const post = await postService.hide(Number(req.params.id));
  res.json(serializeBigInts(post));
});

postRouter.post('/:id/duplicate', async (req, res) => {
  const post = await postService.duplicate(Number(req.params.id));
  res.json(serializeBigInts(post));
});

postRouter.get('/:id/versions', async (req, res) => {
  const versions = await postService.getVersions(Number(req.params.id));
  res.json(serializeBigInts(versions));
});

postRouter.post('/:id/commands', async (req, res) => {
  const schema = z.object({ command: z.string().min(1), aliases: z.array(z.string()).optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
  try {
    const cmd = await postService.addCommand(Number(req.params.id), parsed.data.command, parsed.data.aliases);
    res.status(201).json(cmd);
  } catch (err: any) {
    res.status(409).json({ success: false, error: err.message });
  }
});

postRouter.delete('/:id/commands/:commandId', async (req, res) => {
  await postService.removeCommand(Number(req.params.commandId));
  res.json({ success: true });
});
