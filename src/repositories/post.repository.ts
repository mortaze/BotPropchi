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
      include: { commands: true, _count: { select: { views: true, clickLogs: true } } },
    });
  },

  async findBySlug(slug: string) {
    return prisma.post.findUnique({
      where: { slug },
      include: { commands: true, _count: { select: { views: true, clickLogs: true } } },
    });
  },

  async findByCommand(command: string) {
    const post = await prisma.post.findFirst({
      where: { OR: [{ command }, { commands: { some: { command } } }] },
      include: { commands: true, _count: { select: { views: true, clickLogs: true } } },
    });
    if (post) return post;
    const allPosts = await prisma.post.findMany({
      where: { commands: { some: {} } },
      include: { commands: true, _count: { select: { views: true, clickLogs: true } } },
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
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      prisma.post.findMany({
        where,
        include: { _count: { select: { views: true, clickLogs: true } } },
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
      include: { _count: { select: { views: true } } },
      orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
    });
  },

  async getDrafts() {
    return prisma.post.findMany({
      where: { status: PostStatus.DRAFT },
      include: { _count: { select: { views: true } } },
      orderBy: [{ updatedAt: 'desc' }],
    });
  },

  async getPinned() {
    return prisma.post.findMany({
      where: { isPinned: true, status: PostStatus.PUBLISHED },
      orderBy: [{ sortOrder: 'asc' }],
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
    const [views, clicks, uniqueUsers, dailyViews] = await Promise.all([
      prisma.postView.count({ where: { postId } }),
      prisma.postClickLog.count({ where: { postId } }),
      prisma.postView.groupBy({ by: ['userId'], where: { postId, userId: { not: null } } }),
      prisma.postView.findMany({
        where: { postId, createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
        orderBy: { createdAt: 'asc' },
      }),
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
    };
  },
};
