import { describe, it, expect } from "vitest";
import { generateKey, isValidKey, CURVE_ORDER } from "../src/keys";

describe("keys", () => {
  it("generates a valid hex key", () => {
    const key = generateKey();
    expect(key).toMatch(/^0x[0-9a-f]+$/);
    expect(isValidKey(key)).toBe(true);
  });

  it("generates unique keys", () => {
    const keys = new Set(Array.from({ length: 10 }, () => generateKey()));
    expect(keys.size).toBe(10);
  });

  it("validates keys correctly", () => {
    expect(isValidKey("0x1")).toBe(true);
    expect(isValidKey("0x" + (CURVE_ORDER - 1n).toString(16))).toBe(true);

    // Invalid: zero
    expect(isValidKey("0x0")).toBe(false);
    // Invalid: >= curve order
    expect(isValidKey("0x" + CURVE_ORDER.toString(16))).toBe(false);
    // Invalid: not a number
    expect(isValidKey("not-a-key")).toBe(false);
    expect(isValidKey("")).toBe(false);
  });

  it("generated key is within curve order", () => {
    for (let i = 0; i < 20; i++) {
      const key = generateKey();
      const n = BigInt(key);
      expect(n).toBeGreaterThanOrEqual(1n);
      expect(n).toBeLessThan(CURVE_ORDER);
    }
  });
});
