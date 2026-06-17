import { Worker, WorkerOptions } from 'bullmq';
import { config } from '../config';
import { logger } from '../utils/logger';
import { leaderboardService } from '../services/leaderboard.service';
import type { RebuildLeaderboardJobData } from '../queue/leaderboard.queue';

async function processRebuildLeaderboard(data: RebuildLeaderboardJobData): Promise<void> {
  const { seasonId } = data;
  logger.info(`[LeaderboardWorker] Rebuilding leaderboard cache for season #${seasonId}`);

  await leaderboardService.invalidateCache(seasonId);

  await leaderboardService.getLeaderboard(seasonId, 10);

  logger.info(`[LeaderboardWorker] Leaderboard cache rebuilt for season #${seasonId}`);
}

export async function handleLeaderboardJobInline(data: RebuildLeaderboardJobData): Promise<void> {
  try {
    await processRebuildLeaderboard(data);
  } catch (err) {
    logger.error('[LeaderboardWorker] Inline job failed:', err);
  }
}

function startBullMQWorker(): Worker | null {
  if (!config.redis.url) {
    logger.info('[LeaderboardWorker] No Redis — using inline processing');
    return null;
  }

  const workerOptions: WorkerOptions = {
    connection: { url: config.redis.url, maxRetriesPerRequest: null },
    concurrency: 2,
    lockDuration: 30_000,
  } as any;

  const worker = new Worker<RebuildLeaderboardJobData>(
    'leaderboard',
    async (job) => {
      await processRebuildLeaderboard(job.data);
    },
    workerOptions as any
  );

  worker.on('completed', (job) => {
    logger.debug(`[LeaderboardWorker] Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`[LeaderboardWorker] Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    logger.error('[LeaderboardWorker] Worker error:', err.message);
  });

  logger.info('[LeaderboardWorker] BullMQ worker started');
  return worker;
}

let workerInstance: Worker | null = null;

export function startLeaderboardWorker(): void {
  workerInstance = startBullMQWorker();
}

export async function stopLeaderboardWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.close();
    workerInstance = null;
  }
}
