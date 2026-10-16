import Fastify from "fastify";
import cors from "@fastify/cors";
import { Server as SocketIOServer } from "socket.io";
import { config } from "./config/config.js";
import { logger } from "./utils/logger.js";
import { initFirebase } from "./auth/firebase.js";
import { registerSocketHandlers } from "./middleware/socketHandlers.js";
import { roomStore } from "./rooms/roomStore.js";
import { WORD_CATEGORIES } from "./words/wordDatabase.js";
import { PROTOCOL_VERSION } from "./protocol/version.js";

async function main() {
  // Initialize Firebase Admin
  initFirebase();

  // Create Fastify HTTP server
  const fastify = Fastify({ 
    logger: {
      transport: {
        target: 'pino-pretty',
        options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' }
      }
    } 
  });

  fastify.addHook('onRequest', async (request, reply) => {
    fastify.log.info({ url: request.url, method: request.method, ip: request.ip }, 'Incoming request');
  });

  await fastify.register(cors, {
    origin: true,
    methods: ["GET", "POST"],
  });

  // ─── HTTP Health Endpoints ─────────────────────────────────────────────
  fastify.get("/health", async () => ({
    status: "ok",
    version: PROTOCOL_VERSION,
    env: config.NODE_ENV,
    timestamp: Date.now(),
    rooms: roomStore.size,
  }));

  fastify.get("/api/categories", async () => ({
    categories: WORD_CATEGORIES.map((c) => ({ id: c.id, name: c.name, wordCount: c.words.length })),
  }));

  fastify.get("/api/version", async () => ({
    protocolVersion: PROTOCOL_VERSION,
    minClientVersion: "1.0.0",
  }));

  await fastify.ready();

  // Socket.IO
  const io = new SocketIOServer(fastify.server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
    maxHttpBufferSize: config.MAX_PAYLOAD_BYTES,
    pingTimeout: 20000,
    pingInterval: 10000,
    transports: ["websocket", "polling"],
  });

  // Register all game event handlers
  registerSocketHandlers(io);

  // Start listening
  await fastify.listen({ port: config.PORT, host: "0.0.0.0" });

  logger.info(
    { port: config.PORT, env: config.NODE_ENV, devAuth: config.DEV_AUTH },
    `🎨 DrawRush backend listening on port ${config.PORT}`
  );

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("Shutting down...");
    io.close();
    await fastify.close();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
