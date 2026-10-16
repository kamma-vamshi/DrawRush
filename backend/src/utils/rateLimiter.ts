import { config } from "../config/config.js";
import type { Redis } from "ioredis";

export interface IRateLimiter {
  consume(key: string): Promise<boolean> | boolean;
  clear?(key: string): Promise<void> | void;
}

interface Bucket {
  tokens: number;
  lastRefill: number;
}

export class InMemoryRateLimiter implements IRateLimiter {
  private buckets = new Map<string, Bucket>();
  private readonly maxTokens: number;
  private readonly windowMs: number;

  constructor(maxTokens: number, windowMs: number) {
    this.maxTokens = maxTokens;
    this.windowMs = windowMs;
  }

  /** Returns true if the action is allowed, false if rate-limited. */
  consume(key: string): boolean {
    const now = Date.now();
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: this.maxTokens, lastRefill: now };
      this.buckets.set(key, bucket);
    }
    // Refill tokens proportional to elapsed time
    const elapsed = now - bucket.lastRefill;
    const refill = Math.floor((elapsed / this.windowMs) * this.maxTokens);
    if (refill > 0) {
      bucket.tokens = Math.min(this.maxTokens, bucket.tokens + refill);
      bucket.lastRefill = now;
    }
    if (bucket.tokens > 0) {
      bucket.tokens--;
      return true;
    }
    return false;
  }

  clear(key: string): void {
    this.buckets.delete(key);
  }
}

export class RedisRateLimiter implements IRateLimiter {
  constructor(private redis: Redis, private maxTokens: number, private windowMs: number) {}

  async consume(key: string): Promise<boolean> {
    try {
      const redisKey = `drawrush:ratelimit:${key}`;
      const count = await this.redis.incr(redisKey);
      if (count === 1) {
        await this.redis.pexpire(redisKey, this.windowMs);
      }
      return count <= this.maxTokens;
    } catch {
      // Graceful fallback to allow if Redis has a transient hiccup
      return true;
    }
  }

  async clear(key: string): Promise<void> {
    try {
      await this.redis.del(`drawrush:ratelimit:${key}`);
    } catch {}
  }
}

export let chatRateLimiter: IRateLimiter = new InMemoryRateLimiter(
  config.CHAT_RATE_LIMIT_TOKENS,
  config.CHAT_RATE_LIMIT_WINDOW_MS
);

export let drawRateLimiter: IRateLimiter = new InMemoryRateLimiter(
  config.DRAW_RATE_LIMIT_TOKENS,
  config.DRAW_RATE_LIMIT_WINDOW_MS
);

export function setRateLimiters(redis: Redis): void {
  chatRateLimiter = new RedisRateLimiter(
    redis,
    config.CHAT_RATE_LIMIT_TOKENS,
    config.CHAT_RATE_LIMIT_WINDOW_MS
  );
  drawRateLimiter = new RedisRateLimiter(
    redis,
    config.DRAW_RATE_LIMIT_TOKENS,
    config.DRAW_RATE_LIMIT_WINDOW_MS
  );
}
