import { describe, expect, it, vi } from "vitest";
import {
  executeComposedShieldedSwap,
} from "../src/swaps";

describe("swaps.composed", () => {
  it("quotes, composes boundaries, and executes in one call", async () => {
    const quote = {
      id: "q_1",
      provider: "avnu" as const,
      pair: { sellToken: "STRK" as const, buyToken: "ETH" as const },
      mode: "exact_in" as const,
      sellAmountWei: "100000000000000000",
      estimatedBuyAmountWei: "10000000000000",
      minBuyAmountWei: "9000000000000",
      route: {},
    };
    const dexPlan = {
      provider: "avnu" as const,
      pair: quote.pair,
      mode: "exact_in" as const,
      quoteId: quote.id,
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
      sellAmount: { value: quote.sellAmountWei, unit: "erc20_wei" as const },
      estimatedBuyAmountWei: quote.estimatedBuyAmountWei,
      minBuyAmountWei: quote.minBuyAmountWei,
    };

    const quoteSpy = vi.fn(async () => quote);
    const buildSpy = vi.fn(async () => dexPlan);
    const executeSpy = vi.fn(async (input: any) => ({
      txHash: "0xswap",
      route: "direct" as const,
      plan: input.plan,
    }));
    const prepareWithdraw = vi.fn(async () => ({
      calls: [{ contractAddress: "0xtongo_sell", entrypoint: "withdraw", calldata: ["0x2"] }],
    }));
    const prepareFund = vi.fn(async () => ({
      calls: [
        { contractAddress: "0xeth", entrypoint: "approve", calldata: ["0xtongo_buy", "0x3"] },
        { contractAddress: "0xtongo_buy", entrypoint: "fund", calldata: ["0x3"] },
      ],
    }));

    const result = await executeComposedShieldedSwap(
      {
        quote: quoteSpy,
        build: buildSpy,
        execute: executeSpy,
      },
      {
        walletAddress: "0xabc",
        sourceToken: "STRK",
        destinationToken: "ETH",
        sellAmount: { value: "0.1", unit: "erc20_display" },
        sourceAccount: { prepareWithdraw },
        destinationAccount: { prepareFund },
        executeDirect: async () => ({ txHash: "0xswap" }),
      },
    );

    expect(quoteSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        walletAddress: "0xabc",
        pair: { sellToken: "STRK", buyToken: "ETH" },
      }),
    );
    expect(buildSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        walletAddress: "0xabc",
      }),
    );
    expect(prepareWithdraw).toHaveBeenCalledWith(2n);
    expect(prepareFund).toHaveBeenCalledWith(3n);
    expect(executeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        walletAddress: "0xabc",
        plan: expect.objectContaining({
          quoteId: "q_1",
          calls: expect.any(Array),
        }),
      }),
    );
    expect(result.sellAmountTongoUnits).toBe("2");
    expect(result.minBuyAmountTongoUnits).toBe("3");
    expect(result.composedPlan.calls.map((call) => call.entrypoint)).toEqual([
      "withdraw",
      "swap",
      "approve",
      "fund",
    ]);
  });

  it("fails when quote sell amount cannot map to source tongo units", async () => {
    await expect(
      executeComposedShieldedSwap(
        {
          quote: async () => ({
            id: "q_1",
            provider: "avnu",
            pair: { sellToken: "STRK", buyToken: "ETH" },
            mode: "exact_in",
            sellAmountWei: "1",
            estimatedBuyAmountWei: "100",
            minBuyAmountWei: "90",
            route: {},
          }),
          build: async () => ({
            provider: "avnu",
            pair: { sellToken: "STRK", buyToken: "ETH" },
            mode: "exact_in",
            quoteId: "q_1",
            calls: [{ contractAddress: "0xdex", entrypoint: "swap", calldata: [] }],
            dexCalls: [{ contractAddress: "0xdex", entrypoint: "swap", calldata: [] }],
            sellAmount: { value: "1", unit: "erc20_wei" },
            estimatedBuyAmountWei: "100",
            minBuyAmountWei: "90",
          }),
          execute: async () => {
            throw new Error("unreachable");
          },
        },
        {
          walletAddress: "0xabc",
          sourceToken: "STRK",
          destinationToken: "ETH",
          sellAmount: { value: "1", unit: "erc20_wei" },
          sourceAccount: {
            prepareWithdraw: async () => ({ calls: [] }),
          },
          destinationAccount: {
            prepareFund: async () => ({ calls: [] }),
          },
          executeDirect: async () => ({ txHash: "0xswap" }),
        },
      ),
    ).rejects.toMatchObject({
      name: "ComposedShieldedSwapError",
      code: "SELL_AMOUNT_TOO_SMALL",
    });
  });

  it("fails when min buy cannot map to destination tongo units", async () => {
    await expect(
      executeComposedShieldedSwap(
        {
          quote: async () => ({
            id: "q_1",
            provider: "avnu",
            pair: { sellToken: "STRK", buyToken: "ETH" },
            mode: "exact_in",
            sellAmountWei: "100000000000000000",
            estimatedBuyAmountWei: "100",
            minBuyAmountWei: "1",
            route: {},
          }),
          build: async () => ({
            provider: "avnu",
            pair: { sellToken: "STRK", buyToken: "ETH" },
            mode: "exact_in",
            quoteId: "q_1",
            calls: [{ contractAddress: "0xdex", entrypoint: "swap", calldata: [] }],
            dexCalls: [{ contractAddress: "0xdex", entrypoint: "swap", calldata: [] }],
            sellAmount: { value: "100000000000000000", unit: "erc20_wei" },
            estimatedBuyAmountWei: "100",
            minBuyAmountWei: "1",
          }),
          execute: async () => {
            throw new Error("unreachable");
          },
        },
        {
          walletAddress: "0xabc",
          sourceToken: "STRK",
          destinationToken: "ETH",
          sellAmount: { value: "100000000000000000", unit: "erc20_wei" },
          sourceAccount: {
            prepareWithdraw: async () => ({ calls: [] }),
          },
          destinationAccount: {
            prepareFund: async () => ({ calls: [] }),
          },
          executeDirect: async () => ({ txHash: "0xswap" }),
        },
      ),
    ).rejects.toMatchObject({
      name: "ComposedShieldedSwapError",
      code: "MIN_BUY_TOO_SMALL",
    });
  });
});
