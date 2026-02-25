// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearAgentProfiles } from "~~/lib/marketplace/agents-store";
import { clearHires } from "~~/lib/marketplace/hires-store";
import { clearRateLimits } from "~~/lib/marketplace/rate-limit";
import { resetRegistryMetrics } from "~~/lib/marketplace/registry-metrics";
import { createMarketplaceClient } from "../../../../../sdk/src/marketplace";
import { createEndpointOwnershipProof } from "../../../../../sdk/src/marketplace-proof";
import {
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

import { GET as agentsGET, POST as agentsPOST } from "../marketplace/agents/route";
import { GET as discoverGET } from "../marketplace/discover/route";
import { POST as hiresPOST, GET as hiresGET } from "../marketplace/hires/route";
import { POST as runsPOST } from "../marketplace/runs/route";

async function routeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input.toString();
  const method = (init?.method || "GET").toUpperCase();
  const pathname = new URL(url).pathname;
  const body =
    typeof init?.body === "string"
      ? init.body
      : init?.body
        ? JSON.stringify(init.body)
        : undefined;

  const req = new NextRequest(url, {
    method,
    headers: new Headers(init?.headers || {}),
    body,
  });

  if (pathname === "/api/v1/marketplace/agents" && method === "POST") return agentsPOST(req);
  if (pathname === "/api/v1/marketplace/agents" && method === "GET") return agentsGET(req);
  if (pathname === "/api/v1/marketplace/discover" && method === "GET") return discoverGET(req);
  if (pathname === "/api/v1/marketplace/hires" && method === "POST") return hiresPOST(req);
  if (pathname === "/api/v1/marketplace/hires" && method === "GET") return hiresGET(req);
  if (pathname === "/api/v1/marketplace/runs" && method === "POST") return runsPOST(req);

  return new Response(JSON.stringify({ error: `Unhandled route ${method} ${pathname}` }), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });
}

describe("combined marketplace funnel", () => {
  it("completes register -> discover -> hire -> paid run", async () => {
    clearAgentProfiles();
    clearHires();
    clearRateLimits();
    resetRegistryMetrics();

    const client = createMarketplaceClient({
      baseUrl: "http://localhost/api/v1",
      apiKey: "test-key-1234567890",
      fetchImpl: routeFetch as unknown as typeof fetch,
    });

    const endpoint = "https://agents.cloak.local/funnel";
    await client.registerAgent({
      agent_id: "funnel_agent",
      name: "Funnel Agent",
      description: "desc",
      agent_type: "staking_steward",
      capabilities: ["stake"],
      endpoints: [endpoint],
      endpoint_proofs: [
        createEndpointOwnershipProof({
          endpoint,
          operatorWallet: "0xabc123",
          nonce: "nonce_funnel",
        }),
      ],
      pricing: {
        mode: "per_run",
        amount: "100",
        token: "STRK",
      },
      operator_wallet: "0xabc123",
      service_wallet: "0xcafe1234",
      verified: true,
      trust_score: 82,
    });

    const discovered = await client.discoverAgents({ capability: "stake" });
    expect(discovered.some((agent) => agent.agent_id === "funnel_agent")).toBe(true);

    const hire = await client.createHire({
      agent_id: "funnel_agent",
      operator_wallet: "0xabc123",
      policy_snapshot: { cap: 500 },
      billing_mode: "per_run",
    });
    expect(hire.status).toBe("active");

    const response = await x402Fetch(
      "http://localhost/api/v1/marketplace/runs",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": "test-key-1234567890",
        },
        body: JSON.stringify({
          hire_id: hire.id,
          action: "stake",
          params: { amount: "100" },
          billable: true,
        }),
      },
      {
        fetchImpl: routeFetch as unknown as typeof fetch,
        createPayload: challenge =>
          createShieldedPaymentPayload(challenge, {
            tongoAddress: "tongo1payer",
            proof: "proof-funnel",
            replayKey: "rk_funnel_1",
            nonce: "nonce_funnel_1",
          }),
      },
    );
    expect(response.status).toBe(201);
    const run = await response.json();
    expect(run.payment_evidence.payment_ref).toBe("pay_rk_funnel_1");
    expect(run.agent_trust_snapshot).toBeTruthy();
  });
});

