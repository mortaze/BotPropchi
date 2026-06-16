import { Queue, QueueOptions } from 'bullmq';
import { config } from '../config';
import { logger } from '../utils/logger';

export type MembershipJobType =
  | 'CHECK_MEMBERSHIP'
  | 'CHAT_MEMBER_UPDATE'
  | 'VERIFY_MEMBERSHIP';

export interface CheckMembershipJobData {
  type: 'CHECK_MEMBERSHIP';
  telegramId: number;
  userId?: number;
  force?: boolean;
}

export interface ChatMemberUpdateJobData {
  type: 'CHAT_MEMBER_UPDATE';
  telegramId: number;
  chatId: string;
  newStatus: string;
  oldStatus: string;
}

export interface VerifyMembershipJobData {
  type: 'VERIFY_MEMBERSHIP';
  telegramId: number;
  channelIds: string[];
}

export type MembershipJobData =
  | CheckMembershipJobData
  | ChatMemberUpdateJobData
  | VerifyMembershipJobData;

const QUEUE_NAME = 'membership';

let queue: Queue<MembershipJobData> | null = null;

function buildQueueOptions(): QueueOptions {
  if (!config.redis.url) {
    logger.warn('[MembershipQueue] No Redis URL — using in-memory queue simulation');
    return {} as QueueOptions;
  }
  return {
    connection: {
      url: config.redis.url,
      maxRetriesPerRequest: null,
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  };
}

function getQueue(): Queue<MembershipJobData> {
  if (!queue && config.redis.url) {
    queue = new Queue<MembershipJobData>(QUEUE_NAME, buildQueueOptions() as any);
    logger.info('[MembershipQueue] BullMQ queue initialized');
  }
  return queue as any;
}

export const membershipQueue = {
  getQueue(): Queue<MembershipJobData> | null {
    return config.redis.url ? getQueue() : null;
  },

  async add(data: MembershipJobData, jobId?: string): Promise<void> {
    const q = getQueue();
    if (!q) {
      logger.debug(`[MembershipQueue] (no-Redis) processing ${data.type} inline for user ${data.telegramId}`);
      const { handleJobInline } = await import('../workers/membership.worker');
      await handleJobInline(data);
      return;
    }
    await q.add(data.type, data, {
      jobId: jobId ?? `${data.type}:${data.telegramId}:${Date.now()}`,
      deduplication: { id: `${data.type}:${data.telegramId}` as any, ttl: 30_000 },
    });
  },

  async addBatched(dataList: MembershipJobData[]): Promise<void> {
    const q = getQueue();
    if (!q) {
      for (const data of dataList) {
        await this.add(data);
      }
      return;
    }
    await q.addBulk(
      dataList.map((data) => ({
        name: data.type,
        data,
        opts: {
          deduplication: { id: `${data.type}:${data.telegramId}` as any, ttl: 30_000 },
          attempts: 3,
        },
      }))
    );
  },

  async close(): Promise<void> {
    if (queue) {
      await queue.close();
      queue = null;
    }
  },
};
