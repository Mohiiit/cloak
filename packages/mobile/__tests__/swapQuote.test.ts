import { bringRateAndQuote, formatQuoteError } from "../src/lib/swapQuote";

describe("swapQuote", () => {
  it("formats raw api errors", () => {
    expect(formatQuoteError('{"error":"Not Found"}', 404)).toContain("Not Found");
    expect(formatQuoteError("oops", 500)).toContain("500");
  });

  it("maps sdk quote meta into structured breakdown", async () => {
    const breakdown = await bringRateAndQuote(
      {
        walletAddress: "0x123",
        fromToken: "STRK",
        toToken: "ETH",
        sentUnits: 100n,
        slippageBps: 50,
        supabaseUrl: "https://example.supabase.co",
        supabaseKey: "sb_publishable_x",
      },
      {
        quoteViaSdk: async () => ({
          sellWei: "5000000000000000000", // 5 STRK
          estimatedBuyWei: "35539608600000", // 0.0000355396086 ETH
          minBuyWei: "35361910557000",
          avnuFeeWei: "71079217",
          gasFeeWei: "1000000000000",
        }),
      },
    );

    expect(breakdown.sentUnits).toBe(100n);
    expect(breakdown.estimatedUnits > 0n).toBe(true);
    expect(breakdown.minimumUnits > 0n).toBe(true);
    expect(breakdown.display.input).toBe("5");
    expect(breakdown.display.estimated).not.toBe("0");
    expect(breakdown.display.effectiveRate).not.toBeNull();
  });

  it("falls back to AVNU fetch when sdk returns Not Found", async () => {
    const breakdown = await bringRateAndQuote(
      {
        walletAddress: "0x0123",
        fromToken: "STRK",
        toToken: "ETH",
        sentUnits: 20n,
        slippageBps: 50,
        supabaseUrl: "https://example.supabase.co",
        supabaseKey: "sb_publishable_x",
      },
      {
        quoteViaSdk: async () => {
          throw new Error("Not Found");
        },
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          text: async () => JSON.stringify([
            {
              sellAmount: "0x6f05b59d3b20000",
              buyAmount: "0x32ef35ed4337",
              fee: { avnuFees: "0x29bbdbaee" },
              gasFees: "0x3a8e1410b60",
            },
          ]),
        }),
      },
    );

    expect(breakdown.display.estimated).not.toBe("0");
    expect(breakdown.display.minimum).not.toBe("0");
    expect(breakdown.display.protocolFee).not.toBeNull();
  });

  it("normalizes outsized low-decimal protocol fee displays", async () => {
    const breakdown = await bringRateAndQuote(
      {
        walletAddress: "0x0123",
        fromToken: "ETH",
        toToken: "USDC",
        sentUnits: 100n,
        slippageBps: 50,
        supabaseUrl: "https://example.supabase.co",
        supabaseKey: "sb_publishable_x",
      },
      {
        quoteViaSdk: async () => ({
          sellWei: "300000000000000",
          estimatedBuyWei: "27602",
          minBuyWei: "27463",
          avnuFeeWei: "300000000000",
          avnuFeeToken: "USDC",
          gasFeeWei: "7724000000000",
        }),
      },
    );

    expect(breakdown.display.protocolFee).not.toBe("300000");
  });
});
