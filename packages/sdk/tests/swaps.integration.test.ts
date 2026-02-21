import { describe, expect, it } from "vitest";
import { createAvnuSwapAdapter } from "../src/swaps";

const RUN_INTEGRATION = process.env.SWAP_INTEGRATION === "1";
const describeIntegration = RUN_INTEGRATION ? describe : describe.skip;

describeIntegration("swaps integration (live AVNU)", () => {
  it("fetches quote and builds dex calls", async () => {
    const takerAddress = process.env.SWAP_INTEGRATION_TAKER || "0x1234";
    const sellAmountWei = process.env.SWAP_INTEGRATION_SELL_WEI || "1000000000000000000";

    const adapter = createAvnuSwapAdapter();
    const quote = await adapter.quote({
      walletAddress: takerAddress,
      pair: {
        sellToken: "STRK",
        buyToken: "ETH",
      },
      sellAmount: {
        value: sellAmountWei,
        unit: "erc20_wei",
      },
      slippageBps: 100,
    });

    expect(quote.id.length).toBeGreaterThan(0);
    expect(BigInt(quote.estimatedBuyAmountWei)).toBeGreaterThan(0n);

    const plan = await adapter.build({
      walletAddress: takerAddress,
      pair: quote.pair,
      quote,
    });
    expect(plan.dexCalls.length).toBeGreaterThan(0);
  }, 60_000);
});
