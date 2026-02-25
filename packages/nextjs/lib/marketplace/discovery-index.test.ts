import { describe, expect, it } from "vitest";
import type { AgentProfileResponse } from "@cloak-wallet/sdk";
import {
  clearDiscoveryIndex,
  ingestAgentDiscoveryProfile,
  selectDiscoveryAgentIds,
} from "./discovery-index";

function profile(overrides: Partial<AgentProfileResponse>): AgentProfileResponse {
  const base: AgentProfileResponse = {
    id: "agent_1",
    agent_id: "agent_1",
    name: "Agent One",
    description: "Test",
    image_url: null,
    agent_type: "staking_steward",
    capabilities: ["stake"],
    endpoints: ["https://agents.cloak.local/stake"],
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
  };
  return {
    ...base,
    ...overrides,
  };
}

describe("discovery index ingestion", () => {
  it("indexes agents by capability and type", () => {
    clearDiscoveryIndex();
    ingestAgentDiscoveryProfile(
      profile({
        id: "agent_a",
        agent_id: "agent_a",
        agent_type: "staking_steward",
        capabilities: ["stake", "rebalance"],
      }),
    );
    ingestAgentDiscoveryProfile(
      profile({
        id: "agent_b",
        agent_id: "agent_b",
        agent_type: "swap_runner",
        capabilities: ["swap"],
      }),
    );

    expect(selectDiscoveryAgentIds({ capability: "stake" })).toEqual(["agent_a"]);
    expect(selectDiscoveryAgentIds({ capability: "swap" })).toEqual(["agent_b"]);
    expect(selectDiscoveryAgentIds({ agentType: "swap_runner" })).toEqual(["agent_b"]);
  });

  it("re-ingests and de-duplicates agent records", () => {
    clearDiscoveryIndex();
    ingestAgentDiscoveryProfile(
      profile({
        id: "agent_a",
        agent_id: "agent_a",
        agent_type: "staking_steward",
        capabilities: ["stake"],
      }),
    );
    ingestAgentDiscoveryProfile(
      profile({
        id: "agent_a",
        agent_id: "agent_a",
        agent_type: "staking_steward",
        capabilities: ["rebalance"],
      }),
    );

    expect(selectDiscoveryAgentIds({ capability: "stake" })).toEqual([]);
    expect(selectDiscoveryAgentIds({ capability: "rebalance" })).toEqual(["agent_a"]);
  });
});

