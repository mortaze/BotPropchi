
// src/api/routes/lottery.routes.ts

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

