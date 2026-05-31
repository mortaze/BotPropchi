import { RequiredChannelStatus, RequiredChannelType } from '@prisma/client';
import { Router } from 'express';
import { Telegraf } from 'telegraf';
import { z } from 'zod';
import { channelService } from '../../services/channel.service';
import { serializeBigInts } from '../../utils/serialize';

const channelSchema = z.object({
  title: z.string().trim().min(2),
  displayTitle: z.string().trim().optional().nullable(),
  chatId: z.string().trim().min(2),
  username: z.string().trim().optional().nullable(),
  type: z.nativeEnum(RequiredChannelType).default(RequiredChannelType.CHANNEL),
  inviteLink: z.string().url().optional().nullable().or(z.literal('')),
  buttonText: z.string().trim().optional().nullable(),
  isActive: z.boolean().optional(),
  status: z.nativeEnum(RequiredChannelStatus).optional(),
});

export function createChannelRouter(bot?: Telegraf) {
  const channelRouter = Router();

  channelRouter.get('/', async (_req, res) => res.json({ success: true, items: serializeBigInts(await channelService.list()) }));

  channelRouter.post('/', async (req, res) => {
    const parsed = channelSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
    const channel = await channelService.create({ title: parsed.data.title, chatId: parsed.data.chatId, username: parsed.data.username, type: parsed.data.type ?? RequiredChannelType.CHANNEL, inviteLink: parsed.data.inviteLink || null, isActive: parsed.data.isActive, displayTitle: parsed.data.displayTitle, buttonText: parsed.data.buttonText });
    res.status(201).json({ success: true, channel: serializeBigInts(channel) });
  });

  channelRouter.put('/:id', async (req, res) => {
    const parsed = channelSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
    const payload = { ...parsed.data, ...(parsed.data.inviteLink !== undefined ? { inviteLink: parsed.data.inviteLink || null } : {}) };
    res.json({ success: true, channel: serializeBigInts(await channelService.update(Number(req.params.id), payload)) });
  });

  channelRouter.patch('/:id', async (req, res) => {
    const parsed = channelSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
    const payload = { ...parsed.data, ...(parsed.data.inviteLink !== undefined ? { inviteLink: parsed.data.inviteLink || null } : {}) };
    res.json({ success: true, channel: serializeBigInts(await channelService.update(Number(req.params.id), payload)) });
  });

  channelRouter.post('/:id/refresh-bot-status', async (req, res) => {
    if (!bot) return res.status(503).json({ success: false, error: 'ربات تلگرام در API در دسترس نیست' });
    try {
      const channel = await channelService.refreshBotStatus(bot, Number(req.params.id));
      res.json({ success: true, channel: serializeBigInts(channel) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(400).json({ success: false, error: message });
    }
  });

  channelRouter.delete('/:id', async (req, res) => {
    await channelService.delete(Number(req.params.id));
    res.json({ success: true });
  });

  return channelRouter;
}
