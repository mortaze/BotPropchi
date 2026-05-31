import { BotAdminRole, BotAdminStatus, SystemEventType } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { botAdminService } from '../../services/bot-admin.service';
import { systemLogService } from '../../services/system-log.service';
import { serializeBigInts } from '../../utils/serialize';

export const botAdminRouter = Router();

const schema = z.object({
  telegramId: z.union([z.string(), z.number()]),
  username: z.string().optional().nullable(),
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  role: z.nativeEnum(BotAdminRole).default(BotAdminRole.ADMIN),
  status: z.nativeEnum(BotAdminStatus).default(BotAdminStatus.ACTIVE),
});

botAdminRouter.get('/', async (_req, res) => res.json({ success: true, items: serializeBigInts(await botAdminService.list()) }));
botAdminRouter.post('/', async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
  const item = await botAdminService.upsert(parsed.data as z.infer<typeof schema> & { telegramId: string | number });
  await systemLogService.log({ eventType: SystemEventType.ADMIN_ACTION, message: `Bot admin upserted: ${parsed.data.telegramId}`, metadata: parsed.data as any });
  res.status(201).json({ success: true, item: serializeBigInts(item) });
});
botAdminRouter.patch('/:id', async (req, res) => {
  const parsed = schema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
  const item = await botAdminService.update(Number(req.params.id), parsed.data as any);
  res.json({ success: true, item: serializeBigInts(item) });
});
botAdminRouter.delete('/:id', async (req, res) => {
  await botAdminService.delete(Number(req.params.id));
  res.json({ success: true });
});
