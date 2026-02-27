// @vitest-environment node

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearHires, createHire } from "~~/lib/marketplace/hires-store";
import { clearRunsStore } from "~~/lib/marketplace/runs-store";
import {
  clearAgentProfiles,
  upsertAgentProfile,
} from "~~/lib/marketplace/agents-store";
import {
  clearDelegations,
  createDelegation,
} from "~~/lib/marketplace/delegation-registry";

// Mock the execution adapter so we don't hit real RPC
vi.mock("~~/lib/marketplace/execution-adapter", () => ({
  executeMarketplaceRuntimeAction: vi.fn().mockResolvedValue({
    provider: "basic-protocol",
    txHashes: ["0xcompound_tx"],
    receipt: {
      protocol: "staking",
      action: "compound",
      calls_count: 3,
      mode: "basic",
      tx_hash: "0xcompound_tx",
      unclaimed_rewards_wei: "50000000000000000",
      compounded_amount_wei: "50000000000000000",
      compounded_display: "0.05",
      total_staked_after_wei: "25050000000000000000",
    },
  }),
}));

import { GET, POST } from "../marketplace/cron/compound/route";

const CRON_SECRET = "test-cron-secret-1234";

function makeCronRequest(
  method: "GET" | "POST" = "POST",
  secret?: string,
): NextRequest {
  return new NextRequest(
    "http://localhost/api/v1/marketplace/cron/compound",
    {
      method,
      headers: {
        Authorization: `Bearer ${secret ?? CRON_SECRET}`,
      },
    },
  );
}

function seedAgentProfile(): void {
  upsertAgentProfile({
    agent_id: "staking_steward",
    name: "Staking Steward",
    description: "Auto-compound staking rewards",
    agent_type: "staking_steward",
    capabilities: ["stake", "compound"],
    endpoints: [],
    endpoint_proofs: [],
    pricing: { mode: "per_run", amount: "1", token: "STRK" },
    operator_wallet: "0xoperator1",
    service_wallet: "0xservice1",
  });
}

function seedHire(operatorWallet = "0xoperator1"): string {
  const hire = createHire({
    agent_id: "staking_steward",
    operator_wallet: operatorWallet,
    policy_snapshot: {},
    billing_mode: "delegation",
  });
  return hire.id;
}

function seedDelegation(operatorWallet = "0xoperator1"): void {
  const now = new Date();
  const validFrom = new Date(now.getTime() - 3600_000).toISOString();
  const validUntil = new Date(now.getTime() + 86400_000).toISOString();
  createDelegation(operatorWallet, {
    agent_id: "staking_steward",
    agent_type: "staking_steward",
    allowed_actions: ["stake", "unstake", "rebalance", "compound"],
    token: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
    max_per_run: "1000000000000000000",
    total_allowance: "10000000000000000000",
    valid_from: validFrom,
    valid_until: validUntil,
  });
}

describe("marketplace cron compound route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearHires();
    clearRunsStore();
    clearAgentProfiles();
    clearDelegations();
    process.env.CRON_SECRET = CRON_SECRET;
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("rejects request without CRON_SECRET", async () => {
    const req = makeCronRequest("POST", "wrong-secret");
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("rejects when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    const req = makeCronRequest();
    const res = await POST(req);
    expect(res.status).toBe(500);
  });

  it("returns 200 with zero results when no active hires", async () => {
    const req = makeCronRequest();
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.triggered).toBe(0);
    expect(body.skipped).toBe(0);
    expect(body.failed).toBe(0);
  });

  it("skips hire when no valid delegation exists", async () => {
    seedAgentProfile();
    seedHire();
    // No delegation seeded

    const req = makeCronRequest();
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.triggered).toBe(0);
    expect(body.skipped).toBe(1);
    expect(body.results[0].status).toBe("skipped");
  });

  it("triggers compound when hire and delegation are valid", async () => {
    seedAgentProfile();
    seedHire();
    seedDelegation();

    const req = makeCronRequest();
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.triggered).toBe(1);
    expect(body.skipped).toBe(0);
    expect(body.failed).toBe(0);
    expect(body.results[0].status).toBe("triggered");
    expect(body.results[0].tx_hashes).toContain("0xcompound_tx");
    expect(body.results[0].run_id).toBeTruthy();
  });

  it("processes multiple hires independently", async () => {
    seedAgentProfile();
    seedHire("0xoperator1");
    seedHire("0xoperator2");
    seedDelegation("0xoperator1");
    // operator2 has no delegation → should be skipped

    const req = makeCronRequest();
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.triggered).toBe(1);
    expect(body.skipped).toBe(1);
  });

  it("works via GET (Vercel Cron compatibility)", async () => {
    seedAgentProfile();
    seedHire();
    seedDelegation();

    const req = makeCronRequest("GET");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.triggered).toBe(1);
  });

  it("skips delegation that does not include compound action", async () => {
    seedAgentProfile();
    seedHire();

    // Create a delegation WITHOUT compound in allowed_actions
    const now = new Date();
    createDelegation("0xoperator1", {
      agent_id: "staking_steward",
      agent_type: "staking_steward",
      allowed_actions: ["stake", "unstake"],
      token: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
      max_per_run: "1000000000000000000",
      total_allowance: "10000000000000000000",
      valid_from: new Date(now.getTime() - 3600_000).toISOString(),
      valid_until: new Date(now.getTime() + 86400_000).toISOString(),
    });

    const req = makeCronRequest();
    const res = await POST(req);
    const body = await res.json();
    expect(body.skipped).toBe(1);
    expect(body.triggered).toBe(0);
  });

  it("skips expired delegation", async () => {
    seedAgentProfile();
    seedHire();

    const now = new Date();
    createDelegation("0xoperator1", {
      agent_id: "staking_steward",
      agent_type: "staking_steward",
      allowed_actions: ["compound"],
      token: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
      max_per_run: "1000000000000000000",
      total_allowance: "10000000000000000000",
      valid_from: new Date(now.getTime() - 86400_000).toISOString(),
      valid_until: new Date(now.getTime() - 3600_000).toISOString(), // expired
    });

    const req = makeCronRequest();
    const res = await POST(req);
    const body = await res.json();
    expect(body.skipped).toBe(1);
    expect(body.triggered).toBe(0);
  });
});
