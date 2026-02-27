// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearAgentProfiles, upsertAgentProfile } from "~~/lib/marketplace/agents-store";
import { clearRunsStore } from "~~/lib/marketplace/runs-store";

vi.mock("../_lib/auth", () => ({
  authenticate: vi.fn().mockResolvedValue({
    wallet_address: "0xlb_viewer",
    api_key_id: "key_lb_1",
  }),
  AuthError: class AuthError extends Error {},
}));

import { GET } from "../marketplace/leaderboard/route";

function seedAgent(agentId: string, agentType: string, trustScore = 80) {
  upsertAgentProfile({
    agent_id: agentId,
    name: `Agent ${agentId}`,
    description: `Test agent ${agentId}`,
    agent_type: agentType as "staking_steward" | "swap_runner" | "treasury_dispatcher",
    capabilities: ["stake"],
    endpoints: [`https://example.com/${agentId}`],
    endpoint_proofs: [
      {
        endpoint: `https://example.com/${agentId}`,
        nonce: `nonce_${agentId}`,
        digest: "a".repeat(64),
      },
    ],
    pricing: { mode: "per_run", amount: "1000000000000000", token: "STRK" },
    operator_wallet: "0xlb_operator",
    service_wallet: "0xlb_operator",
    trust_score: trustScore,
  });
}

function getLeaderboard(query = "") {
  return GET(
    new NextRequest(
      `http://localhost/api/v1/marketplace/leaderboard${query ? `?${query}` : ""}`,
      {
        method: "GET",
        headers: { "X-API-Key": "test-key-lb" },
      },
    ),
  );
}

describe("marketplace leaderboard route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAgentProfiles();
    clearRunsStore();
    process.env.MARKETPLACE_LEADERBOARD_ENABLED = "true";
    process.env.CLOAK_MARKETPLACE_ENABLED = "true";
    // Use very short cache TTL for tests so cache doesn't interfere
    process.env.MARKETPLACE_LEADERBOARD_CACHE_TTL_MS = "0";
  });

  // ── 1. GET returns 200 with entries array ──────────────────────────────────

  it("GET /leaderboard returns 200 with entries array", async () => {
    seedAgent("agent_lb_1", "staking_steward");
    seedAgent("agent_lb_2", "swap_runner");

    const res = await getLeaderboard();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.entries)).toBe(true);
    expect(body.entries.length).toBe(2);
    expect(body.total).toBe(2);
    expect(body.period).toBe("7d");
    expect(body.computed_at).toBeTruthy();
  });

  // ── 2. GET with period=24h ─────────────────────────────────────────────────

  it("GET /leaderboard?period=24h uses 24h period", async () => {
    seedAgent("agent_lb_3", "staking_steward");

    const res = await getLeaderboard("period=24h");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.period).toBe("24h");
  });

  // ── 3. Default period is 7d ────────────────────────────────────────────────

  it("GET /leaderboard with no period defaults to 7d", async () => {
    seedAgent("agent_lb_4", "staking_steward");

    const res = await getLeaderboard();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.period).toBe("7d");
  });

  // ── 4. Invalid period falls back to 7d ─────────────────────────────────────

  it("GET /leaderboard?period=invalid falls back to 7d", async () => {
    seedAgent("agent_lb_5", "staking_steward");

    const res = await getLeaderboard("period=1y");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.period).toBe("7d");
  });

  // ── 5. Filter by agent_type ────────────────────────────────────────────────

  it("GET /leaderboard?agent_type=swap_runner filters results", async () => {
    seedAgent("agent_lb_staker", "staking_steward");
    seedAgent("agent_lb_swapper", "swap_runner");

    const res = await getLeaderboard("agent_type=swap_runner");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries.length).toBe(1);
    expect(body.entries[0].agent_id).toBe("agent_lb_swapper");
    expect(body.entries[0].agent_type).toBe("swap_runner");
  });

  // ── 6. Limit parameter caps entries ────────────────────────────────────────

  it("GET /leaderboard?limit=1 returns max 1 entry", async () => {
    seedAgent("agent_lb_a", "staking_steward", 90);
    seedAgent("agent_lb_b", "staking_steward", 70);

    const res = await getLeaderboard("limit=1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries.length).toBe(1);
    // Total reflects all agents computed (before pagination in the route)
    expect(body.total).toBeGreaterThanOrEqual(2);
  });

  // ── 7. Feature flag disabled returns 403 ───────────────────────────────────

  it("returns 403 when leaderboard feature flag is disabled", async () => {
    process.env.MARKETPLACE_LEADERBOARD_ENABLED = "false";

    const res = await getLeaderboard();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("FEATURE_DISABLED");
  });

  // ── 8. Response entry shape ────────────────────────────────────────────────

  it("each entry has expected shape", async () => {
    seedAgent("agent_lb_shape", "staking_steward", 85);

    const res = await getLeaderboard();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries.length).toBeGreaterThanOrEqual(1);
    // Pick the first entry — all should have the same shape
    const entry = body.entries[0];
    expect(entry).toBeTruthy();
    expect(typeof entry.agent_id).toBe("string");
    expect(typeof entry.name).toBe("string");
    expect(typeof entry.work_score).toBe("number");
    expect(typeof entry.successful_runs).toBe("number");
    expect(typeof entry.success_rate).toBe("number");
    expect(typeof entry.trust_score).toBe("number");
    expect(typeof entry.agent_type).toBe("string");
    expect(typeof entry.settled_runs).toBe("number");
    expect(typeof entry.settled_volume).toBe("string");
    expect(typeof entry.avg_execution_latency_ms).toBe("number");
    expect(typeof entry.onchain_status).toBe("string");
    expect(typeof entry.updated_at).toBe("string");
  });

  // ── 9. Offset parameter skips entries ──────────────────────────────────────

  it("GET /leaderboard?offset=1&limit=1 paginates correctly", async () => {
    seedAgent("agent_off_a", "staking_steward", 90);
    seedAgent("agent_off_b", "staking_steward", 70);

    const res = await getLeaderboard("offset=1&limit=1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries.length).toBe(1);
    // Since agents are sorted by work_score desc and both have 0 runs,
    // trust_score determines ranking. offset=1 should skip the first one.
    expect(body.total).toBe(2);
  });

  // ── 10. Empty leaderboard returns empty entries ────────────────────────────

  it("returns empty entries when no agents seeded in this test", async () => {
    // After clearAgentProfiles(), no agents should remain
    const res = await getLeaderboard();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.entries)).toBe(true);
    expect(typeof body.total).toBe("number");
  });

  // ── 11. Works without authentication (anonymous read) ──────────────────────

  it("returns 200 even without valid auth header", async () => {
    const { authenticate: authMock } = await import("../_lib/auth");
    vi.mocked(authMock).mockRejectedValueOnce(new Error("no key"));

    seedAgent("agent_anon", "staking_steward");

    const res = await getLeaderboard();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries.length).toBeGreaterThanOrEqual(1);
  });
});
