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

function getMiniAppUrl() {
  if (process.env.TELEGRAM_MINI_APP_URL) return process.env.TELEGRAM_MINI_APP_URL;
  const frontendUrl = process.env.FRONTEND_URL;
  return frontendUrl ? `${frontendUrl.replace(/\/$/, '')}/mini-app` : '';
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',

  bot: {
    token: required('BOT_TOKEN'),
    adminTelegramId: BigInt(required('ADMIN_TELEGRAM_ID')),
  },
  notifications: {
  winnerContact: process.env.WINNER_CONTACT || "@MrKhodae",
},

  miniApp: {
    url: getMiniAppUrl(),
    debug: String(process.env.DEBUG_MINI_APP || process.env.NEXT_PUBLIC_DEBUG_MINI_APP || 'false').toLowerCase() === 'true',
  },

  api: {
    port: parseInt(process.env.PORT || '3000'),
    jwtSecret: required('JWT_SECRET'),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  db: {
    url: required('DATABASE_URL'),
  },

  redis: {
    url: process.env.REDIS_URL || null,
  },

  cache: {
    ttl: parseInt(process.env.CACHE_TTL_SECONDS || '300'),
    version: process.env.CACHE_VERSION || '1',
  },

  membership: {
    cacheTtl: parseInt(process.env.MEMBERSHIP_CACHE_TTL || '300'),
    requiredChannels: process.env.MEMBERSHIP_REQUIRED_CHANNELS || '',
  },

  wordpress: {
    apiUrl: process.env.WORDPRESS_API_URL || '',
    botApiKey: process.env.WORDPRESS_BOT_API_KEY || '',
    signatureSecret: process.env.WORDPRESS_SIGNATURE_SECRET || '',
    timeoutMs: parseInt(process.env.WORDPRESS_API_TIMEOUT_MS || '25000'),
  },
} as const;
