import { describe, it, expect, vi } from "vitest";
import {
  assembleWardSignature,
  requestWardApproval,
  type WardApprovalRequest,
  type WardApprovalParams,
} from "../src/ward";

function makeRequest(overrides: Partial<WardApprovalRequest> = {}): WardApprovalRequest {
  return {
    id: "req-1",
    ward_address: "0xward",
    guardian_address: "0xguardian",
    action: "transfer",
    token: "STRK",
    amount: "1 STRK",
    recipient: "u3recipient",
    calls_json: "[]",
    nonce: "1",
    resource_bounds_json: "{}",
    tx_hash: "0xtx",
    ward_sig_json: JSON.stringify(["0xw1", "0xw2"]),
    ward_2fa_sig_json: null,
    guardian_sig_json: null,
    guardian_2fa_sig_json: null,
    needs_ward_2fa: false,
    needs_guardian: true,
    needs_guardian_2fa: false,
    status: "pending_guardian",
    final_tx_hash: null,
    error_message: null,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    responded_at: null,
    ...overrides,
  };
}

describe("ward signature matrix", () => {
  it("off/off: ward primary -> guardian primary", () => {
    const req = makeRequest();
    const full = assembleWardSignature(req, ["0xg1", "0xg2"]);
    expect(full).toEqual(["0xw1", "0xw2", "0xg1", "0xg2"]);
  });

  it("on/off: ward primary + ward 2fa -> guardian primary", () => {
    const req = makeRequest({
      ward_2fa_sig_json: JSON.stringify(["0xw2fa1", "0xw2fa2"]),
      needs_ward_2fa: true,
    });
    const full = assembleWardSignature(req, ["0xg1", "0xg2"]);
    expect(full).toEqual([
      "0xw1",
      "0xw2",
      "0xw2fa1",
      "0xw2fa2",
      "0xg1",
      "0xg2",
    ]);
  });

  it("off/on: ward primary -> guardian primary + guardian 2fa", () => {
    const req = makeRequest({ needs_guardian_2fa: true });
    const full = assembleWardSignature(
      req,
      ["0xg1", "0xg2"],
      ["0xg2fa1", "0xg2fa2"],
    );
    expect(full).toEqual(["0xw1", "0xw2", "0xg1", "0xg2", "0xg2fa1", "0xg2fa2"]);
  });

  it("on/on: ward primary + ward 2fa -> guardian primary + guardian 2fa", () => {
    const req = makeRequest({
      ward_2fa_sig_json: JSON.stringify(["0xw2fa1", "0xw2fa2"]),
      needs_ward_2fa: true,
      needs_guardian_2fa: true,
    });
    const full = assembleWardSignature(
      req,
      ["0xg1", "0xg2"],
      ["0xg2fa1", "0xg2fa2"],
    );
    expect(full).toEqual([
      "0xw1",
      "0xw2",
      "0xw2fa1",
      "0xw2fa2",
      "0xg1",
      "0xg2",
      "0xg2fa1",
      "0xg2fa2",
    ]);
  });
});

function makeApprovalParams(): WardApprovalParams {
  return {
    wardAddress: "0xward",
    guardianAddress: "0xguardian",
    action: "transfer",
    token: "STRK",
    amount: "1 STRK",
    recipient: null,
    callsJson: "[]",
    wardSigJson: "[]",
    nonce: "",
    resourceBoundsJson: "{}",
    txHash: "",
    needsWard2fa: false,
    needsGuardian: true,
    needsGuardian2fa: false,
  };
}

describe("requestWardApproval defaults", () => {
  it("inserts pending_ward_sig by default", async () => {
    const created: any[] = [];
    const client = {
      createWardApproval: vi.fn(async (body: any) => {
        const row = { id: "req-1", ...body, status: body.initial_status || "pending_ward_sig", created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 600000).toISOString(), responded_at: null, ward_2fa_sig_json: null, guardian_sig_json: null, guardian_2fa_sig_json: null, final_tx_hash: null, error_message: null };
        created.push(row);
        return row;
      }),
      getWardApproval: vi.fn(async () => ({ id: "req-1", status: "approved", final_tx_hash: "0xabc", tx_hash: "0xabc", created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 600000).toISOString() })),
    } as any;

    const result = await requestWardApproval(client, makeApprovalParams());

    expect(created[0].status).toBe("pending_ward_sig");
    expect(result).toEqual({ approved: true, txHash: "0xabc" });
  });

  it("supports initialStatus override and onRequestCreated hook", async () => {
    const created: any[] = [];
    const onCreated = vi.fn(async () => {});
    const client = {
      createWardApproval: vi.fn(async (body: any) => {
        const row = { id: "req-2", ...body, status: body.initial_status || "pending_ward_sig", created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 600000).toISOString(), responded_at: null, ward_2fa_sig_json: null, guardian_sig_json: null, guardian_2fa_sig_json: null, final_tx_hash: null, error_message: null };
        created.push(row);
        return row;
      }),
      getWardApproval: vi.fn(async () => ({ id: "req-2", status: "approved", final_tx_hash: "0xdef", tx_hash: "0xdef", created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 600000).toISOString() })),
    } as any;

    const result = await requestWardApproval(
      client,
      makeApprovalParams(),
      undefined,
      undefined,
      { initialStatus: "pending_guardian", onRequestCreated: onCreated },
    );

    expect(created[0].status).toBe("pending_guardian");
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ approved: true, txHash: "0xdef" });
  });
});
