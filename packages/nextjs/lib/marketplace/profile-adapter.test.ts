import { describe, expect, it, vi } from "vitest";
import type { AgentProfileResponse } from "@cloak-wallet/sdk";
import { adaptAgentProfileWithRegistry } from "./profile-adapter";

function baseProfile(): AgentProfileResponse {
  return {
    id: "agent_1",
    agent_id: "1",
    name: "Agent 1",
    description: "desc",
    image_url: null,
    agent_type: "staking_steward",
    capabilities: ["stake"],
    endpoints: ["https://agents.cloak.local/stake"],
    pricing: { mode: "per_run", amount: "100", token: "STRK" },
    metadata_uri: null,
    operator_wallet: "0xabc",
    service_wallet: "0xdef",
    trust_score: 40,
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
}

describe("profile adapter", () => {
  it("adapts profile with onchain ownership and registry summaries", async () => {
    const client = {
      ownerOf: vi.fn().mockResolvedValue("0xabc"),
      tokenUri: vi.fn().mockResolvedValue("ipfs://token-uri"),
      getSummary: vi
        .fn()
        .mockResolvedValueOnce(["0x46", "0x1e"])
        .mockResolvedValueOnce(["0x3c", "0x0f"]),
    };
    const adapted = await adaptAgentProfileWithRegistry(baseProfile(), { client });

    expect(adapted.verified).toBe(true);
    expect(adapted.metadata_uri).toBe("ipfs://token-uri");
    expect(adapted.trust_summary?.owner_match).toBe(true);
    expect(adapted.trust_summary?.reputation_score).toBe(70);
    expect(adapted.trust_summary?.validation_score).toBe(60);
    expect(adapted.trust_summary?.freshness_seconds).toBe(30);
    expect(adapted.trust_score).toBe(76);
  });
});
