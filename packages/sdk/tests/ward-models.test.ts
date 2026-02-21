import { describe, it, expect, vi } from "vitest";
import {
  createWardApprovalRequest,
  updateWardApprovalRequest,
  listWardApprovalRequestsForGuardian,
  listWardApprovalRequestsForWard,
  toWardApprovalUiModel,
  type WardApprovalRequest,
} from "../src/ward";

function makeRow(overrides: Partial<WardApprovalRequest> = {}): WardApprovalRequest {
  return {
    id: "req-1",
    ward_address: "0xabc",
    guardian_address: "0xdef",
    action: "transfer",
    token: "STRK",
    amount: "20",
    amount_unit: "tongo_units",
    recipient: "0x123",
    calls_json: "[]",
    nonce: "0x1",
    resource_bounds_json: "{}",
    tx_hash: "0xtx",
    ward_sig_json: "[\"0x1\",\"0x2\"]",
    ward_2fa_sig_json: null,
    guardian_sig_json: null,
    guardian_2fa_sig_json: null,
    needs_ward_2fa: false,
    needs_guardian: true,
    needs_guardian_2fa: false,
    status: "pending_guardian",
    final_tx_hash: null,
    error_message: null,
    created_at: "2026-02-21T00:00:00.000Z",
    expires_at: "2026-02-21T00:10:00.000Z",
    responded_at: null,
    ...overrides,
  };
}

describe("ward typed UI model", () => {
  it("maps shielded request to a normalized UI model", () => {
    const ui = toWardApprovalUiModel(makeRow());
    expect(ui.actionLabel).toBe("Private Transfer");
    expect(ui.visibility).toBe("shielded");
    expect(ui.stage).toBe("guardian_approval");
    expect(ui.amount.displayValue).toBe("1");
    expect(ui.amount.unitValue).toBe("20");
    expect(ui.amount.hasAmount).toBe(true);
  });

  it("infers public transfer unit from legacy amount payload", () => {
    const ui = toWardApprovalUiModel(
      makeRow({
        action: "erc20_transfer",
        amount: "1.25 STRK",
        amount_unit: null,
      }),
    );
    expect(ui.visibility).toBe("public");
    expect(ui.amount.unit).toBe("erc20_display");
    expect(ui.amount.displayValue).toBe("1.25");
  });
});

describe("ward lifecycle helpers", () => {
  it("creates request with normalized addresses and default status", async () => {
    const insert = vi.fn(async (_table: string, body: Record<string, unknown>) => [
      makeRow({
        ...body,
        id: "req-created",
      } as Partial<WardApprovalRequest>),
    ]);
    const sb = { insert };

    const created = await createWardApprovalRequest(sb as any, {
      wardAddress: "0x00AbC",
      guardianAddress: "0x00Def",
      action: "transfer",
      token: "STRK",
      amount: "20",
      amountUnit: "tongo_units",
      recipient: "0x123",
      callsJson: "[]",
      wardSigJson: "[\"0x1\",\"0x2\"]",
      nonce: "0x1",
      resourceBoundsJson: "{}",
      txHash: "0xtx",
      needsWard2fa: false,
      needsGuardian: true,
      needsGuardian2fa: false,
    });

    expect(insert).toHaveBeenCalledWith(
      "ward_approval_requests",
      expect.objectContaining({
        ward_address: "0xabc",
        guardian_address: "0xdef",
        status: "pending_ward_sig",
      }),
    );
    expect(created.id).toBe("req-created");
    expect(created.status).toBe("pending_ward_sig");
  });

  it("sets responded_at automatically when moving to terminal status", async () => {
    const update = vi.fn(async (_table: string, _filters: string, body: Record<string, unknown>) => [
      makeRow({
        id: "req-1",
        status: body.status as WardApprovalRequest["status"],
        responded_at: (body.responded_at as string) || null,
      }),
    ]);
    const sb = { update };

    const row = await updateWardApprovalRequest(sb as any, "req-1", {
      status: "approved",
      finalTxHash: "0xfinal",
    });

    expect(update).toHaveBeenCalledWith(
      "ward_approval_requests",
      "id=eq.req-1",
      expect.objectContaining({
        status: "approved",
        final_tx_hash: "0xfinal",
        responded_at: expect.any(String),
      }),
    );
    expect(row?.status).toBe("approved");
    expect(row?.responded_at).toBeTruthy();
  });

  it("lists guardian/ward requests with normalized filters", async () => {
    const select = vi.fn(async () => [makeRow()]);
    const sb = { select };

    const guardianRows = await listWardApprovalRequestsForGuardian(
      sb as any,
      "0x00DeF",
      ["pending_guardian", "approved"],
      25,
    );
    const wardRows = await listWardApprovalRequestsForWard(
      sb as any,
      "0x00aBc",
      ["pending_guardian"],
      10,
    );

    expect(guardianRows).toHaveLength(1);
    expect(wardRows).toHaveLength(1);
    expect(select).toHaveBeenNthCalledWith(
      1,
      "ward_approval_requests",
      "guardian_address=eq.0xdef&status=in.(pending_guardian,approved)&limit=25",
      "created_at.desc",
    );
    expect(select).toHaveBeenNthCalledWith(
      2,
      "ward_approval_requests",
      "ward_address=eq.0xabc&status=in.(pending_guardian)&limit=10",
      "created_at.desc",
    );
  });
});
