// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearAgentProfiles } from "~~/lib/marketplace/agents-store";
import { buildEndpointOwnershipDigest } from "~~/lib/marketplace/endpoint-proof";
import {
  clearRateLimits,
  MARKETPLACE_RATE_LIMITS,
} from "~~/lib/marketplace/rate-limit";

vi.mock("../_lib/auth", () => ({
  authenticate: vi.fn().mockResolvedValue({
    wallet_address: "0xabc123",
    api_key_id: "key_1",
  }),
  AuthError: class AuthError extends Error {},
}));

import { POST as agentsPOST } from "../marketplace/agents/route";

describe("marketplace rate limit route guards", () => {
  it("throttles agent registration after hitting write limit", async () => {
    clearAgentProfiles();
    clearRateLimits();

    const previousLimit = MARKETPLACE_RATE_LIMITS.agentsWrite.limit;
    const previousWindowMs = MARKETPLACE_RATE_LIMITS.agentsWrite.windowMs;
    MARKETPLACE_RATE_LIMITS.agentsWrite.limit = 1;
    MARKETPLACE_RATE_LIMITS.agentsWrite.windowMs = 60_000;

    try {
      const register = async (agentId: string) => {
        const endpoint = `https://agents.cloak.local/${agentId}`;
        const req = new NextRequest("http://localhost/api/v1/marketplace/agents", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": "test-key-1234567890",
          },
          body: JSON.stringify({
            agent_id: agentId,
            name: agentId,
            description: "desc",
            agent_type: "staking_steward",
            capabilities: ["stake"],
            endpoints: [endpoint],
            endpoint_proofs: [
              {
                endpoint,
                nonce: `${agentId}_nonce`,
                digest: buildEndpointOwnershipDigest({
                  endpoint,
                  operatorWallet: "0xabc123",
                  nonce: `${agentId}_nonce`,
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
        return agentsPOST(req);
      };

      const first = await register("agent_rl_1");
      expect(first.status).toBe(201);

      const second = await register("agent_rl_2");
      expect(second.status).toBe(429);
      const json = await second.json();
      expect(json.code).toBe("RATE_LIMITED");
    } finally {
      MARKETPLACE_RATE_LIMITS.agentsWrite.limit = previousLimit;
      MARKETPLACE_RATE_LIMITS.agentsWrite.windowMs = previousWindowMs;
      clearRateLimits();
    }
  });
});

