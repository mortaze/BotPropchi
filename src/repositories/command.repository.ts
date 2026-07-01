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
  _creationLog: new Map<string, number>(),

  async load(): Promise<Map<string, CommandRecord>> {
    const t0 = Date.now();
    const cached = cache.get<Map<string, CommandRecord>>(CACHE_KEY);
    if (cached && cached.size > 0) {
      this._map = cached;
      logger.info(`[CmdRepo:LOAD] t=${t0} FROM_CACHE size=${cached.size} keys=[${Array.from(cached.keys()).join(',')}]`);
      return this._map;
    }
    const dbT0 = Date.now();
    const rows = await prisma.postCommand.findMany({
      select: { command: true, postId: true, aliases: true },
    });
    const dbMs = Date.now() - dbT0;
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
    logger.info(`[CmdRepo:LOAD] t=${Date.now()} FROM_DB dbMs=${dbMs} totalMs=${Date.now()-t0} rows=${rows.length} mapSize=${this._map.size} keys=[${Array.from(this._map.keys()).join(',')}]`);
    return this._map;
  },

  async resolve(input: string): Promise<CommandRecord | null> {
    const t0 = Date.now();
    const key = input.toLowerCase().trim();
    if (!key) { logger.warn(`[CmdRepo:RESOLVE] t=${t0} EMPTY_INPUT`); return null; }

    const mapEmpty = this._map.size === 0;
    if (mapEmpty) {
      logger.info(`[CmdRepo:RESOLVE] t=${t0} key="${key}" MAP_EMPTY → loading...`);
      await this.load();
    }

    const exact = this._map.get(key);
    if (exact) {
      logger.info(`[CmdRepo:RESOLVE] t=${Date.now()} key="${key}" MAP_HIT postId=${exact.postId} ms=${Date.now()-t0}`);
      return exact;
    }

    logger.info(`[CmdRepo:RESOLVE] t=${Date.now()} key="${key}" MAP_MISS mapSize=${this._map.size} → DB fallback...`);
    const dbT0 = Date.now();
    const dbRow = await prisma.postCommand.findFirst({
      where: { OR: [{ command: key }, { aliases: { array_contains: key } }] },
      select: { command: true, postId: true, aliases: true },
    });
    const dbMs = Date.now() - dbT0;
    if (dbRow) {
      const record: CommandRecord = {
        command: dbRow.command,
        postId: dbRow.postId,
        aliases: Array.isArray(dbRow.aliases) ? (dbRow.aliases as string[]) : [],
      };
      this._map.set(dbRow.command, record);
      for (const alias of record.aliases) this._map.set(alias, record);
      logger.info(`[CmdRepo:RESOLVE] t=${Date.now()} key="${key}" DB_HIT postId=${record.postId} dbMs=${dbMs} totalMs=${Date.now()-t0}`);
      return record;
    }

    logger.warn(`[CmdRepo:RESOLVE] t=${Date.now()} key="${key}" NOT_FOUND dbMs=${dbMs} mapKeys=[${Array.from(this._map.keys()).join(',')}] totalMs=${Date.now()-t0}`);
    return null;
  },

  invalidate(): void {
    const t = Date.now();
    const prevSize = this._map.size;
    const prevKeys = Array.from(this._map.keys());
    this._map.clear();
    cache.del(CACHE_KEY);
    logger.info(`[CmdRepo:INVALIDATE] t=${t} cleared ${prevSize} entries keys=[${prevKeys.join(',')}]`);
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
    const t0 = Date.now();
    logger.info(`[CmdRepo:CREATE] t=${t0} BEFORE_DB postId=${postId} command="${command}" aliases=${JSON.stringify(aliases)}`);
    const conflict = await prisma.postCommand.findFirst({
      where: { command },
      select: { id: true },
    });
    if (conflict) throw new Error(`Command /${command} already exists`);
    const insertT0 = Date.now();
    await prisma.postCommand.create({
      data: { postId, command, aliases: aliases ?? undefined },
    });
    const insertMs = Date.now() - insertT0;
    logger.info(`[CmdRepo:CREATE] t=${Date.now()} AFTER_DB_INSERT insertMs=${insertMs} command="${command}"`);
    this._creationLog.set(command, Date.now());
    this.invalidate();
    logger.info(`[CmdRepo:CREATE] t=${Date.now()} COMPLETE totalMs=${Date.now()-t0} command="${command}"`);
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
  },

  async delete(commandId: number): Promise<void> {
    const row = await prisma.postCommand.findUnique({ where: { id: commandId }, select: { command: true } });
    await prisma.postCommand.delete({ where: { id: commandId } });
    this.invalidate();
    logger.info(`[CmdRepo:DELETE] Deleted: /${row?.command}`);
  },

  async deleteByPostId(postId: number): Promise<void> {
    const deleted = await prisma.postCommand.deleteMany({ where: { postId } });
    this.invalidate();
    logger.info(`[CmdRepo:DELETE_BY_POST] Deleted ${deleted.count} for post #${postId}`);
  },

  async addAlias(commandId: number, alias: string): Promise<void> {
    const row = await prisma.postCommand.findUnique({ where: { id: commandId }, select: { aliases: true } });
    const current = Array.isArray(row?.aliases) ? (row!.aliases as string[]) : [];
    if (current.includes(alias)) throw new Error(`Alias /${alias} already exists`);
    const conflict = await prisma.postCommand.findFirst({ where: { command: alias }, select: { id: true } });
    if (conflict) throw new Error(`Alias /${alias} conflicts with existing command`);
    await prisma.postCommand.update({ where: { id: commandId }, data: { aliases: [...current, alias] } });
    this.invalidate();
  },

  async removeAlias(commandId: number, alias: string): Promise<void> {
    const row = await prisma.postCommand.findUnique({ where: { id: commandId }, select: { aliases: true } });
    const current = Array.isArray(row?.aliases) ? (row!.aliases as string[]) : [];
    await prisma.postCommand.update({ where: { id: commandId }, data: { aliases: current.filter(a => a !== alias) } });
    this.invalidate();
  },

  async listAll() {
    return prisma.postCommand.findMany({
      include: { post: { select: { title: true, status: true } } },
      orderBy: { id: 'asc' },
    }) as any;
  },
};
