import { Router } from 'express';
import { z } from 'zod';
import { ticketService } from '../../services/ticket.service';

export const ticketRouter = Router();

function serializeBigInts(value: any): any {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(serializeBigInts);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializeBigInts(item)]));
  }
  return value;
}

ticketRouter.get('/', async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 10);
    const status = req.query.status ? String(req.query.status) : undefined;
    const categoryId = req.query.categoryId ? Number(req.query.categoryId) : undefined;
    const search = req.query.search ? String(req.query.search) : undefined;

    const result = await ticketService.getAllTickets({ status, categoryId, page, limit, search });
    res.json(serializeBigInts(result));
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

ticketRouter.get('/:id', async (req, res) => {
  try {
    const ticket = await ticketService.getTicketWithHistory(Number(req.params.id));
    if (!ticket) return res.status(404).json({ success: false, error: 'تیکت یافت نشد' });
    res.json(serializeBigInts(ticket));
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

ticketRouter.patch('/:id/close', async (req, res) => {
  try {
    const ticket = await ticketService.closeTicket(Number(req.params.id), false);
    res.json(serializeBigInts(ticket));
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

ticketRouter.delete('/:id', async (req, res) => {
  try {
    await ticketService.softDeleteTicket(Number(req.params.id));
    res.json({ success: true, message: 'تیکت حذف شد' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
