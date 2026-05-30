// src/api/routes/auth.routes.ts
// ورود ادمین

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../prisma/client';
import { config } from '../../config';
import { z } from 'zod';

export const authRouter = Router();

const loginSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
});

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'ورودی نامعتبر' });
  }

  const { username, password } = parsed.data;
  const admin = await prisma.admin.findUnique({ where: { username, isActive: true } });

  if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
    return res.status(401).json({ error: 'نام کاربری یا رمز عبور اشتباه است' });
  }

  await prisma.admin.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date() },
  });

  const token = jwt.sign(
    { adminId: admin.id, username: admin.username, role: admin.role },
    config.api.jwtSecret,
    { expiresIn: config.api.jwtExpiresIn } as any
  );

  res.json({ token, role: admin.role, username: admin.username });
});
