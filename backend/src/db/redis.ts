import { Redis } from "ioredis";
import { config } from "../config/config.js";
import { logger } from "../utils/logger.js";

let redisClient: Redis | null = null;
let redisSubClient: Redis | null = null;

export function getRedisClient(): Redis | null {
  if (!config.USE_REDIS && config.NODE_ENV !== "production") {
    return null;
  }
  if (!redisClient && config.REDIS_URL) {
    try {
      redisClient = new Redis(config.REDIS_URL, {
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
          if (times > 5) return null;
          return Math.min(times * 200, 2000);
        },
        lazyConnect: true,
      });
      redisClient.on("error", (err) => {
        logger.warn({ err: err.message }, "Redis client error");
      });
      redisClient.on("connect", () => {
        logger.info("Redis client connected");
      });
    } catch (e) {
      logger.warn({ err: e }, "Failed to initialize Redis client");
    }
  }
  return redisClient;
}

export function getRedisSubClient(): Redis | null {
  if (!config.USE_REDIS && config.NODE_ENV !== "production") {
    return null;
  }
  if (!redisSubClient && config.REDIS_URL) {
    try {
      redisSubClient = new Redis(config.REDIS_URL, {
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
          if (times > 5) return null;
          return Math.min(times * 200, 2000);
        },
        lazyConnect: true,
      });
      redisSubClient.on("error", (err) => {
        logger.warn({ err: err.message }, "Redis sub client error");
      });
    } catch (e) {
      logger.warn({ err: e }, "Failed to initialize Redis sub client");
    }
  }
  return redisSubClient;
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit().catch(() => {});
    redisClient = null;
  }
  if (redisSubClient) {
    await redisSubClient.quit().catch(() => {});
    redisSubClient = null;
  }
}
