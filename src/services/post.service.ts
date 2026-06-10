import { PostStatus, Prisma, SystemEventType } from '@prisma/client';
import { prisma } from '../prisma/client';
import { postRepository } from '../repositories/post.repository';
import { cache } from '../utils/cache';
import { systemLogService } from './system-log.service';
import { logger } from '../utils/logger';

const CACHE_KEY_PUBLISHED = 'posts:published';
const CACHE_KEY_COMMANDS = 'posts:commands';
const CACHE_KEY_PINNED = 'posts:pinned';

export const postService = {
  async create(data: {
    title: string;
    slug: string;
    content?: string;
    caption?: string;
    mediaFileId?: string;
    mediaType?: string;
    albumMediaIds?: string[];
    parseMode?: string;
    buttons?: any[];
    command?: string;
    status?: PostStatus;
    sortOrder?: number;
    createdBy?: bigint;
  }) {
    const post = await postRepository.create({
      title: data.title,
      slug: data.slug,
      content: data.content,
      caption: data.caption,
      mediaFileId: data.mediaFileId,
      mediaType: data.mediaType,
      albumMediaIds: data.albumMediaIds ? JSON.parse(JSON.stringify(data.albumMediaIds)) : undefined,
      parseMode: data.parseMode ?? 'Markdown',
      buttons: data.buttons ? JSON.parse(JSON.stringify(data.buttons)) : undefined,
      command: data.command,
      status: data.status ?? PostStatus.DRAFT,
      sortOrder: data.sortOrder ?? 0,
      createdBy: data.createdBy,
    });
    this.invalidateCache();
    await systemLogService.log({
      eventType: SystemEventType.ADMIN_ACTION,
      message: `Post Created: "${post.title}" (slug: ${post.slug})`,
      metadata: { postId: post.id, slug: post.slug } as any,
    });
    logger.info(`[Post] Created: "${post.title}" (${post.slug})`);
    return post;
  },

  async update(id: number, data: Prisma.PostUncheckedUpdateInput & { updatedBy?: bigint }) {
    const existing = await postRepository.findById(id);
    if (!existing) return null;
    const post = await postRepository.update(id, { ...data, updatedBy: data.updatedBy ?? undefined });
    this.invalidateCache();
    await systemLogService.log({
      eventType: SystemEventType.ADMIN_ACTION,
      message: `Post Updated: "${post.title}"`,
      metadata: { postId: id, changes: Object.keys(data) } as any,
    });
    logger.info(`[Post] Updated: "${post.title}" (id: ${id})`);
    return post;
  },

  async delete(id: number) {
    const post = await postRepository.findById(id);
    if (!post) return null;
    await postRepository.delete(id);
    this.invalidateCache();
    await systemLogService.log({
      eventType: SystemEventType.ADMIN_ACTION,
      message: `Post Deleted: "${post.title}"`,
      metadata: { postId: id } as any,
    });
    logger.info(`[Post] Deleted: "${post.title}" (id: ${id})`);
    return post;
  },

  async publish(id: number, publishedBy?: bigint) {
    const post = await postRepository.update(id, {
      status: PostStatus.PUBLISHED,
      isPublished: true,
      publishedAt: new Date(),
      updatedBy: publishedBy ?? undefined,
    });
    this.invalidateCache();
    await systemLogService.log({
      eventType: SystemEventType.ADMIN_ACTION,
      message: `Post Published: "${post.title}"`,
      metadata: { postId: id } as any,
    });
    logger.info(`[Post] Published: "${post.title}"`);
    return post;
  },

  async unpublish(id: number) {
    const post = await postRepository.update(id, {
      status: PostStatus.DRAFT,
      isPublished: false,
      updatedBy: undefined,
    });
    this.invalidateCache();
    logger.info(`[Post] Unpublished: "${post.title}"`);
    return post;
  },

  async archive(id: number) {
    const post = await postRepository.update(id, {
      status: PostStatus.ARCHIVED,
      isPublished: false,
    });
    this.invalidateCache();
    return post;
  },

  async schedule(id: number, scheduledAt: Date) {
    const post = await postRepository.update(id, {
      status: PostStatus.SCHEDULED,
      scheduledAt,
      isPublished: false,
    });
    this.invalidateCache();
    return post;
  },

  async duplicate(id: number, createdBy?: bigint) {
    const original = await postRepository.findById(id);
    if (!original) return null;
    const duplicate = await postRepository.create({
      title: `${original.title} (کپی)`,
      slug: `${original.slug}-copy-${Date.now()}`,
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
    });
    this.invalidateCache();
    return duplicate;
  },

  async findById(id: number) {
    return postRepository.findById(id);
  },

  async findBySlug(slug: string) {
    return postRepository.findBySlug(slug);
  },

  async findByCommand(command: string) {
    return postRepository.findByCommand(command);
  },

  async findAll(params: {
    page?: number;
    limit?: number;
    status?: PostStatus;
    isPublished?: boolean;
    search?: string;
  }) {
    return postRepository.findAll(params);
  },

  async getPublished() {
    const cached = cache.get<any[]>(CACHE_KEY_PUBLISHED);
    if (cached) return cached;
    const posts = await postRepository.getPublished();
    cache.set(CACHE_KEY_PUBLISHED, posts, 60);
    return posts;
  },

  async getDrafts() {
    return postRepository.getDrafts();
  },

  async getPinned() {
    const cached = cache.get<any[]>(CACHE_KEY_PINNED);
    if (cached) return cached;
    const posts = await postRepository.getPinned();
    cache.set(CACHE_KEY_PINNED, posts, 60);
    return posts;
  },

  async getCommandMap(): Promise<Map<string, any>> {
    const cached = cache.get<Map<string, any>>(CACHE_KEY_COMMANDS);
    if (cached) return cached;
    const posts = await postRepository.getPublished();
    const map = new Map<string, any>();
    for (const post of posts) {
      if (post.command) map.set(post.command, post);
      if ((post as any).commands) {
        for (const cmd of (post as any).commands) {
          map.set(cmd.command, post);
          if (cmd.aliases && Array.isArray(cmd.aliases)) {
            for (const alias of cmd.aliases) map.set(alias, post);
          }
        }
      }
    }
    cache.set(CACHE_KEY_COMMANDS, map, 60);
    return map;
  },

  async togglePin(id: number) {
    const post = await postRepository.findById(id);
    if (!post) return null;
    const updated = await postRepository.update(id, { isPinned: !post.isPinned });
    this.invalidateCache();
    return updated;
  },

  async reorder(id: number, sortOrder: number) {
    const post = await postRepository.update(id, { sortOrder });
    this.invalidateCache();
    return post;
  },

  async incrementViews(id: number, userId?: number | null, telegramId?: bigint | null) {
    return postRepository.incrementViews(id, userId, telegramId);
  },

  async logClick(data: {
    postId: number;
    userId?: number | null;
    telegramId?: bigint | null;
    buttonText?: string | null;
    buttonType?: string | null;
  }) {
    return postRepository.logClick(data);
  },

  async getAnalytics(postId: number) {
    return postRepository.getAnalytics(postId);
  },

  async addCommand(postId: number, command: string, aliases?: string[]) {
    const existing = await prisma.postCommand.findUnique({ where: { command } });
    if (existing) throw new Error(`Command /${command} already exists`);
    const result = await prisma.postCommand.create({
      data: { postId, command, aliases: aliases ?? undefined },
    });
    this.invalidateCache();
    return result;
  },

  async removeCommand(commandId: number) {
    await prisma.postCommand.delete({ where: { id: commandId } });
    this.invalidateCache();
  },

  async resolveCommand(command: string): Promise<any | null> {
    const map = await this.getCommandMap();
    return map.get(command) || null;
  },

  invalidateCache() {
    cache.del(CACHE_KEY_PUBLISHED);
    cache.del(CACHE_KEY_COMMANDS);
    cache.del(CACHE_KEY_PINNED);
  },

  async getAllForMenu(): Promise<any[]> {
    const published = await this.getPublished();
    return published.filter((p: any) => p.status === 'PUBLISHED');
  },
};
