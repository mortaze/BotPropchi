import { BotAdminRole, BotAdminStatus, Prisma } from '@prisma/client';
import { config } from '../config';
import { prisma } from '../prisma/client';

export const botAdminService = {
  async ensureOwner() {
    return prisma.botAdmin.upsert({
      where: { telegramId: config.bot.adminTelegramId },
      update: { role: BotAdminRole.OWNER, status: BotAdminStatus.ACTIVE },
      create: { telegramId: config.bot.adminTelegramId, role: BotAdminRole.OWNER, status: BotAdminStatus.ACTIVE, firstName: 'Owner' },
    });
  },

  list() {
    return prisma.botAdmin.findMany({ orderBy: [{ role: 'asc' }, { createdAt: 'desc' }] });
  },

  async getActive(telegramId: bigint | number | string) {
    await this.ensureOwner();
    return prisma.botAdmin.findFirst({ where: { telegramId: BigInt(telegramId), status: BotAdminStatus.ACTIVE } });
  },

  async canManage(actorTelegramId: bigint | number | string, targetRole?: BotAdminRole) {
    const actor = await this.getActive(actorTelegramId);
    if (!actor) return false;
    if (actor.role === BotAdminRole.OWNER) return true;
    if (actor.role === BotAdminRole.SUPER_ADMIN) return targetRole !== BotAdminRole.OWNER;
    if (actor.role === BotAdminRole.ADMIN) return targetRole === BotAdminRole.MODERATOR;
    return false;
  },

  async upsert(data: { telegramId: bigint | number | string; username?: string | null; firstName?: string | null; lastName?: string | null; role?: BotAdminRole; status?: BotAdminStatus }) {
    return prisma.botAdmin.upsert({
      where: { telegramId: BigInt(data.telegramId) },
      update: { username: data.username, firstName: data.firstName, lastName: data.lastName, role: data.role ?? BotAdminRole.ADMIN, status: data.status ?? BotAdminStatus.ACTIVE },
      create: { telegramId: BigInt(data.telegramId), username: data.username, firstName: data.firstName, lastName: data.lastName, role: data.role ?? BotAdminRole.ADMIN, status: data.status ?? BotAdminStatus.ACTIVE },
    });
  },

  update(id: number, data: Prisma.BotAdminUpdateInput) {
    return prisma.botAdmin.update({ where: { id }, data });
  },

  delete(id: number) {
    return prisma.botAdmin.delete({ where: { id } });
  },
};
