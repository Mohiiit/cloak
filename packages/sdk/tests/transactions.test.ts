import { describe, it, expect, vi } from "vitest";
import { getTransactions, type TransactionRecord } from "../src/transactions";

function tx(
  txHash: string,
  wallet: string,
  createdAt: string,
): TransactionRecord {
  return {
    wallet_address: wallet,
    tx_hash: txHash,
    type: "transfer",
    token: "STRK",
    status: "pending",
    account_type: "normal",
    network: "sepolia",
    created_at: createdAt,
  };
}

describe("transactions.getTransactions", () => {
  it("includes managed ward transactions in guardian activity", async () => {
    const select = vi.fn(async (table: string, filters?: string) => {
      if (table === "transactions" && filters?.startsWith("wallet_address=eq.")) {
        return [tx("0xown", "0xguardian", "2026-02-20T10:00:00.000Z")];
      }
      if (table === "transactions" && filters?.startsWith("ward_address=eq.")) {
        return [];
      }
      if (table === "ward_configs") {
        return [{ ward_address: "0xward1" }, { ward_address: "0xward2" }];
      }
      if (table === "transactions" && filters?.startsWith("wallet_address=in.")) {
        return [
          tx("0xwardtx", "0xward1", "2026-02-20T11:00:00.000Z"),
          tx("0xown", "0xguardian", "2026-02-20T10:00:00.000Z"), // duplicate
        ];
      }
      return [];
    });

    const rows = await getTransactions("0xguardian", 100, { select } as any);

    expect(rows.map((r) => r.tx_hash)).toEqual(["0xwardtx", "0xown"]);
    expect(select).toHaveBeenCalledWith(
      "transactions",
      expect.stringContaining("wallet_address=in."),
      "created_at.desc",
    );
  });

  it("falls back to wallet/ward queries when ward lookup fails", async () => {
    const select = vi.fn(async (table: string, filters?: string) => {
      if (table === "transactions" && filters?.startsWith("wallet_address=eq.")) {
        return [tx("0xown", "0xguardian", "2026-02-20T10:00:00.000Z")];
      }
      if (table === "transactions" && filters?.startsWith("ward_address=eq.")) {
        return [tx("0xother", "0xother", "2026-02-20T09:00:00.000Z")];
      }
      if (table === "ward_configs") {
        throw new Error("boom");
      }
      return [];
    });

    const rows = await getTransactions("0xguardian", 100, { select } as any);
    expect(rows.map((r) => r.tx_hash)).toEqual(["0xown", "0xother"]);
  });
});
