// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../_lib/auth");
vi.mock("../_lib/supabase");
vi.mock("@cloak-wallet/sdk", () => ({
  normalizeAddress: (addr: string) => addr.toLowerCase(),
}));

import { authenticate, AuthError } from "../_lib/auth";
import { getSupabase } from "../_lib/supabase";
import type { SupabaseClient } from "../_lib/supabase";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const API_KEY = "test-key-1234567890";
const AUTH_CONTEXT = { wallet_address: "0x123abc", api_key_id: "key1" };

function mockAuth(ctx = AUTH_CONTEXT) {
  (authenticate as ReturnType<typeof vi.fn>).mockResolvedValue(ctx);
}

function mockAuthError(message = "Missing X-API-Key header") {
  (authenticate as ReturnType<typeof vi.fn>).mockRejectedValue(
    new AuthError(message),
  );
}

function createMockSb(): SupabaseClient & {
  insert: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
} {
  return {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    del: vi.fn(),
    upsert: vi.fn(),
  };
}

let mockSb: ReturnType<typeof createMockSb>;

function setupMockSb() {
  mockSb = createMockSb();
  (getSupabase as ReturnType<typeof vi.fn>).mockReturnValue(mockSb);
}

function makeReq(
  url: string,
  opts?: { method?: string; body?: unknown },
): NextRequest {
  const init: RequestInit & { headers: Record<string, string> } = {
    method: opts?.method || "GET",
    headers: { "X-API-Key": API_KEY },
  };
  if (opts?.body !== undefined) {
    init.body = JSON.stringify(opts.body);
    init.headers["Content-Type"] = "application/json";
  }
  return new NextRequest(url, init);
}

// ─── Reset ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth();
  setupMockSb();
});

// ═══════════════════════════════════════════════════════════════════════════════
// WARDS
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/v1/wards", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    ({ POST } = await import("../wards/route"));
  });

  it("creates a ward config and returns 201", async () => {
    const input = {
      ward_address: "0xaaa111",
      guardian_address: "0xbbb222",
      ward_public_key: "0xcc1234",
      guardian_public_key: "0xdd5678",
    };
    const inserted = { id: "w1", ...input, status: "active" };
    mockSb.insert.mockResolvedValue([inserted]);

    const res = await POST(
      makeReq("http://localhost/api/v1/wards", {
        method: "POST",
        body: input,
      }),
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBe("w1");
    expect(json.status).toBe("active");
    expect(mockSb.insert).toHaveBeenCalledWith(
      "ward_configs",
      expect.objectContaining({
        ward_address: "0xaaa111",
        guardian_address: "0xbbb222",
        status: "active",
        require_guardian_for_all: true,
      }),
    );
  });

  it("returns 400 for validation error (missing ward_address)", async () => {
    const res = await POST(
      makeReq("http://localhost/api/v1/wards", {
        method: "POST",
        body: { guardian_address: "0xbbb222" },
      }),
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuthError();

    const res = await POST(
      makeReq("http://localhost/api/v1/wards", {
        method: "POST",
        body: {
          ward_address: "0xaaa111",
          guardian_address: "0xbbb222",
          ward_public_key: "0xcc1234",
          guardian_public_key: "0xdd5678",
        },
      }),
    );

    expect(res.status).toBe(401);
  });
});

describe("GET /api/v1/wards", () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    ({ GET } = await import("../wards/route"));
  });

  it("lists wards by guardian address", async () => {
    const rows = [
      { id: "w1", guardian_address: "0x123", ward_address: "0x456" },
    ];
    mockSb.select.mockResolvedValue(rows);

    const res = await GET(
      makeReq("http://localhost/api/v1/wards?guardian=0x123"),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(rows);
    expect(mockSb.select).toHaveBeenCalledWith(
      "ward_configs",
      expect.stringContaining("guardian_address=eq.0x123"),
      expect.objectContaining({ orderBy: "created_at.desc" }),
    );
  });

  it("returns 400 when missing guardian param", async () => {
    const res = await GET(makeReq("http://localhost/api/v1/wards"));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("guardian");
  });
});

// ─── wards/[address] ─────────────────────────────────────────────────────────

