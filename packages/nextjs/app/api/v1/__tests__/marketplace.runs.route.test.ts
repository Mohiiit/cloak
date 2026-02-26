// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearHires, createHire } from "~~/lib/marketplace/hires-store";

vi.mock("../_lib/auth", () => ({
  authenticate: vi.fn().mockResolvedValue({
    wallet_address: "0xabc123",
    api_key_id: "key_1",
  }),
  AuthError: class AuthError extends Error {},
}));

import { GET, POST } from "../marketplace/runs/route";

describe("marketplace runs route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearHires();
  });

  it("returns 402 challenge when billable payment headers are absent", async () => {
    const req = new NextRequest("http://localhost/api/v1/marketplace/runs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "test-key-1234567890",
      },
      body: JSON.stringify({
        hire_id: "hire_1",
        agent_id: "staking_steward",
        action: "stake",
        params: { pool: "0xpool", amount: "100" },
        billable: true,
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.challenge).toBeTruthy();
    expect(res.headers.get("x-x402-challenge")).toBeTruthy();
  });

  it("creates a run after valid x402 headers are provided", async () => {
    const firstReq = new NextRequest("http://localhost/api/v1/marketplace/runs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "test-key-1234567890",
      },
      body: JSON.stringify({
        hire_id: "hire_2",
        agent_id: "staking_steward",
        action: "stake",
        params: { pool: "0xpool", amount: "100" },
        billable: true,
      }),
    });
    const first = await POST(firstReq);
    const firstBody = await first.json();
    const challenge = firstBody.challenge;
    const payment = {
      version: "1",
      scheme: "cloak-shielded-x402",
      challengeId: challenge.challengeId,
      tongoAddress: "tongo1payer",
      token: challenge.token,
      amount: challenge.minAmount,
      proof: "proof-blob",
      replayKey: "rk_market_run",
      contextHash: challenge.contextHash,
      expiresAt: challenge.expiresAt,
      nonce: "nonce_market_run",
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
      body: JSON.stringify({
        hire_id: "hire_2",
        agent_id: "staking_steward",
        action: "stake",
        params: { pool: "0xpool", amount: "100" },
        billable: true,
      }),
    });
    const paidRes = await POST(paidReq);
    expect(paidRes.status).toBe(201);
    const run = await paidRes.json();
    expect(run.id).toMatch(/^run_/);
    expect(run.payment_ref).toBe("pay_rk_market_run");
  });

  it("lists created runs", async () => {
    const req = new NextRequest("http://localhost/api/v1/marketplace/runs", {
      method: "GET",
      headers: {
        "X-API-Key": "test-key-1234567890",
      },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.runs)).toBe(true);
  });

  it("blocks run creation when authenticated operator does not own the hire", async () => {
    const hire = createHire({
      agent_id: "staking_steward",
      operator_wallet: "0xdeadbeef",
      policy_snapshot: {},
      billing_mode: "per_run",
    });

    const req = new NextRequest("http://localhost/api/v1/marketplace/runs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "test-key-1234567890",
      },
      body: JSON.stringify({
        hire_id: hire.id,
        action: "stake",
        params: { pool: "0xpool", amount: "100" },
        billable: false,
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/Only operator can create runs/);
  });
});
