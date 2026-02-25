// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearAgentProfiles } from "~~/lib/marketplace/agents-store";
import { clearHires } from "~~/lib/marketplace/hires-store";
import { buildEndpointOwnershipDigest } from "~~/lib/marketplace/endpoint-proof";
import { clearRateLimits } from "~~/lib/marketplace/rate-limit";
import { resetRegistryMetrics } from "~~/lib/marketplace/registry-metrics";

vi.mock("../_lib/auth", () => ({
  authenticate: vi.fn().mockResolvedValue({
    wallet_address: "0xabc123",
    api_key_id: "key_1",
  }),
  AuthError: class AuthError extends Error {},
}));

import { POST as agentsPOST } from "../marketplace/agents/route";
import { GET as discoverGET } from "../marketplace/discover/route";
import { POST as hiresPOST } from "../marketplace/hires/route";
import { PATCH as hirePATCH } from "../marketplace/hires/[id]/route";
import { GET as metricsGET } from "../marketplace/metrics/route";

describe("marketplace 8004 integration", () => {
  it("completes register -> discover -> hire -> lifecycle update flow", async () => {
    clearAgentProfiles();
    clearHires();
    clearRateLimits();
    resetRegistryMetrics();

    const registerAgent = async (
      agentId: string,
      trustScore: number,
      capabilities: string[],
      agentType: "staking_steward" | "treasury_dispatcher" | "swap_runner",
    ) => {
      const endpoint = `https://agents.cloak.local/${agentId}`;
      const req = new NextRequest("http://localhost/api/v1/marketplace/agents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": "test-key-1234567890",
        },
        body: JSON.stringify({
          agent_id: agentId,
          name: agentId,
          description: "desc",
          agent_type: agentType,
          capabilities,
          endpoints: [endpoint],
          endpoint_proofs: [
            {
              endpoint,
              nonce: `${agentId}_nonce`,
              digest: buildEndpointOwnershipDigest({
                endpoint,
                operatorWallet: "0xabc123",
                nonce: `${agentId}_nonce`,
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
          trust_score: trustScore,
          verified: true,
        }),
      });
      const res = await agentsPOST(req);
      expect(res.status).toBe(201);
    };

    await registerAgent("staking_integrated", 88, ["stake", "rebalance"], "staking_steward");
    await registerAgent("swap_integrated", 92, ["swap"], "swap_runner");

    const discoverReq = new NextRequest(
      "http://localhost/api/v1/marketplace/discover?capability=swap&limit=5",
      {
        method: "GET",
        headers: { "X-API-Key": "test-key-1234567890" },
      },
    );
    const discoverRes = await discoverGET(discoverReq);
    expect(discoverRes.status).toBe(200);
    const discovered = await discoverRes.json();
    expect(discovered.agents).toHaveLength(1);
    expect(discovered.agents[0].agent_id).toBe("swap_integrated");

    const hireReq = new NextRequest("http://localhost/api/v1/marketplace/hires", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "test-key-1234567890",
      },
      body: JSON.stringify({
        agent_id: "swap_integrated",
        operator_wallet: "0xabc123",
        policy_snapshot: { maxSlippageBps: 50 },
        billing_mode: "per_run",
      }),
    });
    const hireRes = await hiresPOST(hireReq);
    expect(hireRes.status).toBe(201);
    const hire = await hireRes.json();

    const patchReq = new NextRequest(
      `http://localhost/api/v1/marketplace/hires/${hire.id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": "test-key-1234567890",
        },
        body: JSON.stringify({ status: "paused" }),
      },
    );
    const patchRes = await hirePATCH(patchReq, {
      params: Promise.resolve({ id: hire.id }),
    });
    expect(patchRes.status).toBe(200);
    const patched = await patchRes.json();
    expect(patched.status).toBe("paused");

    const metricsReq = new NextRequest("http://localhost/api/v1/marketplace/metrics", {
      method: "GET",
      headers: { "X-API-Key": "test-key-1234567890" },
    });
    const metricsRes = await metricsGET(metricsReq);
    expect(metricsRes.status).toBe(200);
    const metrics = await metricsRes.json();
    expect(metrics.metrics.profiles_registered).toBe(2);
    expect(metrics.metrics.discovery_queries).toBe(1);
  });
});

