import { Router } from "express";
import { lotteryService } from "../../services/lottery.service";
import { lotteryRepository } from "../../repositories/lottery.repository";
import { logger } from "../../utils/logger";

const router = Router();

/**
 * GET ALL LOTTERIES
 */
router.get("/", async (_req, res) => {
  try {
    logger.info("📥 GET /api/lotteries");

    const lotteries = await lotteryRepository.getAll();

    return res.json(lotteries);
  } catch (error: any) {
    logger.error("❌ GET LOTTERIES ERROR", error);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * CREATE LOTTERY
 */
router.post("/", async (req, res) => {
  try {
    logger.info("📥 POST /api/lotteries");
    logger.info("BODY:", req.body);

    const lottery = await lotteryRepository.create(req.body);

    logger.info("✅ LOTTERY CREATED", lottery);

    return res.json({
      success: true,
      lottery,
    });
  } catch (error: any) {
    logger.error("❌ CREATE LOTTERY ERROR", error);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * DRAW LOTTERY
 */
router.post("/:id/draw", async (req, res) => {
  try {
    const lotteryId = Number(req.params.id);

    logger.info(`🎯 DRAW LOTTERY ${lotteryId}`);

    const winners = await lotteryService.draw(lotteryId);

    const winnerNames = winners
      .map(
        (w: any) =>
          w.user?.username ||
          w.user?.firstName ||
          `User-${w.user?.id}`
      )
      .join(" ، ");

    return res.json({
      success: true,
      winners,
      message: `برندگان: ${winnerNames}`,
    });
  } catch (error: any) {
    logger.error("❌ DRAW ERROR", error);

    return res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
