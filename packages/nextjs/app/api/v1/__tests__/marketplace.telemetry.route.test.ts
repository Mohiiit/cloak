// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearAgentProfiles, upsertAgentProfile } from "~~/lib/marketplace/agents-store";
import { clearHires } from "~~/lib/marketplace/hires-store";
import { clearRateLimits } from "~~/lib/marketplace/rate-limit";

vi.mock("../_lib/auth", () => ({
  authenticate: vi.fn().mockResolvedValue({
    wallet_address: "0xabc123",
    api_key_id: "key_1",
  }),
  AuthError: class AuthError extends Error {},
}));

import { GET as discoverGET } from "../marketplace/discover/route";
import { POST as hiresPOST } from "../marketplace/hires/route";
import { POST as runsPOST } from "../marketplace/runs/route";

function seedAgent() {
  upsertAgentProfile({
    agent_id: "telemetry_steward",
    name: "Telemetry Steward",
    description: "Test agent for funnel telemetry",
    agent_type: "staking_steward",
    capabilities: ["stake", "x402_shielded"],
    endpoints: ["https://agents.cloak.local/telemetry"],
    endpoint_proofs: [
      {
        endpoint: "https://agents.cloak.local/telemetry",
        operator_wallet: "0xabc123",
        nonce: "nonce_telemetry",
        signature: "proof_telemetry",
        created_at: new Date().toISOString(),
      },
    ],
    pricing: {
      mode: "per_run",
      amount: "5",
      token: "STRK",
    },
    operator_wallet: "0xabc123",
    service_wallet: "0xcafe1234",
    verified: true,
    trust_score: 88,
  });
}

describe("marketplace telemetry funnel events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAgentProfiles();
    clearHires();
    clearRateLimits();
    seedAgent();
  });

  it("emits discover, hire, and run funnel telemetry events", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const discoverReq = new NextRequest(
      "http://localhost/api/v1/marketplace/discover?capability=stake&limit=10&offset=0",
      {
        method: "GET",
        headers: {
          "X-API-Key": "test-key-1234567890",
        },
      },
    );
    const discoverRes = await discoverGET(discoverReq);
    expect(discoverRes.status).toBe(200);
    expect(discoverRes.headers.get("x-agentic-trace-id")).toBeTruthy();

    const hireReq = new NextRequest("http://localhost/api/v1/marketplace/hires", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "test-key-1234567890",
      },
      body: JSON.stringify({
        agent_id: "telemetry_steward",
        operator_wallet: "0xabc123",
        policy_snapshot: { cap: 100 },
        billing_mode: "per_run",
      }),
    });
    const hireRes = await hiresPOST(hireReq);
    expect(hireRes.status).toBe(201);
    expect(hireRes.headers.get("x-agentic-trace-id")).toBeTruthy();
    const hireJson = await hireRes.json();

    const runReq = new NextRequest("http://localhost/api/v1/marketplace/runs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "test-key-1234567890",
      },
      body: JSON.stringify({
        hire_id: hireJson.id,
        action: "stake",
        params: { amount: "5", pool: "0xpool" },
        billable: false,
        execute: true,
      }),
    });
    const runRes = await runsPOST(runReq);
    expect(runRes.status).toBe(201);
    expect(runRes.headers.get("x-agentic-trace-id")).toBeTruthy();

    const logged = logSpy.mock.calls.map(call => String(call[0]));
    const warned = warnSpy.mock.calls.map(call => String(call[0]));
    const lines = [...logged, ...warned];
    expect(lines.some(line => line.includes('"event":"marketplace.funnel.discover_loaded"'))).toBe(true);
    expect(lines.some(line => line.includes('"event":"marketplace.funnel.hire_created"'))).toBe(true);
    expect(lines.some(line => line.includes('"event":"marketplace.funnel.run_requested"'))).toBe(true);
    expect(
      lines.some(line => line.includes('"event":"marketplace.funnel.run_completed"')) ||
        lines.some(line => line.includes('"event":"marketplace.funnel.run_failed"')),
    ).toBe(true);
  });
});
