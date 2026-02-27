// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createHmac } from "crypto";
import { buildChallenge } from "~~/lib/marketplace/x402/challenge";
import {
  createStrictX402Payment,
  ensureX402FacilitatorSecretForTests,
} from "~~/lib/marketplace/x402/test-helpers";

vi.mock("../_lib/auth", () => ({
  authenticate: vi.fn().mockResolvedValue({
    wallet_address: "0xabc123",
    api_key_id: "key_1",
  }),
  AuthError: class AuthError extends Error {},
}));

import { POST as challengePOST } from "../marketplace/payments/x402/challenge/route";
import { POST as verifyPOST } from "../marketplace/payments/x402/verify/route";
import { POST as settlePOST } from "../marketplace/payments/x402/settle/route";
import { POST as runsPOST } from "../marketplace/runs/route";

describe("x402 security / reliability", () => {
  beforeEach(() => {
    ensureX402FacilitatorSecretForTests();
    process.env.X402_VERIFY_ONCHAIN_SETTLEMENT = "false";
  });

  it("rejects expired payment challenges", async () => {
    const built = buildChallenge({
      recipient: "0xabc",
      context: { route: "/api/v1/marketplace/runs" },
    });
    const challenge = {
      ...built,
      expiresAt: new Date(Date.now() - 30_000).toISOString(),
    };
    challenge.signature = createHmac(
      "sha256",
      process.env.X402_FACILITATOR_SECRET || "x402-test-secret",
    )
      .update(
        JSON.stringify({
          version: challenge.version,
          scheme: challenge.scheme,
          challengeId: challenge.challengeId,
          network: challenge.network,
          token: challenge.token,
          minAmount: challenge.minAmount,
          recipient: challenge.recipient,
          contextHash: challenge.contextHash,
          expiresAt: challenge.expiresAt,
          facilitator: challenge.facilitator,
        }),
      )
      .digest("hex");
    const payment = createStrictX402Payment(challenge, {
      tongoAddress: "tongo1payer",
      amount: challenge.minAmount,
      replayKey: "rk_expired_case",
      nonce: "nonce_expired_case",
    });

    const req = new NextRequest("http://localhost/api/v1/marketplace/payments/x402/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challenge, payment }),
    });
    const res = await verifyPOST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.status).toBe("rejected");
    expect(json.reasonCode).toBe("EXPIRED_PAYMENT");
  });

  it("stays idempotent under concurrent settlement attempts", async () => {
    const challenge = buildChallenge({
      recipient: "0xabc",
      context: { route: "/api/v1/marketplace/runs" },
    });
    const payment = createStrictX402Payment(challenge, {
      tongoAddress: "tongo1payer",
      amount: challenge.minAmount,
      replayKey: "rk_parallel_settle_1",
      nonce: "nonce_parallel_settle_1",
    });

    const attempts = await Promise.all(
      Array.from({ length: 6 }).map(async () => {
        const req = new NextRequest(
          "http://localhost/api/v1/marketplace/payments/x402/settle",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ challenge, payment }),
          },
        );
        const res = await settlePOST(req);
        return {
          status: res.status,
          json: await res.json(),
        };
      }),
    );

    expect(attempts.every(item => item.status === 200)).toBe(true);
    expect(attempts.every(item => item.json.status === "settled")).toBe(true);
    expect(new Set(attempts.map(item => item.json.paymentRef)).size).toBe(1);
  }, 30000);

  it("returns 400 for malformed x402 headers on paywalled route", async () => {
    const req = new NextRequest("http://localhost/api/v1/marketplace/runs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "test-key-1234567890",
        "x-x402-challenge": "{not-json}",
        "x-x402-payment": "{not-json}",
      },
      body: JSON.stringify({
        hire_id: "hire_bad_headers",
        agent_id: "staking_steward",
        action: "stake",
        params: { amount: "100" },
      }),
    });
    const res = await runsPOST(req);
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.code).toBe("INVALID_PAYLOAD");
  });

  it("issues unique challenge IDs under burst load", async () => {
    const responses = await Promise.all(
      Array.from({ length: 25 }).map(async (_, i) => {
        const req = new NextRequest(
          "http://localhost/api/v1/marketplace/payments/x402/challenge",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              recipient: "0xabc",
              context: { route: "/api/v1/marketplace/runs", seq: i },
            }),
          },
        );
        const res = await challengePOST(req);
        return {
          status: res.status,
          json: await res.json(),
        };
      }),
    );

    expect(responses.every(item => item.status === 200)).toBe(true);
    const challengeIds = responses.map(item => item.json.challenge.challengeId);
    expect(new Set(challengeIds).size).toBe(challengeIds.length);
  });
});
