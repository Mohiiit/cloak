import { describe, expect, it } from "vitest";
import { composeTrustSummary } from "./trust-summary";

describe("trust summary composition", () => {
  it("composes trust score from ownership + reputation + validation + freshness", () => {
    const composed = composeTrustSummary({
      ownerMatch: true,
      reputationScore: 80,
      validationScore: 70,
      freshnessSeconds: 120,
      existingTrustScore: 50,
    });

    expect(composed.trustSummary.owner_match).toBe(true);
    expect(composed.trustSummary.reputation_score).toBe(80);
    expect(composed.trustSummary.validation_score).toBe(70);
    expect(composed.trustScore).toBeGreaterThan(70);
  });

  it("applies freshness penalty to stale profiles", () => {
    const fresh = composeTrustSummary({
      ownerMatch: false,
      reputationScore: 90,
      validationScore: 90,
      freshnessSeconds: 30,
      existingTrustScore: 70,
    });
    const stale = composeTrustSummary({
      ownerMatch: false,
      reputationScore: 90,
      validationScore: 90,
      freshnessSeconds: 3600,
      existingTrustScore: 70,
    });

    expect(stale.trustScore).toBeLessThan(fresh.trustScore);
  });
});

