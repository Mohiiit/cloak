import { describe, it, expect, vi } from "vitest";
import { getTransactions } from "../src/transactions";

describe("transactions.getTransactions", () => {
  it("includes managed ward transactions in guardian activity", async () => {
    const client = {
      getTransactions: vi.fn(async () => [
        { wallet_address: "0xward1", tx_hash: "0xwardtx", type: "transfer", token: "STRK", amount: null, amount_unit: null, recipient: null, recipient_name: null, note: null, status: "pending", error_message: null, account_type: "normal", ward_address: null, fee: null, network: "sepolia", platform: null, created_at: "2026-02-20T11:00:00.000Z", id: "1" },
        { wallet_address: "0xguardian", tx_hash: "0xown", type: "transfer", token: "STRK", amount: null, amount_unit: null, recipient: null, recipient_name: null, note: null, status: "pending", error_message: null, account_type: "normal", ward_address: null, fee: null, network: "sepolia", platform: null, created_at: "2026-02-20T10:00:00.000Z", id: "2" },
      ]),
    } as any;

    const rows = await getTransactions("0xguardian", 100, client);
    expect(rows.map((r) => r.tx_hash)).toEqual(["0xwardtx", "0xown"]);
    expect(client.getTransactions).toHaveBeenCalledWith("0xguardian", { limit: 100 });
  });

  it("falls back to wallet/ward queries when ward lookup fails", async () => {
    const client = {
      getTransactions: vi.fn(async () => [
        { wallet_address: "0xguardian", tx_hash: "0xown", type: "transfer", token: "STRK", amount: null, amount_unit: null, recipient: null, recipient_name: null, note: null, status: "pending", error_message: null, account_type: "normal", ward_address: null, fee: null, network: "sepolia", platform: null, created_at: "2026-02-20T10:00:00.000Z", id: "1" },
        { wallet_address: "0xother", tx_hash: "0xother", type: "transfer", token: "STRK", amount: null, amount_unit: null, recipient: null, recipient_name: null, note: null, status: "pending", error_message: null, account_type: "normal", ward_address: null, fee: null, network: "sepolia", platform: null, created_at: "2026-02-20T09:00:00.000Z", id: "2" },
      ]),
    } as any;

    const rows = await getTransactions("0xguardian", 100, client);
    expect(rows.map((r) => r.tx_hash)).toEqual(["0xown", "0xother"]);
  });
});
