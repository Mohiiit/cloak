import { describe, expect, it, vi } from "vitest";
import { getActivityRecords, type ActivityRecord } from "../src/activity";
import type { TransactionRecord } from "../src/transactions";

function tx(
  txHash: string,
  walletAddress: string,
  createdAt: string,
): TransactionRecord {
  return {
    wallet_address: walletAddress,
    tx_hash: txHash,
    type: "transfer",
    token: "STRK",
    amount: "5",
    amount_unit: "tongo_units",
    status: "confirmed",
    account_type: "ward",
    network: "sepolia",
    created_at: createdAt,
  };
}

function wardRequest(overrides: Record<string, any>): Record<string, any> {
  return {
    id: "req-1",
    ward_address: "0xward1",
    guardian_address: "0xguardian",
    action: "transfer",
    token: "STRK",
    amount: "3",
    amount_unit: "tongo_units",
    recipient: "0xrecipient",
    status: "pending_guardian",
    tx_hash: "",
    final_tx_hash: null,
    error_message: null,
    created_at: "2026-02-21T15:00:00.000Z",
    responded_at: null,
    ...overrides,
  };
}

describe("activity.getActivityRecords", () => {
  it("merges guardian ward requests with transaction history and deduplicates by tx hash", async () => {
    const select = vi.fn(async (table: string, filters?: string) => {
      if (table === "transactions" && filters?.startsWith("wallet_address=eq.")) {
        return [tx("0xown", "0xguardian", "2026-02-21T12:00:00.000Z")];
      }
      if (table === "transactions" && filters?.startsWith("ward_address=eq.")) {
        return [];
      }
      if (table === "ward_configs") {
        return [{ ward_address: "0xward1" }];
      }
      if (table === "transactions" && filters?.startsWith("wallet_address=in.")) {
        return [tx("0xapproved", "0xward1", "2026-02-21T13:00:00.000Z")];
      }
      if (table === "ward_approval_requests") {
        return [
          wardRequest({
            id: "req-approved",
            status: "approved",
            tx_hash: "0xapproved",
            final_tx_hash: "0xapproved",
            created_at: "2026-02-21T13:10:00.000Z",
          }),
          wardRequest({
            id: "req-rejected",
            status: "rejected",
            amount: "1.25",
            amount_unit: "erc20_display",
            tx_hash: "0xrejected",
            created_at: "2026-02-21T14:00:00.000Z",
          }),
          wardRequest({
            id: "req-pending",
            status: "pending_guardian",
            amount: "2",
            amount_unit: "tongo_units",
            tx_hash: "",
            created_at: "2026-02-21T15:00:00.000Z",
          }),
        ];
      }
      return [];
    });

    const rows = await getActivityRecords("0xguardian", 20, { select } as any);

    expect(rows.map((row) => row.id)).toEqual([
      "req-pending",
      "req-rejected",
      "0xapproved",
      "0xown",
    ]);

    const pending = rows[0] as ActivityRecord;
    expect(pending.source).toBe("ward_request");
    expect(pending.status).toBe("pending");
    expect(pending.status_detail).toBe("pending_guardian");
    expect(pending.note).toContain("guardian approval");

    const rejected = rows[1] as ActivityRecord;
    expect(rejected.status).toBe("rejected");
    expect(rejected.amount_unit).toBe("erc20_display");
  });

  it("returns transactions even when ward request query fails", async () => {
    const select = vi.fn(async (table: string, filters?: string) => {
      if (table === "transactions" && filters?.startsWith("wallet_address=eq.")) {
        return [tx("0xown", "0xguardian", "2026-02-21T12:00:00.000Z")];
      }
      if (table === "transactions" && filters?.startsWith("ward_address=eq.")) {
        return [];
      }
      if (table === "ward_configs") {
        return [];
      }
      if (table === "ward_approval_requests") {
        throw new Error("ward table unavailable");
      }
      return [];
    });

    const rows = await getActivityRecords("0xguardian", 20, { select } as any);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("0xown");
    expect(rows[0].source).toBe("transaction");
  });
});
