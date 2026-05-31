import { RequiredChannelStatus, RequiredChannelType } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { channelService } from '../../services/channel.service';
import { serializeBigInts } from '../../utils/serialize';

export const channelRouter = Router();

const channelSchema = z.object({
  title: z.string().trim().min(2),
  chatId: z.string().trim().min(2),
  username: z.string().trim().optional().nullable(),
  type: z.nativeEnum(RequiredChannelType).default(RequiredChannelType.CHANNEL),
  inviteLink: z.string().url().optional().nullable(),
  isActive: z.boolean().optional(),
  status: z.nativeEnum(RequiredChannelStatus).optional(),
});

channelRouter.get('/', async (_req, res) => res.json({ success: true, items: serializeBigInts(await channelService.list()) }));
channelRouter.post('/', async (req, res) => {
  const parsed = channelSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
  res.status(201).json({ success: true, channel: serializeBigInts(await channelService.create({ title: parsed.data.title, chatId: parsed.data.chatId, username: parsed.data.username, type: parsed.data.type ?? RequiredChannelType.CHANNEL, inviteLink: parsed.data.inviteLink, isActive: parsed.data.isActive })) });
});
channelRouter.put('/:id', async (req, res) => {
  const parsed = channelSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
  res.json({ success: true, channel: serializeBigInts(await channelService.update(Number(req.params.id), parsed.data)) });
});
channelRouter.patch('/:id', async (req, res) => {
  const parsed = channelSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
  res.json({ success: true, channel: serializeBigInts(await channelService.update(Number(req.params.id), parsed.data)) });
});
channelRouter.delete('/:id', async (req, res) => {
  await channelService.delete(Number(req.params.id));
  res.json({ success: true });
});
