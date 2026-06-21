import { Prisma } from '@prisma/client';
import { logger } from './logger';

const PRISMA_UNIQUE_CONSTRAINT_CODES = ['P2002', 'P2003'];
const PRISMA_NOT_FOUND_CODES = ['P2025', 'P2001'];
const PRISMA_TIMEOUT_CODES = ['P2024', 'P2026'];

export interface ParsedPrismaError {
  code: string;
  message: string;
  userMessage: string;
  statusCode: number;
  isUnique: boolean;
  isNotFound: boolean;
  isTimeout: boolean;
  meta?: any;
}

export function parsePrismaError(error: unknown): ParsedPrismaError {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const meta = error.meta;
    const code = error.code;

    const isUnique = PRISMA_UNIQUE_CONSTRAINT_CODES.includes(code);
    const isNotFound = PRISMA_NOT_FOUND_CODES.includes(code);
    const isTimeout = PRISMA_TIMEOUT_CODES.includes(code);

    let userMessage = 'خطای پایگاه داده';
    let statusCode = 500;

    if (isUnique) {
      const target = Array.isArray(meta?.target) ? meta.target.join(', ') : '';
      userMessage = target
        ? `رکورد با این ${target} قبلاً ثبت شده است`
        : 'رکورد تکراری';
      statusCode = 409;
    } else if (isNotFound) {
      userMessage = 'رکورد مورد نظر یافت نشد';
      statusCode = 404;
    } else if (isTimeout) {
      userMessage = 'مدت زمان درخواست به پایان رسید، لطفاً دوباره تلاش کنید';
      statusCode = 504;
    } else if (code === 'P2000') {
      userMessage = 'مقدار وارد شده بسیار طولانی است';
      statusCode = 400;
    } else if (code === 'P2005' || code === 'P2006' || code === 'P2007' || code === 'P2011' || code === 'P2012') {
      userMessage = 'مقدار وارد شده معتبر نیست';
      statusCode = 400;
    } else if (code === 'P2014') {
      userMessage = 'به دلیل وجود رابطه نمی‌توان این عملیات را انجام داد';
      statusCode = 409;
    } else if (code === 'P2023') {
      userMessage = 'اطلاعات ورودی ناسازگار است';
      statusCode = 400;
    }

    return { code, message: error.message, userMessage, statusCode, isUnique, isNotFound, isTimeout, meta };
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return {
      code: 'VALIDATION',
      message: error.message,
      userMessage: 'داده‌های ارسالی معتبر نیست',
      statusCode: 400,
      isUnique: false,
      isNotFound: false,
      isTimeout: false,
    };
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return {
      code: 'INIT',
      message: error.message,
      userMessage: 'خطا در اتصال به پایگاه داده',
      statusCode: 503,
      isUnique: false,
      isNotFound: false,
      isTimeout: false,
    };
  }

  if (error instanceof Prisma.PrismaClientRustPanicError) {
    return {
      code: 'RUST_PANIC',
      message: error.message,
      userMessage: 'خطای داخلی پایگاه داده',
      statusCode: 500,
      isUnique: false,
      isNotFound: false,
      isTimeout: false,
    };
  }

  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return {
      code: 'UNKNOWN',
      message: error.message,
      userMessage: 'خطای ناشناخته پایگاه داده',
      statusCode: 500,
      isUnique: false,
      isNotFound: false,
      isTimeout: false,
    };
  }

  return {
    code: 'GENERIC',
    message: error instanceof Error ? error.message : String(error),
    userMessage: 'خطای داخلی سرور',
    statusCode: 500,
    isUnique: false,
    isNotFound: false,
    isTimeout: false,
  };
}

export function prismaErrorHandler(error: unknown, context: string) {
  const parsed = parsePrismaError(error);
  logger.error(`[PrismaError] ${context}:`, {
    code: parsed.code,
    message: parsed.message,
    userMessage: parsed.userMessage,
    meta: parsed.meta,
  });
  return parsed;
}
