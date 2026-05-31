import { BroadcastParseMode, BroadcastStatus, BroadcastType } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { broadcastService } from '../../services/broadcast.service';
import { serializeBigInts } from '../../utils/serialize';

export const broadcastRouter = Router();

const keyboardButtonSchema = z.object({ text: z.string().min(1), url: z.string().url().optional(), callback_data: z.string().optional() });
const createSchema = z.object({
  title: z.string().trim().min(2),
  messageType: z.nativeEnum(BroadcastType),
  content: z.string().optional().nullable(),
  mediaFileId: z.string().optional().nullable(),
  mediaItems: z.any().optional(),
  parseMode: z.nativeEnum(BroadcastParseMode).optional().nullable(),
  inlineKeyboard: z.array(z.array(keyboardButtonSchema)).optional(),
  scheduledAt: z.string().datetime().optional().nullable(),
}).refine((data) => data.messageType === BroadcastType.TEXT ? Boolean(data.content?.trim()) : Boolean(data.mediaFileId?.trim() || data.mediaItems), {
  message: 'متن یا فایل پیام الزامی است',
});

broadcastRouter.get('/', async (req, res) => {
  const page = z.coerce.number().int().positive().default(1).parse(req.query.page ?? 1);
  const limit = z.coerce.number().int().positive().max(100).default(20).parse(req.query.limit ?? 20);
  const status = req.query.status ? z.nativeEnum(BroadcastStatus).parse(req.query.status) : undefined;
  const result = await broadcastService.list({ page, limit, status });
  res.json({ success: true, ...serializeBigInts(result) });
});

broadcastRouter.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
  const data = parsed.data;
  const keyboard = data.inlineKeyboard ? { inline_keyboard: data.inlineKeyboard } : undefined;
  const broadcast = await broadcastService.create({
    title: data.title,
    messageType: data.messageType,
    content: data.content,
    mediaFileId: data.mediaFileId,
    mediaItems: data.mediaItems,
    parseMode: data.parseMode,
    inlineKeyboard: keyboard,
    scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
    createdBy: req.admin?.username,
  });
  res.status(201).json({ success: true, broadcast: serializeBigInts(broadcast) });
});

broadcastRouter.get('/:id', async (req, res) => {
  const broadcast = await broadcastService.get(Number(req.params.id));
  if (!broadcast) return res.status(404).json({ success: false, error: 'پیام همگانی یافت نشد' });
  res.json({ success: true, broadcast: serializeBigInts(broadcast) });
});

broadcastRouter.post('/:id/enqueue', async (req, res) => res.json({ success: true, broadcast: serializeBigInts(await broadcastService.enqueue(Number(req.params.id))) }));
broadcastRouter.post('/:id/pause', async (req, res) => res.json({ success: true, broadcast: serializeBigInts(await broadcastService.pause(Number(req.params.id))) }));
broadcastRouter.post('/:id/resume', async (req, res) => res.json({ success: true, broadcast: serializeBigInts(await broadcastService.resume(Number(req.params.id))) }));
broadcastRouter.post('/:id/cancel', async (req, res) => res.json({ success: true, broadcast: serializeBigInts(await broadcastService.cancel(Number(req.params.id))) }));
broadcastRouter.post('/:id/retry', async (req, res) => res.json({ success: true, broadcast: serializeBigInts(await broadcastService.retry(Number(req.params.id))) }));
broadcastRouter.post('/:id/test', async (req, res) => {
  const telegramId = req.body?.telegramId ? BigInt(String(req.body.telegramId)) : undefined;
  res.json(await broadcastService.sendTest(Number(req.params.id), telegramId));
});
