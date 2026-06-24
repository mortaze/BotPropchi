// src/api/routes/lottery.routes.ts
// API مدیریت قرعه‌کشی‌ها

import { Router } from 'express';
import { z } from 'zod';
import { lotteryService } from '../../services/lottery.service';
import { logger } from '../../utils/logger';

const router = Router();

const numberField = z.coerce.number().int();
const dateField = z.coerce.date();

const lotterySchema = z.object({
  title: z.string().min(2),
  description: z.string().optional().nullable(),
  prize: z.string().min(1),
  startAt: dateField.optional().nullable(),
  endAt: dateField.optional().nullable(),
  winnersCount: numberField.positive().default(1),
  minPoints: numberField.min(0).default(0),
  entryCost: numberField.min(0).default(10),
  isActive: z.boolean().default(true),
  announcementMsg: z.string().optional().nullable(),
  winnerMessage: z.string().optional().nullable(),
});

function serializeBigInts(value: any): any {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(serializeBigInts);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializeBigInts(item)]));
  }
  return value;
}

router.get('/', async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const result = await lotteryService.getAll(page, limit);

    return res.json({ success: true, ...serializeBigInts(result) });
  } catch (error) {
    logger.error('❌ GET LOTTERIES ERROR', error);
    return res.status(500).json({ success: false, error: 'خطا در دریافت قرعه‌کشی‌ها' });
  }
});

router.post('/', async (req, res) => {
  try {
    const parsed = lotterySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }

    const lottery = await lotteryService.createLottery(parsed.data);
    logger.info(`✅ Lottery created ${lottery.id}`);

    return res.status(201).json({ success: true, lottery: serializeBigInts(lottery) });
  } catch (error: any) {
    logger.error('❌ CREATE LOTTERY ERROR', error);
    return res.status(500).json({ success: false, error: error.message || 'خطا در ساخت قرعه‌کشی' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const lottery = await lotteryService.getById(Number(req.params.id));

    if (!lottery) {
      return res.status(404).json({ success: false, error: 'قرعه‌کشی یافت نشد' });
    }

    return res.json({ success: true, lottery: serializeBigInts(lottery) });
  } catch (error) {
    logger.error('❌ GET LOTTERY DETAILS ERROR', error);
    return res.status(500).json({ success: false, error: 'خطا در دریافت جزئیات قرعه‌کشی' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const parsed = lotterySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }

    const current = await lotteryService.getById(Number(req.params.id));
    if (!current) {
      return res.status(404).json({ success: false, error: 'قرعه‌کشی یافت نشد' });
    }

    const lottery = await lotteryService.updateLottery(Number(req.params.id), parsed.data);
    return res.json({ success: true, lottery: serializeBigInts(lottery) });
  } catch (error: any) {
    logger.error('❌ UPDATE LOTTERY ERROR', error);
    return res.status(500).json({ success: false, error: error.message || 'خطا در ویرایش قرعه‌کشی' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await lotteryService.deleteLottery(Number(req.params.id));
    return res.json({ success: true, message: 'قرعه‌کشی حذف شد' });
  } catch (error: any) {
    logger.error('❌ DELETE LOTTERY ERROR', error);
    return res.status(500).json({ success: false, error: error.message || 'خطا در حذف قرعه‌کشی' });
  }
});

router.post('/:id/draw', async (req, res) => {
  try {
    const winners = await lotteryService.draw(Number(req.params.id), true);

    return res.json({
      success: true,
      winners: serializeBigInts(winners),
      message: winners.length ? 'قرعه‌کشی با موفقیت انجام شد' : 'قرعه‌کشی انجام شد اما شرکت‌کننده‌ای وجود نداشت',
    });
  } catch (error: any) {
    logger.error('❌ DRAW ERROR', error);
    return res.status(400).json({ success: false, error: error.message || 'خطا در قرعه‌کشی' });
  }
});

router.get('/:id/winners', async (req, res) => {
  try {
    const winners = await lotteryService.getWinners(Number(req.params.id));
    return res.json({ success: true, winners: serializeBigInts(winners) });
  } catch (error) {
    logger.error('❌ GET WINNERS ERROR', error);
    return res.status(500).json({ success: false, error: 'خطا در دریافت برندگان' });
  }
});

// ─── Wheel Lottery Endpoints ─────────────────────────────────

router.get('/:id/wheel/participants', async (req, res) => {
  try {
    const participants = await lotteryService.getWheelParticipants(Number(req.params.id));
    return res.json({ success: true, data: serializeBigInts(participants) });
  } catch (error) {
    logger.error('❌ GET WHEEL PARTICIPANTS ERROR', error);
    return res.status(500).json({ success: false, error: 'خطا در دریافت شرکت‌کنندگان' });
  }
});

router.get('/:id/wheel/segments', async (req, res) => {
  try {
    const segments = await lotteryService.getWheelSegments(Number(req.params.id));
    return res.json({ success: true, data: serializeBigInts(segments) });
  } catch (error) {
    logger.error('❌ GET WHEEL SEGMENTS ERROR', error);
    return res.status(500).json({ success: false, error: 'خطا در دریافت بخش‌های گردونه' });
  }
});

router.post('/:id/wheel/spin', async (req, res) => {
  try {
    const result = await lotteryService.spinWheel(Number(req.params.id));
    return res.json({ success: true, data: serializeBigInts(result) });
  } catch (error: any) {
    logger.error('❌ WHEEL SPIN ERROR', error);
    return res.status(400).json({ success: false, error: error.message || 'خطا در چرخش گردونه' });
  }
});

router.post('/:id/wheel/complete', async (req, res) => {
  try {
    await lotteryService.updateLottery(Number(req.params.id), { isCompleted: true, isActive: false });
    return res.json({ success: true, message: 'قرعه‌کشی پایان یافت' });
  } catch (error: any) {
    logger.error('❌ COMPLETE LOTTERY ERROR', error);
    return res.status(400).json({ success: false, error: error.message || 'خطا در پایان قرعه‌کشی' });
  }
});

router.post('/:id/wheel/participants', async (req, res) => {
  try {
    const { userId, chances } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId الزامی است' });
    }
    const participant = await lotteryService.addParticipant(Number(req.params.id), Number(userId), Number(chances || 1));
    return res.json({ success: true, data: serializeBigInts(participant) });
  } catch (error: any) {
    logger.error('❌ ADD PARTICIPANT ERROR', error);
    return res.status(400).json({ success: false, error: error.message || 'خطا در اضافه کردن شرکت‌کننده' });
  }
});

router.delete('/:id/wheel/participants/:userId', async (req, res) => {
  try {
    await lotteryService.removeParticipant(Number(req.params.id), Number(req.params.userId));
    return res.json({ success: true, message: 'شرکت‌کننده حذف شد' });
  } catch (error: any) {
    logger.error('❌ REMOVE PARTICIPANT ERROR', error);
    return res.status(400).json({ success: false, error: error.message || 'خطا در حذف شرکت‌کننده' });
  }
});

router.post('/:id/notifications/send', async (req, res) => {
  try {
    const result = await lotteryService.sendWinnerNotifications(Number(req.params.id));
    return res.json({ success: true, data: result, message: `${result.sentCount} پیام ارسال شد` });
  } catch (error: any) {
    logger.error('❌ SEND NOTIFICATIONS ERROR', error);
    return res.status(400).json({ success: false, error: error.message || 'خطا در ارسال پیام‌ها' });
  }
});

export default router;
