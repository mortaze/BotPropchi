import { Router } from 'express';
import { z } from 'zod';
import { ticketCategoryService } from '../../services/ticket-category.service';

export const ticketCategoryRouter = Router();

function serializeBigInts(value: any): any {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(serializeBigInts);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializeBigInts(item)]));
  }
  return value;
}

ticketCategoryRouter.get('/', async (req, res) => {
  try {
    const all = req.query.all === 'true';
    const categories = all ? await ticketCategoryService.listAll() : await ticketCategoryService.list();
    res.json(serializeBigInts(categories));
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

ticketCategoryRouter.post('/', async (req, res) => {
  const schema = z.object({ title: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });

  try {
    const category = await ticketCategoryService.create(parsed.data.title);
    res.status(201).json(serializeBigInts(category));
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

ticketCategoryRouter.patch('/:id', async (req, res) => {
  const schema = z.object({
    title: z.string().min(1).optional(),
    enabled: z.boolean().optional(),
    order: z.number().int().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });

  try {
    const category = await ticketCategoryService.update(Number(req.params.id), parsed.data);
    res.json(serializeBigInts(category));
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

ticketCategoryRouter.delete('/:id', async (req, res) => {
  try {
    const result = await ticketCategoryService.remove(Number(req.params.id));
    res.json(serializeBigInts(result));
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

ticketCategoryRouter.post('/reorder', async (req, res) => {
  const schema = z.object({ ids: z.array(z.number().int()) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });

  try {
    await ticketCategoryService.reorder(parsed.data.ids);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
