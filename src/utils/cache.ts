// src/utils/cache.ts
// سیستم کش در حافظه

import NodeCache from 'node-cache';
import { config } from '../config';

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

  del(key: string): void {
    this.cache.del(key);
  }

  flush(): void {
    this.cache.flushAll();
  }

  // پاک کردن کلیدهایی که با یک پیشوند شروع می‌شوند
  delByPrefix(prefix: string): void {
    const keys = this.cache.keys().filter((k) => k.startsWith(prefix));
    keys.forEach((k) => this.cache.del(k));
  }
}

export const cache = new CacheService();
