// src/api/routes/lottery.routes.ts
// API مدیریت قرعه‌کشی

import { Router } from 'express';
import { z } from 'zod';
import { lotteryRepository } from '../../repositories/lottery.repository';
import { lotteryService } from '../../services/lottery.service';

export const lotteryRouter = Router();

const createSchema = z.object({
  title: z.string().min(2),
  prize: z.string().min(2),
  winnersCount: z.number().int().min(1).default(1),
});

// ایجاد قرعه‌کشی جدید
lotteryRouter.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const lottery = await lotteryRepository.create(parsed.data);
  res.status(201).json(lottery);
});

// برگزاری قرعه‌کشی (انتخاب برندگان)
lotteryRouter.post('/:id/draw', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const winners = await lotteryService.draw(id);
    res.json({ winners: winners.map((w) => ({ id: w.id, name: w.firstName })) });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// لیست قرعه‌کشی‌ها
lotteryRouter.get('/', async (_req, res) => {
  const history = await lotteryService.getHistory();
  res.json(history);
});
