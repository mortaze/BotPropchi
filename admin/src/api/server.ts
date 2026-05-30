// src/api/server.ts
// API پنل ادمین

import express, {
  Request,
  Response,
  NextFunction,
} from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

import { config } from '../config';
import { logger } from '../utils/logger';

import { authRouter } from './routes/auth.routes';
import { discountRouter } from './routes/discount.routes';
import { lotteryRouter } from './routes/lottery.routes';
import { userRouter } from './routes/user.routes';

import { authMiddleware } from './middlewares/auth.middleware';

export function startAdminApi() {
  const app = express();

  // ───────────────── امنیت ─────────────────
  app.use(helmet());

  app.use(
    cors({
      origin: config.isDev
        ? '*'
        : process.env.FRONTEND_URL || '*',
      credentials: true,
    })
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // ───────────────── Rate Limit ─────────────────
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        error:
          'درخواست‌های زیادی ارسال شده. لطفاً کمی بعد دوباره تلاش کنید.',
      },
    })
  );

  // ───────────────── صفحه اصلی ─────────────────
  app.get('/', (_req: Request, res: Response) => {
    res.status(200).json({
      success: true,
      message: 'BotPropchi API is running 🚀',
      environment: config.isDev ? 'development' : 'production',
      uptime: process.uptime(),
      timestamp: new Date(),
    });
  });

  // ───────────────── Health Check ─────────────────
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      time: new Date(),
    });
  });

  // ───────────────── API Routes ─────────────────
  app.use('/api/auth', authRouter);

  app.use(
    '/api/discounts',
    authMiddleware,
    discountRouter
  );

  app.use(
    '/api/lotteries',
    authMiddleware,
    lotteryRouter
  );

  app.use(
    '/api/users',
    authMiddleware,
    userRouter
  );

  // ───────────────── 404 ─────────────────
  app.use('*', (_req: Request, res: Response) => {
    res.status(404).json({
      error: 'Route not found',
    });
  });

  // ───────────────── Error Handler ─────────────────
  app.use(
    (
      err: Error,
      _req: Request,
      res: Response,
      _next: NextFunction
    ) => {
      logger.error('API Error:', err);

      res.status(500).json({
        error: 'خطای داخلی سرور',
      });
    }
  );

  // ───────────────── Start Server ─────────────────
  const PORT = Number(process.env.PORT) || config.api.port || 8080;

  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`✅ Admin API running on port ${PORT}`);
  });
}