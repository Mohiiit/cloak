import { describe, expect, it, vi, afterEach } from "vitest";
import { SupabaseLite } from "../src/supabase";
import {
  getSwapExecutions,
  saveSwapExecution,
  updateSwapExecution,
} from "../src/swaps";

describe("swaps.storage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("saves normalized swap execution rows", async () => {
    const sb = new SupabaseLite("https://example.supabase.co", "test-key");
    const insertSpy = vi.spyOn(sb, "insert").mockResolvedValue([
      { tx_hash: "0xtx" } as any,
    ]);

    await saveSwapExecution(
      {
        wallet_address: "0x000abc",
        ward_address: "0x000def",
        tx_hash: "0xtx",
        provider: "avnu",
        sell_token: "STRK",
        buy_token: "ETH",
        sell_amount_wei: "100",
        estimated_buy_amount_wei: "50",
        min_buy_amount_wei: "45",
        buy_actual_amount_wei: null,
        status: "pending",
        error_message: null,
      },
      sb,
    );

    expect(insertSpy).toHaveBeenCalledWith(
      "swap_executions",
      expect.objectContaining({
        wallet_address: "0xabc",
        ward_address: "0xdef",
      }),
    );
  });

  it("updates swap execution rows by tx hash", async () => {
    const sb = new SupabaseLite("https://example.supabase.co", "test-key");
    const updateSpy = vi.spyOn(sb, "update").mockResolvedValue([]);

    await updateSwapExecution("0xtx", { status: "failed", error_message: "boom" }, sb);

    expect(updateSpy).toHaveBeenCalledWith(
      "swap_executions",
      "tx_hash=eq.0xtx",
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("includes managed ward swap rows for guardian activity", async () => {
    const sb = new SupabaseLite("https://example.supabase.co", "test-key");
    const selectSpy = vi.spyOn(sb, "select");
    selectSpy.mockImplementation(async (table: string, filters?: string) => {
      if (table === "swap_executions" && filters === "wallet_address=eq.0xguardian") return [];
      if (table === "swap_executions" && filters === "ward_address=eq.0xguardian") return [];
      if (table === "ward_configs") {
        return [{ ward_address: "0xward" }] as any;
      }
      if (table === "swap_executions" && filters === "wallet_address=in.(0xward)") {
        return [
          {
            tx_hash: "0xswap",
            wallet_address: "0xward",
            ward_address: null,
            provider: "avnu",
            sell_token: "STRK",
            buy_token: "ETH",
            sell_amount_wei: "100",
            estimated_buy_amount_wei: "50",
            min_buy_amount_wei: "45",
            status: "pending",
            created_at: "2026-02-21T00:00:00.000Z",
          },
        ] as any;
      }
      return [] as any;
    });

    const rows = await getSwapExecutions("0xguardian", 20, sb);
    expect(rows).toHaveLength(1);
    expect(rows[0].tx_hash).toBe("0xswap");
  });
});
