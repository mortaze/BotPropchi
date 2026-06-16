import Redis from 'ioredis';
import { config } from '../config';
import { logger } from './logger';

class RedisClient {
  private client: Redis | null = null;
  private fallback: Map<string, { value: any; expires: number }> = new Map();
  private connected = false;

  constructor() {
    if (config.redis.url) {
      this.connect();
    } else {
      logger.warn('[Redis] REDIS_URL not configured — using in-memory fallback');
    }
  }

  private connect() {
    try {
      this.client = new Redis(config.redis.url!, {
        maxRetriesPerRequest: null,
        retryStrategy: (times) => {
          if (times > 3) {
            logger.warn('[Redis] Max retries reached, falling back to in-memory cache');
            this.connected = false;
            return null;
          }
          return Math.min(times * 200, 2000);
        },
        lazyConnect: true,
      });

      this.client.on('connect', () => {
        this.connected = true;
        logger.info('[Redis] Connected');
      });

      this.client.on('error', (err) => {
        this.connected = false;
        logger.error('[Redis] Connection error:', err.message);
      });

      this.client.on('close', () => {
        this.connected = false;
        logger.warn('[Redis] Connection closed');
      });

      this.client.connect().catch((err) => {
        this.connected = false;
        logger.warn('[Redis] Failed to connect:', err.message);
      });
    } catch (err) {
      this.connected = false;
      logger.warn('[Redis] Init error:', (err as Error).message);
    }
  }

  isConnected(): boolean {
    return this.connected && this.client !== null && this.client.status === 'ready';
  }

  async get<T>(key: string): Promise<T | undefined> {
    if (this.isConnected()) {
      try {
        const raw = await this.client!.get(key);
        if (raw === null) return undefined;
        return JSON.parse(raw) as T;
      } catch {
        return this.fallbackGet<T>(key);
      }
    }
    return this.fallbackGet<T>(key);
  }

  async set(key: string, value: any, ttlSeconds = 60): Promise<void> {
    if (this.isConnected()) {
      try {
        const serialized = JSON.stringify(value);
        if (ttlSeconds > 0) {
          await this.client!.setex(key, ttlSeconds, serialized);
        } else {
          await this.client!.set(key, serialized);
        }
        return;
      } catch {
        this.fallbackSet(key, value, ttlSeconds);
      }
    }
    this.fallbackSet(key, value, ttlSeconds);
  }

  async del(key: string): Promise<void> {
    if (this.isConnected()) {
      try {
        await this.client!.del(key);
        return;
      } catch { /* fallback */ }
    }
    this.fallback.delete(key);
  }

  async invalidateByPrefix(prefix: string): Promise<void> {
    if (this.isConnected()) {
      try {
        const keys = await this.client!.keys(`${prefix}*`);
        if (keys.length > 0) {
          await this.client!.del(...keys);
        }
        return;
      } catch { /* fallback */ }
    }
    for (const key of this.fallback.keys()) {
      if (key.startsWith(prefix)) {
        this.fallback.delete(key);
      }
    }
  }

  private fallbackGet<T>(key: string): T | undefined {
    const entry = this.fallback.get(key);
    if (!entry) return undefined;
    if (entry.expires > 0 && Date.now() > entry.expires) {
      this.fallback.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  private fallbackSet(key: string, value: any, ttlSeconds: number): void {
    this.fallback.set(key, {
      value,
      expires: ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : 0,
    });
  }

  async quit(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.connected = false;
    }
  }
}

export const redisClient = new RedisClient();
