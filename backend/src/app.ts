import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { Server as SocketIOServer } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { config } from "./config/config.js";
import { logger } from "./utils/logger.js";
import { initFirebase } from "./auth/firebase.js";
import { registerSocketHandlers } from "./middleware/socketHandlers.js";
import { roomStore, setRoomStore, RedisRoomStore } from "./rooms/roomStore.js";
import { setRateLimiters } from "./utils/rateLimiter.js";
import { getRedisClient, getRedisSubClient } from "./db/redis.js";
import { WORD_CATEGORIES } from "./words/wordDatabase.js";
import { PROTOCOL_VERSION } from "./protocol/version.js";

export interface AppInstance {
  fastify: FastifyInstance;
  io: SocketIOServer;
}

/**
 * Validates CORS origins.
 * Allows Android native client (empty/no origin), local development origins,
 * Firebase hosting web origins, and Vercel domains.
 */
export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // Android native client or server-to-server request
  if (config.NODE_ENV !== "production") return true; // Local dev allows all
  try {
    const parsed = new URL(origin);
    const host = parsed.hostname;
    // Allow localhost / loopback in all environments
    if (host === "localhost" || host === "127.0.0.1") return true;
    // Allow Firebase hosting domains
    if (host === "drawrush-510809.web.app" || host === "drawrush-510809.firebaseapp.com") return true;
    // Allow Vercel preview and production domains
    if (host.endsWith(".vercel.app")) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Factory function to create and configure Fastify and Socket.IO.
 * Separates application creation from server startup (`listen()`).
 */
export async function createApp(): Promise<AppInstance> {
  // 1. Initialize Firebase Admin
  initFirebase();

  // 2. Configure Redis distributed state if enabled
  let redisAdapter = undefined;
  if (config.USE_REDIS && config.REDIS_URL) {
    try {
      const pubClient = getRedisClient();
      const subClient = getRedisSubClient();
      if (pubClient && subClient) {
        redisAdapter = createAdapter(pubClient, subClient);
        setRoomStore(new RedisRoomStore(pubClient));
        setRateLimiters(pubClient);
        logger.info("Connected to Redis: distributed room store, adapter, and rate limiter initialized");
      }
    } catch (err) {
      logger.error({ err }, "Failed to initialize Redis. Falling back to in-memory store.");
    }
  }

  // 3. Create Fastify HTTP server
  const fastify = Fastify({
    logger:
      config.NODE_ENV !== "production"
        ? {
            transport: {
              target: "pino-pretty",
              options: { translateTime: "HH:MM:ss Z", ignore: "pid,hostname" },
            },
          }
        : true,
  });

  fastify.addHook("onRequest", async (request) => {
    fastify.log.info({ url: request.url, method: request.method, ip: request.ip }, "Incoming request");
  });

  // 4. Register CORS with intentional origin checking
  await fastify.register(cors, {
    origin: (origin, cb) => {
      if (isAllowedOrigin(origin)) {
        cb(null, true);
      } else {
        cb(new Error("CORS policy violation: origin not allowed"), false);
      }
    },
    methods: ["GET", "POST", "OPTIONS"],
  });

  // ─── HTTP Health & API Endpoints ──────────────────────────────────────────
  fastify.get("/health", async () => ({
    status: "ok",
    version: PROTOCOL_VERSION,
    env: config.NODE_ENV,
    timestamp: Date.now(),
    rooms: roomStore.size,
    storage: config.USE_REDIS ? "redis" : "in-memory",
  }));

  fastify.get("/api/categories", async () => ({
    categories: WORD_CATEGORIES.map((c) => ({ id: c.id, name: c.name, wordCount: c.words.length })),
  }));

  fastify.get("/api/version", async () => ({
    protocolVersion: PROTOCOL_VERSION,
    minClientVersion: "1.0.0",
  }));

  await fastify.ready();

  // 5. Socket.IO Server Configuration
  const io = new SocketIOServer(fastify.server, {
    cors: {
      origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) {
          callback(null, true);
        } else {
          callback(new Error("CORS policy violation: origin not allowed"));
        }
      },
      methods: ["GET", "POST"],
      credentials: true,
    },
    adapter: redisAdapter,
    maxHttpBufferSize: config.MAX_PAYLOAD_BYTES,
    pingTimeout: 20000,
    pingInterval: 10000,
    transports: ["websocket", "polling"],
  });

  // 6. Register all game event handlers
  registerSocketHandlers(io);

  return { fastify, io };
}
