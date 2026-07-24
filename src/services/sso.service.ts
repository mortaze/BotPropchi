// src/services/sso.service.ts
// سرویس SSO - تولید و تبادل توکن یک‌بار مصرف

import crypto from 'crypto';
import { prisma } from '../prisma/client';
import { logger } from '../utils/logger';

const SSO_TOKEN_EXPIRY_MINUTES = 5;

export const ssoService = {
  /**
   * تولید توکن SSO یک‌بار مصرف
   * @param telegramId - شناسه تلگرام ادمین ربات
   * @param adminId - شناسه ادمین وب‌پنل
   */
  async generateToken(telegramId: bigint | number, adminId: number): Promise<string> {
    // حذف توکن‌های قبلی منقضی نشده این ادمین
    await prisma.adminSsoToken.deleteMany({
      where: {
        telegramId: BigInt(telegramId),
        used: false,
      },
    });

    const token = crypto.randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + SSO_TOKEN_EXPIRY_MINUTES * 60 * 1000);

    await prisma.adminSsoToken.create({
      data: {
        token,
        telegramId: BigInt(telegramId),
        adminId,
        expiresAt,
      },
    });

    logger.info(`[SSO] Token generated for telegramId=${telegramId} adminId=${adminId}, expires=${expiresAt.toISOString()}`);
    return token;
  },

  /**
   * تبادل توکن SSO با JWT
   * توکن باید معتبر، استفاده نشده و منقضی نشده باشد
   */
  async exchangeToken(token: string) {
    const ssoToken = await prisma.adminSsoToken.findUnique({
      where: { token },
    });

    if (!ssoToken) {
      logger.warn(`[SSO] Token not found`);
      return null;
    }

    if (ssoToken.used) {
      logger.warn(`[SSO] Token already used, telegramId=${ssoToken.telegramId}`);
      return null;
    }

    if (ssoToken.expiresAt < new Date()) {
      logger.warn(`[SSO] Token expired, telegramId=${ssoToken.telegramId}`);
      // حذف توکن منقضی
      await prisma.adminSsoToken.delete({ where: { id: ssoToken.id } }).catch(() => {});
      return null;
    }

    // علامت‌گذاری به عنوان استفاده شده
    await prisma.adminSsoToken.update({
      where: { id: ssoToken.id },
      data: { used: true },
    });

    // لود ادمین وب‌پنل
    const admin = await prisma.admin.findUnique({
      where: { id: ssoToken.adminId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        username: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
      },
    });

    if (!admin || !admin.isActive) {
      logger.warn(`[SSO] Admin not found or inactive, adminId=${ssoToken.adminId}`);
      return null;
    }

    // آپدیت آخرین لاگین
    await prisma.admin.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    logger.info(`[SSO] Token exchanged successfully for admin=${admin.username}`);

    return {
      adminId: admin.id,
      username: admin.username,
      role: admin.role,
      admin: {
        id: admin.id,
        firstName: admin.firstName,
        lastName: admin.lastName,
        email: admin.email,
        username: admin.username,
        role: admin.role,
        lastLoginAt: admin.lastLoginAt,
      },
    };
  },

  /**
   * پاکسازی توکن‌های منقضی
   */
  async cleanupExpired() {
    const result = await prisma.adminSsoToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { used: true, createdAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } },
        ],
      },
    });
    if (result.count > 0) {
      logger.info(`[SSO] Cleaned up ${result.count} expired/used tokens`);
    }
  },

  /**
   * پیدا کردن یا ایجاد ادمین وب‌پنل متناظر با ادمین ربات (auto-provision)
   */
  async findOrCreatePanelAdmin(botAdmin: {
    telegramId: bigint;
    username?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    role: string;
  }): Promise<{ id: number; username: string } | null> {
    const telegramUsername = botAdmin.username;
    const generatedUsername = `bot_admin_${botAdmin.telegramId}`;

    // ۱. جستجو بر اساس username تلگرام (اگر موجود باشد)
    if (telegramUsername) {
      const existing = await prisma.admin.findFirst({
        where: { username: telegramUsername, isActive: true },
        select: { id: true, username: true },
      });
      if (existing) return existing;
    }

    // ۲. جستجو بر اساس username ساخته شده اتوماتیک (bot_admin_XXXX)
    const existingGenerated = await prisma.admin.findFirst({
      where: { username: generatedUsername, isActive: true },
      select: { id: true, username: true },
    });
    if (existingGenerated) return existingGenerated;

    // ۳. جستجو از طریق توکن‌های SSO قبلی
    const pastToken = await prisma.adminSsoToken.findFirst({
      where: { telegramId: BigInt(botAdmin.telegramId) },
      orderBy: { createdAt: 'desc' },
    });
    if (pastToken) {
      const pastAdmin = await prisma.admin.findUnique({
        where: { id: pastToken.adminId },
        select: { id: true, username: true, isActive: true },
      });
      if (pastAdmin?.isActive) return { id: pastAdmin.id, username: pastAdmin.username };
    }

    // ۴. Auto-provision: ایجاد ادمین وب‌پنل جدید
    const bcrypt = await import('bcryptjs');
    const randomPassword = crypto.randomBytes(32).toString('hex');
    const passwordHash = await bcrypt.hash(randomPassword, 10);

    // تعیین role وب‌پنل بر اساس role ربات
    let panelRole: 'OWNER' | 'SUPER_ADMIN' | 'ADMIN' | 'MODERATOR' = 'ADMIN';
    if (botAdmin.role === 'OWNER') panelRole = 'OWNER';
    else if (botAdmin.role === 'SUPER_ADMIN') panelRole = 'SUPER_ADMIN';
    else if (botAdmin.role === 'ADMIN') panelRole = 'ADMIN';
    else if (botAdmin.role === 'MODERATOR') panelRole = 'MODERATOR';

    try {
      const newAdmin = await prisma.admin.create({
        data: {
          username: generatedUsername,
          passwordHash,
          role: panelRole,
          isActive: true,
          firstName: botAdmin.firstName || null,
          lastName: botAdmin.lastName || null,
        },
      });

      logger.info(`[SSO] Auto-provisioned panel admin: ${newAdmin.username} (id=${newAdmin.id}) for telegramId=${botAdmin.telegramId}`);
      return { id: newAdmin.id, username: newAdmin.username };
    } catch (err: any) {
      // اگر unique constraint خورد، یعنی بین چک و ایجاد ساخته شده — دوباره سرچ کن
      if (err?.code === 'P2002') {
        logger.warn(`[SSO] Race condition on create, retrying findFirst for telegramId=${botAdmin.telegramId}`);
        const retryAdmin = await prisma.admin.findFirst({
          where: { username: generatedUsername },
          select: { id: true, username: true },
        });
        if (retryAdmin) return retryAdmin;
      }
      logger.error(`[SSO] Failed to auto-provision panel admin for telegramId=${botAdmin.telegramId}:`, err);
      return null;
    }
  },
};
