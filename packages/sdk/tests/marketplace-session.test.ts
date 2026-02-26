import { describe, expect, it, vi } from "vitest";
import { CloakApiClient } from "../src/api-client";
import {
  createMarketplaceSession,
  createMarketplaceSessionFromApiClient,
} from "../src/marketplace-session";

describe("marketplace session", () => {
  it("builds marketplace and x402 clients from shared config", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ runs: [] }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            challenge: {
              version: "1",
              scheme: "cloak-shielded-x402",
              challengeId: "c_1",
              network: "sepolia",
              token: "STRK",
              minAmount: "100",
              recipient: "0xabc",
              contextHash: "ctx_hash_1",
              expiresAt: new Date(Date.now() + 60000).toISOString(),
              facilitator:
                "https://cloak-backend-vert.vercel.app/api/v1/marketplace/payments/x402",
            },
          }),
          { status: 200 },
        ),
      );

    const session = createMarketplaceSession({
      baseUrl: "https://cloak-backend-vert.vercel.app",
      apiKey: "test-key",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await session.marketplace.listRuns();
    await session.x402.challenge({ recipient: "0xabc" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://cloak-backend-vert.vercel.app/api/v1/marketplace/runs",
    );
    const runsHeaders = new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers);
    expect(runsHeaders.get("X-API-Key")).toBe("test-key");

    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://cloak-backend-vert.vercel.app/api/v1/marketplace/payments/x402/challenge",
    );
  });

  it("can bootstrap from existing CloakApiClient instance", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ agents: [] }), { status: 200 }),
    );
    const apiClient = new CloakApiClient(
      "https://cloak-backend-vert.vercel.app",
      "test-key-2",
    );

    const session = createMarketplaceSessionFromApiClient(apiClient, {
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await session.marketplace.listAgents();
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://cloak-backend-vert.vercel.app/api/v1/marketplace/agents",
    );
  });
});
