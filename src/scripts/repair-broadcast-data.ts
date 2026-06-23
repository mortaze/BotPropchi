// src/scripts/repair-broadcast-data.ts
// ابزار تعمیر داده‌های Broadcast - PHASE 3

import { prisma } from '../prisma/client';
import { logger } from '../utils/logger';

interface RepairReport {
  totalUsers: number;
  usersRepaired: number;
  usersSkipped: number;
  usersStillInvalid: number;
  details: Array<{ userId: number; telegramId: string; action: string; before: string; after: string }>;
}

export async function repairBroadcastData(): Promise<RepairReport> {
  const report: RepairReport = {
    totalUsers: 0,
    usersRepaired: 0,
    usersSkipped: 0,
    usersStillInvalid: 0,
    details: [],
  };

  // Find all users
  const users = await prisma.user.findMany({
    select: { id: true, telegramId: true, username: true, firstName: true },
  });
  report.totalUsers = users.length;

  for (const user of users) {
    const tid = user.telegramId;
    const tidNum = Number(tid);

    // Check if telegramId is valid
    const isValid = tid && tid !== BigInt(0) && tidNum > 0 && Number.isFinite(tidNum);

    if (isValid) {
      // telegramId is valid — no repair needed
      report.usersSkipped++;
      continue;
    }

    // telegramId is invalid — try to find a valid one
    // Check if there's a broadcast log with a valid telegramId for this user
    const logWithValidTid = await prisma.broadcastLog.findFirst({
      where: { userId: user.id, telegramId: { not: BigInt(0) } },
      orderBy: { createdAt: 'desc' },
    });

    if (logWithValidTid && logWithValidTid.telegramId !== BigInt(0)) {
      // Repair: use the valid telegramId from broadcast log
      const before = tid.toString();
      await prisma.user.update({
        where: { id: user.id },
        data: { telegramId: logWithValidTid.telegramId },
      });
      report.usersRepaired++;
      report.details.push({
        userId: user.id,
        telegramId: logWithValidTid.telegramId.toString(),
        action: 'REPAIRED_FROM_LOG',
        before,
        after: logWithValidTid.telegramId.toString(),
      });
      logger.info(`[Repair] User ${user.id}: repaired telegramId from ${before} to ${logWithValidTid.telegramId.toString()}`);
    } else {
      // Cannot repair — mark as invalid
      report.usersStillInvalid++;
      report.details.push({
        userId: user.id,
        telegramId: tid.toString(),
        action: 'STILL_INVALID',
        before: tid.toString(),
        after: 'N/A',
      });
      logger.warn(`[Repair] User ${user.id}: telegramId ${tid.toString()} is invalid and no repair source found`);
    }
  }

  logger.info(`[Repair] Complete: ${report.usersRepaired} repaired, ${report.usersSkipped} skipped, ${report.usersStillInvalid} still invalid`);
  return report;
}

// PHASE 5: Pre-broadcast validation
export async function validateBroadcastRecipients(broadcastId: number) {
  const logs = await prisma.broadcastLog.findMany({
    where: { broadcastId, status: 'PENDING' },
    select: { id: true, userId: true, telegramId: true },
  });

  const issues: Array<{ logId: number; userId: number; telegramId: string; issue: string }> = [];
  let validCount = 0;

  for (const log of logs) {
    const tid = log.telegramId;
    const tidNum = Number(tid);

    if (!tid || tid === BigInt(0) || tidNum <= 0 || !Number.isFinite(tidNum)) {
      issues.push({ logId: log.id, userId: log.userId, telegramId: tid.toString(), issue: 'INVALID_TELEGRAM_ID' });
    } else {
      validCount++;
    }
  }

  // Check for duplicates
  const telegramIds = logs.map(l => l.telegramId.toString());
  const seen = new Set<string>();
  const duplicates = telegramIds.filter(tid => { if (seen.has(tid)) return true; seen.add(tid); return false; });
  if (duplicates.length > 0) {
    issues.push({ logId: 0, userId: 0, telegramId: duplicates[0], issue: `DUPLICATE_TELEGRAM_IDS: ${duplicates.length} duplicates` });
  }

  return {
    broadcastId,
    totalRecipients: logs.length,
    validCount,
    invalidCount: issues.filter(i => i.issue === 'INVALID_TELEGRAM_ID').length,
    duplicateCount: duplicates.length,
    hasIssues: issues.length > 0,
    issues,
  };
}
