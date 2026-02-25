// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../_lib/auth", () => ({
  authenticate: vi.fn().mockResolvedValue({
    wallet_address: "0xabc123",
    api_key_id: "key_1",
  }),
  AuthError: class AuthError extends Error {},
}));

import { POST as runsPOST } from "../marketplace/runs/route";
import { POST as settlePOST } from "../marketplace/payments/x402/settle/route";

describe("x402 integration", () => {
  it("completes a challenge -> paid run -> idempotent settle flow", async () => {
    const runBody = {
      hire_id: "hire_int_1",
      agent_id: "staking_steward",
      action: "stake",
      params: { pool: "0xpool", amount: "100" },
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
      proof: "proof-blob",
      replayKey: "rk_integration_1",
      contextHash: challenge.contextHash,
      expiresAt: challenge.expiresAt,
      nonce: "nonce_integration_1",
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
    expect(run.payment_ref).toBe("pay_rk_integration_1");

    const settleReq = new NextRequest(
      "http://localhost/api/v1/marketplace/payments/x402/settle",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ challenge, payment }),
      },
    );
    const settleRes = await settlePOST(settleReq);
    expect(settleRes.status).toBe(200);
    const settleJson = await settleRes.json();
    expect(settleJson.status).toBe("settled");
    expect(settleJson.paymentRef).toBe("pay_rk_integration_1");
  });
});

