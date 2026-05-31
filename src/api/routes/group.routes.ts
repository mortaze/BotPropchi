import { TelegramGroupStatus } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { Telegraf } from 'telegraf';
import { groupService } from '../../services/group.service';
import { serializeBigInts } from '../../utils/serialize';

export function createGroupRouter(bot?: Telegraf) {
  const router = Router();
  router.get('/', async (_req, res) => res.json({ success: true, items: serializeBigInts(await groupService.list()) }));
  router.patch('/:id/status', async (req, res) => {
    const parsed = z.object({ status: z.nativeEnum(TelegramGroupStatus) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
    const group = await groupService.updateStatus(Number(req.params.id), parsed.data.status);
    if (bot && parsed.data.status === TelegramGroupStatus.APPROVED) {
      const refreshed = await groupService.refreshBotAdmin(bot, group.chatId);
      return res.json({ success: true, group: serializeBigInts(refreshed) });
    }
    res.json({ success: true, group: serializeBigInts(group) });
  });
  router.post('/:id/refresh-admin', async (req, res) => {
    if (!bot) return res.status(503).json({ success: false, error: 'Bot instance is not available' });
    const groups = await groupService.list();
    const group = groups.find((item) => item.id === Number(req.params.id));
    if (!group) return res.status(404).json({ success: false, error: 'Group not found' });
    res.json({ success: true, group: serializeBigInts(await groupService.refreshBotAdmin(bot, group.chatId)) });
  });
  return router;
}
