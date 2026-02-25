import { describe, expect, it } from "vitest";
import {
  computeFreshnessSnapshot,
  getRegistryMetricsSnapshot,
  incrementRegistryMetric,
  resetRegistryMetrics,
} from "./registry-metrics";

describe("registry metrics + freshness", () => {
  it("tracks counters and freshness summary", () => {
    resetRegistryMetrics();
    incrementRegistryMetric("profiles_registered");
    incrementRegistryMetric("discovery_queries");

    const snapshot = getRegistryMetricsSnapshot();
    expect(snapshot.profiles_registered).toBe(1);
    expect(snapshot.discovery_queries).toBe(1);

    const freshness = computeFreshnessSnapshot([
      {
        id: "a",
        agent_id: "a",
        name: "Agent",
        description: "desc",
        image_url: null,
        agent_type: "staking_steward",
        capabilities: ["stake"],
        endpoints: ["https://agents.cloak.local/a"],
        pricing: { mode: "per_run", amount: "1", token: "STRK" },
        metadata_uri: null,
        operator_wallet: "0xabc",
        service_wallet: "0xdef",
        trust_score: 50,
        trust_summary: {
          owner_match: false,
          reputation_score: 0,
          validation_score: 0,
          freshness_seconds: 0,
        },
        verified: false,
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: null,
        last_indexed_at: new Date().toISOString(),
      },
    ]);
    expect(freshness.totalProfiles).toBe(1);
    expect(freshness.maxAgeSeconds).toBeGreaterThanOrEqual(0);
  });
});

