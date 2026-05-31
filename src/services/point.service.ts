import { Prisma, PointLogType } from '@prisma/client';
import { prisma } from '../prisma/client';
import { logger } from '../utils/logger';

type PrismaExecutor = typeof prisma | Prisma.TransactionClient;

export interface PointChangeInput {
  userId: number;
  amount: number;
  type: PointLogType;
  description?: string;
}

/**
 * تنها مسیر معتبر تغییر امتیاز کاربران.
 * همه قابلیت‌ها (رفرال، قرعه‌کشی، ادمین، بونوس و ...) باید از این سرویس استفاده کنند
 * تا مقدار users.points و تاریخچه point_logs همیشه همگام بمانند.
 */
export const pointService = {
  async changePoints(input: PointChangeInput, client?: PrismaExecutor) {
    const executor = client || prisma;
    const amount = Number(input.amount);

    if (!Number.isInteger(amount)) {
      throw new Error('مقدار امتیاز باید عدد صحیح باشد');
    }

    const run = async (tx: Prisma.TransactionClient) => {
      const user = await tx.user.update({
        where: { id: input.userId },
        data: { points: { increment: amount } },
      });

      const log = await tx.pointLog.create({
        data: {
          userId: input.userId,
          amount,
          type: input.type,
          description: input.description,
        },
      });

      logger.info(`Point change recorded userId=${input.userId}, amount=${amount}, type=${input.type}`);
      return { user, log };
    };

    if (client) {
      return run(executor as Prisma.TransactionClient);
    }

    return prisma.$transaction(run);
  },

  async addPoints(userId: number, amount: number, type: PointLogType, description?: string, client?: PrismaExecutor) {
    return this.changePoints({ userId, amount, type, description }, client);
  },

  async deductPoints(userId: number, amount: number, type: PointLogType, description?: string, client?: PrismaExecutor) {
    return this.changePoints({ userId, amount: -Math.abs(amount), type, description }, client);
  },
};
