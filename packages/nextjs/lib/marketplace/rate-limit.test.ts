import { describe, expect, it } from "vitest";
import { clearRateLimits, consumeRateLimit } from "./rate-limit";

describe("marketplace rate limits", () => {
  it("allows until limit then throttles", () => {
    clearRateLimits();
    const rule = { limit: 2, windowMs: 10_000 };
    const first = consumeRateLimit("scope-a", "0xabc", rule);
    const second = consumeRateLimit("scope-a", "0xabc", rule);
    const third = consumeRateLimit("scope-a", "0xabc", rule);

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSeconds).toBeGreaterThan(0);
  });
});

