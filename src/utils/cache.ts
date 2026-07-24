// src/utils/cache.ts
// سیستم کش در حافظه

import NodeCache from 'node-cache';
import { config } from '../config';

const CACHE_VERSION = config.cache.version;

export function cacheKey(prefix: string, ...parts: (string | number | undefined)[]): string {
  const key = [prefix, ...parts.filter(p => p != null)].join(':');
  return `${key}:v${CACHE_VERSION}`;
}

class CacheService {
  private cache: NodeCache;

  constructor() {
    this.cache = new NodeCache({ stdTTL: config.cache.ttl, checkperiod: 60 });
  }

  get<T>(key: string): T | undefined {
    return this.cache.get<T>(key);
  }

  set<T>(key: string, value: T, ttl?: number): void {
    this.cache.set(key, value, ttl ?? config.cache.ttl);
  }

  setPermanent<T>(key: string, value: T): void {
    this.cache.set(key, value, 86400 * 365);
  }

  del(key: string): void {
    this.cache.del(key);
  }

  flush(): void {
    this.cache.flushAll();
  }

  delByPrefix(prefix: string): void {
    const versionPrefix = `${prefix}:v${CACHE_VERSION}`;
    const keys = this.cache.keys().filter((k) => k.startsWith(versionPrefix));
    for (const k of keys) {
      this.cache.del(k);
    }
  }

  get keys(): string[] {
    return this.cache.keys();
  }
}

export const cache = new CacheService();
