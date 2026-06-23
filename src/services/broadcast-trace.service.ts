// src/services/broadcast-trace.service.ts
// Wire-Level Delivery Audit — no assumptions, only raw data

import { prisma } from '../prisma/client';
import { config } from '../config';
import { logger } from '../utils/logger';
import { Telegraf } from 'telegraf';

const BOT_TOKEN_FINGERPRINT = config.bot.token.slice(-8);

let botInstance: Telegraf | null = null;

export function setBotInstanceForTrace(bot: Telegraf) {
  botInstance = bot;
}

interface LiveTestResult {
  userId: number;
  databaseTelegramId: string;
  databaseChatId: string | null;
  databaseUsername: string | null;
  resolvedChatId: string;
  botTokenFingerprint: string;
  apiEndpoint: string;
  rawRequestPayload: any;
  rawResponse: any;
  httpStatus: number | null;
  telegramErrorCode: number | null;
  telegramDescription: string | null;
  success: boolean;
  error: string | null;
  timestamp: string;
}

interface ComparisonReport {
  successfulUsers: LiveTestResult[];
  failedUsers: LiveTestResult[];
  summary: {
    totalTested: number;
    successCount: number;
    failCount: number;
    commonFailures: Array<{ description: string; count: number }>;
  };
}

// Live test: send real message, capture everything
export async function liveTestSend(userId: number): Promise<LiveTestResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error(`User ${userId} not found`);

  const databaseTelegramId = user.telegramId.toString();
  const databaseChatId = user.telegramId.toString(); // chatId = telegramId in this schema
  const databaseUsername = user.username;

  const resolvedChatId = Number(user.telegramId);
  const timestamp = new Date().toISOString();

  const baseResult: LiveTestResult = {
    userId,
    databaseTelegramId,
    databaseChatId,
    databaseUsername,
    resolvedChatId: String(resolvedChatId),
    botTokenFingerprint: BOT_TOKEN_FINGERPRINT,
    apiEndpoint: '',
    rawRequestPayload: null,
    rawResponse: null,
    httpStatus: null,
    telegramErrorCode: null,
    telegramDescription: null,
    success: false,
    error: null,
    timestamp,
  };

  if (!botInstance) {
    baseResult.error = 'Bot instance not initialized';
    return baseResult;
  }

  if (!resolvedChatId || resolvedChatId <= 0) {
    baseResult.error = `Invalid resolved chatId: ${resolvedChatId}`;
    baseResult.apiEndpoint = `POST /bot${BOT_TOKEN_FINGERPRINT}*/sendMessage`;
    baseResult.rawRequestPayload = { chat_id: resolvedChatId, text: 'test' };
    return baseResult;
  }

  // Build exact payload that will be sent
  const testMessage = `🔍 Diagnostic test ${timestamp}`;
  const payload = { chat_id: resolvedChatId, text: testMessage };
  baseResult.apiEndpoint = `POST /bot${BOT_TOKEN_FINGERPRINT}*/sendMessage`;
  baseResult.rawRequestPayload = payload;

  try {
    const startTime = Date.now();
    const response = await botInstance.telegram.sendMessage(resolvedChatId, testMessage);
    const responseTime = Date.now() - startTime;

    baseResult.success = true;
    baseResult.rawResponse = {
      ok: true,
      result: {
        message_id: (response as any).message_id,
        chat: (response as any).chat,
        date: (response as any).date,
      },
      responseTimeMs: responseTime,
    };
    baseResult.httpStatus = 200;

    // Delete the test message after 1 second
    setTimeout(() => {
      if (botInstance && (response as any).message_id) {
        botInstance.telegram.deleteMessage(resolvedChatId, (response as any).message_id).catch(() => {});
      }
    }, 1000);

    logger.info(`[Trace] Live test SUCCESS: userId=${userId} chatId=${resolvedChatId}`);
  } catch (error: any) {
    baseResult.success = false;
    baseResult.error = error.message || String(error);

    // Parse Telegram API error
    let rawResponse: any = { ok: false, error: error.message };
    try {
      if (error.response) {
        rawResponse = error.response;
        baseResult.httpStatus = error.response.status || error.response.parameters?.error_code || null;
        baseResult.telegramErrorCode = error.response.parameters?.error_code || null;
        baseResult.telegramDescription = error.response.description || null;
      }
      if (error.on) {
        rawResponse = { ok: false, description: error.description, error_code: error.error_code, parameters: error.parameters };
        baseResult.httpStatus = error.error_code || null;
        baseResult.telegramErrorCode = error.error_code || null;
        baseResult.telegramDescription = error.description || null;
      }
    } catch {}

    baseResult.rawResponse = rawResponse;
    logger.warn(`[Trace] Live test FAILED: userId=${userId} chatId=${resolvedChatId} error=${error.message}`);
  }

  return baseResult;
}

