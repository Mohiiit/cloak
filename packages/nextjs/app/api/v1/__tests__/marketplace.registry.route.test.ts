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

import { GET as agentsGET, POST as agentsPOST } from "../marketplace/agents/route";
import { PATCH as agentPATCH } from "../marketplace/agents/[agentId]/route";
import { GET as hiresGET, POST as hiresPOST } from "../marketplace/hires/route";
import { PATCH as hirePATCH } from "../marketplace/hires/[id]/route";

describe("marketplace registry routes", () => {
  it("registers and lists an agent", async () => {
    clearAgentProfiles();
    clearHires();

    const registerReq = new NextRequest("http://localhost/api/v1/marketplace/agents", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "test-key-1234567890",
      },
      body: JSON.stringify({
        agent_id: "staking_steward_v1",
        name: "Staking Steward",
        description: "Auto-manages staking positions",
        agent_type: "staking_steward",
        capabilities: ["stake", "unstake", "rebalance"],
        endpoints: ["https://agents.cloak.local/staking"],
        endpoint_proofs: [
          {
            endpoint: "https://agents.cloak.local/staking",
            nonce: "nonce_a",
            digest: buildEndpointOwnershipDigest({
              endpoint: "https://agents.cloak.local/staking",
              operatorWallet: "0xabc123",
              nonce: "nonce_a",
            }),
          },
        ],
        pricing: {
          mode: "per_run",
          amount: "1000",
          token: "STRK",
        },
        operator_wallet: "0xabc123",
        service_wallet: "0xbeef1234",
      }),
    });
    const registerRes = await agentsPOST(registerReq);
    expect(registerRes.status).toBe(201);
    const profile = await registerRes.json();
    expect(profile.agent_id).toBe("staking_steward_v1");

    const listReq = new NextRequest("http://localhost/api/v1/marketplace/agents", {
      method: "GET",
      headers: { "X-API-Key": "test-key-1234567890" },
    });
    const listRes = await agentsGET(listReq);
    expect(listRes.status).toBe(200);
    const listJson = await listRes.json();
    expect(listJson.agents).toHaveLength(1);

    const pauseReq = new NextRequest(
      "http://localhost/api/v1/marketplace/agents/staking_steward_v1",
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": "test-key-1234567890",
        },
        body: JSON.stringify({ status: "paused" }),
      },
    );
    const pauseRes = await agentPATCH(pauseReq, {
      params: Promise.resolve({ agentId: "staking_steward_v1" }),
    });
    expect(pauseRes.status).toBe(200);
    const pauseJson = await pauseRes.json();
    expect(pauseJson.status).toBe("paused");
  });

  it("creates and updates hires for active agents", async () => {
    clearAgentProfiles();
    clearHires();

    const registerReq = new NextRequest("http://localhost/api/v1/marketplace/agents", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "test-key-1234567890",
      },
      body: JSON.stringify({
        agent_id: "swap_runner_v1",
        name: "Swap Runner",
        description: "Executes swaps",
        agent_type: "swap_runner",
        capabilities: ["swap"],
        endpoints: ["https://agents.cloak.local/swap"],
        endpoint_proofs: [
          {
            endpoint: "https://agents.cloak.local/swap",
            nonce: "nonce_b",
            digest: buildEndpointOwnershipDigest({
              endpoint: "https://agents.cloak.local/swap",
              operatorWallet: "0xabc123",
              nonce: "nonce_b",
            }),
          },
        ],
        pricing: {
          mode: "per_run",
          amount: "2000",
          token: "STRK",
        },
        operator_wallet: "0xabc123",
        service_wallet: "0xcafe1234",
      }),
    });
    await agentsPOST(registerReq);

    const hireReq = new NextRequest("http://localhost/api/v1/marketplace/hires", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "test-key-1234567890",
      },
      body: JSON.stringify({
        agent_id: "swap_runner_v1",
        operator_wallet: "0xabc123",
        policy_snapshot: { maxSlippageBps: 100 },
        billing_mode: "per_run",
      }),
    });
    const hireRes = await hiresPOST(hireReq);
    expect(hireRes.status).toBe(201);
    const hire = await hireRes.json();
    expect(hire.status).toBe("active");

    const listReq = new NextRequest("http://localhost/api/v1/marketplace/hires", {
      method: "GET",
      headers: { "X-API-Key": "test-key-1234567890" },
    });
    const listRes = await hiresGET(listReq);
    expect(listRes.status).toBe(200);
    const listJson = await listRes.json();
    expect(listJson.hires).toHaveLength(1);

    const patchReq = new NextRequest(`http://localhost/api/v1/marketplace/hires/${hire.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "test-key-1234567890",
      },
      body: JSON.stringify({
        status: "paused",
      }),
    });
    const patchRes = await hirePATCH(patchReq, {
      params: Promise.resolve({ id: hire.id }),
    });
    expect(patchRes.status).toBe(200);
    const patched = await patchRes.json();
    expect(patched.status).toBe("paused");
  });
});
