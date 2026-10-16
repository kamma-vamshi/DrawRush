import { config } from "../config/config.js";

/**
 * Token-bucket rate limiter per player per action type.
 * Stores bucket state in memory (per server process).
 * For multi-process deployments, move to Redis-backed implementation.
 */
interface Bucket {
  tokens: number;
  lastRefill: number;
}

export class RateLimiter {
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

export const chatRateLimiter = new RateLimiter(
  config.CHAT_RATE_LIMIT_TOKENS,
  config.CHAT_RATE_LIMIT_WINDOW_MS
);

export const drawRateLimiter = new RateLimiter(
  config.DRAW_RATE_LIMIT_TOKENS,
  config.DRAW_RATE_LIMIT_WINDOW_MS
);
