import "dotenv/config";
import { z } from "zod";

export const configSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  // Dev-only bypass: set DEV_AUTH=true to skip Firebase token verification
  DEV_AUTH: z.preprocess((val) => {
    if (val === undefined) return undefined;
    if (typeof val === "boolean") return val;
    if (typeof val === "number") return val === 1;
    if (typeof val === "string") {
      const s = val.toLowerCase().trim();
      if (s === "true" || s === "1") return true;
      if (s === "false" || s === "0") return false;
    }
    return val;
  }, z.boolean().default(false)),
  // Max drawing history events kept in memory per room
  MAX_CANVAS_HISTORY: z.coerce.number().default(500),
  // Grace period (ms) before a disconnected player is removed
  DISCONNECT_GRACE_MS: z.coerce.number().default(15000),
  // Artist disconnect: time before round is ended (ms)
  ARTIST_DISCONNECT_GRACE_MS: z.coerce.number().default(5000),
  // Host disconnect: time before host is migrated (ms)
  HOST_MIGRATE_GRACE_MS: z.coerce.number().default(8000),
  // Countdown duration before word selection (ms)
  COUNTDOWN_MS: z.coerce.number().default(3000),
  // Word selection timeout (ms)
  WORD_SELECTION_TIMEOUT_MS: z.coerce.number().default(15000),
  // Round result display duration (ms)
  ROUND_RESULT_MS: z.coerce.number().default(5000),
  // Chat rate limit: tokens per window
  CHAT_RATE_LIMIT_TOKENS: z.coerce.number().default(10),
  CHAT_RATE_LIMIT_WINDOW_MS: z.coerce.number().default(5000),
  // Drawing rate limit: events per window
  DRAW_RATE_LIMIT_TOKENS: z.coerce.number().default(60),
  DRAW_RATE_LIMIT_WINDOW_MS: z.coerce.number().default(1000),
  // Max payload bytes from a single socket message
  MAX_PAYLOAD_BYTES: z.coerce.number().default(65536),
}).superRefine((data, ctx) => {
  if (data.NODE_ENV === "production" && data.DEV_AUTH === true) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "DEV_AUTH=true is strictly forbidden in production",
      path: ["DEV_AUTH"],
    });
  }
  if (data.NODE_ENV === "production" && (!data.FIREBASE_PROJECT_ID || !data.FIREBASE_CLIENT_EMAIL || !data.FIREBASE_PRIVATE_KEY)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY are required in production",
      path: ["FIREBASE_PROJECT_ID"],
    });
  }
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    console.error("Invalid configuration:", result.error.format());
    process.exit(1);
  }
  return result.data;
}

export const config = loadConfig();
