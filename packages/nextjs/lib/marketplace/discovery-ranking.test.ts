import { describe, expect, it } from "vitest";
import type { AgentProfileResponse } from "@cloak-wallet/sdk";
import { rankDiscoveredAgents } from "./discovery-ranking";

function profile(overrides: Partial<AgentProfileResponse>): AgentProfileResponse {
  return {
    id: "agent_1",
    agent_id: "agent_1",
    name: "Agent",
    description: "Agent",
    image_url: null,
    agent_type: "staking_steward",
    capabilities: ["stake"],
    endpoints: ["https://agents.cloak.local/stake"],
    pricing: { mode: "per_run", amount: "100", token: "STRK" },
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
    ...overrides,
  };
}

describe("discovery ranking", () => {
  it("prioritizes trust and verification", () => {
    const ranked = rankDiscoveredAgents(
      [
        profile({ agent_id: "a", trust_score: 80, verified: false }),
        profile({ agent_id: "b", trust_score: 70, verified: true }),
      ],
      { capability: "stake" },
    );
    expect(ranked[0].agent_id).toBe("b");
    expect(ranked[1].agent_id).toBe("a");
  });
});

