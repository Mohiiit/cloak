import { describe, expect, it } from "vitest";
import { extractVoiceUsageMetrics } from "~~/lib/agent/voice-metrics";

describe("extractVoiceUsageMetrics", () => {
  it("extracts usage fields from top-level metadata", () => {
    const usage = extractVoiceUsageMetrics({
      duration: 4.2,
      credits_used: "1.5",
      credits_remaining: 998.5,
      request_id: "req_123",
    });

    expect(usage).toEqual({
      durationSec: 4.2,
      creditsUsed: 1.5,
      creditsRemaining: 998.5,
      requestId: "req_123",
    });
  });

  it("extracts usage fields from nested raw metadata", () => {
    const usage = extractVoiceUsageMetrics({
      provider: "sarvam",
      raw: {
        usage: {
          credits_used: 2,
          cost_usd: 0.0041,
          billed_duration: 7.5,
          currency: "USD",
        },
        id: "raw_456",
      },
    });

    expect(usage).toEqual({
      creditsUsed: 2,
      estimatedCostUsd: 0.0041,
      billedDurationSec: 7.5,
      currency: "USD",
      requestId: "raw_456",
    });
  });

  it("returns undefined when no known usage keys are present", () => {
    const usage = extractVoiceUsageMetrics({
      provider: "sarvam",
      raw: { transcript: "hello world" },
    });

    expect(usage).toBeUndefined();
  });
});
