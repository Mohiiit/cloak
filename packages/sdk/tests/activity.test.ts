import { describe, expect, it, vi } from "vitest";
import { getActivityRecords, type ActivityRecord } from "../src/activity";

describe("activity.getActivityRecords", () => {
  it("merges guardian ward requests with transaction history and deduplicates by tx hash", async () => {
    const client = { getActivity: vi.fn() } as any;
    client.getActivity.mockResolvedValue({
      records: [
        {
          id: "req-pending",
          source: "ward_request",
          wallet_address: "0xguardian",
          tx_hash: "",
          type: "transfer",
          token: "STRK",
          amount: "2",
          amount_unit: "tongo_units",
          recipient: "0xrecipient",
          recipient_name: null,
          note: "Waiting for guardian approval",
          status: "pending",
          status_detail: "pending_guardian",
          error_message: null,
          account_type: "guardian",
          ward_address: "0xward1",
          fee: null,
          network: "sepolia",
          platform: "approval",
          created_at: "2026-02-21T15:00:00.000Z",
          responded_at: null,
          swap: null,
        },
        {
          id: "req-rejected",
          source: "ward_request",
          wallet_address: "0xguardian",
          tx_hash: "0xrejected",
          type: "transfer",
          token: "STRK",
          amount: "1.25",
          amount_unit: "erc20_display",
          recipient: "0xrecipient",
          recipient_name: null,
          note: "Request rejected",
          status: "rejected",
          status_detail: "rejected",
          error_message: null,
          account_type: "guardian",
          ward_address: "0xward1",
          fee: null,
          network: "sepolia",
          platform: "approval",
          created_at: "2026-02-21T14:00:00.000Z",
          responded_at: null,
          swap: null,
        },
        {
          id: "0xapproved",
          source: "transaction",
          wallet_address: "0xguardian",
          tx_hash: "0xapproved",
          type: "transfer",
          token: "STRK",
          amount: "5",
          amount_unit: "tongo_units",
          recipient: null,
          recipient_name: null,
          note: null,
          status: "confirmed",
          error_message: null,
          account_type: "ward",
          ward_address: null,
          fee: null,
          network: "sepolia",
          platform: null,
          created_at: "2026-02-21T13:00:00.000Z",
          swap: null,
        },
        {
          id: "0xown",
          source: "transaction",
          wallet_address: "0xguardian",
          tx_hash: "0xown",
          type: "transfer",
          token: "STRK",
          amount: "5",
          amount_unit: "tongo_units",
          recipient: null,
          recipient_name: null,
          note: null,
          status: "confirmed",
          error_message: null,
          account_type: "ward",
          ward_address: null,
          fee: null,
          network: "sepolia",
          platform: null,
          created_at: "2026-02-21T12:00:00.000Z",
          swap: null,
        },
      ],
      total: 4,
      has_more: false,
    });

    const rows = await getActivityRecords("0xguardian", 20, client);

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
    const client = { getActivity: vi.fn() } as any;
    client.getActivity.mockResolvedValue({
      records: [
        {
          id: "0xown",
          source: "transaction",
          wallet_address: "0xguardian",
          tx_hash: "0xown",
          type: "transfer",
          token: "STRK",
          amount: "5",
          amount_unit: "tongo_units",
          recipient: null,
          recipient_name: null,
          note: null,
          status: "confirmed",
          error_message: null,
          account_type: "ward",
          ward_address: null,
          fee: null,
          network: "sepolia",
          platform: null,
          created_at: "2026-02-21T12:00:00.000Z",
          swap: null,
        },
      ],
      total: 1,
      has_more: false,
    });

    const rows = await getActivityRecords("0xguardian", 20, client);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("0xown");
    expect(rows[0].source).toBe("transaction");
  });
});
