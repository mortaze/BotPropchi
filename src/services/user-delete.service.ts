// src/services/user-delete.service.ts
// سرویس حذف امن کاربران

import { Prisma } from '@prisma/client';
import { prisma } from '../prisma/client';
import { logger } from '../utils/logger';

interface DeletePreview {
  user: {
    id: number;
    telegramId: string;
    username: string | null;
    firstName: string;
    createdAt: string;
  } | null;
  willDelete: Record<string, number>;
  safetyWarnings: string[];
}

interface DeleteResult {
  success: boolean;
  deletedUserId: number;
  auditId: number;
  recordsDeleted: Record<string, number>;
}

// Safety check: these users cannot be deleted
const PROTECTED_ROLES = ['OWNER', 'SUPER_ADMIN'];

export const userDeleteService = {
  // Get delete preview
  async getDeletePreview(userId: number): Promise<DeletePreview> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return { user: null, willDelete: {}, safetyWarnings: [] };

    const willDelete: Record<string, number> = {};
    const safetyWarnings: string[] = [];

    // Check safety rules
    const botAdmin = await prisma.botAdmin.findUnique({ where: { telegramId: user.telegramId } });
    if (botAdmin) {
      if (botAdmin.role === 'OWNER') {
        safetyWarnings.push('⚠️ حذف Owner مجاز نیست');
      } else if (PROTECTED_ROLES.includes(botAdmin.role)) {
        safetyWarnings.push(`⚠️ حذف ${botAdmin.role} مجاز نیست`);
      }
    }

    // Check for active lottery entries
    const activeLottery = await prisma.lotteryEntry.findFirst({
      where: { userId, lottery: { isCompleted: false } },
    });
    if (activeLottery) {
      safetyWarnings.push('⚠️ کاربر در قرعه‌کشی فعال شرکت دارد');
    }

    // Check for last super admin
    if (botAdmin?.role === 'SUPER_ADMIN') {
      const superAdminCount = await prisma.botAdmin.count({ where: { role: 'SUPER_ADMIN', status: 'ACTIVE' } });
      if (superAdminCount <= 1) {
        safetyWarnings.push('⚠️ حذف آخرین Super Admin مجاز نیست');
      }
    }

    // Count records to delete (all dependent tables)
    const counts = await Promise.all([
      prisma.userAttribution.count({ where: { userId } }),
      prisma.attributionEvent.count({ where: { userId } }),
      prisma.pointLog.count({ where: { userId } }),
      prisma.referral.count({ where: { referrerId: userId } }),
      prisma.referral.count({ where: { referredUserId: userId } }),
      prisma.leaderboardCache.count({ where: { userId } }),
      prisma.referralLog.count({ where: { inviterId: userId } }),
      prisma.referralLog.count({ where: { referredId: userId } }),
      prisma.lotteryEntry.count({ where: { userId } }),
      prisma.lotteryWinner.count({ where: { userId } }),
      prisma.userRequiredChannelMembership.count({ where: { userId } }),
      prisma.broadcastLog.count({ where: { userId } }),
      prisma.miniAppDebugLog.count({ where: { userId } }),
      prisma.systemLog.count({ where: { userId } }),
    ]);

    const tableNames = [
      'attributions', 'attributionEvents', 'pointLogs',
      'referralsAsInviter', 'referralsAsReferred', 'leaderboardCache',
      'referralLogsAsInviter', 'referralLogsAsReferred',
      'lotteryEntries', 'lotteryWins', 'channelMemberships',
      'broadcastLogs',
      'miniAppDebugLogs', 'systemLogs',
    ];

    tableNames.forEach((name, i) => {
      if (counts[i] > 0) willDelete[name] = counts[i];
    });

    return {
      user: {
        id: user.id,
        telegramId: user.telegramId.toString(),
        username: user.username,
        firstName: user.firstName,
        createdAt: user.createdAt.toISOString(),
      },
      willDelete,
      safetyWarnings,
    };
  },

  // Delete user with cascade and audit
  async deleteUser(userId: number, adminId: number, adminName: string): Promise<DeleteResult> {
    // Safety checks
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return { success: false, deletedUserId: userId, auditId: 0, recordsDeleted: {} };

    // Check if user is protected
    const botAdmin = await prisma.botAdmin.findUnique({ where: { telegramId: user.telegramId } });
    if (botAdmin?.role === 'OWNER') {
      throw new Error('حذف Owner مجاز نیست');
    }
    if (botAdmin?.role === 'SUPER_ADMIN') {
      const superAdminCount = await prisma.botAdmin.count({ where: { role: 'SUPER_ADMIN', status: 'ACTIVE' } });
      if (superAdminCount <= 1) {
        throw new Error('حذف آخرین Super Admin مجاز نیست');
      }
    }

    // Create snapshot for audit
    const snapshot = {
      ...user,
      telegramId: user.telegramId.toString(),
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      lastActivityAt: user.lastActivityAt?.toISOString() ?? null,
      firstActivityAt: user.firstActivityAt?.toISOString() ?? null,
    };

    // Delete in transaction
    const result = await prisma.$transaction(async (tx) => {
      const deleted: Record<string, number> = {};

      // Delete all dependent records (order matters for foreign keys)
      deleted.attributionEvents = (await tx.attributionEvent.deleteMany({ where: { userId } })).count;
      deleted.attributions = (await tx.userAttribution.deleteMany({ where: { userId } })).count;
      deleted.pointLogs = (await tx.pointLog.deleteMany({ where: { userId } })).count;
      deleted.referralsAsInviter = (await tx.referral.deleteMany({ where: { referrerId: userId } })).count;
      deleted.referralsAsReferred = (await tx.referral.deleteMany({ where: { referredUserId: userId } })).count;
      deleted.leaderboardCache = (await tx.leaderboardCache.deleteMany({ where: { userId } })).count;
      deleted.referralLogsAsInviter = (await tx.referralLog.deleteMany({ where: { inviterId: userId } })).count;
      deleted.referralLogsAsReferred = (await tx.referralLog.deleteMany({ where: { referredId: userId } })).count;
      deleted.lotteryEntries = (await tx.lotteryEntry.deleteMany({ where: { userId } })).count;
      deleted.lotteryWins = (await tx.lotteryWinner.deleteMany({ where: { userId } })).count;
      deleted.channelMemberships = (await tx.userRequiredChannelMembership.deleteMany({ where: { userId } })).count;
      deleted.broadcastLogs = (await tx.broadcastLog.deleteMany({ where: { userId } })).count;
      deleted.miniAppDebugLogs = (await tx.miniAppDebugLog.deleteMany({ where: { userId } })).count;
      deleted.systemLogs = (await tx.systemLog.deleteMany({ where: { userId } })).count;

      // Create audit record BEFORE deleting user
      const audit = await tx.deletedUsersAudit.create({
        data: {
          deletedUserId: user.id,
          telegramId: user.telegramId,
          username: user.username,
          firstName: user.firstName,
          deletedByAdminId: adminId,
          deletedByAdminName: adminName,
          snapshot: snapshot as Prisma.InputJsonValue,
        },
      });

      // Delete the user
      await tx.user.delete({ where: { id: userId } });

      return { auditId: audit.id, recordsDeleted: deleted };
    });

    logger.info(`[UserDelete] userId=${userId} deleted by admin=${adminId} records=${JSON.stringify(result.recordsDeleted)}`);

    return {
      success: true,
      deletedUserId: userId,
      auditId: result.auditId,
      recordsDeleted: result.recordsDeleted,
    };
  },

  // Get deleted users list
  async getDeletedUsers(params: { page?: number; limit?: number }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));

    const [items, total] = await Promise.all([
      prisma.deletedUsersAudit.findMany({
        orderBy: { deletedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.deletedUsersAudit.count(),
    ]);

    return { items, total, pages: Math.ceil(total / limit) };
  },
};
