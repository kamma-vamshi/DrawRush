import { describe, it, expect } from "vitest";
import { calcGuessPoints, calcArtistPoints, clampScore } from "../../src/scoring/scoring.js";

describe("calcGuessPoints", () => {
  it("returns 1000 when full time remaining", () => {
    expect(calcGuessPoints(80000, 80000)).toBe(1000);
  });

  it("returns 500 when half time remaining", () => {
    expect(calcGuessPoints(40000, 80000)).toBe(500);
  });

  it("returns minimum 50 when time is 0", () => {
    expect(calcGuessPoints(0, 80000)).toBe(50);
  });

  it("returns minimum 50 when very little time left", () => {
    const pts = calcGuessPoints(1000, 80000);
    expect(pts).toBeGreaterThanOrEqual(50);
    expect(pts).toBeLessThan(100);
  });

  it("handles totalMs = 0 without crash", () => {
    expect(calcGuessPoints(5000, 0)).toBe(50);
  });

  it("handles negative remaining time", () => {
    expect(calcGuessPoints(-1000, 80000)).toBe(50);
  });

  it("does not exceed 1000", () => {
    expect(calcGuessPoints(90000, 80000)).toBeLessThanOrEqual(1000);
  });
});

describe("calcArtistPoints", () => {
  it("returns 0 for no correct guessers", () => {
    expect(calcArtistPoints(0)).toBe(0);
  });

  it("returns 25 for 1 correct guesser", () => {
    expect(calcArtistPoints(1)).toBe(25);
  });

  it("returns 175 for 7 correct guessers", () => {
    expect(calcArtistPoints(7)).toBe(175);
  });

  it("never returns negative", () => {
    expect(calcArtistPoints(-1)).toBe(0);
  });
});

describe("clampScore", () => {
  it("prevents negative scores", () => {
    expect(clampScore(-500)).toBe(0);
  });

  it("passes through positive scores", () => {
    expect(clampScore(750)).toBe(750);
  });

  it("allows zero", () => {
    expect(clampScore(0)).toBe(0);
  });
});
