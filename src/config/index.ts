// src/config/index.ts
// تنظیمات مرکزی پروژه
export { prisma } from "../prisma/client";
import dotenv from 'dotenv';
dotenv.config();

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`متغیر محیطی ${key} تنظیم نشده است`);
  return value;
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',

  bot: {
    token: required('BOT_TOKEN'),
    adminTelegramId: BigInt(required('ADMIN_TELEGRAM_ID')),
  },

  api: {
    port: parseInt(process.env.PORT || '3000'),
    jwtSecret: required('JWT_SECRET'),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  db: {
    url: required('DATABASE_URL'),
  },

  cache: {
    ttl: parseInt(process.env.CACHE_TTL_SECONDS || '300'),
  },
} as const;
