import { randomBytes } from "crypto";

/** Generate a cryptographically secure 6-character uppercase alphanumeric room code. */
export function generateRoomCode(): string {
  const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // removed ambiguous 0/O, 1/I
  let code = "";
  const bytes = randomBytes(6);
  for (const byte of bytes) {
    code += CHARS[byte % CHARS.length];
  }
  return code;
}

/** Normalize a guess for case-insensitive comparison. */
export function normalizeGuess(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s'-]/g, "");
}

/** Normalize a word for storage and comparison. */
export function normalizeWord(raw: string): string {
  return raw.toLowerCase().trim().replace(/\s+/g, " ");
}

/** Build a masked word pattern, revealing hint letters. */
export function buildWordPattern(word: string, revealed: Set<number>): string {
  return word
    .split("")
    .map((ch, i) => {
      if (ch === " ") return " ";
      if (revealed.has(i)) return ch.toUpperCase();
      return "_";
    })
    .join(" ");
}

/** Pick random indices (letters) to reveal as a hint, avoiding already-revealed ones. */
export function pickHintIndex(word: string, revealed: Set<number>): number | null {
  const candidates: number[] = [];
  for (let i = 0; i < word.length; i++) {
    if (word[i] !== " " && !revealed.has(i)) {
      candidates.push(i);
    }
  }
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/** Validate nickname: non-empty, max 20 chars, no control characters. */
export function validateNickname(nick: string): { valid: boolean; reason?: string } {
  if (!nick || nick.trim().length === 0) {
    return { valid: false, reason: "NICKNAME_REQUIRED" };
  }
  if (nick.trim().length > 20) {
    return { valid: false, reason: "NICKNAME_TOO_LONG" };
  }
  if (!/^[\w\s\-'.!?]+$/u.test(nick.trim())) {
    return { valid: false, reason: "NICKNAME_INVALID" };
  }
  return { valid: true };
}

/** Clamp a number between min and max. */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Sleep for ms milliseconds (useful in game timers). */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Calculate guess speed points. */
export function calculateGuessPoints(
  remainingMs: number,
  totalMs: number
): number {
  if (totalMs <= 0) return 50;
  return Math.max(50, Math.round(1000 * (remainingMs / totalMs)));
}

/** Calculate artist reward based on number of correct guessers. */
export function calculateArtistPoints(correctGuessers: number): number {
  // 25 points per correct guesser, min 0
  return Math.max(0, correctGuessers * 25);
}
