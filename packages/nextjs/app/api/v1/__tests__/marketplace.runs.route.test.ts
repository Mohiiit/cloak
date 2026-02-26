// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearHires, createHire } from "~~/lib/marketplace/hires-store";
import { clearIdempotencyStore } from "~~/lib/marketplace/idempotency-store";
import { clearAgentProfiles, upsertAgentProfile } from "~~/lib/marketplace/agents-store";
import { clearRunsStore } from "~~/lib/marketplace/runs-store";
import {
  createX402TongoProofEnvelope,
  createShieldedPaymentPayload,
  encodeX402TongoProofEnvelope,
} from "../../../../../sdk/src/x402";

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
    clearRunsStore();
    clearAgentProfiles();
    clearIdempotencyStore();
    delete process.env.X402_VERIFY_ONCHAIN_SETTLEMENT;
    delete process.env.X402_LEGACY_SETTLEMENT_COMPAT;
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

  it("binds paywall recipient to agent service wallet when profile exists", async () => {
    upsertAgentProfile({
      agent_id: "staking_steward",
      name: "Staking Steward",
      description: "staking",
      agent_type: "staking_steward",
      capabilities: ["stake"],
      endpoints: ["https://example.com/staking"],
      endpoint_proofs: [
        {
          endpoint: "https://example.com/staking",
          nonce: "nonce",
          digest: "a".repeat(64),
        },
      ],
      pricing: {
        mode: "per_run",
        amount: "1",
        token: "STRK",
      },
      operator_wallet: "0xabc123",
      service_wallet: "0xface",
    });

    const req = new NextRequest("http://localhost/api/v1/marketplace/runs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "test-key-1234567890",
      },
      body: JSON.stringify({
        hire_id: "hire_profile_1",
        agent_id: "staking_steward",
        action: "stake",
        params: { pool: "0xpool", amount: "100" },
        billable: true,
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.challenge.recipient).toBe("0xface");
  });

  it("rejects unsupported actions before issuing x402 challenge", async () => {
    const req = new NextRequest("http://localhost/api/v1/marketplace/runs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "test-key-1234567890",
      },
      body: JSON.stringify({
        hire_id: "hire_unsupported_action",
        agent_id: "staking_steward",
        action: "swap",
        params: { from_token: "USDC", to_token: "STRK", amount: "25" },
        billable: true,
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(res.headers.get("x-x402-challenge")).toBeNull();
    const body = await res.json();
    expect(body.error).toContain(
      'Action "swap" is not supported for staking_steward',
    );
  });

  it("creates a run after valid x402 headers are provided", async () => {
    const firstReq = new NextRequest(
      "http://localhost/api/v1/marketplace/runs",
      {
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
      },
    );
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

    const paidReq = new NextRequest(
      "http://localhost/api/v1/marketplace/runs",
      {
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
      },
    );
    const paidRes = await POST(paidReq);
    expect(paidRes.status).toBe(201);
    const run = await paidRes.json();
    expect(run.id).toMatch(/^run_/);
    expect(run.payment_ref).toBe("pay_rk_market_run");
  });

  it("returns pending_payment run when settlement is pending on-chain", async () => {
    process.env.X402_VERIFY_ONCHAIN_SETTLEMENT = "true";
    process.env.X402_LEGACY_SETTLEMENT_COMPAT = "false";

    const firstReq = new NextRequest(
      "http://localhost/api/v1/marketplace/runs",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": "test-key-1234567890",
        },
        body: JSON.stringify({
          hire_id: "hire_pending_1",
          agent_id: "staking_steward",
          action: "stake",
          params: { pool: "0xpool", amount: "100" },
          billable: true,
        }),
      },
    );
    const first = await POST(firstReq);
    const firstBody = await first.json();
    const challenge = firstBody.challenge;
    const replayKey = "rk_market_pending";
    const nonce = "nonce_market_pending";
    const envelope = createX402TongoProofEnvelope({
      challenge,
      tongoAddress: "tongo1payer",
      replayKey,
      nonce,
      settlementTxHash: "0x111122223333444455556666777788889999aaaabbbbccccddddeeeeffff",
      attestor: "test-suite",
    });
    const payment = createShieldedPaymentPayload(challenge, {
      tongoAddress: "tongo1payer",
      proof: encodeX402TongoProofEnvelope(envelope),
      replayKey,
      nonce,
    });

    const paidReq = new NextRequest(
      "http://localhost/api/v1/marketplace/runs",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": "test-key-1234567890",
          "x-x402-challenge": JSON.stringify(challenge),
          "x-x402-payment": JSON.stringify(payment),
        },
        body: JSON.stringify({
          hire_id: "hire_pending_1",
          agent_id: "staking_steward",
          action: "stake",
          params: { pool: "0xpool", amount: "100" },
          billable: true,
        }),
      },
    );

    const paidRes = await POST(paidReq);
    expect(paidRes.status).toBe(202);
    const run = await paidRes.json();
    expect(run.status).toBe("pending_payment");
    expect(run.payment_evidence?.state).toBe("pending_payment");
    expect(run.execution_tx_hashes).toBeNull();
  });

  it("lists created runs", async () => {
    const req = new NextRequest(
      "http://localhost/api/v1/marketplace/runs?limit=1&offset=0",
      {
        method: "GET",
        headers: {
          "X-API-Key": "test-key-1234567890",
        },
      },
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.runs)).toBe(true);
    expect(body.pagination).toBeTruthy();
    expect(body.pagination.limit).toBe(1);
    expect(body.pagination.offset).toBe(0);
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

  it("supports status filtering with pagination", async () => {
    const createBody = (hireId: string, action: string) =>
      JSON.stringify({
        hire_id: hireId,
        agent_id: "staking_steward",
        action,
        params: { pool: "0xpool", amount: "100" },
        billable: false,
      });

    const first = new NextRequest("http://localhost/api/v1/marketplace/runs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "test-key-1234567890",
      },
      body: createBody("hire_filter_1", "stake"),
    });
    const second = new NextRequest("http://localhost/api/v1/marketplace/runs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "test-key-1234567890",
      },
      body: createBody("hire_filter_2", "rebalance"),
    });
    expect((await POST(first)).status).toBe(201);
    expect((await POST(second)).status).toBe(201);

    const listReq = new NextRequest(
      "http://localhost/api/v1/marketplace/runs?status=completed&limit=1&offset=0",
      {
        method: "GET",
        headers: {
          "X-API-Key": "test-key-1234567890",
        },
      },
    );
    const listRes = await GET(listReq);
    expect(listRes.status).toBe(200);
    const listJson = await listRes.json();
    expect(Array.isArray(listJson.runs)).toBe(true);
    expect(listJson.runs.length).toBe(1);
    expect(listJson.pagination.total).toBe(1);
  });

  it("replays run creation when idempotency key is reused with same payload", async () => {
    const body = JSON.stringify({
      hire_id: "hire_idem_1",
      agent_id: "staking_steward",
      action: "stake",
      params: { pool: "0xpool", amount: "100" },
      billable: false,
    });

    const firstReq = new NextRequest(
      "http://localhost/api/v1/marketplace/runs",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": "test-key-1234567890",
          "Idempotency-Key": "idem-run-1",
        },
        body,
      },
    );
    const firstRes = await POST(firstReq);
    expect(firstRes.status).toBe(201);
    const firstRun = await firstRes.json();
    expect(firstRes.headers.get("x-idempotency-key")).toBe("idem-run-1");

    const secondReq = new NextRequest(
      "http://localhost/api/v1/marketplace/runs",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": "test-key-1234567890",
          "Idempotency-Key": "idem-run-1",
        },
        body,
      },
    );
    const secondRes = await POST(secondReq);
    expect(secondRes.status).toBe(201);
    expect(secondRes.headers.get("x-idempotent-replay")).toBe("true");
    const secondRun = await secondRes.json();
    expect(secondRun.id).toBe(firstRun.id);
  });

  it("rejects idempotency key reuse with different run payload", async () => {
    const firstReq = new NextRequest(
      "http://localhost/api/v1/marketplace/runs",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": "test-key-1234567890",
          "Idempotency-Key": "idem-run-2",
        },
        body: JSON.stringify({
          hire_id: "hire_idem_2",
          agent_id: "staking_steward",
          action: "stake",
          params: { amount: "100" },
          billable: false,
        }),
      },
    );
    expect((await POST(firstReq)).status).toBe(201);

    const secondReq = new NextRequest(
      "http://localhost/api/v1/marketplace/runs",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": "test-key-1234567890",
          "Idempotency-Key": "idem-run-2",
        },
        body: JSON.stringify({
          hire_id: "hire_idem_2",
          agent_id: "staking_steward",
          action: "unstake",
          params: { amount: "50" },
          billable: false,
        }),
      },
    );
    const secondRes = await POST(secondReq);
    expect(secondRes.status).toBe(409);
    const secondJson = await secondRes.json();
    expect(secondJson.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });
});
