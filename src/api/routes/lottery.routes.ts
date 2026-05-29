
// src/api/routes/lottery.routes.ts
import { lotteryService } from "../../services/lottery.service";
router.post("/:id/draw", async (req, res) => {
  try {
    const lotteryId = Number(req.params.id);

    const winners = await lotteryService.draw(lotteryId);

    return res.json({
      success: true,
      winners,
      message: `برندگان: ${winners
        .map((w) => w.user.firstName)
        .join("، ")}`,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});
export default router;
