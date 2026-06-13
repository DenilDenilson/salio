import { Redis } from "@upstash/redis";

export interface CacheClient {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  acquireLock(key: string, ttlSeconds: number): Promise<string | null>;
  releaseLock(key: string, token: string): Promise<void>;
}

interface MemoryEntry {
  value: unknown;
  expiresAt?: number;
}

export class InMemoryCache implements CacheClient {
  private readonly entries = new Map<string, MemoryEntry>();
  private readonly locks = new Map<
    string,
    { token: string; expiresAt: number }
  >();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.entries.get(key);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    this.entries.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
    });
  }

  async del(key: string): Promise<void> {
    this.entries.delete(key);
  }

  async acquireLock(key: string, ttlSeconds: number): Promise<string | null> {
    const existing = this.locks.get(key);
    if (existing && existing.expiresAt > Date.now()) {
      return null;
    }
    const token = crypto.randomUUID();
    this.locks.set(key, { token, expiresAt: Date.now() + ttlSeconds * 1000 });
    return token;
  }

  async releaseLock(key: string, token: string): Promise<void> {
    const existing = this.locks.get(key);
    if (existing?.token === token) {
      this.locks.delete(key);
    }
  }
}

/* v8 ignore start */
export class UpstashCache implements CacheClient {
  private readonly redis: Redis;

  constructor(url: string, token: string) {
    this.redis = new Redis({ url, token });
  }

  async get<T>(key: string): Promise<T | null> {
    return this.redis.get<T>(key);
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.redis.set(key, value, { ex: ttlSeconds });
    } else {
      await this.redis.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async acquireLock(key: string, ttlSeconds: number): Promise<string | null> {
    const token = crypto.randomUUID();
    const result = await this.redis.set(key, token, {
      nx: true,
      ex: ttlSeconds,
    });
    return result === "OK" ? token : null;
  }

  async releaseLock(key: string, token: string): Promise<void> {
    const current = await this.redis.get<string>(key);
    if (current === token) {
      await this.redis.del(key);
    }
  }
}
/* v8 ignore stop */
