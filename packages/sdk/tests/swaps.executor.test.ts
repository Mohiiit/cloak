import { describe, expect, it, vi, afterEach } from "vitest";
import { executeShieldedSwap } from "../src/swaps";
import * as router from "../src/router";

describe("swaps.executor", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("routes shielded swap through orchestrator with typed metadata", async () => {
    const orchestrateSpy = vi
      .spyOn(router, "orchestrateExecution")
      .mockResolvedValue({
        txHash: "0xswap",
        route: "direct",
      });

    const plan = {
      provider: "avnu" as const,
      pair: { sellToken: "STRK" as const, buyToken: "ETH" as const },
      mode: "exact_in" as const,
      quoteId: "q1",
      calls: [{ contractAddress: "0x1", entrypoint: "a", calldata: [] }],
      dexCalls: [{ contractAddress: "0x2", entrypoint: "b", calldata: [] }],
      sellAmount: { value: "2", unit: "tongo_units" as const },
      estimatedBuyAmountWei: "50",
      minBuyAmountWei: "45",
    };

    const result = await executeShieldedSwap(
      {
        getWardPolicySnapshot: async () => null,
        evaluateWardExecutionPolicy: async () => null,
        saveTransaction: async () => null,
        confirmTransaction: async () => undefined,
        network: "sepolia",
      },
      {
        walletAddress: "0xabc",
        plan,
        executeDirect: async () => ({ txHash: "0xswap" }),
      },
    );

    expect(orchestrateSpy).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        walletAddress: "0xabc",
        meta: expect.objectContaining({
          type: "shielded_swap",
          token: "STRK",
          network: "sepolia",
        }),
      }),
    );
    expect(result.plan.quoteId).toBe("q1");
    expect(result.txHash).toBe("0xswap");
  });
});
