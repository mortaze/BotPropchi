// src/utils/logger.ts

import winston from "winston";
import fs from "fs";
import path from "path";
import crypto from "crypto";

// ساخت پوشه logs اگر وجود نداشت
const logDir = path.join(process.cwd(), "logs");

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// تشخیص محیط
const isDev = process.env.NODE_ENV !== "production";

// فرمت لاگ
const devFormat = winston.format.printf(
  ({ timestamp, level, message, ...meta }) => {
    const extra =
      Object.keys(meta).length > 0
        ? JSON.stringify(meta, null, 2)
        : "";

    return `[${timestamp}] ${level}: ${message} ${extra}`;
  }
);

export const logger = winston.createLogger({
  level: isDev ? "debug" : "info",

  format: winston.format.combine(
    winston.format.timestamp({
      format: "YYYY-MM-DD HH:mm:ss",
    }),
    winston.format.errors({ stack: true }),

    isDev
      ? winston.format.combine(
          winston.format.colorize(),
          devFormat
        )
      : winston.format.json()
  ),

  transports: [
    // Console
    new winston.transports.Console(),

    // فقط خطاها
    new winston.transports.File({
      filename: path.join(logDir, "error.log"),
      level: "error",
    }),

    // همه لاگ‌ها
    new winston.transports.File({
      filename: path.join(logDir, "combined.log"),
    }),
  ],

  // جلوگیری از crash
  exceptionHandlers: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.join(logDir, "exceptions.log"),
    }),
  ],

  rejectionHandlers: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.join(logDir, "rejections.log"),
    }),
  ],
});

const traceStorage = new Map<string, { start: number }>();

export function createTraceId(): string {
  return crypto.randomBytes(4).toString('hex');
}

export function traceLogger(traceId?: string) {
  const tid = traceId || createTraceId();
  traceStorage.set(tid, { start: Date.now() });
  return {
    traceId: tid,
    info: (msg: string, meta?: any) => logger.info(`[${tid}] ${msg}`, meta),
    warn: (msg: string, meta?: any) => logger.warn(`[${tid}] ${msg}`, meta),
    error: (msg: string, meta?: any) => logger.error(`[${tid}] ${msg}`, meta),
    debug: (msg: string, meta?: any) => logger.debug(`[${tid}] ${msg}`, meta),
    duration: () => {
      const entry = traceStorage.get(tid);
      if (entry) return Date.now() - entry.start;
      return 0;
    },
    done: () => {
      traceStorage.delete(tid);
    },
  };
}

export default logger;
