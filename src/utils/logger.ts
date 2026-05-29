// src/utils/logger.ts

import winston from "winston";
import fs from "fs";
import path from "path";

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

export default logger;
