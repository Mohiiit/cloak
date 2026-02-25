// @vitest-environment node

import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../marketplace/payments/x402/verify/route";
import { buildChallenge } from "~~/lib/marketplace/x402/challenge";

describe("POST /api/v1/marketplace/payments/x402/verify", () => {
  it("accepts a valid payment envelope", async () => {
    const challenge = buildChallenge({
      recipient: "0xabc123",
      token: "STRK",
      minAmount: "100",
      context: { runId: "1" },
    });

    const payment = {
      version: "1" as const,
      scheme: "cloak-shielded-x402" as const,
      challengeId: challenge.challengeId,
      tongoAddress: "tongo1test",
      token: "STRK",
      amount: "100",
      proof: "proof-blob",
      replayKey: "rk_1",
      contextHash: challenge.contextHash,
      expiresAt: challenge.expiresAt,
      nonce: "nonce_1",
      createdAt: new Date().toISOString(),
    };

    const req = new NextRequest(
      "http://localhost/api/v1/marketplace/payments/x402/verify",
      {
        method: "POST",
        body: JSON.stringify({ challenge, payment }),
        headers: { "Content-Type": "application/json" },
      },
    );

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("accepted");
    expect(json.paymentRef).toBe("pay_rk_1");
  });

  it("rejects context mismatches", async () => {
    const challenge = buildChallenge({
      recipient: "0xabc123",
      token: "STRK",
      minAmount: "100",
      context: { runId: "1" },
    });
    const payment = {
      version: "1" as const,
      scheme: "cloak-shielded-x402" as const,
      challengeId: challenge.challengeId,
      tongoAddress: "tongo1test",
      token: "STRK",
      amount: "100",
      proof: "proof-blob",
      replayKey: "rk_2",
      contextHash: "bad-context-hash",
      expiresAt: challenge.expiresAt,
      nonce: "nonce_2",
      createdAt: new Date().toISOString(),
    };
    const req = new NextRequest(
      "http://localhost/api/v1/marketplace/payments/x402/verify",
      {
        method: "POST",
        body: JSON.stringify({ challenge, payment }),
        headers: { "Content-Type": "application/json" },
      },
    );
    const res = await POST(req);
    const json = await res.json();
    expect(json.status).toBe("rejected");
    expect(json.reasonCode).toBe("CONTEXT_MISMATCH");
  });
});

