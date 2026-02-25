// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearAgentProfiles } from "~~/lib/marketplace/agents-store";
import { clearHires } from "~~/lib/marketplace/hires-store";
import { clearRateLimits } from "~~/lib/marketplace/rate-limit";
import { resetRegistryMetrics } from "~~/lib/marketplace/registry-metrics";
import { createMarketplaceClient } from "../../../../../sdk/src/marketplace";
import { createEndpointOwnershipProof } from "../../../../../sdk/src/marketplace-proof";

vi.mock("../_lib/auth", () => ({
  authenticate: vi.fn().mockResolvedValue({
    wallet_address: "0xabc123",
    api_key_id: "key_1",
  }),
  AuthError: class AuthError extends Error {},
}));

import { GET as agentsGET, POST as agentsPOST } from "../marketplace/agents/route";
import { GET as discoverGET } from "../marketplace/discover/route";
import { GET as hiresGET, POST as hiresPOST } from "../marketplace/hires/route";
import { PATCH as hirePATCH } from "../marketplace/hires/[id]/route";

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
  if (pathname.startsWith("/api/v1/marketplace/hires/") && method === "PATCH") {
    const id = pathname.split("/").pop() || "";
    return hirePATCH(req, { params: Promise.resolve({ id }) });
  }
  return new Response(JSON.stringify({ error: `Unhandled route ${method} ${pathname}` }), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });
}

describe("marketplace 8004 e2e via SDK", () => {
  it("executes registry + discovery + hire flow through sdk client", async () => {
    clearAgentProfiles();
    clearHires();
    clearRateLimits();
    resetRegistryMetrics();

    const client = createMarketplaceClient({
      baseUrl: "http://localhost/api/v1",
      apiKey: "test-key-1234567890",
      fetchImpl: routeFetch as unknown as typeof fetch,
    });

    const endpoint = "https://agents.cloak.local/e2e";
    const proof = createEndpointOwnershipProof({
      endpoint,
      operatorWallet: "0xabc123",
      nonce: "nonce_e2e",
    });

    const profile = await client.registerAgent({
      agent_id: "e2e_agent",
      name: "E2E Agent",
      description: "desc",
      agent_type: "staking_steward",
      capabilities: ["stake"],
      endpoints: [endpoint],
      endpoint_proofs: [proof],
      pricing: {
        mode: "per_run",
        amount: "100",
        token: "STRK",
      },
      operator_wallet: "0xabc123",
      service_wallet: "0xcafe1234",
      trust_score: 85,
      verified: true,
    });
    expect(profile.agent_id).toBe("e2e_agent");

    const discovered = await client.discoverAgents({ capability: "stake" });
    expect(discovered.some((agent) => agent.agent_id === "e2e_agent")).toBe(true);

    const hire = await client.createHire({
      agent_id: "e2e_agent",
      operator_wallet: "0xabc123",
      policy_snapshot: { maxNotional: "1000" },
      billing_mode: "per_run",
    });
    expect(hire.status).toBe("active");

    const updated = await client.updateHire(hire.id, { status: "paused" });
    expect(updated.status).toBe("paused");
  });
});

