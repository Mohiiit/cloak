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
import { GET as discoverGET } from "../marketplace/discover/route";
import { POST as hiresPOST } from "../marketplace/hires/route";
import { POST as runsPOST } from "../marketplace/runs/route";

describe("swap runner listing + x402 integration", () => {
  it("discovers swap runner and executes paid swap", async () => {
    clearAgentProfiles();
    clearHires();
    clearRateLimits();

    const endpoint = "https://agents.cloak.local/swap-runner";
    const registerReq = new NextRequest("http://localhost/api/v1/marketplace/agents", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "test-key-1234567890",
      },
      body: JSON.stringify({
        agent_id: "swap_runner",
        name: "Swap Runner",
        description: "desc",
        agent_type: "swap_runner",
        capabilities: ["swap", "dca_tick"],
        endpoints: [endpoint],
        endpoint_proofs: [
          {
            endpoint,
            nonce: "nonce_swap",
            digest: buildEndpointOwnershipDigest({
              endpoint,
              operatorWallet: "0xabc123",
              nonce: "nonce_swap",
            }),
          },
        ],
        pricing: {
          mode: "per_run",
          amount: "110",
          token: "STRK",
        },
        operator_wallet: "0xabc123",
        service_wallet: "0xcafe1234",
        verified: true,
      }),
    });
    expect((await agentsPOST(registerReq)).status).toBe(201);

    const discoverReq = new NextRequest(
      "http://localhost/api/v1/marketplace/discover?agent_type=swap_runner",
      {
        method: "GET",
        headers: { "X-API-Key": "test-key-1234567890" },
      },
    );
    const discoverRes = await discoverGET(discoverReq);
    expect(discoverRes.status).toBe(200);
    const discovered = await discoverRes.json();
    expect(discovered.agents.length).toBe(1);
    expect(discovered.agents[0].agent_id).toBe("swap_runner");

    const hireReq = new NextRequest("http://localhost/api/v1/marketplace/hires", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "test-key-1234567890",
      },
      body: JSON.stringify({
        agent_id: "swap_runner",
        operator_wallet: "0xabc123",
        policy_snapshot: { maxSlippageBps: 80 },
        billing_mode: "per_run",
      }),
    });
    const hireRes = await hiresPOST(hireReq);
    expect(hireRes.status).toBe(201);
    const hire = await hireRes.json();

    const runBody = {
      hire_id: hire.id,
      action: "swap",
      params: {
        from_token: "STRK",
        to_token: "USDC",
        amount: "100",
      },
      billable: true,
    };
    const firstReq = new NextRequest("http://localhost/api/v1/marketplace/runs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "test-key-1234567890",
      },
      body: JSON.stringify(runBody),
    });
    const firstRes = await runsPOST(firstReq);
    expect(firstRes.status).toBe(402);
    const firstJson = await firstRes.json();
    const challenge = firstJson.challenge;

    const payment = {
      version: "1",
      scheme: "cloak-shielded-x402",
      challengeId: challenge.challengeId,
      tongoAddress: "tongo1payer",
      token: challenge.token,
      amount: challenge.minAmount,
      proof: "proof-swap",
      replayKey: "rk_swap_1",
      contextHash: challenge.contextHash,
      expiresAt: challenge.expiresAt,
      nonce: "nonce_swap_run_1",
      createdAt: new Date().toISOString(),
    };

    const paidReq = new NextRequest("http://localhost/api/v1/marketplace/runs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "test-key-1234567890",
        "x-x402-challenge": JSON.stringify(challenge),
        "x-x402-payment": JSON.stringify(payment),
      },
      body: JSON.stringify(runBody),
    });
    const paidRes = await runsPOST(paidReq);
    expect(paidRes.status).toBe(201);
    const run = await paidRes.json();
    expect(run.status).toBe("completed");
    expect(run.result.protocol).toBe("starkzap-swap");
    expect(run.payment_ref).toBe("pay_rk_swap_1");
  });
});

