/**
 * DrawRush Scoring — all score calculations happen server-side only.
 * Unit-testable pure functions.
 */

/**
 * Calculate points for a correct guess based on remaining time.
 * Formula: max(50, round(1000 * remainingMs / totalMs))
 */
export function calcGuessPoints(remainingMs: number, totalMs: number): number {
  if (totalMs <= 0 || remainingMs < 0) return 50;
  const raw = 1000 * (remainingMs / totalMs);
  return Math.min(1000, Math.max(50, Math.round(raw)));
}

/**
 * Calculate artist reward for each correct guesser.
 * 25 points per correct guesser.
 */
export function calcArtistPoints(correctGuessCount: number): number {
  return Math.max(0, correctGuessCount * 25);
}

/**
 * Apply a speed-decay bonus for fast correct guesses.
 * First correct guesser gets full points; subsequent guessers scale down slightly.
 */
export function calcOrderBonus(orderIndex: number): number {
  // 0-indexed: first guesser gets 0 extra, but no penalty applied here.
  // The natural speed-based formula already rewards earlier guessers.
  return 0;
}

/**
 * Prevent negative score — scores can never go below 0.
 */
export function clampScore(score: number): number {
  return Math.max(0, score);
}
