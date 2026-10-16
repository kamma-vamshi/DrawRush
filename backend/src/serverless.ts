import type { IncomingMessage, ServerResponse } from "http";
import { createApp, type AppInstance } from "./app.js";

let appPromise: Promise<AppInstance> | null = null;

async function getApp(): Promise<AppInstance> {
  if (!appPromise) {
    appPromise = createApp();
  }
  return appPromise;
}

/**
 * Serverless request handler for Vercel functions.
 * Dispatches incoming HTTP requests and Socket.IO polling/handshake requests
 * through Fastify and Socket.IO attached to fastify.server.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { fastify } = await getApp();
  fastify.server.emit("request", req, res);
}
