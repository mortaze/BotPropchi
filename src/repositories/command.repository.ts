import { prisma } from '../prisma/client';
import { logger } from '../utils/logger';
import { cache } from '../utils/cache';
import { cacheKey } from '../utils/cache';

const CACHE_KEY = cacheKey('commands:map');
const CACHE_TTL = 300;

export interface CommandRecord {
  command: string;
  postId: number;
  aliases: string[];
}

export const commandRepository = {
  _map: new Map<string, CommandRecord>(),

  async load(): Promise<Map<string, CommandRecord>> {
    const cached = cache.get<Map<string, CommandRecord>>(CACHE_KEY);
    if (cached && cached.size > 0) {
      this._map = cached;
      logger.info(`[CmdRepo] Loaded from cache: ${cached.size} entries`);
      return this._map;
    }
    const rows = await prisma.postCommand.findMany({
      select: { command: true, postId: true, aliases: true },
    });
    this._map = new Map();
    for (const row of rows) {
      const record: CommandRecord = {
        command: row.command,
        postId: row.postId,
        aliases: Array.isArray(row.aliases) ? (row.aliases as string[]) : [],
      };
      this._map.set(row.command, record);
      for (const alias of record.aliases) {
        this._map.set(alias, record);
      }
    }
    cache.set(CACHE_KEY, this._map, CACHE_TTL);
    logger.info(`[CmdRepo] Built from DB: ${rows.length} PostCommand rows → ${this._map.size} map entries`);
    return this._map;
  },

  async resolve(input: string): Promise<CommandRecord | null> {
    const key = input.toLowerCase().trim();
    if (!key) return null;

    if (this._map.size === 0) await this.load();

    const exact = this._map.get(key);
    if (exact) {
      logger.info(`[CmdRepo] Hit "${key}" → postId=${exact.postId}`);
      return exact;
    }

    logger.info(`[CmdRepo] Miss "${key}". DB fallback...`);
    const dbRow = await prisma.postCommand.findFirst({
      where: { OR: [{ command: key }, { aliases: { array_contains: key } }] },
      select: { command: true, postId: true, aliases: true },
    });
    if (dbRow) {
      const record: CommandRecord = {
        command: dbRow.command,
        postId: dbRow.postId,
        aliases: Array.isArray(dbRow.aliases) ? (dbRow.aliases as string[]) : [],
      };
      this._map.set(dbRow.command, record);
      for (const alias of record.aliases) this._map.set(alias, record);
      logger.info(`[CmdRepo] DB fallback hit "${key}" → postId=${record.postId}`);
      return record;
    }

    logger.warn(`[CmdRepo] Not found: "${key}"`);
    return null;
  },

  invalidate(): void {
    this._map.clear();
    cache.del(CACHE_KEY);
    logger.info(`[CmdRepo] Cache invalidated`);
  },

  async getByPostId(postId: number): Promise<{ command: string; aliases: string[] } | null> {
    const row = await prisma.postCommand.findFirst({
      where: { postId },
      select: { command: true, aliases: true },
    });
    if (!row) return null;
    return {
      command: row.command,
      aliases: Array.isArray(row.aliases) ? (row.aliases as string[]) : [],
    };
  },

  async create(postId: number, command: string, aliases?: string[]): Promise<void> {
    const conflict = await prisma.postCommand.findFirst({
      where: { command },
      select: { id: true },
    });
    if (conflict) throw new Error(`Command /${command} already exists`);
    await prisma.postCommand.create({
      data: { postId, command, aliases: aliases ?? undefined },
    });
    this.invalidate();
    logger.info(`[CmdRepo] Created: /${command} → post #${postId}`);
  },

  async update(commandId: number, data: { command?: string; aliases?: string[] }): Promise<void> {
    if (data.command) {
      const conflict = await prisma.postCommand.findFirst({
        where: { command: data.command, NOT: { id: commandId } },
        select: { id: true },
      });
      if (conflict) throw new Error(`Command /${data.command} already exists`);
    }
    await prisma.postCommand.update({ where: { id: commandId }, data });
    this.invalidate();
    logger.info(`[CmdRepo] Updated command id=${commandId}`);
  },

  async delete(commandId: number): Promise<void> {
    const row = await prisma.postCommand.findUnique({ where: { id: commandId }, select: { command: true } });
    await prisma.postCommand.delete({ where: { id: commandId } });
    this.invalidate();
    logger.info(`[CmdRepo] Deleted: /${row?.command}`);
  },

  async deleteByPostId(postId: number): Promise<void> {
    const deleted = await prisma.postCommand.deleteMany({ where: { postId } });
    this.invalidate();
    logger.info(`[CmdRepo] Deleted ${deleted.count} commands for post #${postId}`);
  },

  async addAlias(commandId: number, alias: string): Promise<void> {
    const row = await prisma.postCommand.findUnique({ where: { id: commandId }, select: { aliases: true } });
    const current = Array.isArray(row?.aliases) ? (row!.aliases as string[]) : [];
    if (current.includes(alias)) throw new Error(`Alias /${alias} already exists`);
    const conflict = await prisma.postCommand.findFirst({
      where: { command: alias },
      select: { id: true },
    });
    if (conflict) throw new Error(`Alias /${alias} conflicts with existing command`);
    await prisma.postCommand.update({
      where: { id: commandId },
      data: { aliases: [...current, alias] },
    });
    this.invalidate();
    logger.info(`[CmdRepo] Added alias /${alias} to command id=${commandId}`);
  },

  async removeAlias(commandId: number, alias: string): Promise<void> {
    const row = await prisma.postCommand.findUnique({ where: { id: commandId }, select: { aliases: true } });
    const current = Array.isArray(row?.aliases) ? (row!.aliases as string[]) : [];
    await prisma.postCommand.update({
      where: { id: commandId },
      data: { aliases: current.filter(a => a !== alias) },
    });
    this.invalidate();
    logger.info(`[CmdRepo] Removed alias /${alias} from command id=${commandId}`);
  },

  async listAll(): Promise<Array<{ id: number; command: string; postId: number; aliases: string[]; post: { title: string; status: string } }>> {
    return prisma.postCommand.findMany({
      include: { post: { select: { title: true, status: true } } },
      orderBy: { id: 'asc' },
    }) as any;
  },
};
