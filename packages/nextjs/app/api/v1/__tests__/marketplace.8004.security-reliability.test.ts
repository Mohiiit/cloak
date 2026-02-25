// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearAgentProfiles } from "~~/lib/marketplace/agents-store";
import { clearHires } from "~~/lib/marketplace/hires-store";
import {
  clearRateLimits,
  MARKETPLACE_RATE_LIMITS,
} from "~~/lib/marketplace/rate-limit";
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
import { PATCH as agentPATCH } from "../marketplace/agents/[agentId]/route";
import { POST as hiresPOST } from "../marketplace/hires/route";

describe("marketplace 8004 security/reliability", () => {
  it("rejects invalid endpoint proof digest", async () => {
    clearAgentProfiles();
    clearHires();
    clearRateLimits();

    const endpoint = "https://agents.cloak.local/sec-proof";
    const req = new NextRequest("http://localhost/api/v1/marketplace/agents", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "test-key-1234567890",
      },
      body: JSON.stringify({
        agent_id: "sec_invalid_proof",
        name: "Invalid Proof Agent",
        description: "desc",
        agent_type: "staking_steward",
        capabilities: ["stake"],
        endpoints: [endpoint],
        endpoint_proofs: [
          {
            endpoint,
            nonce: "nonce_bad",
            digest:
              "0000000000000000000000000000000000000000000000000000000000000000",
          },
        ],
        pricing: {
          mode: "per_run",
          amount: "100",
          token: "STRK",
        },
        operator_wallet: "0xabc123",
        service_wallet: "0xcafe1234",
      }),
    });
    const res = await agentsPOST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Invalid endpoint digest");
  });

  it("throttles discovery under aggressive query bursts", async () => {
    clearAgentProfiles();
    clearHires();
    clearRateLimits();

    const endpoint = "https://agents.cloak.local/discovery-burst";
    const registerReq = new NextRequest("http://localhost/api/v1/marketplace/agents", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "test-key-1234567890",
      },
      body: JSON.stringify({
        agent_id: "burst_agent",
        name: "Burst Agent",
        description: "desc",
        agent_type: "staking_steward",
        capabilities: ["stake"],
        endpoints: [endpoint],
        endpoint_proofs: [
          {
            endpoint,
            nonce: "nonce_burst",
            digest: buildEndpointOwnershipDigest({
              endpoint,
              operatorWallet: "0xabc123",
              nonce: "nonce_burst",
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
      }),
    });
    expect((await agentsPOST(registerReq)).status).toBe(201);

    const previousLimit = MARKETPLACE_RATE_LIMITS.discoverRead.limit;
    const previousWindow = MARKETPLACE_RATE_LIMITS.discoverRead.windowMs;
    MARKETPLACE_RATE_LIMITS.discoverRead.limit = 1;
    MARKETPLACE_RATE_LIMITS.discoverRead.windowMs = 60_000;

    try {
      const firstReq = new NextRequest(
        "http://localhost/api/v1/marketplace/discover?capability=stake",
        {
          method: "GET",
          headers: { "X-API-Key": "test-key-1234567890" },
        },
      );
      const secondReq = new NextRequest(
        "http://localhost/api/v1/marketplace/discover?capability=stake",
        {
          method: "GET",
          headers: { "X-API-Key": "test-key-1234567890" },
        },
      );
      expect((await discoverGET(firstReq)).status).toBe(200);
      const second = await discoverGET(secondReq);
      expect(second.status).toBe(429);
      const secondJson = await second.json();
      expect(secondJson.code).toBe("RATE_LIMITED");
    } finally {
      MARKETPLACE_RATE_LIMITS.discoverRead.limit = previousLimit;
      MARKETPLACE_RATE_LIMITS.discoverRead.windowMs = previousWindow;
      clearRateLimits();
    }
  });

  it("prevents hiring paused agents", async () => {
    clearAgentProfiles();
    clearHires();
    clearRateLimits();

    const endpoint = "https://agents.cloak.local/paused-agent";
    const registerReq = new NextRequest("http://localhost/api/v1/marketplace/agents", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "test-key-1234567890",
      },
      body: JSON.stringify({
        agent_id: "paused_agent",
        name: "Paused Agent",
        description: "desc",
        agent_type: "staking_steward",
        capabilities: ["stake"],
        endpoints: [endpoint],
        endpoint_proofs: [
          {
            endpoint,
            nonce: "nonce_paused",
            digest: buildEndpointOwnershipDigest({
              endpoint,
              operatorWallet: "0xabc123",
              nonce: "nonce_paused",
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
      }),
    });
    expect((await agentsPOST(registerReq)).status).toBe(201);

    const pauseReq = new NextRequest(
      "http://localhost/api/v1/marketplace/agents/paused_agent",
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
          params: Promise.resolve({ agentId: "paused_agent" }),
        })
      ).status,
    ).toBe(200);

    const hireReq = new NextRequest("http://localhost/api/v1/marketplace/hires", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "test-key-1234567890",
      },
      body: JSON.stringify({
        agent_id: "paused_agent",
        operator_wallet: "0xabc123",
        policy_snapshot: { cap: 1000 },
        billing_mode: "per_run",
      }),
    });
    const hireRes = await hiresPOST(hireReq);
    expect(hireRes.status).toBe(409);
    const json = await hireRes.json();
    expect(json.code).toBe("AGENT_UNAVAILABLE");
  });
});

