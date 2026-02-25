// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearAgentProfiles } from "~~/lib/marketplace/agents-store";
import { buildEndpointOwnershipDigest } from "~~/lib/marketplace/endpoint-proof";
import { clearRateLimits } from "~~/lib/marketplace/rate-limit";
import { resetRegistryMetrics } from "~~/lib/marketplace/registry-metrics";

vi.mock("../_lib/auth", () => ({
  authenticate: vi.fn().mockResolvedValue({
    wallet_address: "0xabc123",
    api_key_id: "key_1",
  }),
  AuthError: class AuthError extends Error {},
}));

import { POST as agentsPOST } from "../marketplace/agents/route";
import { GET as discoverGET } from "../marketplace/discover/route";
import { GET as metricsGET } from "../marketplace/metrics/route";

describe("marketplace metrics route", () => {
  it("returns registry counters and freshness snapshot", async () => {
    clearAgentProfiles();
    clearRateLimits();
    resetRegistryMetrics();

    const endpoint = "https://agents.cloak.local/metric_agent";
    const registerReq = new NextRequest("http://localhost/api/v1/marketplace/agents", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "test-key-1234567890",
      },
      body: JSON.stringify({
        agent_id: "metric_agent",
        name: "Metric Agent",
        description: "desc",
        agent_type: "staking_steward",
        capabilities: ["stake"],
        endpoints: [endpoint],
        endpoint_proofs: [
          {
            endpoint,
            nonce: "metric_nonce",
            digest: buildEndpointOwnershipDigest({
              endpoint,
              operatorWallet: "0xabc123",
              nonce: "metric_nonce",
            }),
          },
        ],
        pricing: {
          mode: "per_run",
          amount: "100",
          token: "STRK",
        },
        operator_wallet: "0xabc123",
        service_wallet: "0xcafe1234",
      }),
    });
    const registerRes = await agentsPOST(registerReq);
    expect(registerRes.status).toBe(201);

    const discoverReq = new NextRequest(
      "http://localhost/api/v1/marketplace/discover?capability=stake",
      {
        method: "GET",
        headers: { "X-API-Key": "test-key-1234567890" },
      },
    );
    const discoverRes = await discoverGET(discoverReq);
    expect(discoverRes.status).toBe(200);

    const metricsReq = new NextRequest("http://localhost/api/v1/marketplace/metrics", {
      method: "GET",
      headers: { "X-API-Key": "test-key-1234567890" },
    });
    const metricsRes = await metricsGET(metricsReq);
    expect(metricsRes.status).toBe(200);
    const json = await metricsRes.json();
    expect(json.metrics.profiles_registered).toBeGreaterThan(0);
    expect(json.metrics.discovery_queries).toBeGreaterThan(0);
    expect(json.freshness.totalProfiles).toBe(1);
  });
});

