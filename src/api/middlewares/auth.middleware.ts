// src/api/middlewares/auth.middleware.ts
// بررسی JWT برای API

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config';

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

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'توکن احراز هویت یافت نشد' });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, config.api.jwtSecret) as AdminPayload;
    req.admin = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'توکن نامعتبر یا منقضی شده' });
  }
}
