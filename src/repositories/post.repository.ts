import { Prisma, PostStatus } from '@prisma/client';
import { prisma } from '../prisma/client';

export const postRepository = {
  async create(data: Prisma.PostUncheckedCreateInput) {
    return prisma.post.create({ data });
  },

  async update(id: number, data: Prisma.PostUncheckedUpdateInput) {
    return prisma.post.update({ where: { id }, data });
  },

  async delete(id: number) {
    return prisma.post.delete({ where: { id } });
  },

  async findById(id: number) {
    return prisma.post.findUnique({
      where: { id },
      include: { commands: true, richMedia: { orderBy: { order: 'asc' } }, richEntities: true, keyboards: { orderBy: [{ row: 'asc' }, { col: 'asc' }] }, _count: { select: { views: true, clickLogs: true } } },
    });
  },

  async findBySlug(slug: string) {
    return prisma.post.findUnique({
      where: { slug },
      include: { commands: true, richMedia: { orderBy: { order: 'asc' } }, richEntities: true, keyboards: { orderBy: [{ row: 'asc' }, { col: 'asc' }] }, _count: { select: { views: true, clickLogs: true } } },
    });
  },

  async findByCommand(command: string) {
    const post = await prisma.post.findFirst({
      where: { OR: [{ command }, { commands: { some: { command } } }] },
      include: { commands: true, richMedia: { orderBy: { order: 'asc' } }, richEntities: true, keyboards: { orderBy: [{ row: 'asc' }, { col: 'asc' }] }, _count: { select: { views: true, clickLogs: true } } },
    });
    if (post) return post;
    const allPosts = await prisma.post.findMany({
      where: { commands: { some: {} } },
      include: { commands: true, richMedia: { orderBy: { order: 'asc' } }, richEntities: true, keyboards: { orderBy: [{ row: 'asc' }, { col: 'asc' }] }, _count: { select: { views: true, clickLogs: true } } },
    });
    for (const p of allPosts) {
      for (const cmd of p.commands) {
        const aliases = cmd.aliases as string[] | null;
        if (aliases && Array.isArray(aliases) && aliases.includes(command)) return p;
      }
    }
    return null;
  },

  async findAll(params: {
    page?: number;
    limit?: number;
    status?: PostStatus;
    isPublished?: boolean;
    search?: string;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(50, Math.max(1, params.limit || 10));
    const skip = (page - 1) * limit;
    const where: Prisma.PostWhereInput = {
      ...(params.status ? { status: params.status } : {}),
      ...(params.isPublished !== undefined ? { isPublished: params.isPublished } : {}),
      ...(params.search
        ? {
            OR: [
              { title: { contains: params.search, mode: 'insensitive' as const } },
              { content: { contains: params.search, mode: 'insensitive' as const } },
              { slug: { contains: params.search, mode: 'insensitive' as const } },
              { command: { contains: params.search, mode: 'insensitive' as const } },
              { commands: { some: { command: { contains: params.search, mode: 'insensitive' as const } } } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.post.findMany({
        where,
        include: { commands: true, richMedia: { orderBy: { order: 'asc' } }, richEntities: true, keyboards: { orderBy: [{ row: 'asc' }, { col: 'asc' }] }, _count: { select: { views: true, clickLogs: true } } },
        orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.post.count({ where }),
    ]);
    return { items, total, pages: Math.ceil(total / limit) };
  },

  async getPublished() {
    return prisma.post.findMany({
      where: { status: PostStatus.PUBLISHED, isPublished: true },
      include: { commands: true, richMedia: { orderBy: { order: 'asc' } }, richEntities: true, keyboards: { orderBy: [{ row: 'asc' }, { col: 'asc' }] }, _count: { select: { views: true } } },
      orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
    });
  },

  async getPublishedByPage(page: number, limit: number = 5) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      prisma.post.findMany({
        where: { status: PostStatus.PUBLISHED, isPublished: true },
        include: { commands: true, richMedia: { orderBy: { order: 'asc' } }, richEntities: true, keyboards: { orderBy: [{ row: 'asc' }, { col: 'asc' }] }, _count: { select: { views: true } } },
        orderBy: [{ sortOrder: 'asc' }, { publishedAt: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.post.count({ where: { status: PostStatus.PUBLISHED, isPublished: true } }),
    ]);
    return { items, total, pages: Math.ceil(total / limit), page };
  },

  async getDrafts() {
    return prisma.post.findMany({
      where: { status: PostStatus.DRAFT },
      include: { _count: { select: { views: true } } },
      orderBy: [{ updatedAt: 'desc' }],
    });
  },

  async getHidden() {
    return prisma.post.findMany({
      where: { status: PostStatus.HIDDEN },
      orderBy: [{ updatedAt: 'desc' }],
    });
  },

  async incrementViews(id: number, userId?: number | null, telegramId?: bigint | null) {
    return prisma.$transaction([
      prisma.postView.create({
        data: {
          postId: id,
          userId: userId ?? undefined,
          telegramId: telegramId ?? undefined,
        },
      }),
      prisma.post.update({ where: { id }, data: {} }),
    ]);
  },

  async logClick(data: {
    postId: number;
    userId?: number | null;
    telegramId?: bigint | null;
    buttonText?: string | null;
    buttonType?: string | null;
  }) {
    return prisma.postClickLog.create({ data: data as any });
  },

  async getAnalytics(postId: number) {
    const [views, clicks, uniqueUsers, dailyViews, buttonClicks, commandUsage] = await Promise.all([
      prisma.postView.count({ where: { postId } }),
      prisma.postClickLog.count({ where: { postId } }),
      prisma.postView.groupBy({ by: ['userId'], where: { postId, userId: { not: null } } }),
      prisma.postView.findMany({
        where: { postId, createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.postClickLog.groupBy({ by: ['buttonText'], where: { postId, buttonText: { not: null } }, _count: true }),
      prisma.postView.count({ where: { postId, action: 'command' } }),
    ]);
    const dailyMap = new Map<string, number>();
    for (const v of dailyViews) {
      const day = v.createdAt.toISOString().slice(0, 10);
      dailyMap.set(day, (dailyMap.get(day) || 0) + 1);
    }
    return {
      totalViews: views,
      totalClicks: clicks,
      uniqueUsers: uniqueUsers.length,
      dailyViews: Array.from(dailyMap.entries()).map(([date, count]) => ({ date, count })),
      buttonClicks: buttonClicks.map((b: any) => ({ text: b.buttonText, count: b._count })),
      commandUsage,
    };
  },

  async getGlobalAnalytics() {
    const [totalPosts, totalViews, totalClicks, publishedCount, draftCount, archivedCount, hiddenCount, scheduledCount, totalUniqueUsers, dailyViews, buttonClicks, commandClicks] = await Promise.all([
      prisma.post.count(),
      prisma.postView.count(),
      prisma.postClickLog.count(),
      prisma.post.count({ where: { status: PostStatus.PUBLISHED, isPublished: true } }),
      prisma.post.count({ where: { status: PostStatus.DRAFT } }),
      prisma.post.count({ where: { status: PostStatus.ARCHIVED } }),
      prisma.post.count({ where: { status: PostStatus.HIDDEN } }),
      prisma.post.count({ where: { status: PostStatus.SCHEDULED } }),
      prisma.postView.groupBy({ by: ['userId'], where: { userId: { not: null } } }),
      prisma.postView.findMany({
        where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.postClickLog.groupBy({ by: ['buttonText'], where: { buttonText: { not: null } }, _count: true, orderBy: { _count: { buttonText: 'desc' } }, take: 10 }),
      prisma.postView.count({ where: { action: 'command' } }),
    ]);
    const dailyMap = new Map<string, number>();
    for (const v of dailyViews) {
      const day = v.createdAt.toISOString().slice(0, 10);
      dailyMap.set(day, (dailyMap.get(day) || 0) + 1);
    }
    return {
      totalPosts,
      published: publishedCount,
      drafts: draftCount,
      archived: archivedCount,
      hidden: hiddenCount,
      scheduled: scheduledCount,
      totalViews,
      totalClicks,
      uniqueUsers: totalUniqueUsers.length,
      ctr: totalViews > 0 ? ((totalClicks / totalViews) * 100).toFixed(2) : '0.00',
      dailyViews: Array.from(dailyMap.entries()).map(([date, count]) => ({ date, count })),
      topButtonClicks: buttonClicks.map((b: any) => ({ text: b.buttonText, count: b._count })),
      commandClicks,
    };
  },

  async getTopPosts(limit: number = 5) {
    return prisma.post.findMany({
      where: { status: PostStatus.PUBLISHED, isPublished: true },
      include: { _count: { select: { views: true, clickLogs: true } } },
      orderBy: [{ views: { _count: 'desc' } }],
      take: limit,
    });
  },

  async saveVersion(postId: number, snapshot: any) {
    return prisma.postVersion.create({
      data: { postId, snapshot: JSON.parse(JSON.stringify(snapshot)) },
    });
  },

  async getVersions(postId: number) {
    return prisma.postVersion.findMany({
      where: { postId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  },

  async restoreVersion(versionId: number) {
    const version = await prisma.postVersion.findUnique({ where: { id: versionId } });
    if (!version) return null;
    const snapshot = version.snapshot as any;
    const post = await prisma.post.update({
      where: { id: snapshot.id || version.postId },
      data: {
        title: snapshot.title,
        slug: snapshot.slug,
        content: snapshot.content,
        caption: snapshot.caption,
        mediaFileId: snapshot.mediaFileId,
        mediaType: snapshot.mediaType,
        albumMediaIds: snapshot.albumMediaIds,
        parseMode: snapshot.parseMode,
        buttons: snapshot.buttons,
        command: snapshot.command,
        status: snapshot.status,
        sortOrder: snapshot.sortOrder,
      },
    });
    return post;
  },

  async integrityCheck() {
    const issues: string[] = [];
    const posts = await prisma.post.findMany({
      select: { id: true, title: true, mediaFileId: true, mediaType: true, buttons: true, command: true },
    });
    for (const post of posts) {
      if (post.mediaFileId && !post.mediaType) {
        issues.push(`Post #${post.id} "${post.title}": has mediaFileId but no mediaType`);
      }
      if (post.buttons) {
        const btns = post.buttons as any[];
        for (let r = 0; r < btns.length; r++) {
          const row = btns[r];
          if (!Array.isArray(row)) {
            issues.push(`Post #${post.id} "${post.title}": buttons row ${r} is not an array`);
            continue;
          }
          for (let c = 0; c < row.length; c++) {
            const btn = row[c];
            if (!btn || !btn.text) {
              issues.push(`Post #${post.id} "${post.title}": button at [${r}][${c}] has no text`);
            }
            if (btn && btn.type === 'URL' && !btn.value) {
              issues.push(`Post #${post.id} "${post.title}": button "${btn.text}" is URL type but has no URL`);
            }
          }
        }
      }
    }
    const commands = await prisma.postCommand.findMany({
      include: { post: { select: { id: true, title: true } } },
    });
    for (const cmd of commands) {
      if (!cmd.post) {
        issues.push(`Command /${cmd.command} (id: ${cmd.id}): orphaned, post deleted`);
      }
    }
    return issues;
  },

  async duplicateWithCommands(id: number, newTitle: string, newSlug: string, createdBy?: bigint) {
    return prisma.$transaction(async (tx) => {
      const original = await tx.post.findUnique({
        where: { id },
        include: { commands: true },
      });
      if (!original) return null;
      const post = await tx.post.create({
        data: {
          title: newTitle,
          slug: newSlug,
          content: original.content,
          caption: original.caption,
          mediaFileId: original.mediaFileId,
          mediaType: original.mediaType,
          albumMediaIds: original.albumMediaIds,
          parseMode: original.parseMode,
          buttons: original.buttons,
          command: original.command ? `${original.command}_copy` : undefined,
          status: PostStatus.DRAFT,
          sortOrder: (original.sortOrder ?? 0) + 1,
          createdBy,
        },
      });
      for (const cmd of original.commands) {
        await tx.postCommand.create({
          data: {
            postId: post.id,
            command: `${cmd.command}_copy_${post.id}`,
            aliases: cmd.aliases,
          },
        });
      }
      return post;
    });
  },
};
