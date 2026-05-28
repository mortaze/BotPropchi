// src/api/server.ts
// API پنل ادمین

import express from 'express';
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

  // امنیت
  app.use(helmet());
  app.use(cors({ origin: config.isDev ? '*' : process.env.FRONTEND_URL }));
  app.use(express.json({ limit: '1mb' }));

  // Rate limiting برای API
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100,
      message: { error: 'درخواست‌های زیادی ارسال شده. لطفاً کمی صبر کنید.' },
    })
  );

  // مسیرها
  app.use('/api/auth', authRouter);
  app.use('/api/discounts', authMiddleware, discountRouter);
  app.use('/api/lotteries', authMiddleware, lotteryRouter);
  app.use('/api/users', authMiddleware, userRouter);

  // health check
  app.get('/health', (_, res) => res.json({ status: 'ok', time: new Date() }));

  // مدیریت خطا
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('API Error:', err);
    res.status(500).json({ error: 'خطای داخلی سرور' });
  });

  app.listen(config.api.port, () => {
    logger.info(`✅ Admin API روی پورت ${config.api.port} اجرا شد`);
  });
}
