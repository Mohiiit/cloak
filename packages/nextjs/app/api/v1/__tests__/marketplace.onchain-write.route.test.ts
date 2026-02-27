// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearAgentProfiles } from "~~/lib/marketplace/agents-store";
import { buildEndpointOwnershipDigest } from "~~/lib/marketplace/endpoint-proof";

vi.mock("../_lib/auth", () => ({
  authenticate: vi.fn().mockResolvedValue({
    wallet_address: "0xabc123",
    api_key_id: "key_1",
  }),
  AuthError: class AuthError extends Error {},
}));

vi.mock("~~/lib/marketplace/onchain-identity", () => ({
  checkAgentOnchainIdentity: vi.fn().mockResolvedValue({
    enforced: false,
    verified: false,
    status: "skipped",
    owner: null,
    reason: null,
    checkedAt: "2026-02-26T00:00:00.000Z",
  }),
}));

const {
  submitAgentRegistrationOnchain,
  reconcilePendingAgentRegistrationWrite,
} = vi.hoisted(() => ({
  submitAgentRegistrationOnchain: vi.fn(),
  reconcilePendingAgentRegistrationWrite: vi.fn(),
}));

vi.mock("~~/lib/marketplace/onchain-registration", () => ({
  submitAgentRegistrationOnchain,
  reconcilePendingAgentRegistrationWrite,
}));

import { GET as agentsGET, POST as agentsPOST } from "../marketplace/agents/route";

describe("marketplace agent registration onchain write", () => {
  beforeEach(() => {
    clearAgentProfiles();
    submitAgentRegistrationOnchain.mockReset();
    reconcilePendingAgentRegistrationWrite.mockReset();
    submitAgentRegistrationOnchain.mockResolvedValue({
      status: "pending",
      txHash: "0xwrite1",
      reason: "awaiting_confirmation",
      checkedAt: "2026-02-26T00:00:00.000Z",
    });
    reconcilePendingAgentRegistrationWrite.mockResolvedValue(null);
  });

  it("persists registration write outcome on profile create", async () => {
    const endpoint = "https://agents.cloak.local/onchain-write";
    const req = new NextRequest("http://localhost/api/v1/marketplace/agents", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "test-key-1234567890",
      },
      body: JSON.stringify({
        agent_id: "111",
        name: "Onchain Write Agent",
        description: "desc",
        agent_type: "staking_steward",
        capabilities: ["stake"],
        endpoints: [endpoint],
        endpoint_proofs: [
          {
            endpoint,
            nonce: "nonce_onchain_write",
            digest: buildEndpointOwnershipDigest({
              endpoint,
              operatorWallet: "0xabc123",
              nonce: "nonce_onchain_write",
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
    expect(res.status).toBe(201);
    const profile = await res.json();
    expect(profile.onchain_write_status).toBe("pending");
    expect(profile.onchain_write_tx_hash).toBe("0xwrite1");
    expect(submitAgentRegistrationOnchain).toHaveBeenCalledTimes(1);
  });

  it("reconciles pending write outcome during refresh_onchain", async () => {
    const endpoint = "https://agents.cloak.local/onchain-write-refresh";
    const registerReq = new NextRequest("http://localhost/api/v1/marketplace/agents", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "test-key-1234567890",
      },
      body: JSON.stringify({
        agent_id: "222",
        name: "Onchain Refresh Agent",
        description: "desc",
        agent_type: "staking_steward",
        capabilities: ["stake"],
        endpoints: [endpoint],
        endpoint_proofs: [
          {
            endpoint,
            nonce: "nonce_onchain_refresh",
            digest: buildEndpointOwnershipDigest({
              endpoint,
              operatorWallet: "0xabc123",
              nonce: "nonce_onchain_refresh",
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
    expect((await agentsPOST(registerReq)).status).toBe(201);

    reconcilePendingAgentRegistrationWrite.mockResolvedValueOnce({
      status: "confirmed",
      txHash: "0xwrite2",
      reason: null,
      checkedAt: "2026-02-26T00:10:00.000Z",
    });

    const listReq = new NextRequest(
      "http://localhost/api/v1/marketplace/agents?refresh_onchain=true",
      {
        method: "GET",
        headers: {
          "X-API-Key": "test-key-1234567890",
        },
      },
    );

    const listRes = await agentsGET(listReq);
    expect(listRes.status).toBe(200);
    const listJson = await listRes.json();
    expect(listJson.agents[0].onchain_write_status).toBe("confirmed");
    expect(listJson.agents[0].onchain_write_tx_hash).toBe("0xwrite2");
  });
});
