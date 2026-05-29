// src/api/routes/lottery.routes.ts

import { Router } from "express";
import { lotteryService } from "../../services/lottery.service";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router();

// draw lottery
router.post("/:id/draw", authMiddleware, async (req, res) => {
  try {
    const lotteryId = Number(req.params.id);

    const winners = await lotteryService.draw(lotteryId);

    const formattedWinners = winners.map((w) => ({
      id: w.user.id,
      telegramId: w.user.telegramId.toString(),
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
    return res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
