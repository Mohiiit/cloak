import { describe, expect, it } from "vitest";
import {
  composeShieldedSwapPlan,
  SwapPlanComposeError,
} from "../src/swaps";

const DEX_PLAN = {
  provider: "avnu" as const,
  pair: { sellToken: "STRK" as const, buyToken: "ETH" as const },
  mode: "exact_in" as const,
  quoteId: "q_1",
  calls: [
    {
      contractAddress: "0xdex",
      entrypoint: "swap",
      calldata: ["0x1"],
    },
  ],
  dexCalls: [
    {
      contractAddress: "0xdex",
      entrypoint: "swap",
      calldata: ["0x1"],
    },
  ],
  sellAmount: {
    value: "100000000000000000",
    unit: "erc20_wei" as const,
  },
  estimatedBuyAmountWei: "50000000000000000",
  minBuyAmountWei: "49000000000000000",
};

describe("swaps.builder", () => {
  it("composes boundary + dex calls into one atomic plan", () => {
    const plan = composeShieldedSwapPlan({
      dexPlan: DEX_PLAN,
      withdrawCalls: [
        {
          contractAddress: "0xtongo_sell",
          entrypoint: "withdraw",
          calldata: ["0x1"],
        },
        {
          contractAddress: "0xstrk",
          entrypoint: "approve",
          calldata: ["0xspender", "0x1", "0x0"],
        },
      ],
      fundCalls: [
        {
          contractAddress: "0xeth",
          entrypoint: "approve",
          calldata: ["0xtongo_buy", "0x1", "0x0"],
        },
        {
          contractAddress: "0xtongo_buy",
          entrypoint: "fund",
          calldata: ["0x1"],
        },
      ],
    });

    expect(plan.calls).toHaveLength(5);
    expect(plan.calls[0].entrypoint).toBe("withdraw");
    expect(plan.calls[2].entrypoint).toBe("swap");
    expect(plan.calls[4].entrypoint).toBe("fund");
    expect((plan.meta as any)?.composed).toBe(true);
  });

  it("fails when boundary call sets are missing", () => {
    expect(() =>
      composeShieldedSwapPlan({
        dexPlan: DEX_PLAN,
        withdrawCalls: [],
        fundCalls: [],
      }),
    ).toThrowError(SwapPlanComposeError);
  });

  it("fails when dex calls are missing", () => {
    expect(() =>
      composeShieldedSwapPlan({
        dexPlan: {
          ...DEX_PLAN,
          dexCalls: [],
        },
        withdrawCalls: [{ contractAddress: "0x1", entrypoint: "a", calldata: [] }],
        fundCalls: [{ contractAddress: "0x2", entrypoint: "b", calldata: [] }],
      }),
    ).toThrowError(SwapPlanComposeError);
  });
});
