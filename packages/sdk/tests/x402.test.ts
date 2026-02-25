import { describe, expect, it, vi } from "vitest";
import {
  createContextHash,
  parseX402Challenge,
  createShieldedPaymentPayload,
  decodeX402PaymentHeader,
  extractX402PaymentPayload,
  x402Fetch,
  payWithX402,
  createShieldedFacilitatorClient,
  type X402Challenge,
} from "../src/x402";

const baseChallenge: X402Challenge = {
  version: "1",
  scheme: "cloak-shielded-x402",
  challengeId: "c_123",
  network: "sepolia",
  token: "STRK",
  minAmount: "100",
  recipient: "0xabc",
  contextHash: "ctxhash",
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  facilitator: "http://localhost:3000/api/v1/marketplace/payments/x402",
};

describe("x402 helpers", () => {
  it("builds deterministic context hashes", () => {
    const a = createContextHash({ b: 2, a: 1 });
    const b = createContextHash({ a: 1, b: 2 });
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it("parses challenge from headers", () => {
    const headers = new Headers({
      "x-x402-challenge": JSON.stringify(baseChallenge),
    });
    const parsed = parseX402Challenge(headers);
    expect(parsed.challengeId).toBe("c_123");
  });

  it("creates and decodes shielded payment payload", () => {
    const payload = createShieldedPaymentPayload(baseChallenge, {
      tongoAddress: "tongo-addr",
      proof: "proof-blob",
    });
    const decoded = decodeX402PaymentHeader(JSON.stringify(payload));
    expect(decoded.challengeId).toBe(baseChallenge.challengeId);
    expect(decoded.token).toBe("STRK");
    expect(decoded.amount).toBe("100");
  });

  it("extracts payment payload from request headers", () => {
    const payload = createShieldedPaymentPayload(baseChallenge, {
      tongoAddress: "tongo-addr",
      proof: "proof-blob",
    });
    const headers = new Headers({
      "x-x402-payment": JSON.stringify(payload),
    });
    const extracted = extractX402PaymentPayload(headers);
    expect(extracted?.challengeId).toBe(baseChallenge.challengeId);
  });

  it("retries request when first response is 402", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("Payment required", {
          status: 402,
          headers: {
            "x-x402-challenge": JSON.stringify(baseChallenge),
          },
        }),
      )
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const response = await x402Fetch(
      "https://example.com/run",
      { method: "POST" },
      {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        createPayload: challenge =>
          createShieldedPaymentPayload(challenge, {
            tongoAddress: "payer",
            proof: "proof-blob",
          }),
      },
    );

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const retryInit = fetchImpl.mock.calls[1][1] as RequestInit;
    const headers = new Headers(retryInit.headers);
    expect(headers.get("x-x402-challenge")).toBe(JSON.stringify(baseChallenge));
    expect(headers.get("x-x402-payment")).toBeTruthy();
  });

  it("sends payment payload in one shot with payWithX402", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    const payload = createShieldedPaymentPayload(baseChallenge, {
      tongoAddress: "payer",
      proof: "proof-blob",
    });
    const res = await payWithX402(
      "https://example.com/run",
      { method: "POST" },
      payload,
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(res.status).toBe(200);
    const headers = new Headers((fetchImpl.mock.calls[0][1] as RequestInit).headers);
    expect(headers.get("x-x402-payment")).toBeTruthy();
  });

  it("calls facilitator challenge/verify/settle APIs", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ challenge: baseChallenge }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "accepted",
            retryable: false,
            paymentRef: "pay_ref",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "settled",
            paymentRef: "pay_ref",
            txHash: "0xabc",
          }),
          { status: 200 },
        ),
      );

    const client = createShieldedFacilitatorClient({
      baseUrl: "https://facilitator.example.com",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const challenge = await client.challenge({
      recipient: "0xabc",
      token: "STRK",
      minAmount: "100",
    });
    const payload = createShieldedPaymentPayload(challenge, {
      tongoAddress: "tongo-addr",
      proof: "proof-blob",
      replayKey: "rk_x",
      nonce: "nonce_x",
    });
    const verify = await client.verify({ challenge, payment: payload });
    const settle = await client.settle({ challenge, payment: payload });

    expect(verify.status).toBe("accepted");
    expect(settle.status).toBe("settled");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
