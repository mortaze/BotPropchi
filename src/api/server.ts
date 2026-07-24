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
import { Telegraf } from "telegraf";
import { broadcastService } from "../services/broadcast.service";
import { logger } from "../utils/logger";
import { BRAND_NAME } from "../constants";

import { authRouter } from "./routes/auth.routes";
import { aiSettingsRouter } from "./routes/ai-settings.routes";
import { analyticsRouter } from "./routes/analytics.routes";
import { botAdminRouter } from "./routes/bot-admin.routes";
import { systemLogRouter } from "./routes/system-log.routes";
import lotteryRouter from "./routes/lottery.routes";
import { userRouter } from "./routes/user.routes";
import { referralRouter } from "./routes/referral.routes";
import { leaderboardRouter } from "./routes/leaderboard.routes";
import { createChannelRouter } from "./routes/channel.routes";
import { createGroupRouter } from "./routes/group.routes";
import { keywordReplyRouter } from "./routes/keyword-reply.routes";
import { settingsRouter } from "./routes/settings.routes";
import { adminUserRouter } from "./routes/admin-user.routes";
import { scoringRouter } from "./routes/scoring.routes";
import { createMiniAppRouter } from "./routes/mini-app.routes";
import { miniAppLogRouter } from "./routes/mini-app-log.routes";
import { postRouter } from "./routes/post.routes";
import { scheduledMessageRoutes } from "./routes/scheduled-message.routes";
import { autoReplyRoutes } from "./routes/auto-reply.routes";
import { menuRouter } from "./routes/menu.routes";

import { searchRouter } from "./routes/search.routes";
import { attributionRouter } from "./routes/attribution.routes";
import { broadcastDiagnosticsRouter } from "./routes/broadcast-diagnostics.routes";
import { broadcastRcaRouter } from "./routes/broadcast-rca.routes";
import { systemIntegrityRouter } from "./routes/system-integrity.routes";
import { userDeleteRouter } from "./routes/user-delete.routes";
import { userEventRouter } from "./routes/user-event.routes";
import { ticketRouter } from "./routes/ticket.routes";
import { ticketCategoryRouter } from "./routes/ticket-category.routes";
import { automationRouter } from "./routes/automation.routes";

import { authMiddleware, requireFeature, requireOwner } from "./middlewares/auth.middleware";

export function startAdminApi(bot?: Telegraf) {
  if (bot) broadcastService.setBot(bot);
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
      message: `${BRAND_NAME} API is running 🚀`,
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

  // ───────────────── TELEGRAM MINI APP ROUTES ─────────────────
  app.use("/api/mini-app", createMiniAppRouter(bot));

  // ───────────────── LOTTERY ROUTES ─────────────────
  app.use(
    "/api/lotteries",
    authMiddleware,
    requireFeature("lottery"),
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
    requireFeature("referrals"),
    referralRouter
  );

  app.use("/api/scoring", authMiddleware, requireFeature("points"), scoringRouter);

  // ───────────────── LEADERBOARD / SEASONS ROUTES ─────────────────
  app.use("/api/leaderboard", authMiddleware, leaderboardRouter);


  app.use(
    "/api/required-channels",
    authMiddleware,
    requireFeature("force_join"),
    createChannelRouter(bot)
  );

  app.use(
    "/api/groups",
    authMiddleware,
    requireFeature("groups"),
    createGroupRouter(bot)
  );

  app.use(
    "/api/keyword-replies",
    authMiddleware,
    requireFeature("auto_replies"),
    keywordReplyRouter
  );

  app.use("/api/bot-admins", authMiddleware, botAdminRouter);
  app.use("/api/analytics", authMiddleware, requireFeature("reports"), analyticsRouter);
  app.use("/api/attribution", authMiddleware, requireFeature("reports"), attributionRouter);
  app.use("/api/broadcast-diagnostics", authMiddleware, requireFeature("reports"), broadcastDiagnosticsRouter);
  app.use("/api/broadcast-rca", authMiddleware, requireFeature("reports"), broadcastRcaRouter);
  app.use("/api/system-integrity", authMiddleware, requireFeature("reports"), systemIntegrityRouter);
  app.use("/api/admin/users", authMiddleware, userDeleteRouter);
  app.use("/api/user-events", authMiddleware, userEventRouter);
  app.use("/api/search", authMiddleware, searchRouter);
  app.use("/api/settings", authMiddleware, settingsRouter);
  app.use("/api/admin-users", authMiddleware, requireOwner, adminUserRouter);
  app.use("/api/ai-settings", authMiddleware, aiSettingsRouter);
  app.use("/api/system-logs", authMiddleware, systemLogRouter);
  app.use("/api/mini-app-logs", authMiddleware, miniAppLogRouter);

  // ───────────────── POST ROUTES ─────────────────
  app.use("/api/posts", authMiddleware, requireFeature("posts"), postRouter);

  // ───────────────── SCHEDULED MESSAGE ROUTES ─────────────────
  app.use("/api/scheduled-messages", authMiddleware, scheduledMessageRoutes);

  // ───────────────── AUTO REPLY ROUTES ───────────────────────
  app.use("/api/auto-replies", authMiddleware, autoReplyRoutes);

  // ───────────────── MENU ROUTES ─────────────────
  app.use("/api/menu", authMiddleware, menuRouter);

  // ───────────────── TICKET ROUTES ────────────────────────────
  app.use("/api/tickets", authMiddleware, ticketRouter);
  app.use("/api/ticket-categories", authMiddleware, ticketCategoryRouter);

  // ───────────────── AUTOMATION ROUTES ────────────────────────
  app.use("/api/automation", authMiddleware, automationRouter);

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
