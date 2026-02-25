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
import { POST as runsPOST } from "../marketplace/runs/route";

describe("marketplace cross-link profile + payment evidence", () => {
  it("attaches trust snapshot and x402 evidence to runs", async () => {
    clearAgentProfiles();
    clearHires();
    clearRateLimits();

    const endpoint = "https://agents.cloak.local/crosslink";
    const registerReq = new NextRequest("http://localhost/api/v1/marketplace/agents", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "test-key-1234567890",
      },
      body: JSON.stringify({
        agent_id: "crosslink_agent",
        name: "Crosslink Agent",
        description: "desc",
        agent_type: "staking_steward",
        capabilities: ["stake"],
        endpoints: [endpoint],
        endpoint_proofs: [
          {
            endpoint,
            nonce: "nonce_crosslink",
            digest: buildEndpointOwnershipDigest({
              endpoint,
              operatorWallet: "0xabc123",
              nonce: "nonce_crosslink",
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
        verified: true,
      }),
    });
    expect((await agentsPOST(registerReq)).status).toBe(201);

    const hireReq = new NextRequest("http://localhost/api/v1/marketplace/hires", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "test-key-1234567890",
      },
      body: JSON.stringify({
        agent_id: "crosslink_agent",
        operator_wallet: "0xabc123",
        policy_snapshot: { cap: 1000 },
        billing_mode: "per_run",
      }),
    });
    const hireRes = await hiresPOST(hireReq);
    expect(hireRes.status).toBe(201);
    const hire = await hireRes.json();

    const runBody = {
      hire_id: hire.id,
      action: "stake",
      params: { amount: "100" },
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
      proof: "proof-crosslink",
      replayKey: "rk_crosslink_1",
      contextHash: challenge.contextHash,
      expiresAt: challenge.expiresAt,
      nonce: "nonce_crosslink_1",
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
    expect(run.hire_operator_wallet).toBe("0xabc123");
    expect(run.agent_trust_snapshot).toBeTruthy();
    expect(run.payment_evidence.scheme).toBe("cloak-shielded-x402");
    expect(run.payment_evidence.payment_ref).toBe("pay_rk_crosslink_1");
  });
});

