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
    const createWardApproval = vi.fn(async (body: Record<string, unknown>) => ({
      ...makeRow(),
      ...body,
      id: "req-created",
      status: body.initial_status || "pending_ward_sig",
    }));
    const client = { createWardApproval };

    const created = await createWardApprovalRequest(client as any, {
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

    expect(createWardApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        ward_address: "0xabc",
        guardian_address: "0xdef",
        initial_status: "pending_ward_sig",
      }),
    );
    expect(created.id).toBe("req-created");
    expect(created.status).toBe("pending_ward_sig");
  });

  it("sets responded_at automatically when moving to terminal status", async () => {
    const updateWardApproval = vi.fn(async () => undefined);
    const getWardApproval = vi.fn(async () => ({
      ...makeRow(),
      id: "req-1",
      status: "approved",
      responded_at: new Date().toISOString(),
    }));
    const client = { updateWardApproval, getWardApproval };

    const row = await updateWardApprovalRequest(client as any, "req-1", {
      status: "approved",
      finalTxHash: "0xfinal",
    });

    expect(updateWardApproval).toHaveBeenCalledWith(
      "req-1",
      expect.objectContaining({
        status: "approved",
        final_tx_hash: "0xfinal",
      }),
    );
    expect(row?.status).toBe("approved");
    expect(row?.responded_at).toBeTruthy();
  });

  it("lists guardian/ward requests with normalized filters", async () => {
    const getWardApprovalHistory = vi.fn(async () => [makeRow()]);
    const getPendingWardApprovals = vi.fn(async () => [makeRow()]);
    const client = { getWardApprovalHistory, getPendingWardApprovals };

    const guardianRows = await listWardApprovalRequestsForGuardian(
      client as any,
      "0x00DeF",
      ["pending_guardian", "approved"],
      25,
    );
    const wardRows = await listWardApprovalRequestsForWard(
      client as any,
      "0x00aBc",
      ["pending_guardian"],
      10,
    );

    expect(guardianRows).toHaveLength(1);
    expect(wardRows).toHaveLength(1);
    expect(getWardApprovalHistory).toHaveBeenCalledWith({
      guardian: "0xdef",
      limit: 25,
    });
    expect(getPendingWardApprovals).toHaveBeenCalledWith({
      ward: "0xabc",
    });
  });
});
