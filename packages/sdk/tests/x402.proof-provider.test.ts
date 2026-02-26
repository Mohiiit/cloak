import { describe, expect, it, vi } from "vitest";
import {
  StaticX402ProofProvider,
  createShieldedPaymentPayloadWithProofProvider,
  x402FetchWithProofProvider,
  type X402Challenge,
} from "../src/x402";

const baseChallenge: X402Challenge = {
  version: "1",
  scheme: "cloak-shielded-x402",
  challengeId: "c_pp_123",
  network: "sepolia",
  token: "STRK",
  minAmount: "100",
  recipient: "0xabc",
  contextHash: "ctxhash",
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  facilitator: "http://localhost:3000/api/v1/marketplace/payments/x402",
};

describe("x402 proof provider", () => {
  it("creates shielded payloads via proof provider", async () => {
    const provider = new StaticX402ProofProvider("proof_blob");
    const payload = await createShieldedPaymentPayloadWithProofProvider(baseChallenge, {
      tongoAddress: "tongo-proof",
      proofProvider: provider,
    });

    expect(payload.proof).toBe("proof_blob");
    expect(payload.challengeId).toBe(baseChallenge.challengeId);
    expect(payload.amount).toBe(baseChallenge.minAmount);
  });

  it("retries 402 requests and auto-builds payload from proof provider", async () => {
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

    const response = await x402FetchWithProofProvider(
      "https://example.com/paid",
      { method: "POST" },
      {
        tongoAddress: "tongo-proof",
        proofProvider: new StaticX402ProofProvider("proof_blob"),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      },
    );

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const retryHeaders = new Headers((fetchImpl.mock.calls[1][1] as RequestInit).headers);
    const paymentHeader = retryHeaders.get("x-x402-payment");
    expect(paymentHeader).toBeTruthy();
    expect(paymentHeader || "").toContain("proof_blob");
  });
});