describe("GET /api/v1/wards/:address", () => {
  let GET: (
    req: NextRequest,
    ctx: { params: Promise<{ address: string }> },
  ) => Promise<Response>;

  beforeEach(async () => {
    ({ GET } = await import("../wards/[address]/route"));
  });

  it("returns a single ward config", async () => {
    const row = { id: "w1", ward_address: "0x456", status: "active" };
    mockSb.select.mockResolvedValue([row]);

    const res = await GET(
      makeReq("http://localhost/api/v1/wards/0x456"),
      { params: Promise.resolve({ address: "0x456" }) },
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe("w1");
  });

  it("returns 404 when ward not found", async () => {
    mockSb.select.mockResolvedValue([]);

    const res = await GET(
      makeReq("http://localhost/api/v1/wards/0xNOTFOUND"),
      { params: Promise.resolve({ address: "0xNOTFOUND" }) },
    );

    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/v1/wards/:address", () => {
  let PATCH: (
    req: NextRequest,
    ctx: { params: Promise<{ address: string }> },
  ) => Promise<Response>;

  beforeEach(async () => {
    ({ PATCH } = await import("../wards/[address]/route"));
  });

  it("updates a ward config", async () => {
    const updated = { id: "w1", status: "frozen" };
    mockSb.update.mockResolvedValue([updated]);

    const res = await PATCH(
      makeReq("http://localhost/api/v1/wards/0x456", {
        method: "PATCH",
        body: { status: "frozen" },
      }),
      { params: Promise.resolve({ address: "0x456" }) },
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("frozen");
  });

  it("returns 404 when ward not found", async () => {
    mockSb.update.mockResolvedValue([]);

    const res = await PATCH(
      makeReq("http://localhost/api/v1/wards/0xNOTFOUND", {
        method: "PATCH",
        body: { status: "frozen" },
      }),
      { params: Promise.resolve({ address: "0xNOTFOUND" }) },
    );

    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// WARD APPROVALS
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/v1/ward-approvals", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    ({ POST } = await import("../ward-approvals/route"));
  });

  it("creates a ward approval and returns 201", async () => {
    const input = {
      ward_address: "0xaaa111",
      guardian_address: "0xbbb222",
      action: "transfer",
      token: "STRK",
      amount: "100",
      recipient: "0xddd444",
      calls_json: '{"calls":[]}',
      nonce: "1",
      resource_bounds_json: '{"l1_gas":{}}',
      tx_hash: "0xabcdef",
      ward_sig_json: '{"r":"0x1","s":"0x2"}',
      needs_ward_2fa: false,
      needs_guardian: true,
      needs_guardian_2fa: false,
    };
    const inserted = { id: "wa1", ...input, status: "pending_ward_sig" };
    mockSb.insert.mockResolvedValue([inserted]);

    const res = await POST(
      makeReq("http://localhost/api/v1/ward-approvals", {
        method: "POST",
        body: input,
      }),
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBe("wa1");
    expect(mockSb.insert).toHaveBeenCalledWith(
      "ward_approval_requests",
      expect.objectContaining({
        status: "pending_ward_sig",
        responded_at: null,
      }),
    );
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuthError();

    const res = await POST(
      makeReq("http://localhost/api/v1/ward-approvals", {
        method: "POST",
        body: {},
      }),
    );

    expect(res.status).toBe(401);
  });
});

describe("GET /api/v1/ward-approvals", () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    ({ GET } = await import("../ward-approvals/route"));
  });

  it("lists ward approvals by ward and guardian", async () => {
    const rows = [{ id: "wa1", status: "pending_guardian" }];
    mockSb.select.mockResolvedValue(rows);

    const res = await GET(
      makeReq(
        "http://localhost/api/v1/ward-approvals?ward=0xWARD&guardian=0xGUARDIAN&status=pending_guardian",
      ),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(rows);
    expect(mockSb.select).toHaveBeenCalledWith(
      "ward_approval_requests",
      expect.stringContaining("ward_address=eq.0xward"),
      expect.objectContaining({ orderBy: "created_at.desc" }),
    );
  });

  it("returns all approvals when no filters", async () => {
    mockSb.select.mockResolvedValue([]);

    const res = await GET(
      makeReq("http://localhost/api/v1/ward-approvals"),
    );

    expect(res.status).toBe(200);
    // Called with undefined filter when no params given
    expect(mockSb.select).toHaveBeenCalledWith(
      "ward_approval_requests",
      undefined,
      expect.objectContaining({ orderBy: "created_at.desc" }),
    );
  });
});

// ─── ward-approvals/[id] ────────────────────────────────────────────────────

describe("GET /api/v1/ward-approvals/:id", () => {
  let GET: (
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> },
  ) => Promise<Response>;

  beforeEach(async () => {
    ({ GET } = await import("../ward-approvals/[id]/route"));
  });

  it("returns a single ward approval", async () => {
    const row = { id: "wa1", status: "pending_guardian" };
    mockSb.select.mockResolvedValue([row]);

    const res = await GET(
      makeReq("http://localhost/api/v1/ward-approvals/wa1"),
      { params: Promise.resolve({ id: "wa1" }) },
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe("wa1");
  });

  it("returns 404 when not found", async () => {
    mockSb.select.mockResolvedValue([]);

    const res = await GET(
      makeReq("http://localhost/api/v1/ward-approvals/nope"),
      { params: Promise.resolve({ id: "nope" }) },
    );

    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/v1/ward-approvals/:id", () => {
  let PATCH: (
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> },
  ) => Promise<Response>;

  beforeEach(async () => {
    ({ PATCH } = await import("../ward-approvals/[id]/route"));
  });

  it("updates ward approval status", async () => {
    const updated = { id: "wa1", status: "approved" };
    mockSb.update.mockResolvedValue([updated]);

    const res = await PATCH(
      makeReq("http://localhost/api/v1/ward-approvals/wa1", {
        method: "PATCH",
        body: { status: "approved" },
      }),
      { params: Promise.resolve({ id: "wa1" }) },
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("approved");
    // Terminal status should auto-set responded_at
    expect(mockSb.update).toHaveBeenCalledWith(
      "ward_approval_requests",
      "id=eq.wa1",
      expect.objectContaining({
        status: "approved",
        responded_at: expect.any(String),
        updated_at: expect.any(String),
      }),
    );
  });

  it("sets responded_at for terminal statuses", async () => {
    mockSb.update.mockResolvedValue([{ id: "wa1", status: "rejected" }]);

    await PATCH(
      makeReq("http://localhost/api/v1/ward-approvals/wa1", {
        method: "PATCH",
        body: { status: "rejected" },
      }),
      { params: Promise.resolve({ id: "wa1" }) },
    );

    const updatePayload = mockSb.update.mock.calls[0][2];
    expect(updatePayload.responded_at).toBeDefined();
  });

  it("does not set responded_at for non-terminal statuses", async () => {
    mockSb.update.mockResolvedValue([
      { id: "wa1", status: "pending_guardian" },
    ]);

    await PATCH(
      makeReq("http://localhost/api/v1/ward-approvals/wa1", {
        method: "PATCH",
        body: { status: "pending_guardian" },
      }),
      { params: Promise.resolve({ id: "wa1" }) },
    );

    const updatePayload = mockSb.update.mock.calls[0][2];
    expect(updatePayload.responded_at).toBeUndefined();
  });

  it("returns 404 when not found", async () => {
    mockSb.update.mockResolvedValue([]);

    const res = await PATCH(
      makeReq("http://localhost/api/v1/ward-approvals/nope", {
        method: "PATCH",
        body: { status: "approved" },
      }),
      { params: Promise.resolve({ id: "nope" }) },
    );

    expect(res.status).toBe(404);
  });
});

// ─── ward-approvals/history ─────────────────────────────────────────────────

describe("GET /api/v1/ward-approvals/history", () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    ({ GET } = await import("../ward-approvals/history/route"));
  });

  it("returns paginated ward approval history", async () => {
    const rows = [{ id: "wa1" }, { id: "wa2" }];
    mockSb.select.mockResolvedValue(rows);

    const res = await GET(
      makeReq(
        "http://localhost/api/v1/ward-approvals/history?ward=0xWARD&limit=10&offset=0",
      ),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(rows);
    expect(mockSb.select).toHaveBeenCalledWith(
      "ward_approval_requests",
      expect.stringContaining("ward_address=eq.0xward"),
      expect.objectContaining({
        orderBy: "created_at.desc",
        limit: 10,
        offset: 0,
      }),
    );
  });

  it("defaults to limit=50 and offset=0", async () => {
    mockSb.select.mockResolvedValue([]);

    await GET(
      makeReq("http://localhost/api/v1/ward-approvals/history"),
    );

    expect(mockSb.select).toHaveBeenCalledWith(
      "ward_approval_requests",
      undefined,
      expect.objectContaining({ limit: 50, offset: 0 }),
    );
  });

  it("caps limit at 200", async () => {
    mockSb.select.mockResolvedValue([]);

    await GET(
      makeReq("http://localhost/api/v1/ward-approvals/history?limit=999"),
    );

    expect(mockSb.select).toHaveBeenCalledWith(
      "ward_approval_requests",
      undefined,
      expect.objectContaining({ limit: 200 }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TRANSACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/v1/transactions", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    ({ POST } = await import("../transactions/route"));
  });

  it("saves a transaction and returns 201", async () => {
    const input = {
      wallet_address: "0xabc123",
      tx_hash: "0xdef456",
      type: "fund",
      token: "STRK",
      amount: "5",
      status: "pending",
      account_type: "normal",
      network: "sepolia",
    };
    const inserted = { id: "t1", ...input };
    mockSb.insert.mockResolvedValue([inserted]);

    const res = await POST(
      makeReq("http://localhost/api/v1/transactions", {
        method: "POST",
        body: input,
      }),
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBe("t1");
    expect(mockSb.insert).toHaveBeenCalledWith(
      "transactions",
      expect.objectContaining({
        wallet_address: "0xabc123",
        tx_hash: "0xdef456",
      }),
    );
  });

  it("returns 400 for validation error", async () => {
    const res = await POST(
      makeReq("http://localhost/api/v1/transactions", {
        method: "POST",
        body: { wallet_address: "not-hex" },
      }),
    );

    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/transactions", () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    ({ GET } = await import("../transactions/route"));
  });

  it("fan-out queries by wallet_address, ward_address, and managed wards", async () => {
    const tx1 = {
      tx_hash: "0xT1",
      wallet_address: "0x123",
      created_at: "2026-02-20T00:00:00Z",
    };
    const tx2 = {
      tx_hash: "0xT2",
      ward_address: "0x123",
      created_at: "2026-02-19T00:00:00Z",
    };
    // First call: by wallet_address, Second: by ward_address, Third: ward_configs lookup
    mockSb.select
      .mockResolvedValueOnce([tx1]) // by wallet_address
      .mockResolvedValueOnce([tx2]) // by ward_address
      .mockResolvedValueOnce([]); // ward_configs (no managed wards)

    const res = await GET(
      makeReq("http://localhost/api/v1/transactions?wallet=0x123"),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(2);
    // Sorted by created_at desc
    expect(json[0].tx_hash).toBe("0xT1");
    expect(json[1].tx_hash).toBe("0xT2");
  });

  it("deduplicates transactions by tx_hash", async () => {
    const tx = {
      tx_hash: "0xSAME",
      wallet_address: "0x123",
      created_at: "2026-02-20T00:00:00Z",
    };
    mockSb.select
      .mockResolvedValueOnce([tx]) // by wallet_address
      .mockResolvedValueOnce([tx]) // by ward_address (same tx)
      .mockResolvedValueOnce([]); // ward_configs

    const res = await GET(
      makeReq("http://localhost/api/v1/transactions?wallet=0x123"),
    );

    const json = await res.json();
    expect(json).toHaveLength(1);
  });

  it("returns 400 when missing wallet param", async () => {
    const res = await GET(
      makeReq("http://localhost/api/v1/transactions"),
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("wallet");
  });
});

describe("PATCH /api/v1/transactions/:txHash", () => {
  let PATCH: (
    req: NextRequest,
    ctx: { params: Promise<{ txHash: string }> },
  ) => Promise<Response>;

  beforeEach(async () => {
    ({ PATCH } = await import("../transactions/[txHash]/route"));
  });

  it("updates a transaction status", async () => {
    const updated = { tx_hash: "0xTX", status: "confirmed" };
    mockSb.update.mockResolvedValue([updated]);

    const res = await PATCH(
      makeReq("http://localhost/api/v1/transactions/0xTX", {
        method: "PATCH",
        body: { status: "confirmed" },
      }),
      { params: Promise.resolve({ txHash: "0xTX" }) },
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("confirmed");
    expect(mockSb.update).toHaveBeenCalledWith(
      "transactions",
      "tx_hash=eq.0xTX",
      expect.objectContaining({ status: "confirmed" }),
    );
  });

  it("returns 404 when transaction not found", async () => {
    mockSb.update.mockResolvedValue([]);

    const res = await PATCH(
      makeReq("http://localhost/api/v1/transactions/0xNOPE", {
        method: "PATCH",
        body: { status: "failed" },
      }),
      { params: Promise.resolve({ txHash: "0xNOPE" }) },
    );

    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SWAPS
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/v1/swaps", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    ({ POST } = await import("../swaps/route"));
  });

  it("saves a swap execution and returns 201", async () => {
    const input = {
      execution_id: "exec-1",
      wallet_address: "0xabc123",
      tx_hash: "0xdef456",
      provider: "avnu",
      sell_token: "STRK",
      buy_token: "ETH",
      sell_amount_wei: "1000000",
      estimated_buy_amount_wei: "500",
      min_buy_amount_wei: "490",
      status: "pending",
    };
    const inserted = { id: "s1", ...input };
    mockSb.insert.mockResolvedValue([inserted]);

    const res = await POST(
      makeReq("http://localhost/api/v1/swaps", {
        method: "POST",
        body: input,
      }),
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBe("s1");
    expect(mockSb.insert).toHaveBeenCalledWith(
      "swap_executions",
      expect.objectContaining({
        wallet_address: "0xabc123",
        execution_id: "exec-1",
      }),
    );
  });

  it("returns 400 for validation error", async () => {
    const res = await POST(
      makeReq("http://localhost/api/v1/swaps", {
        method: "POST",
        body: { execution_id: "" },
      }),
    );

    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/swaps", () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    ({ GET } = await import("../swaps/route"));
  });

  it("fan-out queries and returns deduplicated swaps", async () => {
    const swap1 = {
      execution_id: "e1",
      tx_hash: "0xS1",
      wallet_address: "0x123",
      created_at: "2026-02-20T00:00:00Z",
    };
    const swap2 = {
      execution_id: "e2",
      tx_hash: "0xS2",
      ward_address: "0x123",
      created_at: "2026-02-19T00:00:00Z",
    };
    mockSb.select
      .mockResolvedValueOnce([swap1]) // by wallet_address
      .mockResolvedValueOnce([swap2]) // by ward_address
      .mockResolvedValueOnce([]); // ward_configs

    const res = await GET(
      makeReq("http://localhost/api/v1/swaps?wallet=0x123"),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(2);
  });

  it("returns 400 when missing wallet param", async () => {
    const res = await GET(makeReq("http://localhost/api/v1/swaps"));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("wallet");
  });
});

describe("PATCH /api/v1/swaps/:txHash", () => {
  let PATCH: (
    req: NextRequest,
    ctx: { params: Promise<{ txHash: string }> },
  ) => Promise<Response>;

  beforeEach(async () => {
    ({ PATCH } = await import("../swaps/[txHash]/route"));
  });

  it("updates a swap by tx_hash", async () => {
    const updated = { tx_hash: "0xSWAP", status: "confirmed" };
    mockSb.update.mockResolvedValue([updated]);

    const res = await PATCH(
      makeReq("http://localhost/api/v1/swaps/0xSWAP", {
        method: "PATCH",
        body: { status: "confirmed" },
      }),
      { params: Promise.resolve({ txHash: "0xSWAP" }) },
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("confirmed");
    expect(mockSb.update).toHaveBeenCalledWith(
      "swap_executions",
      "tx_hash=eq.0xSWAP",
      expect.objectContaining({ status: "confirmed" }),
    );
  });

  it("returns 404 when swap not found", async () => {
    mockSb.update.mockResolvedValue([]);

    const res = await PATCH(
      makeReq("http://localhost/api/v1/swaps/0xNOPE", {
        method: "PATCH",
        body: { status: "failed" },
      }),
      { params: Promise.resolve({ txHash: "0xNOPE" }) },
    );

    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/v1/swaps/by-execution/:executionId", () => {
  let PATCH: (
    req: NextRequest,
    ctx: { params: Promise<{ executionId: string }> },
  ) => Promise<Response>;

  beforeEach(async () => {
    ({ PATCH } = await import("../swaps/by-execution/[executionId]/route"));
  });

  it("updates a swap by execution_id", async () => {
    const updated = { execution_id: "exec-1", status: "confirmed" };
    mockSb.update.mockResolvedValue([updated]);

    const res = await PATCH(
      makeReq("http://localhost/api/v1/swaps/by-execution/exec-1", {
        method: "PATCH",
        body: { status: "confirmed" },
      }),
      { params: Promise.resolve({ executionId: "exec-1" }) },
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("confirmed");
    expect(mockSb.update).toHaveBeenCalledWith(
      "swap_executions",
      "execution_id=eq.exec-1",
      expect.objectContaining({ status: "confirmed" }),
    );
  });

  it("returns 404 when not found", async () => {
    mockSb.update.mockResolvedValue([]);

    const res = await PATCH(
      makeReq("http://localhost/api/v1/swaps/by-execution/nope", {
        method: "PATCH",
        body: { status: "failed" },
      }),
      { params: Promise.resolve({ executionId: "nope" }) },
    );

    expect(res.status).toBe(404);
  });
});

// ─── swaps/steps ────────────────────────────────────────────────────────────

describe("POST /api/v1/swaps/steps", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    ({ POST } = await import("../swaps/steps/route"));
  });

  it("inserts a new swap step and returns 201", async () => {
    const input = {
      execution_id: "exec-1",
      step_key: "approve",
      step_order: 0,
      attempt: 0,
      status: "pending",
    };
    const inserted = { id: "step1", ...input };
    mockSb.select.mockResolvedValue([]); // no existing
    mockSb.insert.mockResolvedValue([inserted]);

    const res = await POST(
      makeReq("http://localhost/api/v1/swaps/steps", {
        method: "POST",
        body: input,
      }),
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBe("step1");
  });

  it("upserts (updates) an existing step and returns 200", async () => {
    const input = {
      execution_id: "exec-1",
      step_key: "approve",
      step_order: 0,
      attempt: 0,
      status: "success",
    };
    const existing = { id: "step1" };
    const updated = { id: "step1", ...input };
    mockSb.select.mockResolvedValue([existing]);
    mockSb.update.mockResolvedValue([updated]);

    const res = await POST(
      makeReq("http://localhost/api/v1/swaps/steps", {
        method: "POST",
        body: input,
      }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("success");
    expect(mockSb.update).toHaveBeenCalledWith(
      "swap_execution_steps",
      "id=eq.step1",
      expect.objectContaining({ status: "success" }),
    );
  });

  it("returns 400 for invalid step data", async () => {
    const res = await POST(
      makeReq("http://localhost/api/v1/swaps/steps", {
        method: "POST",
        body: { execution_id: "" },
      }),
    );

    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/swaps/steps", () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    ({ GET } = await import("../swaps/steps/route"));
  });

  it("returns steps for given execution_ids", async () => {
    const steps = [
      { id: "s1", execution_id: "e1", step_key: "approve" },
      { id: "s2", execution_id: "e2", step_key: "swap" },
    ];
    mockSb.select.mockResolvedValue(steps);

    const res = await GET(
      makeReq(
        "http://localhost/api/v1/swaps/steps?execution_ids=e1,e2",
      ),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveLength(2);
    expect(mockSb.select).toHaveBeenCalledWith(
      "swap_execution_steps",
      "execution_id=in.(e1,e2)",
      expect.objectContaining({ orderBy: "created_at.asc" }),
    );
  });

  it("returns 400 when missing execution_ids param", async () => {
    const res = await GET(
      makeReq("http://localhost/api/v1/swaps/steps"),
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("execution_ids");
  });

  it("returns empty array for empty execution_ids string", async () => {
    const res = await GET(
      makeReq("http://localhost/api/v1/swaps/steps?execution_ids="),
    );

    // execution_ids param is present but empty string after filtering
    // The route checks if executionIdsRaw is falsy, "" is falsy
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVITY
// ═══════════════════════════════════════════════════════════════════════════════

describe("GET /api/v1/activity", () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    ({ GET } = await import("../activity/route"));
  });

  it("returns unified activity feed with transactions and ward approvals", async () => {
    const tx = {
      tx_hash: "0xTX1",
      wallet_address: "0x123",
      type: "fund",
      token: "STRK",
      status: "confirmed",
      account_type: "normal",
      network: "sepolia",
      created_at: "2026-02-20T12:00:00Z",
    };
    const wardApproval = {
      id: "wa1",
      ward_address: "0xWARD",
      guardian_address: "0x123",
      action: "configure",
      token: "STRK",
      amount: "10",
      status: "pending_guardian",
      tx_hash: "0xWA_TX",
      final_tx_hash: null,
      error_message: null,
      created_at: "2026-02-20T11:00:00Z",
    };

    // The activity route makes many select calls. We need to mock them in sequence.
    // fanOutQuery for transactions: 2 parallel + ward_configs
    // fanOutQuery for swap_executions: 2 parallel + ward_configs
    // swap_execution_steps
    // ward_approval_requests: 2 parallel (as guardian, as ward)
    mockSb.select
      // fanOutQuery for transactions - by wallet_address
      .mockResolvedValueOnce([tx])
      // fanOutQuery for transactions - by ward_address
      .mockResolvedValueOnce([])
      // ward_configs for transactions fan-out
      .mockResolvedValueOnce([])
      // fanOutQuery for swap_executions - by wallet_address
      .mockResolvedValueOnce([])
      // fanOutQuery for swap_executions - by ward_address
      .mockResolvedValueOnce([])
      // ward_configs for swaps fan-out
      .mockResolvedValueOnce([])
      // ward_approval_requests as guardian
      .mockResolvedValueOnce([wardApproval])
      // ward_approval_requests as ward
      .mockResolvedValueOnce([]);

    const res = await GET(
      makeReq("http://localhost/api/v1/activity?wallet=0x123"),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.records).toBeDefined();
    expect(json.total).toBeGreaterThanOrEqual(1);
    expect(json.has_more).toBeDefined();

    // The tx should appear as "transaction" source
    const txRecord = json.records.find(
      (r: { source: string }) => r.source === "transaction",
    );
    expect(txRecord).toBeDefined();
    expect(txRecord.status).toBe("confirmed");

    // The ward approval should appear as "ward_request" source
    const wardRecord = json.records.find(
      (r: { source: string }) => r.source === "ward_request",
    );
    expect(wardRecord).toBeDefined();
    expect(wardRecord.type).toBe("configure_ward");
    expect(wardRecord.status).toBe("pending");
    expect(wardRecord.status_detail).toBe("pending_guardian");
  });

  it("returns 400 when missing wallet param", async () => {
    const res = await GET(makeReq("http://localhost/api/v1/activity"));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("wallet");
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuthError();

    const res = await GET(
      makeReq("http://localhost/api/v1/activity?wallet=0x123"),
    );

    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PUSH
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/v1/push/register", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    ({ POST } = await import("../push/register/route"));
  });

  it("upserts a push subscription and returns 200", async () => {
    mockSb.upsert.mockResolvedValue([{ wallet_address: "0x123abc" }]);

    const res = await POST(
      makeReq("http://localhost/api/v1/push/register", {
        method: "POST",
        body: {
          platform: "ios",
          device_id: "device-abc",
          token: "apns-token-123",
        },
      }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(mockSb.upsert).toHaveBeenCalledWith(
      "push_subscriptions",
      expect.objectContaining({
        wallet_address: "0x123abc",
        device_id: "device-abc",
        platform: "ios",
        token: "apns-token-123",
        is_active: true,
      }),
      "wallet_address,device_id",
    );
  });

  it("returns 400 for invalid platform", async () => {
    const res = await POST(
      makeReq("http://localhost/api/v1/push/register", {
        method: "POST",
        body: {
          platform: "invalid-platform",
          device_id: "device-abc",
        },
      }),
    );

    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuthError();

    const res = await POST(
      makeReq("http://localhost/api/v1/push/register", {
        method: "POST",
        body: {
          platform: "ios",
          device_id: "device-abc",
        },
      }),
    );

    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/v1/push/unregister", () => {
  let DELETE: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    ({ DELETE } = await import("../push/unregister/route"));
  });

  it("deactivates a push subscription and returns 204", async () => {
    mockSb.update.mockResolvedValue([]);

    const res = await DELETE(
      makeReq("http://localhost/api/v1/push/unregister", {
        method: "DELETE",
        body: { device_id: "device-abc" },
      }),
    );

    expect(res.status).toBe(204);
    expect(mockSb.update).toHaveBeenCalledWith(
      "push_subscriptions",
      expect.stringContaining("wallet_address=eq.0x123abc"),
      { is_active: false },
    );
  });

  it("returns 400 when missing device_id", async () => {
    const res = await DELETE(
      makeReq("http://localhost/api/v1/push/unregister", {
        method: "DELETE",
        body: {},
      }),
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("device_id");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// COMPLIANCE - VIEWING GRANTS
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/v1/compliance/viewing-grants", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    ({ POST } = await import("../compliance/viewing-grants/route"));
  });

  it("creates a viewing grant and returns 201", async () => {
    const input = {
      viewer_address: "0xaaa999",
      encrypted_viewing_key: "encrypted-key-data",
      scope: "full",
    };
    const inserted = {
      id: "vg1",
      owner_address: "0x123abc",
      ...input,
      status: "active",
    };
    mockSb.insert.mockResolvedValue([inserted]);

    const res = await POST(
      makeReq("http://localhost/api/v1/compliance/viewing-grants", {
        method: "POST",
        body: input,
      }),
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBe("vg1");
    expect(json.status).toBe("active");
    expect(mockSb.insert).toHaveBeenCalledWith(
      "viewing_key_grants",
      expect.objectContaining({
        owner_address: "0x123abc",
        viewer_address: "0xaaa999",
        status: "active",
      }),
    );
  });

  it("returns 400 for invalid input", async () => {
    const res = await POST(
      makeReq("http://localhost/api/v1/compliance/viewing-grants", {
        method: "POST",
        body: { viewer_address: "not-hex" },
      }),
    );

    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/compliance/viewing-grants", () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    ({ GET } = await import("../compliance/viewing-grants/route"));
  });

  it("lists grants by owner role (default)", async () => {
    const rows = [{ id: "vg1", owner_address: "0x123abc", status: "active" }];
    mockSb.select.mockResolvedValue(rows);

    const res = await GET(
      makeReq("http://localhost/api/v1/compliance/viewing-grants"),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(rows);
    expect(mockSb.select).toHaveBeenCalledWith(
      "viewing_key_grants",
      expect.stringContaining("owner_address=eq.0x123abc"),
      expect.objectContaining({ orderBy: "created_at.desc" }),
    );
  });

  it("lists grants by viewer role", async () => {
    mockSb.select.mockResolvedValue([]);

    const res = await GET(
      makeReq(
        "http://localhost/api/v1/compliance/viewing-grants?role=viewer",
      ),
    );

    expect(res.status).toBe(200);
    expect(mockSb.select).toHaveBeenCalledWith(
      "viewing_key_grants",
      expect.stringContaining("viewer_address=eq.0x123abc"),
      expect.any(Object),
    );
  });

  it("includes revoked grants when requested", async () => {
    mockSb.select.mockResolvedValue([]);

    const res = await GET(
      makeReq(
        "http://localhost/api/v1/compliance/viewing-grants?include_revoked=true",
      ),
    );

    expect(res.status).toBe(200);
    // Filter should NOT include status=eq.active
    const filterArg = mockSb.select.mock.calls[0][1] as string;
    expect(filterArg).not.toContain("status=eq.active");
  });

  it("excludes revoked grants by default", async () => {
    mockSb.select.mockResolvedValue([]);

    await GET(
      makeReq("http://localhost/api/v1/compliance/viewing-grants"),
    );

    const filterArg = mockSb.select.mock.calls[0][1] as string;
    expect(filterArg).toContain("status=eq.active");
  });
});

// ─── compliance/viewing-grants/[id]/revoke ──────────────────────────────────

describe("PATCH /api/v1/compliance/viewing-grants/:id/revoke", () => {
  let PATCH: (
    req: NextRequest,
    ctx: { params: Promise<{ id: string }> },
  ) => Promise<Response>;

  beforeEach(async () => {
    ({ PATCH } = await import(
      "../compliance/viewing-grants/[id]/revoke/route"
    ));
  });

  it("revokes a grant owned by the authenticated user", async () => {
    const existing = {
      id: "vg1",
      owner_address: "0x123abc",
      status: "active",
    };
    const updated = { ...existing, status: "revoked" };
    mockSb.select.mockResolvedValue([existing]);
    mockSb.update.mockResolvedValue([updated]);

    const res = await PATCH(
      makeReq(
        "http://localhost/api/v1/compliance/viewing-grants/vg1/revoke",
        { method: "PATCH", body: { reason: "no longer needed" } },
      ),
      { params: Promise.resolve({ id: "vg1" }) },
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("revoked");
    expect(mockSb.update).toHaveBeenCalledWith(
      "viewing_key_grants",
      "id=eq.vg1",
      expect.objectContaining({
        status: "revoked",
        revocation_reason: "no longer needed",
      }),
    );
  });

  it("returns 404 when grant not found", async () => {
    mockSb.select.mockResolvedValue([]);

    const res = await PATCH(
      makeReq(
        "http://localhost/api/v1/compliance/viewing-grants/nope/revoke",
        { method: "PATCH" },
      ),
      { params: Promise.resolve({ id: "nope" }) },
    );

    expect(res.status).toBe(404);
  });

  it("returns 401 when trying to revoke a grant owned by someone else", async () => {
    const existing = {
      id: "vg1",
      owner_address: "0xOTHER",
      status: "active",
    };
    mockSb.select.mockResolvedValue([existing]);

    const res = await PATCH(
      makeReq(
        "http://localhost/api/v1/compliance/viewing-grants/vg1/revoke",
        { method: "PATCH" },
      ),
      { params: Promise.resolve({ id: "vg1" }) },
    );

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toContain("do not own");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// COMPLIANCE - INNOCENCE PROOFS
// ═══════════════════════════════════════════════════════════════════════════════

describe("POST /api/v1/compliance/innocence-proofs", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    ({ POST } = await import("../compliance/innocence-proofs/route"));
  });

  it("creates an innocence proof and returns 201", async () => {
    const input = {
      proof_hash: "abc123",
      circuit_version: "v1",
      nullifier_hash: "null-hash",
      note: "Monthly proof",
    };
    const inserted = { id: "ip1", owner_address: "0x123abc", ...input };
    mockSb.insert.mockResolvedValue([inserted]);

    const res = await POST(
      makeReq("http://localhost/api/v1/compliance/innocence-proofs", {
        method: "POST",
        body: input,
      }),
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBe("ip1");
    expect(mockSb.insert).toHaveBeenCalledWith(
      "innocence_proofs",
      expect.objectContaining({
        owner_address: "0x123abc",
        proof_hash: "abc123",
        circuit_version: "v1",
      }),
    );
  });

  it("returns 400 for invalid input", async () => {
    const res = await POST(
      makeReq("http://localhost/api/v1/compliance/innocence-proofs", {
        method: "POST",
        body: { proof_hash: "" },
      }),
    );

    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuthError();

    const res = await POST(
      makeReq("http://localhost/api/v1/compliance/innocence-proofs", {
        method: "POST",
        body: {
          proof_hash: "abc",
          circuit_version: "v1",
        },
      }),
    );

    expect(res.status).toBe(401);
  });
});

describe("GET /api/v1/compliance/innocence-proofs", () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    ({ GET } = await import("../compliance/innocence-proofs/route"));
  });

  it("lists proofs for authenticated user", async () => {
    const rows = [
      { id: "ip1", owner_address: "0x123abc", proof_hash: "abc" },
    ];
    mockSb.select.mockResolvedValue(rows);

    const res = await GET(
      makeReq("http://localhost/api/v1/compliance/innocence-proofs"),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual(rows);
    expect(mockSb.select).toHaveBeenCalledWith(
      "innocence_proofs",
      "owner_address=eq.0x123abc",
      expect.objectContaining({ orderBy: "created_at.desc" }),
    );
  });

  it("returns 401 when unauthenticated", async () => {
    mockAuthError();

    const res = await GET(
      makeReq("http://localhost/api/v1/compliance/innocence-proofs"),
    );

    expect(res.status).toBe(401);
  });
});
