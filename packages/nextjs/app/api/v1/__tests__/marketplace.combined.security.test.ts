// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearAgentProfiles } from "~~/lib/marketplace/agents-store";
import { clearHires } from "~~/lib/marketplace/hires-store";
import { clearRateLimits } from "~~/lib/marketplace/rate-limit";
import { buildEndpointOwnershipDigest } from "~~/lib/marketplace/endpoint-proof";

vi.mock("../_lib/auth", () => ({
  authenticate: vi.fn().mockResolvedValue({
    wallet_address: "0xabc123",
    api_key_id: "key_1",
  }),
  AuthError: class AuthError extends Error {},
}));

import { POST as agentsPOST } from "../marketplace/agents/route";
import { POST as hiresPOST } from "../marketplace/hires/route";
import { PATCH as agentPATCH } from "../marketplace/agents/[agentId]/route";
import { GET as discoverGET } from "../marketplace/discover/route";
import { POST as runsPOST } from "../marketplace/runs/route";

async function registerAgent(agentId: string, status: "active" | "paused" | "retired" = "active") {
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
      agent_type: "staking_steward",
      capabilities: ["stake"],
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
      status,
    }),
  });
  return agentsPOST(req);
}

describe("combined security/data-quality checks", () => {
  it("rejects run requests when provided agent_id mismatches hire", async () => {
    clearAgentProfiles();
    clearHires();
    clearRateLimits();

    expect((await registerAgent("sec_agent_a")).status).toBe(201);
    const hireReq = new NextRequest("http://localhost/api/v1/marketplace/hires", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "test-key-1234567890",
      },
      body: JSON.stringify({
        agent_id: "sec_agent_a",
        operator_wallet: "0xabc123",
        policy_snapshot: { cap: 1000 },
        billing_mode: "per_run",
      }),
    });
    const hireRes = await hiresPOST(hireReq);
    const hire = await hireRes.json();

    const runReq = new NextRequest("http://localhost/api/v1/marketplace/runs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "test-key-1234567890",
      },
      body: JSON.stringify({
        hire_id: hire.id,
        agent_id: "different_agent",
        action: "stake",
        params: { amount: "1" },
        billable: false,
      }),
    });
    const runRes = await runsPOST(runReq);
    expect(runRes.status).toBe(400);
    const runJson = await runRes.json();
    expect(runJson.error).toContain("does not match hire");
  });

  it("keeps discovery quality by excluding paused/retired agents", async () => {
    clearAgentProfiles();
    clearHires();
    clearRateLimits();

    expect((await registerAgent("discover_active")).status).toBe(201);
    expect((await registerAgent("discover_paused")).status).toBe(201);
    expect((await registerAgent("discover_retired", "retired")).status).toBe(201);

    const pauseReq = new NextRequest(
      "http://localhost/api/v1/marketplace/agents/discover_paused",
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": "test-key-1234567890",
        },
        body: JSON.stringify({ status: "paused" }),
      },
    );
    expect(
      (
        await agentPATCH(pauseReq, {
          params: Promise.resolve({ agentId: "discover_paused" }),
        })
      ).status,
    ).toBe(200);

    const discoverReq = new NextRequest(
      "http://localhost/api/v1/marketplace/discover?capability=stake",
      {
        method: "GET",
        headers: { "X-API-Key": "test-key-1234567890" },
      },
    );
    const discoverRes = await discoverGET(discoverReq);
    expect(discoverRes.status).toBe(200);
    const json = await discoverRes.json();
    const ids = json.agents.map((agent: { agent_id: string }) => agent.agent_id);
    expect(ids).toContain("discover_active");
    expect(ids).not.toContain("discover_paused");
    expect(ids).not.toContain("discover_retired");
    expect(new Set(ids).size).toBe(ids.length);
  });
});

