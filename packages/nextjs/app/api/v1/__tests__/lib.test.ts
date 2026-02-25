// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─────────────────────────────────────────────────────────────────────────────
// 1. validation.ts
// ─────────────────────────────────────────────────────────────────────────────

import {
  AuthRegisterSchema,
  TwoFactorEnableSchema,
  CreateApprovalSchema,
  UpdateApprovalSchema,
  CreateWardConfigSchema,
  UpdateWardConfigSchema,
  CreateWardApprovalSchema,
  UpdateWardApprovalSchema,
  SaveTransactionSchema,
  UpdateTransactionSchema,
  SaveSwapSchema,
  UpdateSwapSchema,
  UpsertSwapStepSchema,
  PushRegisterSchema,
  CreateViewingGrantSchema,
  CreateInnocenceProofSchema,
  X402ChallengeSchema,
  X402PaymentPayloadSchema,
  X402VerifyRequestSchema,
  X402SettleRequestSchema,
  validate,
  ValidationError,
} from "../_lib/validation";

// ─────────────────────────────────────────────────────────────────────────────
// 2. errors.ts
// ─────────────────────────────────────────────────────────────────────────────

import {
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  serverError,
} from "../_lib/errors";

// ─────────────────────────────────────────────────────────────────────────────
// 3. auth.ts (mocked supabase)
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("../_lib/supabase", () => {
  const mockSelect = vi.fn();
  return {
    getSupabase: vi.fn(() => ({
      select: mockSelect,
      insert: vi.fn(),
      update: vi.fn(),
      del: vi.fn(),
      upsert: vi.fn(),
    })),
    __mockSelect: mockSelect,
  };
});

import { hashApiKey, authenticate, AuthError } from "../_lib/auth";
import { getSupabase } from "../_lib/supabase";

