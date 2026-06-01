// src/api/middlewares/auth.middleware.ts
// بررسی JWT برای API

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { prisma } from '../../prisma/client';
import { isOwnerRole, settingsService } from '../../services/settings.service';

export interface AdminPayload {
  adminId: number;
  username: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      admin?: AdminPayload;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'توکن احراز هویت یافت نشد' });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, config.api.jwtSecret) as AdminPayload;
    const admin = await prisma.admin.findUnique({ where: { id: payload.adminId }, select: { id: true, username: true, role: true, isActive: true } });
    if (!admin?.isActive) return res.status(401).json({ success: false, error: 'حساب ادمین غیرفعال است' });
    req.admin = { adminId: admin.id, username: admin.username, role: admin.role };
    next();
  } catch {
    return res.status(401).json({ error: 'توکن نامعتبر یا منقضی شده' });
  }
}


export function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (!isOwnerRole(req.admin?.role)) {
    return res.status(403).json({ success: false, error: 'دسترسی فقط برای Owner مجاز است' });
  }
  next();
}

export function requireFeature(featureKey: string) {
  return async (_req: Request, res: Response, next: NextFunction) => {
    if (!(await settingsService.isFeatureEnabled(featureKey))) {
      return res.status(503).json({ success: false, disabled: true, error: 'این سرویس غیرفعال است' });
    }
    next();
  };
}