// getChat test: verify user exists on Telegram side
export async function liveTestGetChat(userId: number): Promise<LiveTestResult & { getChatResponse: any }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error(`User ${userId} not found`);

  const databaseTelegramId = user.telegramId.toString();
  const resolvedChatId = Number(user.telegramId);
  const timestamp = new Date().toISOString();

  const result: LiveTestResult & { getChatResponse: any } = {
    userId,
    databaseTelegramId,
    databaseChatId: user.telegramId.toString(),
    databaseUsername: user.username,
    resolvedChatId: String(resolvedChatId),
    botTokenFingerprint: BOT_TOKEN_FINGERPRINT,
    apiEndpoint: `POST /bot${BOT_TOKEN_FINGERPRINT}*/getChat`,
    rawRequestPayload: { chat_id: resolvedChatId },
    rawResponse: null,
    httpStatus: null,
    telegramErrorCode: null,
    telegramDescription: null,
    success: false,
    error: null,
    timestamp,
    getChatResponse: null,
  };

  if (!botInstance) {
    result.error = 'Bot instance not initialized';
    return result;
  }

  if (!resolvedChatId || resolvedChatId <= 0) {
    result.error = `Invalid resolved chatId: ${resolvedChatId}`;
    return result;
  }

  try {
    const startTime = Date.now();
    const chat = await botInstance.telegram.getChat(resolvedChatId);
    const responseTime = Date.now() - startTime;

    result.success = true;
    result.getChatResponse = chat;
    result.rawResponse = {
      ok: true,
      result: chat,
      responseTimeMs: responseTime,
    };
    result.httpStatus = 200;

    logger.info(`[Trace] getChat SUCCESS: userId=${userId} chatId=${resolvedChatId}`);
  } catch (error: any) {
    result.success = false;
    result.error = error.message || String(error);

    let rawResponse: any = { ok: false, error: error.message };
    try {
      if (error.response) {
        rawResponse = error.response;
        result.httpStatus = error.response.status || null;
        result.telegramErrorCode = error.response.parameters?.error_code || null;
        result.telegramDescription = error.response.description || null;
      }
      if (error.on) {
        rawResponse = { ok: false, description: error.description, error_code: error.error_code, parameters: error.parameters };
        result.httpStatus = error.error_code || null;
        result.telegramErrorCode = error.error_code || null;
        result.telegramDescription = error.description || null;
      }
    } catch {}

    result.rawResponse = rawResponse;
    logger.warn(`[Trace] getChat FAILED: userId=${userId} chatId=${resolvedChatId} error=${error.message}`);
  }

  return result;
}

// Batch test: test 10 successful + 10 failed users
export async function batchTraceTest(): Promise<ComparisonReport> {
  // Get 10 users who previously succeeded
  const successfulUserIds = await prisma.broadcastDeliveryLog.findMany({
    where: { finalStatus: 'SUCCESS' },
    distinct: ['userId'],
    select: { userId: true },
    take: 10,
    orderBy: { createdAt: 'desc' },
  });

  // Get 10 users who previously failed
  const failedUserIds = await prisma.broadcastDeliveryLog.findMany({
    where: { finalStatus: 'FAILED' },
    distinct: ['userId'],
    select: { userId: true },
    take: 10,
    orderBy: { createdAt: 'desc' },
  });

  const successfulUsers: LiveTestResult[] = [];
  for (const { userId } of successfulUserIds) {
    try {
      const result = await liveTestSend(userId);
      successfulUsers.push(result);
    } catch (error: any) {
      successfulUsers.push({
        userId,
        databaseTelegramId: 'ERROR',
        databaseChatId: null,
        databaseUsername: null,
        resolvedChatId: 'ERROR',
        botTokenFingerprint: BOT_TOKEN_FINGERPRINT,
        apiEndpoint: '',
        rawRequestPayload: null,
        rawResponse: null,
        httpStatus: null,
        telegramErrorCode: null,
        telegramDescription: null,
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  const failedUsers: LiveTestResult[] = [];
  for (const { userId } of failedUserIds) {
    try {
      const result = await liveTestSend(userId);
      failedUsers.push(result);
    } catch (error: any) {
      failedUsers.push({
        userId,
        databaseTelegramId: 'ERROR',
        databaseChatId: null,
        databaseUsername: null,
        resolvedChatId: 'ERROR',
        botTokenFingerprint: BOT_TOKEN_FINGERPRINT,
        apiEndpoint: '',
        rawRequestPayload: null,
        rawResponse: null,
        httpStatus: null,
        telegramErrorCode: null,
        telegramDescription: null,
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Count common failures
  const allResults = [...successfulUsers, ...failedUsers];
  const failureDescriptions: Record<string, number> = {};
  for (const r of allResults) {
    if (!r.success && r.telegramDescription) {
      failureDescriptions[r.telegramDescription] = (failureDescriptions[r.telegramDescription] || 0) + 1;
    }
  }
  const commonFailures = Object.entries(failureDescriptions)
    .map(([description, count]) => ({ description, count }))
    .sort((a, b) => b.count - a.count);

  return {
    successfulUsers,
    failedUsers,
    summary: {
      totalTested: allResults.length,
      successCount: allResults.filter(r => r.success).length,
      failCount: allResults.filter(r => !r.success).length,
      commonFailures,
    },
  };
}
