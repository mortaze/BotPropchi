// src/api/server.ts

import express, {
  Request,
  Response,
  NextFunction,
} from "express";

import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";

import { config } from "../config";
import { logger } from "../utils/logger";

import { authRouter } from "./routes/auth.routes";
import { discountRouter } from "./routes/discount.routes";
import lotteryRouter from "./routes/lottery.routes";
import { userRouter } from "./routes/user.routes";
import { referralRouter } from "./routes/referral.routes";

import { authMiddleware } from "./middlewares/auth.middleware";

export function startAdminApi() {
  const app = express();

  // ───────────────── TRUST PROXY (Railway) ─────────────────
  app.set("trust proxy", 1);

  // ───────────────── SECURITY ─────────────────
  app.use(helmet());

  app.use(
    cors({
      origin:
        process.env.NODE_ENV === "development"
          ? "*"
          : process.env.FRONTEND_URL || "*",
      credentials: true,
    })
  );

  // ───────────────── BODY PARSER ─────────────────
  app.use(express.json({ limit: "2mb" }));

  app.use(
    express.urlencoded({
      extended: true,
    })
  );

  // ───────────────── REQUEST LOGGER ─────────────────
  app.use(
    (
      req: Request,
      _res: Response,
      next: NextFunction
    ) => {
      logger.info(
        `📥 ${req.method} ${req.originalUrl}`
      );

      if (Object.keys(req.body || {}).length > 0) {
        logger.debug("BODY:", req.body);
      }

      next();
    }
  );

  // ───────────────── RATE LIMIT ─────────────────
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 300,

      standardHeaders: true,
      legacyHeaders: false,

      message: {
        success: false,
        error:
          "درخواست‌های زیادی ارسال شده، کمی بعد دوباره تلاش کنید",
      },
    })
  );

  // ───────────────── ROOT ─────────────────
  app.get("/", (_req: Request, res: Response) => {
    return res.status(200).json({
      success: true,
      message: "BotPropchi API is running 🚀",
      environment:
        process.env.NODE_ENV || "development",
      uptime: process.uptime(),
      timestamp: new Date(),
    });
  });

  // ───────────────── HEALTH CHECK ─────────────────
  app.get(
    "/health",
    (_req: Request, res: Response) => {
      return res.status(200).json({
        success: true,
        status: "ok",
        timestamp: new Date(),
      });
    }
  );

  // ───────────────── AUTH ROUTES ─────────────────
  app.use("/api/auth", authRouter);

  // ───────────────── DISCOUNT ROUTES ─────────────────
  app.use(
    "/api/discounts",
    authMiddleware,
    discountRouter
  );

  // ───────────────── LOTTERY ROUTES ─────────────────
  app.use(
    "/api/lotteries",
    authMiddleware,
    lotteryRouter
  );

  // ───────────────── USER ROUTES ─────────────────
  app.use(
    "/api/users",
    authMiddleware,
    userRouter
  );

  // ───────────────── REFERRAL ROUTES ─────────────────
  app.use(
    "/api/referrals",
    authMiddleware,
    referralRouter
  );

  // ───────────────── 404 HANDLER ─────────────────
  app.use(
    "*",
    (req: Request, res: Response) => {
      logger.warn(
        `❌ Route Not Found: ${req.method} ${req.originalUrl}`
      );

      return res.status(404).json({
        success: false,
        error: "Route not found",
      });
    }
  );

  // ───────────────── ERROR HANDLER ─────────────────
  app.use(
    (
      err: any,
      req: Request,
      res: Response,
      _next: NextFunction
    ) => {
      logger.error("❌ API ERROR", {
        method: req.method,
        url: req.originalUrl,
        message: err.message,
        stack: err.stack,
      });

      // JSON parse error
      if (err instanceof SyntaxError) {
        return res.status(400).json({
          success: false,
          error: "فرمت JSON نامعتبر است",
        });
      }

      return res.status(500).json({
        success: false,
        error:
          process.env.NODE_ENV === "development"
            ? err.message
            : "خطای داخلی سرور",
      });
    }
  );

  // ───────────────── START SERVER ─────────────────
  const PORT =
    Number(process.env.PORT) ||
    config?.api?.port ||
    8080;

  const server = app.listen(
    PORT,
    "0.0.0.0",
    () => {
      logger.info(
        `✅ Admin API running on port ${PORT}`
      );
    }
  );

  // ───────────────── GRACEFUL SHUTDOWN ─────────────────
  process.on("SIGTERM", () => {
    logger.warn("🛑 SIGTERM RECEIVED");

    server.close(() => {
      logger.info("✅ Server Closed");
      process.exit(0);
    });
  });

  process.on("SIGINT", () => {
    logger.warn("🛑 SIGINT RECEIVED");

    server.close(() => {
      logger.info("✅ Server Closed");
      process.exit(0);
    });
  });

  return app;
}
