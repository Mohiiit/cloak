// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../marketplace/payments/x402/settle/route";
import { buildChallenge } from "~~/lib/marketplace/x402/challenge";
import {
  createStrictX402Payment,
  ensureX402FacilitatorSecretForTests,
} from "~~/lib/marketplace/x402/test-helpers";

describe("POST /api/v1/marketplace/payments/x402/settle", () => {
  beforeEach(() => {
    ensureX402FacilitatorSecretForTests();
    process.env.X402_VERIFY_ONCHAIN_SETTLEMENT = "false";
  });

  it("settles a valid payment", async () => {
    const challenge = buildChallenge({
      recipient: "0xabc123",
      token: "STRK",
      minAmount: "10",
      context: { runId: "1" },
    });
    const payment = createStrictX402Payment(challenge, {
      tongoAddress: "tongo1test",
      amount: "10",
      replayKey: "rk_settle_1",
      nonce: "nonce_settle_1",
    });

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
    const payment = createStrictX402Payment(challenge, {
      tongoAddress: "tongo1test",
      amount: "11",
      replayKey: "rk_settle_idempotent",
      nonce: "nonce_settle_i",
    });

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
    const payment = createStrictX402Payment(challenge, {
      tongoAddress: "tongo1test",
      amount: "10",
      replayKey: "rk_settle_2",
      nonce: "nonce_settle_2",
    });
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
