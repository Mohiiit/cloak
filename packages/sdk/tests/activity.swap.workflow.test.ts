import { describe, expect, it, vi, afterEach } from "vitest";
import { getActivityRecords } from "../src/activity";
import { SupabaseLite } from "../src/supabase";

describe("activity swap workflow", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("attaches typed swap payload for shielded_swap transactions", async () => {
    const sb = new SupabaseLite("https://example.supabase.co", "test-key");
    const selectSpy = vi.spyOn(sb, "select");

    selectSpy.mockImplementation(async (table: string, filters?: string) => {
      if (table === "transactions" && filters === "wallet_address=eq.0xabc") {
        return [
          {
            wallet_address: "0xabc",
            tx_hash: "0xswap",
            type: "shielded_swap",
            token: "STRK",
            amount: "2",
            amount_unit: "tongo_units",
            status: "pending",
            account_type: "normal",
            network: "sepolia",
            created_at: "2026-02-21T00:00:00.000Z",
          },
        ] as any;
      }
      if (table === "transactions" && filters === "ward_address=eq.0xabc") {
        return [] as any;
      }
      if (table === "ward_configs") {
        return [] as any;
      }
      if (table === "swap_executions" && filters === "wallet_address=eq.0xabc") {
        return [
          {
            tx_hash: "0xswap",
            wallet_address: "0xabc",
            provider: "avnu",
            sell_token: "STRK",
            buy_token: "ETH",
            sell_amount_wei: "100",
            estimated_buy_amount_wei: "50",
            min_buy_amount_wei: "45",
            buy_actual_amount_wei: null,
            status: "pending",
            created_at: "2026-02-21T00:00:00.000Z",
          },
        ] as any;
      }
      if (table === "swap_executions" && filters === "ward_address=eq.0xabc") {
        return [] as any;
      }
      if (table === "ward_approval_requests") {
        return [] as any;
      }
      return [] as any;
    });

    const rows = await getActivityRecords("0xabc", 20, sb);
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("shielded_swap");
    expect(rows[0].swap).toEqual(
      expect.objectContaining({
        provider: "avnu",
        sell_token: "STRK",
        buy_token: "ETH",
      }),
    );
  });
});
