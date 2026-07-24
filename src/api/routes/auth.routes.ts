// src/api/routes/auth.routes.ts
// احراز هویت ادمین

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

import { prisma } from '../../prisma/client';
import { config } from '../../config';
import { ssoService } from '../../services/sso.service';

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
          firstName: admin.firstName,
          lastName: admin.lastName,
          email: admin.email,
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
        firstName: true,
        lastName: true,
        email: true,
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

    if (!admin.isActive) {
      return res.status(403).json({
        success: false,
        error: 'حساب ادمین غیرفعال است',
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

// ─────────────────────────────────────────────
// POST /api/auth/sso/exchange
// تبادل توکن SSO با JWT
// ─────────────────────────────────────────────

authRouter.post(
  '/sso/exchange',
  async (req: Request, res: Response) => {
    try {
      const { token } = req.body;

      if (!token || typeof token !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'توکن SSO ارسال نشده',
        });
      }

      const result = await ssoService.exchangeToken(token);

      if (!result) {
        return res.status(401).json({
          success: false,
          error: 'توکن SSO نامعتبر، منقضی یا قبلاً استفاده شده',
        });
      }

      // ساخت JWT (همان فرمت login)
      const jwtToken = jwt.sign(
        {
          adminId: result.adminId,
          username: result.username,
          role: result.role,
        },
        config.api.jwtSecret,
        {
          expiresIn: config.api.jwtExpiresIn,
        } as jwt.SignOptions
      );

      return res.status(200).json({
        success: true,
        token: jwtToken,
        admin: result.admin,
      });
    } catch (error) {
      console.error('SSO EXCHANGE ERROR:', error);

      return res.status(500).json({
        success: false,
        error: 'خطای داخلی سرور',
      });
    }
  }
);
