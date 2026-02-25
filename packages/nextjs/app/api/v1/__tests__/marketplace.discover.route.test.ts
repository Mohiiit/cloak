// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearAgentProfiles } from "~~/lib/marketplace/agents-store";
import { clearHires } from "~~/lib/marketplace/hires-store";
import { buildEndpointOwnershipDigest } from "~~/lib/marketplace/endpoint-proof";

vi.mock("../_lib/auth", () => ({
  authenticate: vi.fn().mockResolvedValue({
    wallet_address: "0xabc123",
    api_key_id: "key_1",
  }),
  AuthError: class AuthError extends Error {},
}));

import { POST as agentsPOST } from "../marketplace/agents/route";
import { GET as discoverGET } from "../marketplace/discover/route";

describe("marketplace discover route", () => {
  it("returns ranked discovery results", async () => {
    clearAgentProfiles();
    clearHires();

    const agents = [
      {
        agent_id: "staking_high",
        trust_score: 90,
        verified: true,
        capabilities: ["stake"],
      },
      {
        agent_id: "staking_mid",
        trust_score: 60,
        verified: false,
        capabilities: ["stake"],
      },
      {
        agent_id: "swap_best",
        trust_score: 95,
        verified: true,
        capabilities: ["swap"],
      },
    ];

    for (const agent of agents) {
      const endpoint = `https://agents.cloak.local/${agent.agent_id}`;
      const registerReq = new NextRequest("http://localhost/api/v1/marketplace/agents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": "test-key-1234567890",
        },
        body: JSON.stringify({
          agent_id: agent.agent_id,
          name: agent.agent_id,
          description: "Test agent",
          agent_type: agent.agent_id.includes("swap") ? "swap_runner" : "staking_steward",
          capabilities: agent.capabilities,
          endpoints: [endpoint],
          endpoint_proofs: [
            {
              endpoint,
              nonce: `${agent.agent_id}_nonce`,
              digest: buildEndpointOwnershipDigest({
                endpoint,
                operatorWallet: "0xabc123",
                nonce: `${agent.agent_id}_nonce`,
              }),
            },
          ],
          pricing: {
            mode: "per_run",
            amount: "100",
            token: "STRK",
          },
          operator_wallet: "0xabc123",
          service_wallet: "0xcafe1234",
          trust_score: agent.trust_score,
          verified: agent.verified,
        }),
      });
      const res = await agentsPOST(registerReq);
      expect(res.status).toBe(201);
    }

    const req = new NextRequest(
      "http://localhost/api/v1/marketplace/discover?capability=stake&limit=10",
      {
        method: "GET",
        headers: { "X-API-Key": "test-key-1234567890" },
      },
    );

    const res = await discoverGET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.agents).toHaveLength(2);
    expect(json.agents[0].agent_id).toBe("staking_high");
    expect(json.agents[1].agent_id).toBe("staking_mid");
    expect(typeof json.agents[0].discovery_score).toBe("number");
  });
});

