// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { clearDelegations } from "~~/lib/marketplace/delegation-registry";

vi.mock("../_lib/auth", () => ({
  authenticate: vi.fn().mockResolvedValue({
    wallet_address: "0xdel_operator",
    api_key_id: "key_del_1",
  }),
  AuthError: class AuthError extends Error {},
}));

import { authenticate } from "../_lib/auth";
import { GET, POST } from "../marketplace/delegations/route";
import { POST as REVOKE_POST } from "../marketplace/delegations/[id]/revoke/route";

function makeDelegationBody(overrides: Record<string, unknown> = {}) {
  return {
    agent_id: "staking_steward",
    agent_type: "staking_steward",
    allowed_actions: ["stake", "unstake"],
    token: "STRK",
    max_per_run: "1000000000000000000",
    total_allowance: "10000000000000000000",
    valid_from: new Date(Date.now() - 60_000).toISOString(),
    valid_until: new Date(Date.now() + 86_400_000).toISOString(),
    ...overrides,
  };
}

function postDelegation(body: Record<string, unknown>) {
  return POST(
    new NextRequest("http://localhost/api/v1/marketplace/delegations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "test-key-del",
      },
      body: JSON.stringify(body),
    }),
  );
}

function getDelegations(query = "") {
  return GET(
    new NextRequest(
      `http://localhost/api/v1/marketplace/delegations${query ? `?${query}` : ""}`,
      {
        method: "GET",
        headers: { "X-API-Key": "test-key-del" },
      },
    ),
  );
}

function revokeById(id: string) {
  return REVOKE_POST(
    new NextRequest(
      `http://localhost/api/v1/marketplace/delegations/${id}/revoke`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": "test-key-del",
        },
      },
    ),
    { params: Promise.resolve({ id }) },
  );
}

