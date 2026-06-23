import { Router } from 'express';
import { userDeleteService } from '../../services/user-delete.service';
import { serializeBigInts } from '../../utils/serialize';
import { logger } from '../../utils/logger';
import { prisma } from '../../prisma/client';

export const userDeleteRouter = Router();

function asyncHandler(fn: (req: any, res: any, next: any) => Promise<any>) {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      logger.error('[User Delete Route] Error:', err);
      res.status(500).json({ success: false, error: err.message || 'خطا' });
    });
  };
}

// Delete preview
userDeleteRouter.get('/:id/delete-preview', asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.id);
  if (isNaN(userId)) return res.status(400).json({ success: false, error: 'شناسه نامعتبر' });
  const data = await userDeleteService.getDeletePreview(userId);
  if (!data.user) return res.status(404).json({ success: false, error: 'کاربر یافت نشد' });
  res.json({ success: true, data: serializeBigInts(data) });
}));

// Delete user
userDeleteRouter.delete('/:id', asyncHandler(async (req, res) => {
  const userId = parseInt(req.params.id);
  if (isNaN(userId)) return res.status(400).json({ success: false, error: 'شناسه نامعتبر' });

  // Get admin info from JWT
  const adminId = (req as any).adminId || 0;
  const adminName = (req as any).adminUsername || 'unknown';

  // Safety check: cannot delete yourself
  const targetUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!targetUser) return res.status(404).json({ success: false, error: 'کاربر یافت نشد' });

  const admin = await prisma.botAdmin.findUnique({ where: { telegramId: targetUser.telegramId } });
  if (admin && String(admin.telegramId) === String(adminId)) {
    return res.status(400).json({ success: false, error: 'حذف خود مجاز نیست' });
  }

  const result = await userDeleteService.deleteUser(userId, adminId, adminName);
  res.json({ success: true, data: serializeBigInts(result) });
}));

// Deleted users list
userDeleteRouter.get('/deleted', asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const data = await userDeleteService.getDeletedUsers({ page, limit });
  res.json({ success: true, data: serializeBigInts(data) });
}));
