import { describe, expect, it } from "vitest";
import {
  clearAgentProfiles,
  getAgentProfile,
  listAgentProfiles,
  upsertAgentProfile,
  updateAgentProfile,
} from "./agents-store";

describe("agents store", () => {
  it("upserts and updates profiles", () => {
    clearAgentProfiles();

    const created = upsertAgentProfile({
      agent_id: "agent_store_1",
      name: "Agent Store 1",
      description: "desc",
      agent_type: "staking_steward",
      capabilities: ["stake"],
      endpoints: ["https://agents.cloak.local/store1"],
      endpoint_proofs: [
        {
          endpoint: "https://agents.cloak.local/store1",
          nonce: "nonce_1",
          digest:
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      ],
      pricing: { mode: "per_run", amount: "100", token: "STRK" },
      operator_wallet: "0xabc123",
      service_wallet: "0xdef123",
      trust_score: 77,
      verified: true,
      status: "active",
    });

    expect(created.agent_id).toBe("agent_store_1");
    expect(created.trust_score).toBe(77);

    const updated = updateAgentProfile("agent_store_1", { status: "paused" });
    expect(updated?.status).toBe("paused");

    const fetched = getAgentProfile("agent_store_1");
    expect(fetched?.status).toBe("paused");
    expect(listAgentProfiles()).toHaveLength(1);
  });
});

