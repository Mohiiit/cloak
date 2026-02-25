import { describe, expect, it, vi, afterEach } from "vitest";
import { getActivityRecords } from "../src/activity";
import { CloakApiClient } from "../src/api-client";

describe("activity swap workflow", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("attaches typed swap payload for shielded_swap transactions", async () => {
    const client = new CloakApiClient("https://example.com", "test-key");
    const getActivitySpy = vi.spyOn(client, "getActivity").mockResolvedValue({
      records: [
        {
          id: "0xswap",
          source: "transaction" as const,
          wallet_address: "0xabc",
          tx_hash: "0xswap",
          type: "shielded_swap",
          token: "STRK",
          amount: "2",
          amount_unit: "tongo_units" as const,
          recipient: null,
          recipient_name: null,
          note: null,
          status: "pending" as const,
          error_message: null,
          account_type: "normal" as const,
          ward_address: null,
          fee: null,
          network: "sepolia",
          platform: null,
          created_at: "2026-02-21T00:00:00.000Z",
          swap: {
            execution_id: "swap_1",
            provider: "avnu",
            sell_token: "STRK",
            buy_token: "ETH",
            sell_amount_wei: "100",
            estimated_buy_amount_wei: "50",
            min_buy_amount_wei: "45",
            buy_actual_amount_wei: null,
            tx_hashes: null,
            primary_tx_hash: "0xswap",
            status: "pending",
          },
        },
      ],
      total: 1,
      has_more: false,
    });

    const rows = await getActivityRecords("0xabc", 20, client);
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("shielded_swap");
    expect(rows[0].swap).toEqual(
      expect.objectContaining({
        provider: "avnu",
        sell_token: "STRK",
        buy_token: "ETH",
      }),
    );
    expect(getActivitySpy).toHaveBeenCalledWith("0xabc", { limit: 20 });
  });
});
