import { describe, expect, it, vi } from "vitest";
import { createMarketplaceClient } from "../src/marketplace";

describe("marketplace sdk client", () => {
  it("registers agent profiles via marketplace API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "agent_a",
          agent_id: "agent_a",
          name: "Agent A",
          description: "desc",
          image_url: null,
          agent_type: "staking_steward",
          capabilities: ["stake"],
          endpoints: ["https://agents.cloak.local/a"],
          pricing: { mode: "per_run", amount: "100", token: "STRK" },
          metadata_uri: null,
          operator_wallet: "0xabc",
          service_wallet: "0xdef",
          trust_score: 80,
          verified: true,
          created_at: new Date().toISOString(),
          updated_at: null,
        }),
        { status: 201 },
      ),
    );

    const client = createMarketplaceClient({
      baseUrl: "http://localhost/api/v1",
      apiKey: "test-key-123",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const res = await client.registerAgent({
      agent_id: "agent_a",
      name: "Agent A",
      description: "desc",
      agent_type: "staking_steward",
      capabilities: ["stake"],
      endpoints: ["https://agents.cloak.local/a"],
      endpoint_proofs: [
        {
          endpoint: "https://agents.cloak.local/a",
          nonce: "nonce_a",
          digest:
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      ],
      pricing: {
        mode: "per_run",
        amount: "100",
        token: "STRK",
      },
      operator_wallet: "0xabc",
      service_wallet: "0xdef",
    });

    expect(res.agent_id).toBe("agent_a");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost/api/v1/marketplace/agents");
  });

  it("discovers agents and manages hires", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            agents: [
              {
                id: "agent_a",
                agent_id: "agent_a",
                name: "Agent A",
                description: "desc",
                image_url: null,
                agent_type: "staking_steward",
                capabilities: ["stake"],
                endpoints: ["https://agents.cloak.local/a"],
                pricing: { mode: "per_run", amount: "100", token: "STRK" },
                metadata_uri: null,
                operator_wallet: "0xabc",
                service_wallet: "0xdef",
                trust_score: 90,
                verified: true,
                discovery_score: 102,
                created_at: new Date().toISOString(),
                updated_at: null,
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "hire_1",
            agent_id: "agent_a",
            operator_wallet: "0xabc",
            policy_snapshot: {},
            billing_mode: "per_run",
            status: "active",
            created_at: new Date().toISOString(),
            updated_at: null,
          }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            runs: [
              {
                id: "run_1",
                hire_id: "hire_1",
                agent_id: "agent_a",
                action: "stake",
                params: {},
                billable: true,
                status: "queued",
                payment_ref: null,
                settlement_tx_hash: null,
                execution_tx_hashes: null,
                result: null,
                created_at: new Date().toISOString(),
                updated_at: null,
              },
            ],
          }),
          { status: 200 },
        ),
      );

    const client = createMarketplaceClient({
      baseUrl: "http://localhost/api/v1",
      apiKey: "test-key-123",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const discovered = await client.discoverAgents({ capability: "stake" });
    expect(discovered).toHaveLength(1);
    expect(discovered[0].agent_id).toBe("agent_a");

    const hire = await client.createHire({
      agent_id: "agent_a",
      operator_wallet: "0xabc",
      policy_snapshot: {},
      billing_mode: "per_run",
    });
    expect(hire.id).toBe("hire_1");

    const runs = await client.listRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0].id).toBe("run_1");

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

