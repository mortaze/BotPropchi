import { Queue, QueueOptions } from 'bullmq';
import { config } from '../config';
import { logger } from '../utils/logger';

export type LeaderboardJobType = 'REBUILD_LEADERBOARD';

export interface RebuildLeaderboardJobData {
  type: 'REBUILD_LEADERBOARD';
  seasonId: number;
}

export type LeaderboardJobData = RebuildLeaderboardJobData;

const QUEUE_NAME = 'leaderboard';

let queue: Queue<LeaderboardJobData> | null = null;

function buildQueueOptions(): QueueOptions {
  if (!config.redis.url) {
    logger.warn('[LeaderboardQueue] No Redis URL — using in-memory queue simulation');
    return {} as QueueOptions;
  }
  return {
    connection: {
      url: config.redis.url,
      maxRetriesPerRequest: null,
    },
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 20 },
    },
  };
}

function getQueue(): Queue<LeaderboardJobData> {
  if (!queue && config.redis.url) {
    queue = new Queue<LeaderboardJobData>(QUEUE_NAME, buildQueueOptions() as any);
    logger.info('[LeaderboardQueue] BullMQ queue initialized');
  }
  return queue as any;
}

export const leaderboardQueue = {
  getQueue(): Queue<LeaderboardJobData> | null {
    return config.redis.url ? getQueue() : null;
  },

  async add(data: RebuildLeaderboardJobData): Promise<void> {
    const q = getQueue();
    if (!q) {
      logger.debug('[LeaderboardQueue] (no-Redis) processing inline');
      const { handleLeaderboardJobInline } = await import('../workers/leaderboard.worker');
      await handleLeaderboardJobInline(data);
      return;
    }
    await q.add(data.type, data, {
      jobId: `${data.type}:${data.seasonId}`,
      deduplication: { id: `${data.type}:${data.seasonId}` as any, ttl: 60_000 },
    });
  },

  async close(): Promise<void> {
    if (queue) {
      await queue.close();
      queue = null;
    }
  },
};
