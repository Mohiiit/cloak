// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearAgentProfiles, upsertAgentProfile } from "~~/lib/marketplace/agents-store";
import { clearHires } from "~~/lib/marketplace/hires-store";
import { clearRunsStore } from "~~/lib/marketplace/runs-store";
import { buildEndpointOwnershipDigest } from "~~/lib/marketplace/endpoint-proof";

vi.mock("../_lib/auth", () => ({
  authenticate: vi.fn().mockResolvedValue({
    wallet_address: "0xabc123",
    api_key_id: "key_1",
  }),
  AuthError: class AuthError extends Error {},
}));

vi.mock("~~/lib/marketplace/onchain-identity", () => ({
  isOnchainIdentityEnforced: vi.fn().mockReturnValue(true),
  checkAgentOnchainIdentity: vi.fn().mockResolvedValue({
    enforced: true,
    verified: false,
    status: "mismatch",
    owner: "0xdead",
    reason: "operator_owner_mismatch",
    checkedAt: "2026-02-26T00:00:00.000Z",
  }),
}));

import { POST as agentsPOST } from "../marketplace/agents/route";
import { POST as hiresPOST } from "../marketplace/hires/route";
import { POST as runsPOST } from "../marketplace/runs/route";

describe("marketplace on-chain identity enforcement", () => {
  beforeEach(() => {
    clearAgentProfiles();
    clearHires();
    clearRunsStore();
  });

  it("blocks agent registration on on-chain owner mismatch", async () => {
    const endpoint = "https://agents.cloak.local/enforced";
    const req = new NextRequest("http://localhost/api/v1/marketplace/agents", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "test-key-1234567890",
      },
      body: JSON.stringify({
        agent_id: "agent_enforced_register",
        name: "Enforced Agent",
        description: "desc",
        agent_type: "staking_steward",
        capabilities: ["stake"],
        endpoints: [endpoint],
        endpoint_proofs: [
          {
            endpoint,
            nonce: "nonce_enforced_register",
            digest: buildEndpointOwnershipDigest({
              endpoint,
              operatorWallet: "0xabc123",
              nonce: "nonce_enforced_register",
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
    const res = await agentsPOST(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("ONCHAIN_IDENTITY_MISMATCH");
  });

  it("blocks hire creation when profile identity mismatches chain", async () => {
    upsertAgentProfile({
      agent_id: "agent_enforced_hire",
      name: "Enforced Hire Agent",
      description: "desc",
      agent_type: "staking_steward",
      capabilities: ["stake"],
      endpoints: ["https://agents.cloak.local/enforced-hire"],
      endpoint_proofs: [
        {
          endpoint: "https://agents.cloak.local/enforced-hire",
          nonce: "nonce_enforced_hire",
          digest: buildEndpointOwnershipDigest({
            endpoint: "https://agents.cloak.local/enforced-hire",
            operatorWallet: "0xabc123",
            nonce: "nonce_enforced_hire",
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
      status: "active",
    });

    const req = new NextRequest("http://localhost/api/v1/marketplace/hires", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "test-key-1234567890",
      },
      body: JSON.stringify({
        agent_id: "agent_enforced_hire",
        operator_wallet: "0xabc123",
        policy_snapshot: { cap: 100 },
        billing_mode: "per_run",
      }),
    });
    const res = await hiresPOST(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("ONCHAIN_IDENTITY_MISMATCH");
  });

  it("blocks run creation when enforced identity check fails", async () => {
    upsertAgentProfile({
      agent_id: "agent_enforced_run",
      name: "Enforced Run Agent",
      description: "desc",
      agent_type: "staking_steward",
      capabilities: ["stake"],
      endpoints: ["https://agents.cloak.local/enforced-run"],
      endpoint_proofs: [
        {
          endpoint: "https://agents.cloak.local/enforced-run",
          nonce: "nonce_enforced_run",
          digest: buildEndpointOwnershipDigest({
            endpoint: "https://agents.cloak.local/enforced-run",
            operatorWallet: "0xabc123",
            nonce: "nonce_enforced_run",
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
      status: "active",
    });

    const req = new NextRequest("http://localhost/api/v1/marketplace/runs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "test-key-1234567890",
      },
      body: JSON.stringify({
        hire_id: "hire_enforced_run",
        agent_id: "agent_enforced_run",
        action: "stake",
        params: { amount: "100" },
        billable: false,
      }),
    });
    const res = await runsPOST(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("ONCHAIN_IDENTITY_MISMATCH");
  });
});
