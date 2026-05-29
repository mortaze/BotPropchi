// src/api/routes/lottery.routes.ts

import { Router } from "express";
import { lotteryService } from "../../services/lottery.service";

const router = Router();

/**
 * دریافت لیست قرعه‌کشی‌ها
 */
router.get("/", async (_req, res) => {
  try {
    const lotteries = await lotteryService.getHistory();

    return res.json(lotteries);
  } catch (error: any) {
    console.error("❌ GET LOTTERIES ERROR:", error);

    return res.status(500).json({
      success: false,
      error: error.message || "خطا در دریافت قرعه‌کشی‌ها",
    });
  }
});

/**
 * دریافت قرعه‌کشی فعال
 */
router.get("/active", async (_req, res) => {
  try {
    const lottery = await lotteryService.getActiveLottery();

    return res.json({
      success: true,
      lottery,
    });
  } catch (error: any) {
    console.error("❌ GET ACTIVE LOTTERY ERROR:", error);

    return res.status(500).json({
      success: false,
      error: error.message || "خطا در دریافت قرعه‌کشی فعال",
    });
  }
});

/**
 * شرکت در قرعه‌کشی
 */
router.post("/:id/enter", async (req, res) => {
  try {
    const lotteryId = Number(req.params.id);
    const { telegramId } = req.body;

    if (!telegramId) {
      return res.status(400).json({
        success: false,
        error: "telegramId الزامی است",
      });
    }

    const result = await lotteryService.enterLottery(
      BigInt(telegramId),
      lotteryId
    );

    return res.json(result);
  } catch (error: any) {
    console.error("❌ ENTER LOTTERY ERROR:", error);

    return res.status(500).json({
      success: false,
      error: error.message || "خطا در ثبت در قرعه‌کشی",
    });
  }
});

/**
 * برگزاری قرعه‌کشی
 */
router.post("/:id/draw", async (req, res) => {
  try {
    const lotteryId = Number(req.params.id);

    console.log("🎯 DRAW LOTTERY:", lotteryId);

    const winners = await lotteryService.draw(lotteryId);

    const winnerNames = winners
      .map(
        (w: any) =>
          w.user?.username ||
          w.user?.firstName ||
          `User-${w.user?.id}`
      )
      .join(" ، ");

    console.log("🏆 WINNERS:", winnerNames);

    return res.json({
      success: true,
      winners,
      message:
        winnerNames.length > 0
          ? `برندگان: ${winnerNames}`
          : "هیچ شرکت‌کننده‌ای در قرعه‌کشی وجود نداشت",
    });
  } catch (error: any) {
    console.error("❌ DRAW LOTTERY ERROR:", error);

    return res.status(400).json({
      success: false,
      error: error.message || "خطا در برگزاری قرعه‌کشی",
    });
  }
});

export default router;
