import { describe, it, expect } from "vitest";
import { pickWords, validateCustomWords, isWordSafe, WORD_CATEGORIES } from "../../src/words/wordDatabase.js";

describe("pickWords", () => {
  it("returns the requested count", () => {
    const words = pickWords(3);
    expect(words).toHaveLength(3);
  });

  it("returns unique words", () => {
    const words = pickWords(10);
    const unique = new Set(words);
    expect(unique.size).toBe(10);
  });

  it("avoids already-used words", () => {
    const used = new Set(["cat", "dog", "elephant"]);
    const words = pickWords(5, { usedWords: used });
    for (const w of words) {
      expect(used.has(w.toLowerCase())).toBe(false);
    }
  });

  it("respects category filter", () => {
    const catWords = WORD_CATEGORIES.find(c => c.id === "animals")!.words;
    const catSet = new Set(catWords);
    const picked = pickWords(5, { categories: ["animals"] });
    for (const w of picked) {
      expect(catSet.has(w)).toBe(true);
    }
  });

  it("uses only custom words in exclusive mode", () => {
    const customWords = ["banana", "mango", "papaya"];
    const picked = pickWords(2, { customWords, exclusiveCustomWords: true });
    expect(picked.length).toBeLessThanOrEqual(2);
    for (const w of picked) {
      expect(customWords).toContain(w);
    }
  });

  it("returns fewer words if pool is smaller than requested", () => {
    const customWords = ["only-one"];
    const picked = pickWords(5, { customWords, exclusiveCustomWords: true });
    expect(picked.length).toBeLessThanOrEqual(1);
  });
});

describe("validateCustomWords", () => {
  it("accepts valid words", () => {
    const result = validateCustomWords(["banana", "mango"]);
    expect(result.valid).toBe(true);
  });

  it("rejects more than 200 words", () => {
    const result = validateCustomWords(Array.from({ length: 201 }, (_, i) => `word${i}`));
    expect(result.valid).toBe(false);
  });

  it("rejects words longer than 30 chars", () => {
    const result = validateCustomWords(["a".repeat(31)]);
    expect(result.valid).toBe(false);
  });

  it("rejects empty strings", () => {
    const result = validateCustomWords([""]);
    expect(result.valid).toBe(false);
  });
});

describe("isWordSafe", () => {
  it("passes normal words", () => {
    expect(isWordSafe("elephant")).toBe(true);
    expect(isWordSafe("pizza")).toBe(true);
  });

  it("blocks unsafe words", () => {
    expect(isWordSafe("kill")).toBe(false);
    expect(isWordSafe("hate")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isWordSafe("KILL")).toBe(false);
  });
});

describe("word categories", () => {
  it("has at least 5 categories", () => {
    expect(WORD_CATEGORIES.length).toBeGreaterThanOrEqual(5);
  });

  it("each category has at least 10 words", () => {
    for (const cat of WORD_CATEGORIES) {
      expect(cat.words.length).toBeGreaterThanOrEqual(10);
    }
  });
});
