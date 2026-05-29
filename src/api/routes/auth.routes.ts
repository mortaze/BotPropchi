// src/api/routes/auth.routes.ts
// احراز هویت ادمین

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

import { prisma } from '../../prisma/client';
import { config } from '../../config';

export const authRouter = Router();

// ─────────────────────────────────────────────
// Validation Schema
// ─────────────────────────────────────────────

const loginSchema = z.object({
  username: z
    .string()
    .min(3, 'نام کاربری حداقل باید ۳ کاراکتر باشد'),

  password: z
    .string()
    .min(6, 'رمز عبور حداقل باید ۶ کاراکتر باشد'),
});

// ─────────────────────────────────────────────
// GET /api/auth
// تست مسیر
// ─────────────────────────────────────────────

authRouter.get('/', (_req: Request, res: Response) => {
  return res.status(200).json({
    success: true,
    message: 'Auth API Working ✅',
    timestamp: new Date(),
  });
});

// ─────────────────────────────────────────────
// POST /api/auth/login
// ورود ادمین
// ─────────────────────────────────────────────

authRouter.post(
  '/login',
  async (req: Request, res: Response) => {
    try {
      // validate body
      const parsed = loginSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: 'ورودی نامعتبر',
          issues: parsed.error.flatten(),
        });
      }

      const { username, password } = parsed.data;

      // پیدا کردن ادمین
      const admin = await prisma.admin.findFirst({
        where: {
          username,
          isActive: true,
        },
      });

      // چک وجود ادمین
      if (!admin) {
        return res.status(401).json({
          success: false,
          error: 'نام کاربری یا رمز عبور اشتباه است',
        });
      }

      // چک رمز
      const isPasswordValid = await bcrypt.compare(
        password,
        admin.passwordHash
      );

      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          error: 'نام کاربری یا رمز عبور اشتباه است',
        });
      }

      // آپدیت آخرین لاگین
      await prisma.admin.update({
        where: {
          id: admin.id,
        },
        data: {
          lastLoginAt: new Date(),
        },
      });

      // ساخت JWT
      const token = jwt.sign(
        {
          adminId: admin.id,
          username: admin.username,
          role: admin.role,
        },
        config.api.jwtSecret,
        {
          expiresIn: config.api.jwtExpiresIn,
        } as jwt.SignOptions
      );

      // خروجی موفق
      return res.status(200).json({
        success: true,

        token,

        admin: {
          id: admin.id,
          username: admin.username,
          role: admin.role,
          lastLoginAt: admin.lastLoginAt,
        },
      });
    } catch (error) {
      console.error('AUTH LOGIN ERROR:', error);

      return res.status(500).json({
        success: false,
        error: 'خطای داخلی سرور',
      });
    }
  }
);

// ─────────────────────────────────────────────
// GET /api/auth/me
// اطلاعات ادمین لاگین کرده
// ─────────────────────────────────────────────

authRouter.get('/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: 'توکن ارسال نشده',
      });
    }

    const token = authHeader.replace('Bearer ', '');

    const decoded = jwt.verify(
      token,
      config.api.jwtSecret
    ) as {
      adminId: number;
    };

    const admin = await prisma.admin.findUnique({
      where: {
        id: decoded.adminId,
      },
      select: {
        id: true,
        username: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    if (!admin) {
      return res.status(404).json({
        success: false,
        error: 'ادمین پیدا نشد',
      });
    }

    return res.status(200).json({
      success: true,
      admin,
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'توکن نامعتبر است',
    });
  }
});
