// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  createX402TongoProofEnvelope,
  encodeX402TongoProofEnvelope,
  createShieldedPaymentPayload,
  x402Fetch,
} from "../../../../../sdk/src/x402";

vi.mock("../_lib/auth", () => ({
  authenticate: vi.fn().mockResolvedValue({
    wallet_address: "0xabc123",
    api_key_id: "key_1",
  }),
  AuthError: class AuthError extends Error {},
}));

import { POST as runsPOST } from "../marketplace/runs/route";

async function routeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input.toString();
  const method = init?.method || "GET";
  const path = new URL(url).pathname;
  const body =
    typeof init?.body === "string"
      ? init.body
      : init?.body
        ? JSON.stringify(init.body)
        : undefined;

  if (path === "/api/v1/marketplace/runs" && method === "POST") {
    const req = new NextRequest(url, {
      method,
      headers: new Headers(init?.headers || {}),
      body,
    });
    return runsPOST(req);
  }

  return new Response(JSON.stringify({ error: `Unhandled route: ${method} ${path}` }), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });
}

describe("x402 e2e", () => {
  it("creates a billable run via SDK x402 retry flow", async () => {
    const runBody = {
      hire_id: "hire_e2e_1",
      agent_id: "staking_steward",
      action: "stake",
      params: { pool: "0xpool", amount: "250" },
      billable: true,
    };

    const response = await x402Fetch(
      "http://localhost/api/v1/marketplace/runs",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": "test-key-1234567890",
        },
        body: JSON.stringify(runBody),
      },
      {
        fetchImpl: routeFetch as unknown as typeof fetch,
        createPayload: challenge => {
          const replayKey = "rk_e2e_1";
          const nonce = "nonce_e2e_1";
          const proofEnvelope = createX402TongoProofEnvelope({
            challenge,
            tongoAddress: "tongo1payer",
            replayKey,
            nonce,
            settlementTxHash: "0x1234",
            attestor: "test-suite",
          });
          return createShieldedPaymentPayload(challenge, {
            tongoAddress: "tongo1payer",
            proof: encodeX402TongoProofEnvelope(proofEnvelope),
            replayKey,
            nonce,
          });
        },
      },
    );

    expect(response.status).toBe(201);
    const json = (await response.json()) as { payment_ref: string | null };
    expect(json.payment_ref).toBe("pay_rk_e2e_1");
  });
});
