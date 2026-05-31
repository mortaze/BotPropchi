import { BroadcastParseMode, KeywordReplyResponseType } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { keywordReplyService } from '../../services/keyword-reply.service';
import { serializeBigInts } from '../../utils/serialize';

export const keywordReplyRouter = Router();

const schema = z.object({
  keyword: z.string().trim().min(1),
  response: z.string().optional().nullable(),
  responseType: z.nativeEnum(KeywordReplyResponseType).default(KeywordReplyResponseType.TEXT),
  parseMode: z.nativeEnum(BroadcastParseMode).optional().nullable(),
  mediaFileId: z.string().trim().optional().nullable(),
  isActive: z.boolean().optional(),
});

keywordReplyRouter.get('/', async (_req, res) => res.json({ success: true, items: serializeBigInts(await keywordReplyService.list()) }));
keywordReplyRouter.post('/', async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
  res.status(201).json({ success: true, item: serializeBigInts(await keywordReplyService.create({ keyword: parsed.data.keyword, response: parsed.data.response, responseType: parsed.data.responseType, parseMode: parsed.data.parseMode, mediaFileId: parsed.data.mediaFileId, isActive: parsed.data.isActive ?? true })) });
});
keywordReplyRouter.patch('/:id', async (req, res) => {
  const parsed = schema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
  res.json({ success: true, item: serializeBigInts(await keywordReplyService.update(Number(req.params.id), parsed.data)) });
});
keywordReplyRouter.delete('/:id', async (req, res) => {
  await keywordReplyService.delete(Number(req.params.id));
  res.json({ success: true });
});
keywordReplyRouter.get('/history', async (req, res) => res.json({ success: true, items: serializeBigInts(await keywordReplyService.history(Number(req.query.limit) || 50)) }));
