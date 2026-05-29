```ts
// src/api/routes/lottery.routes.ts

import { Router } from "express";
import { prisma } from "../../config";
import { lotteryService } from "../../services/lottery.service";
import { authMiddleware } from "../middlewares/auth.middleware";
import { logger } from "../../utils/logger";

const router = Router();

/**
 * GET ALL LOTTERIES
 */
router.get("/", authMiddleware, async (_req, res) => {
  try {
    const lotteries = await prisma.lottery.findMany({
      orderBy: {
        createdAt: "desc",
      },

      include: {
        entries: {
          include: {
            user: true,
          },
        },

        _count: {
          select: {
            entries: true,
          },
        },
      },
    });

    const formatted = lotteries.map((lottery) => ({
      id: lottery.id,
      title: lottery.title,
      description: lottery.description,
      prize: lottery.prize,

      startAt: lottery.startAt,
      endAt: lottery.endAt,

      winnersCount: lottery.winnersCount,
      minPoints: lottery.minPoints,

      isActive: lottery.isActive,
      isCompleted: lottery.isCompleted,

      createdAt: lottery.createdAt,

      participantsCount: lottery._count.entries,

      winners: lottery.entries
        .filter((e) => e.isWinner)
        .map((e) => ({
          id: e.user.id,

          telegramId:
            e.user.telegramId?.toString() || null,

          username: e.user.username,

          firstName: e.user.firstName,

          lastName: e.user.lastName,
        })),
    }));

    return res.json({
      success: true,
      lotteries: formatted,
    });
  } catch (error: any) {
    logger.error("❌ GET LOTTERIES ERROR", error);

    return res.status(500).json({
      success: false,
      error: "خطا در دریافت قرعه‌کشی‌ها",
    });
  }
});

/**
 * CREATE LOTTERY
 */
router.post("/", authMiddleware, async (req, res) => {
  try {
    const {
      title,
      description,
      prize,
      startAt,
      endAt,
      winnersCount,
      minPoints,
      announcementMsg,
    } = req.body;

    // validation
    if (
      !title ||
      !prize ||
      !startAt ||
      !endAt
    ) {
      return res.status(400).json({
        success: false,
        error: "اطلاعات ناقص است",
      });
    }

    const startDate = new Date(startAt);
    const endDate = new Date(endAt);

    // جلوگیری از باگ تاریخ
    if (endDate <= startDate) {
      return res.status(400).json({
        success: false,
        error:
          "تاریخ پایان باید بعد از تاریخ شروع باشد",
      });
    }

    const lottery = await prisma.lottery.create({
      data: {
        title,
        description,
        prize,

        startAt: startDate,
        endAt: endDate,

        winnersCount:
          Number(winnersCount) || 1,

        minPoints:
          Number(minPoints) || 0,

        announcementMsg:
          announcementMsg || "",

        isActive: true,
        isCompleted: false,
      },
    });

    logger.info(
      `✅ Lottery created ${lottery.id}`
    );

    return res.json({
      success: true,
      lottery,
    });
  } catch (error: any) {
    logger.error(
      "❌ CREATE LOTTERY ERROR",
      error
    );

    return res.status(500).json({
      success: false,
      error: "خطا در ساخت قرعه‌کشی",
    });
  }
});

/**
 * DRAW LOTTERY
 */
router.post(
  "/:id/draw",
  authMiddleware,
  async (req, res) => {
    try {
      const lotteryId = Number(req.params.id);

      logger.info(
        `🎯 DRAW LOTTERY ${lotteryId}`
      );

      const lottery =
        await prisma.lottery.findUnique({
          where: {
            id: lotteryId,
          },
        });

      if (!lottery) {
        return res.status(404).json({
          success: false,
          error: "قرعه‌کشی یافت نشد",
        });
      }

      // جلوگیری از draw زودتر
      if (new Date() < lottery.endAt) {
        return res.status(400).json({
          success: false,
          error:
            "هنوز زمان قرعه‌کشی نرسیده",
        });
      }

      const winners =
        await lotteryService.draw(
          lotteryId
        );

      const formattedWinners =
        winners.map((w) => ({
          id: w.user.id,

          telegramId:
            w.user.telegramId?.toString() ||
            null,

          username: w.user.username,

          firstName: w.user.firstName,

          lastName: w.user.lastName,
        }));

      return res.json({
        success: true,

        winners: formattedWinners,

        message: `برندگان: ${formattedWinners
          .map(
            (w) =>
              w.username ||
              w.firstName ||
              `User-${w.id}`
          )
          .join(" ، ")}`,
      });
    } catch (error: any) {
      logger.error("❌ DRAW ERROR", error);

      return res.status(500).json({
        success: false,
        error:
          error.message ||
          "خطا در قرعه‌کشی",
      });
    }
  }
);

/**
 * DELETE LOTTERY
 */
router.delete(
  "/:id",
  authMiddleware,
  async (req, res) => {
    try {
      const lotteryId = Number(req.params.id);

      await prisma.lotteryEntry.deleteMany({
        where: {
          lotteryId,
        },
      });

      await prisma.lottery.delete({
        where: {
          id: lotteryId,
        },
      });

      return res.json({
        success: true,
      });
    } catch (error: any) {
      logger.error(
        "❌ DELETE LOTTERY ERROR",
        error
      );

      return res.status(500).json({
        success: false,
        error: "خطا در حذف قرعه‌کشی",
      });
    }
  }
);

export default router;
```
