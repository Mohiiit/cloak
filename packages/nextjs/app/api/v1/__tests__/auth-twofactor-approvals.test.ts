// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("../_lib/auth", () => ({
  authenticate: vi.fn(),
  hashApiKey: vi.fn().mockResolvedValue("hashed_key_abc123"),
  AuthError: class AuthError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "AuthError";
    }
  },
}));

vi.mock("../_lib/supabase", () => ({
  getSupabase: vi.fn(),
}));

vi.mock("@cloak-wallet/sdk", () => ({
  normalizeAddress: (addr: string) => addr.toLowerCase(),
}));

// Import mocks after vi.mock declarations
import { authenticate, AuthError, hashApiKey } from "../_lib/auth";
import { getSupabase } from "../_lib/supabase";
import type { SupabaseClient } from "../_lib/supabase";

// ─── Helpers ────────────────────────────────────────────────────────────────

function mockSupabase(overrides: Partial<SupabaseClient> = {}): SupabaseClient {
  const sb: SupabaseClient = {
    insert: vi.fn().mockResolvedValue([]),
    select: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue([]),
    del: vi.fn().mockResolvedValue([]),
    upsert: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
  vi.mocked(getSupabase).mockReturnValue(sb);
  return sb;
}

function authed(wallet = "0x123", keyId = "key1") {
  vi.mocked(authenticate).mockResolvedValue({
    wallet_address: wallet,
    api_key_id: keyId,
  });
}

function authFails(message = "Missing X-API-Key header") {
  vi.mocked(authenticate).mockRejectedValue(new AuthError(message));
}

function makeReq(
  url: string,
  opts?: { method?: string; body?: unknown; headers?: Record<string, string> },
): NextRequest {
  const { method = "GET", body, headers = {} } = opts ?? {};
  const init: RequestInit & { headers: Record<string, string> } = {
    method,
    headers: {
      "X-API-Key": "test-key-1234567890",
      ...headers,
    },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers["Content-Type"] = "application/json";
  }
  return new NextRequest(url, init);
}

async function json(res: Response) {
  return res.json();
}

// ─── Test Suites ────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════
// 1. POST /auth/register
// ═══════════════════════════════════════════════════════════════════════════

describe("POST /auth/register", () => {
  let POST: typeof import("../auth/register/route").POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ POST } = await import("../auth/register/route"));
  });

  it("returns 201 with api_key on success", async () => {
    const sb = mockSupabase({
      select: vi.fn().mockResolvedValue([]), // no existing wallet
      insert: vi.fn().mockResolvedValue([{ id: "row1" }]),
    });

    const req = makeReq("http://localhost/api/v1/auth/register", {
      method: "POST",
      body: { wallet_address: "0xABC", public_key: "0xDEF" },
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    const data = await json(res);
    expect(data.api_key).toBeDefined();
    expect(typeof data.api_key).toBe("string");

    // Should have checked for existing wallet
    expect(sb.select).toHaveBeenCalledWith(
      "api_keys",
      expect.stringContaining("wallet_address=eq."),
      { limit: 1 },
    );
    // Should have inserted the new key
    expect(sb.insert).toHaveBeenCalledWith(
      "api_keys",
      expect.objectContaining({
        key_hash: "hashed_key_abc123",
      }),
    );
  });

  it("returns 200 and rotates key when wallet already registered", async () => {
    const sb = mockSupabase({
      select: vi.fn().mockResolvedValue([{ id: "existing-key" }]),
      update: vi.fn().mockResolvedValue([{ id: "existing-key" }]),
    });

    const req = makeReq("http://localhost/api/v1/auth/register", {
      method: "POST",
      body: { wallet_address: "0xABC", public_key: "0xDEF" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await json(res);
    expect(typeof data.api_key).toBe("string");
    expect(data.api_key.length).toBeGreaterThan(0);
    expect(sb.update).toHaveBeenCalledWith(
      "api_keys",
      "id=eq.existing-key",
      expect.objectContaining({
        key_hash: "hashed_key_abc123",
        public_key: "0xDEF",
        revoked_at: null,
      }),
    );
  });

  it("returns 400 for missing wallet_address", async () => {
    mockSupabase();

    const req = makeReq("http://localhost/api/v1/auth/register", {
      method: "POST",
      body: { public_key: "0xDEF" },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid wallet_address (not hex)", async () => {
    mockSupabase();

    const req = makeReq("http://localhost/api/v1/auth/register", {
      method: "POST",
      body: { wallet_address: "not-hex", public_key: "0xDEF" },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. GET /auth/verify
// ═══════════════════════════════════════════════════════════════════════════

describe("GET /auth/verify", () => {
  let GET: typeof import("../auth/verify/route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ GET } = await import("../auth/verify/route"));
  });

  it("returns { valid: true, wallet_address } on success", async () => {
    authed("0xWALLET");

    const req = makeReq("http://localhost/api/v1/auth/verify");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const data = await json(res);
    expect(data).toEqual({
      valid: true,
      wallet_address: "0xWALLET",
    });
  });

  it("returns 401 when AuthError thrown", async () => {
    authFails("Invalid API key");

    const req = makeReq("http://localhost/api/v1/auth/verify");
    const res = await GET(req);

    expect(res.status).toBe(401);
    const data = await json(res);
    expect(data.error).toBe("Invalid API key");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. GET /two-factor/status
// ═══════════════════════════════════════════════════════════════════════════

describe("GET /two-factor/status", () => {
  let GET: typeof import("../two-factor/status/route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ GET } = await import("../two-factor/status/route"));
  });

  it("returns { enabled: true, secondary_public_key } when found", async () => {
    authed();
    mockSupabase({
      select: vi.fn().mockResolvedValue([
        { wallet_address: "0x123", secondary_public_key: "0x5ec4e7" },
      ]),
    });

    const req = makeReq(
      "http://localhost/api/v1/two-factor/status?wallet=0x123",
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const data = await json(res);
    expect(data).toEqual({
      enabled: true,
      secondary_public_key: "0x5ec4e7",
    });
  });

  it("returns { enabled: false } when not found", async () => {
    authed();
    mockSupabase({
      select: vi.fn().mockResolvedValue([]),
    });

    const req = makeReq(
      "http://localhost/api/v1/two-factor/status?wallet=0x123",
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const data = await json(res);
    expect(data).toEqual({ enabled: false });
  });

  it("returns 400 for missing wallet param", async () => {
    authed();
    mockSupabase();

    const req = makeReq("http://localhost/api/v1/two-factor/status");
    const res = await GET(req);

    expect(res.status).toBe(400);
    const data = await json(res);
    expect(data.error).toContain("wallet");
  });

  it("returns 401 for auth error", async () => {
    authFails();
    mockSupabase();

    const req = makeReq(
      "http://localhost/api/v1/two-factor/status?wallet=0x123",
    );
    const res = await GET(req);

    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. POST /two-factor/enable
// ═══════════════════════════════════════════════════════════════════════════

describe("POST /two-factor/enable", () => {
  let POST: typeof import("../two-factor/enable/route").POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ POST } = await import("../two-factor/enable/route"));
  });

  it("upserts and returns { success: true }", async () => {
    authed();
    const sb = mockSupabase({
      upsert: vi.fn().mockResolvedValue([{ wallet_address: "0x123" }]),
    });

    const req = makeReq("http://localhost/api/v1/two-factor/enable", {
      method: "POST",
      body: {
        wallet_address: "0xABC",
        secondary_public_key: "0x5ec4e7",
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await json(res);
    expect(data).toEqual({ success: true });

    expect(sb.upsert).toHaveBeenCalledWith(
      "two_factor_configs",
      expect.objectContaining({
        wallet_address: "0xabc", // normalizeAddress lowercases
        secondary_public_key: "0x5ec4e7",
      }),
      "wallet_address",
    );
  });

  it("returns 400 for missing secondary_public_key", async () => {
    authed();
    mockSupabase();

    const req = makeReq("http://localhost/api/v1/two-factor/enable", {
      method: "POST",
      body: { wallet_address: "0xABC" },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid wallet_address", async () => {
    authed();
    mockSupabase();

    const req = makeReq("http://localhost/api/v1/two-factor/enable", {
      method: "POST",
      body: {
        wallet_address: "not-hex",
        secondary_public_key: "0x5ec4e7",
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 401 for auth error", async () => {
    authFails();
    mockSupabase();

    const req = makeReq("http://localhost/api/v1/two-factor/enable", {
      method: "POST",
      body: {
        wallet_address: "0xABC",
        secondary_public_key: "0x5ec4e7",
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. DELETE /two-factor/disable
// ═══════════════════════════════════════════════════════════════════════════

describe("DELETE /two-factor/disable", () => {
  let DELETE: typeof import("../two-factor/disable/route").DELETE;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ DELETE } = await import("../two-factor/disable/route"));
  });

  it("returns 204 on success", async () => {
    authed();
    const sb = mockSupabase({
      del: vi.fn().mockResolvedValue([]),
    });

    const req = makeReq("http://localhost/api/v1/two-factor/disable", {
      method: "DELETE",
      body: { wallet_address: "0xABC" },
    });

    const res = await DELETE(req);
    expect(res.status).toBe(204);

    expect(sb.del).toHaveBeenCalledWith(
      "two_factor_configs",
      "wallet_address=eq.0xabc",
    );
  });

  it("returns 400 for missing wallet_address", async () => {
    authed();
    mockSupabase();

    const req = makeReq("http://localhost/api/v1/two-factor/disable", {
      method: "DELETE",
      body: {},
    });

    const res = await DELETE(req);
    expect(res.status).toBe(400);

    const data = await json(res);
    expect(data.error).toContain("wallet_address");
  });

  it("returns 400 for non-string wallet_address", async () => {
    authed();
    mockSupabase();

    const req = makeReq("http://localhost/api/v1/two-factor/disable", {
      method: "DELETE",
      body: { wallet_address: 123 },
    });

    const res = await DELETE(req);
    expect(res.status).toBe(400);
  });

  it("returns 401 for auth error", async () => {
    authFails();
    mockSupabase();

    const req = makeReq("http://localhost/api/v1/two-factor/disable", {
      method: "DELETE",
      body: { wallet_address: "0xABC" },
    });

    const res = await DELETE(req);
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. POST /approvals
// ═══════════════════════════════════════════════════════════════════════════

const validApprovalBody = {
  wallet_address: "0xABC",
  action: "transfer",
  token: "STRK",
  amount: "100",
  recipient: "0xDEF",
  calls_json: '{"calls":[]}',
  sig1_json: '{"r":"0x1","s":"0x2"}',
  nonce: "5",
  resource_bounds_json: '{"l1_gas":{}}',
  tx_hash: "0xabcdef1234567890",
};

describe("POST /approvals", () => {
  let POST: typeof import("../approvals/route").POST;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ POST } = await import("../approvals/route"));
  });

  it("creates and returns 201", async () => {
    authed();
    const inserted = { id: "apr-1", ...validApprovalBody, status: "pending" };
    const sb = mockSupabase({
      insert: vi.fn().mockResolvedValue([inserted]),
    });

    const req = makeReq("http://localhost/api/v1/approvals", {
      method: "POST",
      body: validApprovalBody,
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    const data = await json(res);
    expect(data.id).toBe("apr-1");
    expect(data.status).toBe("pending");

    expect(sb.insert).toHaveBeenCalledWith(
      "approval_requests",
      expect.objectContaining({
        status: "pending",
        action: "transfer",
      }),
    );
  });

  it("returns 400 for validation error (missing action)", async () => {
    authed();
    mockSupabase();

    const req = makeReq("http://localhost/api/v1/approvals", {
      method: "POST",
      body: { wallet_address: "0xABC" }, // missing required fields
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid wallet_address", async () => {
    authed();
    mockSupabase();

    const req = makeReq("http://localhost/api/v1/approvals", {
      method: "POST",
      body: { ...validApprovalBody, wallet_address: "bad" },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 401 for auth error", async () => {
    authFails();
    mockSupabase();

    const req = makeReq("http://localhost/api/v1/approvals", {
      method: "POST",
      body: validApprovalBody,
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. GET /approvals
// ═══════════════════════════════════════════════════════════════════════════

describe("GET /approvals", () => {
  let GET: typeof import("../approvals/route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ GET } = await import("../approvals/route"));
  });

  it("returns filtered list", async () => {
    authed();
    const rows = [
      { id: "apr-1", status: "pending" },
      { id: "apr-2", status: "approved" },
    ];
    mockSupabase({
      select: vi.fn().mockResolvedValue(rows),
    });

    const req = makeReq(
      "http://localhost/api/v1/approvals?wallet=0x123",
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const data = await json(res);
    expect(data).toHaveLength(2);
    expect(data[0].id).toBe("apr-1");
  });

  it("returns 400 for missing wallet param", async () => {
    authed();
    mockSupabase();

    const req = makeReq("http://localhost/api/v1/approvals");
    const res = await GET(req);

    expect(res.status).toBe(400);
    const data = await json(res);
    expect(data.error).toContain("wallet");
  });

  it("supports status filter", async () => {
    authed();
    const sb = mockSupabase({
      select: vi.fn().mockResolvedValue([{ id: "apr-1", status: "pending" }]),
    });

    const req = makeReq(
      "http://localhost/api/v1/approvals?wallet=0x123&status=pending",
    );
    const res = await GET(req);

    expect(res.status).toBe(200);

    // Verify that the select filter includes status
    const filterArg = vi.mocked(sb.select).mock.calls[0][1] as string;
    expect(filterArg).toContain("status=eq.pending");
    expect(filterArg).toContain("wallet_address=eq.");
  });

  it("returns 401 for auth error", async () => {
    authFails();
    mockSupabase();

    const req = makeReq(
      "http://localhost/api/v1/approvals?wallet=0x123",
    );
    const res = await GET(req);

    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. GET /approvals/:id
// ═══════════════════════════════════════════════════════════════════════════

describe("GET /approvals/:id", () => {
  let GET: typeof import("../approvals/[id]/route").GET;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ GET } = await import("../approvals/[id]/route"));
  });

  it("returns single approval", async () => {
    authed();
    const approval = { id: "apr-1", status: "pending", action: "transfer" };
    mockSupabase({
      select: vi.fn().mockResolvedValue([approval]),
    });

    const req = makeReq("http://localhost/api/v1/approvals/apr-1");
    const res = await GET(req, {
      params: Promise.resolve({ id: "apr-1" }),
    });

    expect(res.status).toBe(200);
    const data = await json(res);
    expect(data.id).toBe("apr-1");
    expect(data.action).toBe("transfer");
  });

  it("returns 404 when not found", async () => {
    authed();
    mockSupabase({
      select: vi.fn().mockResolvedValue([]),
    });

    const req = makeReq("http://localhost/api/v1/approvals/nonexistent");
    const res = await GET(req, {
      params: Promise.resolve({ id: "nonexistent" }),
    });

    expect(res.status).toBe(404);
    const data = await json(res);
    expect(data.error).toContain("not found");
  });

  it("returns 401 for auth error", async () => {
    authFails();
    mockSupabase();

    const req = makeReq("http://localhost/api/v1/approvals/apr-1");
    const res = await GET(req, {
      params: Promise.resolve({ id: "apr-1" }),
    });

    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. PATCH /approvals/:id
// ═══════════════════════════════════════════════════════════════════════════

describe("PATCH /approvals/:id", () => {
  let PATCH: typeof import("../approvals/[id]/route").PATCH;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ PATCH } = await import("../approvals/[id]/route"));
  });

  it("updates and returns 200", async () => {
    authed();
    const updated = { id: "apr-1", status: "approved" };
    const sb = mockSupabase({
      update: vi.fn().mockResolvedValue([updated]),
    });

    const req = makeReq("http://localhost/api/v1/approvals/apr-1", {
      method: "PATCH",
      body: { status: "approved" },
    });

    const res = await PATCH(req, {
      params: Promise.resolve({ id: "apr-1" }),
    });

    expect(res.status).toBe(200);
    const data = await json(res);
    expect(data.status).toBe("approved");

    // Verify update was called with the right filter
    expect(sb.update).toHaveBeenCalledWith(
      "approval_requests",
      "id=eq.apr-1",
      expect.objectContaining({ status: "approved" }),
    );
  });

  it("sets responded_at for terminal status 'approved'", async () => {
    authed();
    const sb = mockSupabase({
      update: vi.fn().mockResolvedValue([{ id: "apr-1", status: "approved" }]),
    });

    const req = makeReq("http://localhost/api/v1/approvals/apr-1", {
      method: "PATCH",
      body: { status: "approved" },
    });

    await PATCH(req, { params: Promise.resolve({ id: "apr-1" }) });

    const updateData = vi.mocked(sb.update).mock.calls[0][2];
    expect(updateData).toHaveProperty("responded_at");
    expect(typeof updateData.responded_at).toBe("string");
  });

  it("sets responded_at for terminal status 'rejected'", async () => {
    authed();
    const sb = mockSupabase({
      update: vi.fn().mockResolvedValue([{ id: "apr-1", status: "rejected" }]),
    });

    const req = makeReq("http://localhost/api/v1/approvals/apr-1", {
      method: "PATCH",
      body: { status: "rejected" },
    });

    await PATCH(req, { params: Promise.resolve({ id: "apr-1" }) });

    const updateData = vi.mocked(sb.update).mock.calls[0][2];
    expect(updateData).toHaveProperty("responded_at");
  });

  it("sets responded_at for terminal status 'expired'", async () => {
    authed();
    const sb = mockSupabase({
      update: vi.fn().mockResolvedValue([{ id: "apr-1", status: "expired" }]),
    });

    const req = makeReq("http://localhost/api/v1/approvals/apr-1", {
      method: "PATCH",
      body: { status: "expired" },
    });

    await PATCH(req, { params: Promise.resolve({ id: "apr-1" }) });

    const updateData = vi.mocked(sb.update).mock.calls[0][2];
    expect(updateData).toHaveProperty("responded_at");
  });

  it("does NOT set responded_at for non-terminal status 'pending'", async () => {
    authed();
    const sb = mockSupabase({
      update: vi.fn().mockResolvedValue([{ id: "apr-1", status: "pending" }]),
    });

    const req = makeReq("http://localhost/api/v1/approvals/apr-1", {
      method: "PATCH",
      body: { status: "pending" },
    });

    await PATCH(req, { params: Promise.resolve({ id: "apr-1" }) });

    const updateData = vi.mocked(sb.update).mock.calls[0][2];
    expect(updateData).not.toHaveProperty("responded_at");
  });

  it("does NOT set responded_at for non-terminal status 'failed'", async () => {
    authed();
    const sb = mockSupabase({
      update: vi.fn().mockResolvedValue([{ id: "apr-1", status: "failed" }]),
    });

    const req = makeReq("http://localhost/api/v1/approvals/apr-1", {
      method: "PATCH",
      body: { status: "failed" },
    });

    await PATCH(req, { params: Promise.resolve({ id: "apr-1" }) });

    const updateData = vi.mocked(sb.update).mock.calls[0][2];
    expect(updateData).not.toHaveProperty("responded_at");
  });

  it("returns 404 when not found", async () => {
    authed();
    mockSupabase({
      update: vi.fn().mockResolvedValue([]),
    });

    const req = makeReq("http://localhost/api/v1/approvals/nonexistent", {
      method: "PATCH",
      body: { status: "approved" },
    });

    const res = await PATCH(req, {
      params: Promise.resolve({ id: "nonexistent" }),
    });

    expect(res.status).toBe(404);
    const data = await json(res);
    expect(data.error).toContain("not found");
  });

  it("returns 400 for invalid status value", async () => {
    authed();
    mockSupabase();

    const req = makeReq("http://localhost/api/v1/approvals/apr-1", {
      method: "PATCH",
      body: { status: "invalid_status" },
    });

    const res = await PATCH(req, {
      params: Promise.resolve({ id: "apr-1" }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 401 for auth error", async () => {
    authFails();
    mockSupabase();

    const req = makeReq("http://localhost/api/v1/approvals/apr-1", {
      method: "PATCH",
      body: { status: "approved" },
    });

    const res = await PATCH(req, {
      params: Promise.resolve({ id: "apr-1" }),
    });

    expect(res.status).toBe(401);
  });

  it("includes final_tx_hash when provided", async () => {
    authed();
    const sb = mockSupabase({
      update: vi.fn().mockResolvedValue([
        { id: "apr-1", status: "approved", final_tx_hash: "0xabc123" },
      ]),
    });

    const req = makeReq("http://localhost/api/v1/approvals/apr-1", {
      method: "PATCH",
      body: { status: "approved", final_tx_hash: "0xabc123" },
    });

    const res = await PATCH(req, {
      params: Promise.resolve({ id: "apr-1" }),
    });

    expect(res.status).toBe(200);

    const updateData = vi.mocked(sb.update).mock.calls[0][2];
    expect(updateData.final_tx_hash).toBe("0xabc123");
    expect(updateData).toHaveProperty("responded_at");
  });
});
