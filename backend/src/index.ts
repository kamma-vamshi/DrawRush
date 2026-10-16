import { createApp } from "./app.js";
import { config } from "./config/config.js";
import { logger } from "./utils/logger.js";
import { closeRedis } from "./db/redis.js";

async function main() {
  const { fastify, io } = await createApp();

  await fastify.listen({ port: config.PORT, host: "0.0.0.0" });

  logger.info(
    { port: config.PORT, env: config.NODE_ENV, devAuth: config.DEV_AUTH, useRedis: config.USE_REDIS },
    `🎨 DrawRush backend listening on port ${config.PORT}`
  );

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("Shutting down DrawRush backend...");
    io.close();
    await fastify.close();
    await closeRedis();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
