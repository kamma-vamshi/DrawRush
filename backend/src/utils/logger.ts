import pino from "pino";
import { config } from "../config/config.js";

/**
 * Structured logger with secret-word redaction.
 * Any field named "word", "answer", "secretWord", "choice" in logged objects
 * will be replaced with "[REDACTED]".
 */
export const logger = pino({
  level: config.NODE_ENV === "production" ? "info" : "debug",
  transport:
    config.NODE_ENV !== "production"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
  serializers: {
    // Redact sensitive fields at serialization time
    payload: (p: unknown) => redactSecrets(p),
  },
  redact: {
    paths: ["*.word", "*.answer", "*.secretWord", "*.wordChoices[*]"],
    censor: "[REDACTED]",
  },
});

function redactSecrets(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") return obj;
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const lk = k.toLowerCase();
    if (lk === "word" || lk === "answer" || lk === "secretword" || lk === "wordchoices") {
      result[k] = "[REDACTED]";
    } else {
      result[k] = v;
    }
  }
  return result;
}