describe("marketplace delegation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearDelegations();
    process.env.ERC8004_DELEGATION_ENABLED = "true";
    process.env.CLOAK_MARKETPLACE_ENABLED = "true";
  });

  // ── 1. POST creates delegation with correct shape ──────────────────────────

  it("POST /delegations returns 201 with correct response shape", async () => {
    const res = await postDelegation(makeDelegationBody());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toMatch(/^dlg_/);
    expect(body.operator_wallet).toBe("0xdel_operator");
    expect(body.agent_id).toBe("staking_steward");
    expect(body.token).toBe("STRK");
    expect(body.max_per_run).toBe("1000000000000000000");
    expect(body.total_allowance).toBe("10000000000000000000");
    expect(body.consumed_amount).toBe("0");
    expect(body.remaining_allowance).toBe("10000000000000000000");
    expect(body.nonce).toBe(0);
    expect(body.status).toBe("active");
    expect(body.valid_from).toBeTruthy();
    expect(body.valid_until).toBeTruthy();
    expect(body.created_at).toBeTruthy();
    expect(body.revoked_at).toBeNull();
    expect(body.onchain_tx_hash).toBeNull();
    expect(body.escrow_tx_hash).toBeNull();
    expect(body.delegation_contract).toBeNull();
    expect(Array.isArray(body.allowed_actions)).toBe(true);
    expect(body.allowed_actions).toContain("stake");
  });

  // ── 1b. POST with on-chain tx hash stores escrow fields ────────────────────

  it("POST /delegations with onchain_tx_hash stores escrow fields", async () => {
    const res = await postDelegation(
      makeDelegationBody({
        onchain_tx_hash: "0xabc123",
        delegation_contract: "0xDelegationContract",
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.onchain_tx_hash).toBe("0xabc123");
    expect(body.escrow_tx_hash).toBe("0xabc123");
    expect(body.delegation_contract).toBe("0xDelegationContract");
  });

  // ── 2. GET returns delegations with pagination ─────────────────────────────

  it("GET /delegations returns 200 with pagination", async () => {
    await postDelegation(makeDelegationBody());
    await postDelegation(makeDelegationBody({ agent_id: "swap_runner", agent_type: "swap_runner" }));

    const res = await getDelegations("limit=10&offset=0");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.delegations)).toBe(true);
    expect(body.delegations.length).toBe(2);
    expect(body.pagination).toBeTruthy();
    expect(body.pagination.limit).toBe(10);
    expect(body.pagination.offset).toBe(0);
    expect(body.pagination.total).toBe(2);
  });

  // ── 3. GET with agent_id filter ────────────────────────────────────────────

  it("GET /delegations?agent_id=X returns filtered results", async () => {
    await postDelegation(makeDelegationBody({ agent_id: "staking_steward" }));
    await postDelegation(makeDelegationBody({ agent_id: "swap_runner", agent_type: "swap_runner" }));

    const res = await getDelegations("agent_id=staking_steward");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.delegations.length).toBe(1);
    expect(body.delegations[0].agent_id).toBe("staking_steward");
  });

  // ── 4. Revoke sets status and revoked_at ───────────────────────────────────

  it("POST /delegations/[id]/revoke returns 200 with status=revoked", async () => {
    const createRes = await postDelegation(makeDelegationBody());
    const delegation = await createRes.json();

    const revokeRes = await revokeById(delegation.id);
    expect(revokeRes.status).toBe(200);
    const revoked = await revokeRes.json();
    expect(revoked.status).toBe("revoked");
    expect(revoked.revoked_at).toBeTruthy();
    expect(revoked.id).toBe(delegation.id);
  });

  // ── 5. Revoke by wrong operator returns 403 ───────────────────────────────

  it("revoke by wrong operator returns 403", async () => {
    const createRes = await postDelegation(makeDelegationBody());
    const delegation = await createRes.json();

    // Change the authenticated operator
    vi.mocked(authenticate).mockResolvedValueOnce({
      wallet_address: "0xother_operator",
      api_key_id: "key_other",
    });

    const revokeRes = await revokeById(delegation.id);
    expect(revokeRes.status).toBe(403);
    const body = await revokeRes.json();
    expect(body.error).toMatch(/Only the operator can revoke/);
  });

  // ── 6. Revoke is idempotent ────────────────────────────────────────────────

  it("revoke on already-revoked delegation returns 200", async () => {
    const createRes = await postDelegation(makeDelegationBody());
    const delegation = await createRes.json();

    const first = await revokeById(delegation.id);
    expect(first.status).toBe(200);

    const second = await revokeById(delegation.id);
    expect(second.status).toBe(200);
    const body = await second.json();
    expect(body.status).toBe("revoked");
  });

  // ── 7. POST with missing required fields returns 400 ──────────────────────

  it("POST with missing required fields returns 400", async () => {
    const res = await postDelegation({ agent_id: "staking_steward" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  // ── 8. POST with invalid max_per_run returns 400 ──────────────────────────

  it("POST with non-numeric max_per_run returns 400", async () => {
    const res = await postDelegation(
      makeDelegationBody({ max_per_run: "not_a_number" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/valid numeric/);
  });

  // ── 9. POST with valid_until before valid_from returns 400 ─────────────────

  it("POST with valid_until before valid_from returns 400", async () => {
    const now = Date.now();
    const res = await postDelegation(
      makeDelegationBody({
        valid_from: new Date(now + 86_400_000).toISOString(),
        valid_until: new Date(now - 86_400_000).toISOString(),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/valid_until must be after/);
  });

  // ── 10. POST with empty allowed_actions returns 400 ────────────────────────

  it("POST with empty allowed_actions returns 400", async () => {
    const res = await postDelegation(
      makeDelegationBody({ allowed_actions: [] }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/allowed_actions/);
  });

  // ── 11. Feature flag disabled returns 403 ──────────────────────────────────

  it("returns 403 when delegation feature flag is disabled", async () => {
    process.env.ERC8004_DELEGATION_ENABLED = "false";

    const postRes = await postDelegation(makeDelegationBody());
    expect(postRes.status).toBe(403);
    const postBody = await postRes.json();
    expect(postBody.code).toBe("FEATURE_DISABLED");

    const getRes = await getDelegations();
    expect(getRes.status).toBe(403);
    const getBody = await getRes.json();
    expect(getBody.code).toBe("FEATURE_DISABLED");
  });

  // ── 12. Revoke returns 404 for non-existent delegation ─────────────────────

  it("revoke non-existent delegation returns 404", async () => {
    const res = await revokeById("dlg_nonexistent");
    expect(res.status).toBe(404);
  });

  // ── 13. GET with pagination offset skips entries ───────────────────────────

  it("GET with offset skips entries correctly", async () => {
    await postDelegation(makeDelegationBody({ agent_id: "staking_steward" }));
    await postDelegation(makeDelegationBody({ agent_id: "swap_runner", agent_type: "swap_runner" }));
    await postDelegation(makeDelegationBody({ agent_id: "treasury_dispatcher", agent_type: "treasury_dispatcher" }));

    const res = await getDelegations("limit=1&offset=1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.delegations.length).toBe(1);
    expect(body.pagination.total).toBe(3);
    expect(body.pagination.offset).toBe(1);
  });

  // ── 14. Revoke feature flag disabled returns 403 ───────────────────────────

  it("revoke returns 403 when delegation feature flag is disabled", async () => {
    const createRes = await postDelegation(makeDelegationBody());
    const delegation = await createRes.json();

    process.env.ERC8004_DELEGATION_ENABLED = "false";
    const res = await revokeById(delegation.id);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("FEATURE_DISABLED");
  });

  // ── 15. POST with invalid JSON body returns 400 ────────────────────────────

  it("POST with invalid JSON body returns 400", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/v1/marketplace/delegations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": "test-key-del",
        },
        body: "not-valid-json{{{",
      }),
    );
    expect(res.status).toBe(400);
  });
});
