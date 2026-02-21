import { describe, expect, it } from "vitest";
import {
  SwapValidationError,
  assertValidSlippageBps,
  assertValidSwapAmount,
  assertValidSwapPair,
  assertValidSwapQuoteRequest,
} from "../src/swaps";

describe("swap type validation", () => {
  it("accepts a valid quote request", () => {
    expect(() =>
      assertValidSwapQuoteRequest({
        walletAddress: "0x123",
        pair: { sellToken: "STRK", buyToken: "ETH" },
        sellAmount: { value: "10", unit: "tongo_units" },
        slippageBps: 100,
      }),
    ).not.toThrow();
  });

  it("rejects same-token pairs", () => {
    expect(() =>
      assertValidSwapPair({ sellToken: "STRK", buyToken: "STRK" }),
    ).toThrowError(SwapValidationError);
  });

  it("rejects invalid integer unit amounts", () => {
    expect(() =>
      assertValidSwapAmount({ value: "1.2", unit: "tongo_units" }),
    ).toThrowError(SwapValidationError);
  });

  it("accepts positive display amounts", () => {
    expect(() =>
      assertValidSwapAmount({ value: "0.25", unit: "erc20_display" }),
    ).not.toThrow();
  });

  it("rejects invalid slippage bounds", () => {
    expect(() => assertValidSlippageBps(0)).toThrowError(SwapValidationError);
    expect(() => assertValidSlippageBps(5001)).toThrowError(SwapValidationError);
  });
});
