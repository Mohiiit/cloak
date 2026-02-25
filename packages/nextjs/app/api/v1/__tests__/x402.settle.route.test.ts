// @vitest-environment node

import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../marketplace/payments/x402/settle/route";
import { buildChallenge } from "~~/lib/marketplace/x402/challenge";

describe("POST /api/v1/marketplace/payments/x402/settle", () => {
  it("settles a valid payment", async () => {
    const challenge = buildChallenge({
      recipient: "0xabc123",
      token: "STRK",
      minAmount: "10",
      context: { runId: "1" },
    });
    const payment = {
      version: "1" as const,
      scheme: "cloak-shielded-x402" as const,
      challengeId: challenge.challengeId,
      tongoAddress: "tongo1test",
      token: "STRK",
      amount: "10",
      proof: "proof-blob",
      replayKey: "rk_settle_1",
      contextHash: challenge.contextHash,
      expiresAt: challenge.expiresAt,
      nonce: "nonce_settle_1",
      createdAt: new Date().toISOString(),
    };

    const req = new NextRequest(
      "http://localhost/api/v1/marketplace/payments/x402/settle",
      {
        method: "POST",
        body: JSON.stringify({ challenge, payment }),
        headers: { "Content-Type": "application/json" },
      },
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("settled");
    expect(json.paymentRef).toBe("pay_rk_settle_1");
    expect(json.txHash).toMatch(/^0x/);
  });

  it("is idempotent for repeated settle on same replay key", async () => {
    const challenge = buildChallenge({
      recipient: "0xabc123",
      token: "STRK",
      minAmount: "11",
      context: { runId: "2" },
    });
    const payment = {
      version: "1" as const,
      scheme: "cloak-shielded-x402" as const,
      challengeId: challenge.challengeId,
      tongoAddress: "tongo1test",
      token: "STRK",
      amount: "11",
      proof: "proof-blob",
      replayKey: "rk_settle_idempotent",
      contextHash: challenge.contextHash,
      expiresAt: challenge.expiresAt,
      nonce: "nonce_settle_i",
      createdAt: new Date().toISOString(),
    };

    const req1 = new NextRequest(
      "http://localhost/api/v1/marketplace/payments/x402/settle",
      {
        method: "POST",
        body: JSON.stringify({ challenge, payment }),
        headers: { "Content-Type": "application/json" },
      },
    );
    const req2 = new NextRequest(
      "http://localhost/api/v1/marketplace/payments/x402/settle",
      {
        method: "POST",
        body: JSON.stringify({ challenge, payment }),
        headers: { "Content-Type": "application/json" },
      },
    );

    const first = await POST(req1);
    const second = await POST(req2);
    const firstJson = await first.json();
    const secondJson = await second.json();
    expect(firstJson.status).toBe("settled");
    expect(secondJson.status).toBe("settled");
    expect(secondJson.txHash).toBe(firstJson.txHash);
  });

  it("returns rejected status for invalid challenge signature", async () => {
    const challenge = buildChallenge({
      recipient: "0xabc123",
      token: "STRK",
      minAmount: "10",
      context: { runId: "1" },
    });
    const tamperedChallenge = { ...challenge, signature: "bad-signature" };
    const payment = {
      version: "1" as const,
      scheme: "cloak-shielded-x402" as const,
      challengeId: challenge.challengeId,
      tongoAddress: "tongo1test",
      token: "STRK",
      amount: "10",
      proof: "proof-blob",
      replayKey: "rk_settle_2",
      contextHash: challenge.contextHash,
      expiresAt: challenge.expiresAt,
      nonce: "nonce_settle_2",
      createdAt: new Date().toISOString(),
    };
    const req = new NextRequest(
      "http://localhost/api/v1/marketplace/payments/x402/settle",
      {
        method: "POST",
        body: JSON.stringify({ challenge: tamperedChallenge, payment }),
        headers: { "Content-Type": "application/json" },
      },
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("rejected");
    expect(json.reasonCode).toBe("INVALID_PAYLOAD");
  });
});
