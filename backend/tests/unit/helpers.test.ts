import { describe, it, expect } from "vitest";
import {
  normalizeGuess,
  validateNickname,
  generateRoomCode,
  buildWordPattern,
  pickHintIndex,
  calculateGuessPoints,
  calculateArtistPoints,
  clamp,
} from "../../src/utils/helpers.js";

describe("normalizeGuess", () => {
  it("lowercases the guess", () => {
    expect(normalizeGuess("ELEPHANT")).toBe("elephant");
  });

  it("trims whitespace", () => {
    expect(normalizeGuess("  cat  ")).toBe("cat");
  });

  it("collapses multiple spaces", () => {
    expect(normalizeGuess("hot  air  balloon")).toBe("hot air balloon");
  });

  it("removes special punctuation", () => {
    expect(normalizeGuess("cat!")).toBe("cat");
  });

  it("preserves hyphens", () => {
    expect(normalizeGuess("T-Rex")).toBe("t-rex");
  });

  it("preserves apostrophes", () => {
    expect(normalizeGuess("cat's")).toBe("cat's");
  });
});

describe("validateNickname", () => {
  it("accepts valid nickname", () => {
    expect(validateNickname("Alex").valid).toBe(true);
  });

  it("rejects empty nickname", () => {
    expect(validateNickname("").valid).toBe(false);
  });

  it("rejects whitespace-only nickname", () => {
    expect(validateNickname("   ").valid).toBe(false);
  });

  it("rejects too-long nickname (>20)", () => {
    expect(validateNickname("A".repeat(21)).valid).toBe(false);
  });

  it("accepts 20-char nickname", () => {
    expect(validateNickname("A".repeat(20)).valid).toBe(true);
  });

  it("rejects special characters", () => {
    expect(validateNickname("hacker<script>").valid).toBe(false);
  });

  it("accepts underscore and hyphen", () => {
    expect(validateNickname("cool_player-1").valid).toBe(true);
  });
});

describe("generateRoomCode", () => {
  it("generates 6-character code", () => {
    expect(generateRoomCode()).toHaveLength(6);
  });

  it("generates uppercase code", () => {
    const code = generateRoomCode();
    expect(code).toBe(code.toUpperCase());
  });

  it("generates unique codes", () => {
    const codes = new Set(Array.from({ length: 100 }, generateRoomCode));
    expect(codes.size).toBeGreaterThan(90);
  });

  it("does not contain ambiguous characters (0, O, 1, I)", () => {
    for (let i = 0; i < 100; i++) {
      const code = generateRoomCode();
      expect(code).not.toMatch(/[01IO]/);
    }
  });
});

describe("buildWordPattern", () => {
  it("masks all letters initially", () => {
    expect(buildWordPattern("cat", new Set())).toBe("_ _ _");
  });

  it("preserves spaces", () => {
    expect(buildWordPattern("hot dog", new Set())).toBe("_ _ _   _ _ _");
  });

  it("reveals specific indices", () => {
    expect(buildWordPattern("cat", new Set([0]))).toBe("C _ _");
  });

  it("reveals multiple letters", () => {
    expect(buildWordPattern("elephant", new Set([0, 2]))).toBe("E _ E _ _ _ _ _");
  });
});

describe("pickHintIndex", () => {
  it("returns a valid index", () => {
    const idx = pickHintIndex("cat", new Set());
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(3);
  });

  it("does not return already-revealed index", () => {
    const revealed = new Set([0, 1]);
    const idx = pickHintIndex("cat", revealed);
    expect(idx).toBe(2);
  });

  it("returns null when all letters revealed", () => {
    const revealed = new Set([0, 1, 2]);
    expect(pickHintIndex("cat", revealed)).toBeNull();
  });

  it("skips spaces", () => {
    // "hi" has indices 0,1 only
    const idx = pickHintIndex("hi", new Set([0]));
    expect(idx).toBe(1);
  });
});

describe("clamp", () => {
  it("clamps below min", () => expect(clamp(-5, 0, 10)).toBe(0));
  it("clamps above max", () => expect(clamp(15, 0, 10)).toBe(10));
  it("passes through in range", () => expect(clamp(5, 0, 10)).toBe(5));
});