// Helper to grab the mock select fn
function getMockSelect() {
  // eslint-disable-next-line
  return (getSupabase as any)().__proto__ === undefined
    ? (getSupabase() as any).select
    : (getSupabase() as any).select;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: validation.ts
// ═══════════════════════════════════════════════════════════════════════════════

describe("validation.ts", () => {
  // ── validate() helper ────────────────────────────────────────────────────

  describe("validate()", () => {
    it("returns parsed data on success", () => {
      const input = { wallet_address: "0xabc123", public_key: "0xdef456" };
      const result = validate(AuthRegisterSchema, input);
      expect(result).toEqual(input);
    });

    it("throws ValidationError on failure", () => {
      expect(() => validate(AuthRegisterSchema, {})).toThrow(ValidationError);
    });

    it("ValidationError has name 'ValidationError'", () => {
      try {
        validate(AuthRegisterSchema, {});
        expect.fail("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        expect((e as ValidationError).name).toBe("ValidationError");
      }
    });

    it("ValidationError.response is a NextResponse with status 400", () => {
      try {
        validate(AuthRegisterSchema, {});
        expect.fail("should have thrown");
      } catch (e) {
        const err = e as ValidationError;
        expect(err.response.status).toBe(400);
      }
    });

    it("ValidationError.response body contains VALIDATION_ERROR code", async () => {
      try {
        validate(AuthRegisterSchema, {});
        expect.fail("should have thrown");
      } catch (e) {
        const err = e as ValidationError;
        const body = await err.response.json();
        expect(body.code).toBe("VALIDATION_ERROR");
        expect(body.error).toBeTruthy();
      }
    });

    it("error message includes field path", () => {
      try {
        validate(AuthRegisterSchema, { wallet_address: "bad" });
        expect.fail("should have thrown");
      } catch (e) {
        expect((e as ValidationError).message).toContain("wallet_address");
      }
    });
  });

  // ── AuthRegisterSchema ───────────────────────────────────────────────────

  describe("AuthRegisterSchema", () => {
    it("accepts valid input", () => {
      const result = AuthRegisterSchema.safeParse({
        wallet_address: "0x123abc",
        public_key: "0xdef456",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing wallet_address", () => {
      const result = AuthRegisterSchema.safeParse({ public_key: "0xabc" });
      expect(result.success).toBe(false);
    });

    it("rejects missing public_key", () => {
      const result = AuthRegisterSchema.safeParse({ wallet_address: "0xabc" });
      expect(result.success).toBe(false);
    });

    it("rejects wallet_address without 0x prefix", () => {
      const result = AuthRegisterSchema.safeParse({
        wallet_address: "abc123",
        public_key: "0xdef",
      });
      expect(result.success).toBe(false);
    });

    it("rejects wallet_address with non-hex chars", () => {
      const result = AuthRegisterSchema.safeParse({
        wallet_address: "0xGHIJKL",
        public_key: "0xdef",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty wallet_address (just 0x)", () => {
      const result = AuthRegisterSchema.safeParse({
        wallet_address: "0x",
        public_key: "0xdef",
      });
      expect(result.success).toBe(false);
    });
  });

  // ── TwoFactorEnableSchema ────────────────────────────────────────────────

  describe("TwoFactorEnableSchema", () => {
    it("accepts valid input", () => {
      const result = TwoFactorEnableSchema.safeParse({
        wallet_address: "0xaaa",
        secondary_public_key: "0xbbb",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing secondary_public_key", () => {
      const result = TwoFactorEnableSchema.safeParse({
        wallet_address: "0xaaa",
      });
      expect(result.success).toBe(false);
    });
  });

  // ── CreateApprovalSchema ─────────────────────────────────────────────────

  describe("CreateApprovalSchema", () => {
    const validApproval = {
      wallet_address: "0xabc",
      action: "transfer",
      token: "STRK",
      amount: null,
      recipient: null,
      calls_json: '{"calls":[]}',
      sig1_json: '{"r":"1","s":"2"}',
      nonce: "5",
      resource_bounds_json: '{"l1_gas":{}}',
      tx_hash: "0xdeadbeef",
    };

    it("accepts valid input", () => {
      const result = CreateApprovalSchema.safeParse(validApproval);
      expect(result.success).toBe(true);
    });

    it("rejects missing action", () => {
      const { action, ...rest } = validApproval;
      const result = CreateApprovalSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it("rejects empty calls_json", () => {
      const result = CreateApprovalSchema.safeParse({
        ...validApproval,
        calls_json: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects non-hex tx_hash", () => {
      const result = CreateApprovalSchema.safeParse({
        ...validApproval,
        tx_hash: "not-hex",
      });
      expect(result.success).toBe(false);
    });
  });

  // ── UpdateApprovalSchema ─────────────────────────────────────────────────

  describe("UpdateApprovalSchema", () => {
    it("accepts valid status", () => {
      const result = UpdateApprovalSchema.safeParse({ status: "approved" });
      expect(result.success).toBe(true);
    });

    it("accepts status with optional fields", () => {
      const result = UpdateApprovalSchema.safeParse({
        status: "failed",
        final_tx_hash: "0xabc",
        error_message: "timeout",
      });
      expect(result.success).toBe(true);
    });

    it("accepts null final_tx_hash", () => {
      const result = UpdateApprovalSchema.safeParse({
        status: "pending",
        final_tx_hash: null,
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid status enum", () => {
      const result = UpdateApprovalSchema.safeParse({
        status: "invalid_status",
      });
      expect(result.success).toBe(false);
    });

    it("rejects non-hex final_tx_hash", () => {
      const result = UpdateApprovalSchema.safeParse({
        status: "approved",
        final_tx_hash: "not-hex",
      });
      expect(result.success).toBe(false);
    });
  });

  // ── CreateWardConfigSchema ───────────────────────────────────────────────

  describe("CreateWardConfigSchema", () => {
    const validWardConfig = {
      ward_address: "0x111",
      guardian_address: "0x222",
      ward_public_key: "0x333",
      guardian_public_key: "0x444",
    };

    it("accepts valid input (required fields only)", () => {
      const result = CreateWardConfigSchema.safeParse(validWardConfig);
      expect(result.success).toBe(true);
    });

    it("accepts valid input with optional fields", () => {
      const result = CreateWardConfigSchema.safeParse({
        ...validWardConfig,
        spending_limit_per_tx: "1000",
        max_per_tx: "500",
        pseudo_name: "Kid",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing guardian_address", () => {
      const { guardian_address, ...rest } = validWardConfig;
      const result = CreateWardConfigSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it("rejects non-hex ward_address", () => {
      const result = CreateWardConfigSchema.safeParse({
        ...validWardConfig,
        ward_address: "nope",
      });
      expect(result.success).toBe(false);
    });
  });

  // ── UpdateWardConfigSchema ───────────────────────────────────────────────

  describe("UpdateWardConfigSchema", () => {
    it("accepts empty object (all optional)", () => {
      const result = UpdateWardConfigSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("accepts valid status", () => {
      const result = UpdateWardConfigSchema.safeParse({ status: "frozen" });
      expect(result.success).toBe(true);
    });

    it("rejects invalid ward status", () => {
      const result = UpdateWardConfigSchema.safeParse({ status: "deleted" });
      expect(result.success).toBe(false);
    });

    it("accepts boolean require_guardian_for_all", () => {
      const result = UpdateWardConfigSchema.safeParse({
        require_guardian_for_all: true,
      });
      expect(result.success).toBe(true);
    });
  });

  // ── CreateWardApprovalSchema ─────────────────────────────────────────────

  describe("CreateWardApprovalSchema", () => {
    const validWardApproval = {
      ward_address: "0xaaa",
      guardian_address: "0xbbb",
      action: "transfer",
      token: "ETH",
      amount: "100",
      recipient: "0xccc",
      calls_json: '{"calls":[]}',
      nonce: "1",
      resource_bounds_json: "{}",
      tx_hash: "0xddd",
      ward_sig_json: '{"r":"0","s":"0"}',
      needs_ward_2fa: false,
      needs_guardian: true,
      needs_guardian_2fa: false,
    };

    it("accepts valid input", () => {
      const result = CreateWardApprovalSchema.safeParse(validWardApproval);
      expect(result.success).toBe(true);
    });

    it("rejects missing needs_guardian (required boolean)", () => {
      const { needs_guardian, ...rest } = validWardApproval;
      const result = CreateWardApprovalSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it("accepts optional initial_status with valid enum", () => {
      const result = CreateWardApprovalSchema.safeParse({
        ...validWardApproval,
        initial_status: "pending_guardian",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid initial_status", () => {
      const result = CreateWardApprovalSchema.safeParse({
        ...validWardApproval,
        initial_status: "approved",
      });
      expect(result.success).toBe(false);
    });

    it("accepts null amount", () => {
      const result = CreateWardApprovalSchema.safeParse({
        ...validWardApproval,
        amount: null,
      });
      expect(result.success).toBe(true);
    });

    it("accepts optional amount_unit", () => {
      const result = CreateWardApprovalSchema.safeParse({
        ...validWardApproval,
        amount_unit: "erc20_wei",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid amount_unit", () => {
      const result = CreateWardApprovalSchema.safeParse({
        ...validWardApproval,
        amount_unit: "bitcoin",
      });
      expect(result.success).toBe(false);
    });
  });

  // ── UpdateWardApprovalSchema ─────────────────────────────────────────────

  describe("UpdateWardApprovalSchema", () => {
    it("accepts valid status", () => {
      const result = UpdateWardApprovalSchema.safeParse({
        status: "approved",
      });
      expect(result.success).toBe(true);
    });

    it("accepts gas_error status", () => {
      const result = UpdateWardApprovalSchema.safeParse({
        status: "gas_error",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid status", () => {
      const result = UpdateWardApprovalSchema.safeParse({
        status: "unknown",
      });
      expect(result.success).toBe(false);
    });

    it("accepts all optional sig fields", () => {
      const result = UpdateWardApprovalSchema.safeParse({
        status: "approved",
        ward_sig_json: "{}",
        ward_2fa_sig_json: "{}",
        guardian_sig_json: "{}",
        guardian_2fa_sig_json: "{}",
      });
      expect(result.success).toBe(true);
    });
  });

  // ── SaveTransactionSchema ────────────────────────────────────────────────

  describe("SaveTransactionSchema", () => {
    const validTx = {
      wallet_address: "0xabc",
      tx_hash: "0xdef",
      type: "transfer",
      token: "STRK",
      status: "pending",
      account_type: "normal",
      network: "sepolia",
    };

    it("accepts valid input (required fields)", () => {
      const result = SaveTransactionSchema.safeParse(validTx);
      expect(result.success).toBe(true);
    });

    it("accepts all optional fields", () => {
      const result = SaveTransactionSchema.safeParse({
        ...validTx,
        amount: "100",
        amount_unit: "tongo_units",
        recipient: "0x999",
        recipient_name: "Alice",
        note: "test payment",
        error_message: null,
        ward_address: "0x888",
        fee: "0.001",
        platform: "web",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid status enum", () => {
      const result = SaveTransactionSchema.safeParse({
        ...validTx,
        status: "completed",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid account_type enum", () => {
      const result = SaveTransactionSchema.safeParse({
        ...validTx,
        account_type: "admin",
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing network", () => {
      const { network, ...rest } = validTx;
      const result = SaveTransactionSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });
  });

  // ── UpdateTransactionSchema ──────────────────────────────────────────────

  describe("UpdateTransactionSchema", () => {
    it("accepts valid status", () => {
      const result = UpdateTransactionSchema.safeParse({ status: "confirmed" });
      expect(result.success).toBe(true);
    });

    it("accepts status with optional fields", () => {
      const result = UpdateTransactionSchema.safeParse({
        status: "failed",
        error_message: "reverted",
        fee: "0.01",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing status", () => {
      const result = UpdateTransactionSchema.safeParse({
        error_message: "test",
      });
      expect(result.success).toBe(false);
    });
  });

  // ── SaveSwapSchema ───────────────────────────────────────────────────────

  describe("SaveSwapSchema", () => {
    const validSwap = {
      execution_id: "swap-001",
      wallet_address: "0xabc",
      provider: "avnu",
      sell_token: "STRK",
      buy_token: "ETH",
      sell_amount_wei: "1000000",
      estimated_buy_amount_wei: "500",
      min_buy_amount_wei: "450",
      status: "pending",
    };

    it("accepts valid input", () => {
      const result = SaveSwapSchema.safeParse(validSwap);
      expect(result.success).toBe(true);
    });

    it("accepts all optional fields", () => {
      const result = SaveSwapSchema.safeParse({
        ...validSwap,
        ward_address: "0x999",
        tx_hash: "0xfff",
        primary_tx_hash: "0xeee",
        tx_hashes: ["0xaaa", "0xbbb"],
        buy_actual_amount_wei: "510",
        failure_step_key: null,
        failure_reason: null,
        route_meta: { steps: 2 },
        error_message: null,
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty execution_id", () => {
      const result = SaveSwapSchema.safeParse({
        ...validSwap,
        execution_id: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid swap status", () => {
      const result = SaveSwapSchema.safeParse({
        ...validSwap,
        status: "cancelled",
      });
      expect(result.success).toBe(false);
    });
  });

  // ── UpdateSwapSchema ─────────────────────────────────────────────────────

  describe("UpdateSwapSchema", () => {
    it("accepts empty object (all optional)", () => {
      const result = UpdateSwapSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("accepts valid status update", () => {
      const result = UpdateSwapSchema.safeParse({ status: "confirmed" });
      expect(result.success).toBe(true);
    });

    it("rejects invalid status", () => {
      const result = UpdateSwapSchema.safeParse({ status: "aborted" });
      expect(result.success).toBe(false);
    });

    it("accepts tx_hashes array", () => {
      const result = UpdateSwapSchema.safeParse({
        tx_hashes: ["0xaaa", "0xbbb"],
      });
      expect(result.success).toBe(true);
    });
  });

  // ── UpsertSwapStepSchema ─────────────────────────────────────────────────

  describe("UpsertSwapStepSchema", () => {
    const validStep = {
      execution_id: "swap-001",
      step_key: "approve",
      step_order: 0,
      attempt: 1,
      status: "running",
    };

    it("accepts valid input", () => {
      const result = UpsertSwapStepSchema.safeParse(validStep);
      expect(result.success).toBe(true);
    });

    it("accepts optional datetime fields", () => {
      const result = UpsertSwapStepSchema.safeParse({
        ...validStep,
        started_at: "2026-02-24T12:00:00Z",
        finished_at: "2026-02-24T12:01:00Z",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid ISO datetime", () => {
      const result = UpsertSwapStepSchema.safeParse({
        ...validStep,
        started_at: "not-a-date",
      });
      expect(result.success).toBe(false);
    });

    it("rejects negative step_order", () => {
      const result = UpsertSwapStepSchema.safeParse({
        ...validStep,
        step_order: -1,
      });
      expect(result.success).toBe(false);
    });

    it("rejects non-integer attempt", () => {
      const result = UpsertSwapStepSchema.safeParse({
        ...validStep,
        attempt: 1.5,
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid step status", () => {
      const result = UpsertSwapStepSchema.safeParse({
        ...validStep,
        status: "cancelled",
      });
      expect(result.success).toBe(false);
    });

    it("accepts skipped status", () => {
      const result = UpsertSwapStepSchema.safeParse({
        ...validStep,
        status: "skipped",
      });
      expect(result.success).toBe(true);
    });

    it("accepts metadata object", () => {
      const result = UpsertSwapStepSchema.safeParse({
        ...validStep,
        metadata: { gas_used: "12345", retries: 2 },
      });
      expect(result.success).toBe(true);
    });
  });

  // ── PushRegisterSchema ───────────────────────────────────────────────────

  describe("PushRegisterSchema", () => {
    it("accepts valid ios registration", () => {
      const result = PushRegisterSchema.safeParse({
        platform: "ios",
        device_id: "device-123",
        token: "apns-token",
      });
      expect(result.success).toBe(true);
    });

    it("accepts valid web registration with endpoint", () => {
      const result = PushRegisterSchema.safeParse({
        platform: "web",
        device_id: "browser-abc",
        endpoint: "https://push.example.com/sub/123",
        p256dh: "key1",
        auth: "key2",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid platform", () => {
      const result = PushRegisterSchema.safeParse({
        platform: "windows",
        device_id: "device-123",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty device_id", () => {
      const result = PushRegisterSchema.safeParse({
        platform: "android",
        device_id: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid endpoint URL", () => {
      const result = PushRegisterSchema.safeParse({
        platform: "web",
        device_id: "device-123",
        endpoint: "not-a-url",
      });
      expect(result.success).toBe(false);
    });

    it("accepts extension platform", () => {
      const result = PushRegisterSchema.safeParse({
        platform: "extension",
        device_id: "ext-1",
      });
      expect(result.success).toBe(true);
    });
  });

  // ── CreateViewingGrantSchema ─────────────────────────────────────────────

  describe("CreateViewingGrantSchema", () => {
    it("accepts valid input", () => {
      const result = CreateViewingGrantSchema.safeParse({
        viewer_address: "0xabc",
        encrypted_viewing_key: "encrypted-data",
        scope: "all_transactions",
      });
      expect(result.success).toBe(true);
    });

    it("accepts optional expires_at", () => {
      const result = CreateViewingGrantSchema.safeParse({
        viewer_address: "0xabc",
        encrypted_viewing_key: "encrypted-data",
        scope: "all_transactions",
        expires_at: "2026-12-31T23:59:59Z",
      });
      expect(result.success).toBe(true);
    });

    it("rejects non-hex viewer_address", () => {
      const result = CreateViewingGrantSchema.safeParse({
        viewer_address: "not-hex",
        encrypted_viewing_key: "data",
        scope: "scope",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty scope", () => {
      const result = CreateViewingGrantSchema.safeParse({
        viewer_address: "0xabc",
        encrypted_viewing_key: "data",
        scope: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid expires_at datetime", () => {
      const result = CreateViewingGrantSchema.safeParse({
        viewer_address: "0xabc",
        encrypted_viewing_key: "data",
        scope: "scope",
        expires_at: "tomorrow",
      });
      expect(result.success).toBe(false);
    });
  });

  // ── CreateInnocenceProofSchema ───────────────────────────────────────────

  describe("CreateInnocenceProofSchema", () => {
    it("accepts valid input", () => {
      const result = CreateInnocenceProofSchema.safeParse({
        proof_hash: "abc123",
        circuit_version: "v1.0",
      });
      expect(result.success).toBe(true);
    });

    it("accepts optional fields", () => {
      const result = CreateInnocenceProofSchema.safeParse({
        proof_hash: "abc123",
        circuit_version: "v1.0",
        nullifier_hash: "null-hash",
        note: "compliance proof",
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty proof_hash", () => {
      const result = CreateInnocenceProofSchema.safeParse({
        proof_hash: "",
        circuit_version: "v1.0",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty circuit_version", () => {
      const result = CreateInnocenceProofSchema.safeParse({
        proof_hash: "abc",
        circuit_version: "",
      });
      expect(result.success).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: errors.ts
// ═══════════════════════════════════════════════════════════════════════════════

describe("errors.ts", () => {
  describe("badRequest()", () => {
    it("returns 400 status", () => {
      const res = badRequest("invalid input");
      expect(res.status).toBe(400);
    });

    it("body contains the error message", async () => {
      const res = badRequest("invalid input");
      const body = await res.json();
      expect(body.error).toBe("invalid input");
    });

    it("body contains the custom code when provided", async () => {
      const res = badRequest("bad", "CUSTOM_CODE");
      const body = await res.json();
      expect(body.code).toBe("CUSTOM_CODE");
    });

    it("body has no code when not provided", async () => {
      const res = badRequest("bad");
      const body = await res.json();
      expect(body.code).toBeUndefined();
    });
  });

  describe("unauthorized()", () => {
    it("returns 401 status", () => {
      const res = unauthorized();
      expect(res.status).toBe(401);
    });

    it("has code UNAUTHORIZED", async () => {
      const res = unauthorized();
      const body = await res.json();
      expect(body.code).toBe("UNAUTHORIZED");
    });

    it("uses default message when none provided", async () => {
      const res = unauthorized();
      const body = await res.json();
      expect(body.error).toBe("Unauthorized");
    });

    it("uses custom message when provided", async () => {
      const res = unauthorized("Token expired");
      const body = await res.json();
      expect(body.error).toBe("Token expired");
    });
  });

  describe("forbidden()", () => {
    it("returns 403 status", () => {
      const res = forbidden();
      expect(res.status).toBe(403);
    });

    it("has code FORBIDDEN", async () => {
      const res = forbidden();
      const body = await res.json();
      expect(body.code).toBe("FORBIDDEN");
    });

    it("uses default message", async () => {
      const res = forbidden();
      const body = await res.json();
      expect(body.error).toBe("Forbidden");
    });

    it("uses custom message", async () => {
      const res = forbidden("No access");
      const body = await res.json();
      expect(body.error).toBe("No access");
    });
  });

  describe("notFound()", () => {
    it("returns 404 status", () => {
      const res = notFound();
      expect(res.status).toBe(404);
    });

    it("has code NOT_FOUND", async () => {
      const res = notFound();
      const body = await res.json();
      expect(body.code).toBe("NOT_FOUND");
    });

    it("uses default message", async () => {
      const res = notFound();
      const body = await res.json();
      expect(body.error).toBe("Not found");
    });

    it("uses custom message", async () => {
      const res = notFound("Ward not found");
      const body = await res.json();
      expect(body.error).toBe("Ward not found");
    });
  });

  describe("conflict()", () => {
    it("returns 409 status", () => {
      const res = conflict("Already exists");
      expect(res.status).toBe(409);
    });

    it("has code CONFLICT", async () => {
      const res = conflict("Duplicate");
      const body = await res.json();
      expect(body.code).toBe("CONFLICT");
    });

    it("passes custom message through", async () => {
      const res = conflict("Key already registered");
      const body = await res.json();
      expect(body.error).toBe("Key already registered");
    });
  });

  describe("serverError()", () => {
    it("returns 500 status", () => {
      const res = serverError();
      expect(res.status).toBe(500);
    });

    it("has code INTERNAL_ERROR", async () => {
      const res = serverError();
      const body = await res.json();
      expect(body.code).toBe("INTERNAL_ERROR");
    });

    it("uses default message", async () => {
      const res = serverError();
      const body = await res.json();
      expect(body.error).toBe("Internal server error");
    });

    it("uses custom message", async () => {
      const res = serverError("Database connection failed");
      const body = await res.json();
      expect(body.error).toBe("Database connection failed");
    });
  });
});

describe("x402 validation schemas", () => {
  const validChallenge = {
    version: "1",
    scheme: "cloak-shielded-x402",
    challengeId: "chal_1",
    network: "sepolia",
    token: "STRK",
    minAmount: "100000000000000000",
    recipient: "0xabc123",
    contextHash: "0123456789abcdef0123456789abcdef",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    facilitator: "https://example.com/api/v1/marketplace/payments/x402",
  };

  const validPayment = {
    version: "1",
    scheme: "cloak-shielded-x402",
    challengeId: "chal_1",
    tongoAddress: "tongo1abc",
    token: "STRK",
    amount: "100000000000000000",
    proof: "proofblob",
    replayKey: "rk_1",
    contextHash: "0123456789abcdef0123456789abcdef",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    nonce: "nonce_1",
    createdAt: new Date().toISOString(),
  };

  it("accepts valid challenge", () => {
    expect(X402ChallengeSchema.safeParse(validChallenge).success).toBe(true);
  });

  it("rejects malformed challenge scheme", () => {
    expect(
      X402ChallengeSchema.safeParse({
        ...validChallenge,
        scheme: "wrong-scheme",
      }).success,
    ).toBe(false);
  });

  it("accepts valid payment payload", () => {
    expect(X402PaymentPayloadSchema.safeParse(validPayment).success).toBe(true);
  });

  it("rejects malformed payment payload", () => {
    expect(
      X402PaymentPayloadSchema.safeParse({
        ...validPayment,
        createdAt: "not-a-date",
      }).success,
    ).toBe(false);
  });

  it("accepts verify request envelope", () => {
    expect(
      X402VerifyRequestSchema.safeParse({
        challenge: validChallenge,
        payment: validPayment,
      }).success,
    ).toBe(true);
  });

  it("accepts settle request envelope", () => {
    expect(
      X402SettleRequestSchema.safeParse({
        challenge: validChallenge,
        payment: validPayment,
      }).success,
    ).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: auth.ts
// ═══════════════════════════════════════════════════════════════════════════════

describe("auth.ts", () => {
  let mockSelect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect = (getSupabase() as any).select;
  });

  // ── hashApiKey() ─────────────────────────────────────────────────────────

  describe("hashApiKey()", () => {
    it("returns a hex string", async () => {
      const hash = await hashApiKey("test-key-1234567890");
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("returns consistent results for the same input", async () => {
      const hash1 = await hashApiKey("my-api-key-abcdef");
      const hash2 = await hashApiKey("my-api-key-abcdef");
      expect(hash1).toBe(hash2);
    });

    it("returns different hashes for different inputs", async () => {
      const hash1 = await hashApiKey("key-aaaa-1234567890");
      const hash2 = await hashApiKey("key-bbbb-1234567890");
      expect(hash1).not.toBe(hash2);
    });
  });

  // ── authenticate() ──────────────────────────────────────────────────────

  describe("authenticate()", () => {
    it("throws AuthError when no X-API-Key header", async () => {
      const req = new NextRequest("http://localhost/api/v1/test");
      await expect(authenticate(req)).rejects.toThrow(AuthError);
      await expect(authenticate(req)).rejects.toThrow(
        "Missing X-API-Key header",
      );
    });

    it("throws AuthError when key is too short", async () => {
      const req = new NextRequest("http://localhost/api/v1/test", {
        headers: { "X-API-Key": "short" },
      });
      await expect(authenticate(req)).rejects.toThrow(AuthError);
      await expect(authenticate(req)).rejects.toThrow(
        "Invalid API key format",
      );
    });

    it("throws AuthError when key not found in database", async () => {
      mockSelect.mockResolvedValue([]);
      const req = new NextRequest("http://localhost/api/v1/test", {
        headers: { "X-API-Key": "valid-key-1234567890" },
      });
      await expect(authenticate(req)).rejects.toThrow(AuthError);
      await expect(authenticate(req)).rejects.toThrow("Invalid API key");
    });

    it("throws AuthError when key is revoked", async () => {
      mockSelect.mockResolvedValue([
        {
          id: "key-id-1",
          wallet_address: "0xabc",
          key_hash: "hash",
          created_at: "2026-01-01T00:00:00Z",
          revoked_at: "2026-02-01T00:00:00Z",
        },
      ]);
      const req = new NextRequest("http://localhost/api/v1/test", {
        headers: { "X-API-Key": "valid-key-1234567890" },
      });
      await expect(authenticate(req)).rejects.toThrow(AuthError);
      await expect(authenticate(req)).rejects.toThrow(
        "API key has been revoked",
      );
    });

    it("returns AuthContext on success", async () => {
      mockSelect.mockResolvedValue([
        {
          id: "key-id-1",
          wallet_address: "0xabc123",
          key_hash: "hash",
          created_at: "2026-01-01T00:00:00Z",
          revoked_at: null,
        },
      ]);
      const req = new NextRequest("http://localhost/api/v1/test", {
        headers: { "X-API-Key": "valid-key-1234567890" },
      });
      const ctx = await authenticate(req);
      expect(ctx).toEqual({
        wallet_address: "0xabc123",
        api_key_id: "key-id-1",
      });
    });

    it("works with lowercase x-api-key header", async () => {
      mockSelect.mockResolvedValue([
        {
          id: "key-id-2",
          wallet_address: "0xdef456",
          key_hash: "hash",
          created_at: "2026-01-01T00:00:00Z",
          revoked_at: null,
        },
      ]);
      const req = new NextRequest("http://localhost/api/v1/test", {
        headers: { "x-api-key": "valid-key-1234567890" },
      });
      const ctx = await authenticate(req);
      expect(ctx).toEqual({
        wallet_address: "0xdef456",
        api_key_id: "key-id-2",
      });
    });

    it("calls supabase select with correct table and hash filter", async () => {
      mockSelect.mockResolvedValue([
        {
          id: "key-id-3",
          wallet_address: "0x789",
          key_hash: "hash",
          created_at: "2026-01-01T00:00:00Z",
          revoked_at: null,
        },
      ]);
      const apiKey = "valid-key-1234567890";
      const expectedHash = await hashApiKey(apiKey);

      const req = new NextRequest("http://localhost/api/v1/test", {
        headers: { "X-API-Key": apiKey },
      });
      await authenticate(req);

      expect(mockSelect).toHaveBeenCalledWith(
        "api_keys",
        `key_hash=eq.${expectedHash}`,
        { limit: 1 },
      );
    });
  });

  // ── AuthError class ──────────────────────────────────────────────────────

  describe("AuthError", () => {
    it("is an instance of Error", () => {
      const err = new AuthError("test");
      expect(err).toBeInstanceOf(Error);
    });

    it("has name AuthError", () => {
      const err = new AuthError("test");
      expect(err.name).toBe("AuthError");
    });

    it("has the correct message", () => {
      const err = new AuthError("Custom auth error");
      expect(err.message).toBe("Custom auth error");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: supabase.ts
// ═══════════════════════════════════════════════════════════════════════════════

describe("supabase.ts", () => {
  // We need to test getSupabase with real env vars, but the module is already
  // mocked above for auth tests. We test the env-var validation by importing
  // the real module in isolation using vi.importActual.

  // The supabase module captures env vars at module load time:
  //   const SUPABASE_URL = process.env.SUPABASE_URL || "";
  // ESM module caching prevents re-loading with different env vars in
  // the same test file. We test the env validation logic by running a
  // dedicated child script that imports the module in a clean process.

  describe("getSupabase() env validation", () => {
    it("throws when SUPABASE_URL is not set", async () => {
      const { execSync } = await import("child_process");
      const cwd = process.cwd();
      const script = `
        delete process.env.SUPABASE_URL;
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;
        const { getSupabase } = require("${cwd}/app/api/v1/_lib/supabase");
        try { getSupabase(); process.exit(1); }
        catch (e) {
          if (e.message.includes("SUPABASE_URL")) process.exit(0);
          process.exit(2);
        }
      `;
      // tsx can run TS, but the module uses ESM. Use node with tsx loader.
      // Simpler: just use node since compiled JS is not available.
      // Use a direct approach: spawn node with tsx.
      let exitCode: number;
      try {
        execSync(
          `npx tsx -e '${script.replace(/'/g, "\\'")}'`,
          { cwd, stdio: "pipe", timeout: 10000, env: { ...process.env, SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "" } },
        );
        exitCode = 0;
      } catch (err: any) {
        exitCode = err.status ?? 1;
      }
      expect(exitCode).toBe(0);
    });

    it("throws when SUPABASE_SERVICE_ROLE_KEY is not set", async () => {
      const { execSync } = await import("child_process");
      const cwd = process.cwd();
      const script = `
        process.env.SUPABASE_URL = "https://example.supabase.co";
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;
        const { getSupabase } = require("${cwd}/app/api/v1/_lib/supabase");
        try { getSupabase(); process.exit(1); }
        catch (e) {
          if (e.message.includes("SUPABASE_SERVICE_ROLE_KEY")) process.exit(0);
          process.exit(2);
        }
      `;
      let exitCode: number;
      try {
        execSync(
          `npx tsx -e '${script.replace(/'/g, "\\'")}'`,
          { cwd, stdio: "pipe", timeout: 10000, env: { ...process.env, SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "" } },
        );
        exitCode = 0;
      } catch (err: any) {
        exitCode = err.status ?? 1;
      }
      expect(exitCode).toBe(0);
    });

    it("returns client with all methods when env vars are set", async () => {
      const { execSync } = await import("child_process");
      const cwd = process.cwd();
      const script = `
        process.env.SUPABASE_URL = "https://example.supabase.co";
        process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key-12345";
        const { getSupabase } = require("${cwd}/app/api/v1/_lib/supabase");
        const c = getSupabase();
        const methods = ["insert", "select", "update", "del", "upsert"];
        const ok = methods.every(m => typeof c[m] === "function");
        process.exit(ok ? 0 : 1);
      `;
      let exitCode: number;
      try {
        execSync(
          `npx tsx -e '${script.replace(/'/g, "\\'")}'`,
          {
            cwd,
            stdio: "pipe",
            timeout: 10000,
            env: {
              ...process.env,
              SUPABASE_URL: "https://example.supabase.co",
              SUPABASE_SERVICE_ROLE_KEY: "service-role-key-12345",
            },
          },
        );
        exitCode = 0;
      } catch (err: any) {
        exitCode = err.status ?? 1;
      }
      expect(exitCode).toBe(0);
    });
  });
});
