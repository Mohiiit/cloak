import { describe, expect, it, vi } from "vitest";
import {
  AvnuSwapApiError,
  AvnuSwapStaleQuoteError,
  createAvnuSwapAdapter,
} from "../src/swaps";

function ok(body: unknown) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  };
}

function fail(status: number, body: unknown) {
  return {
    ok: false,
    status,
    text: async () => JSON.stringify(body),
  };
}

describe("swaps.avnu adapter", () => {
  it("maps quote response into normalized SDK shape", async () => {
    const fetchMock = vi.fn(async () =>
      ok([
        {
          quoteId: "q_1",
          buyAmount: "42000000000000000",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      ]));
    const adapter = createAvnuSwapAdapter({ fetch: fetchMock });

    const quote = await adapter.quote({
      walletAddress: "0xabc",
      pair: { sellToken: "STRK", buyToken: "ETH" },
      sellAmount: { value: "2", unit: "tongo_units" },
      slippageBps: 100,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(quote.id).toBe("q_1");
    expect(quote.provider).toBe("avnu");
    expect(quote.sellAmountWei).toBe("100000000000000000");
    expect(quote.estimatedBuyAmountWei).toBe("42000000000000000");
    expect(quote.minBuyAmountWei).toBe("41580000000000000");
  });

  it("rejects stale quotes", async () => {
    const fetchMock = vi.fn(async () =>
      ok([
        {
          quoteId: "q_1",
          buyAmount: "100",
          expiresAt: new Date(Date.now() - 1000).toISOString(),
        },
      ]));
    const adapter = createAvnuSwapAdapter({ fetch: fetchMock });

    await expect(
      adapter.quote({
        walletAddress: "0xabc",
        pair: { sellToken: "STRK", buyToken: "ETH" },
        sellAmount: { value: "1", unit: "erc20_wei" },
      }),
    ).rejects.toBeInstanceOf(AvnuSwapStaleQuoteError);
  });

  it("retries and succeeds on transient 5xx", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fail(503, { message: "temporarily unavailable" }))
      .mockResolvedValueOnce(ok([{ quoteId: "q_ok", buyAmount: "12" }]));
    const adapter = createAvnuSwapAdapter({
      fetch: fetchMock,
      maxRetries: 2,
      retryDelayMs: 0,
    });

    const quote = await adapter.quote({
      walletAddress: "0xabc",
      pair: { sellToken: "STRK", buyToken: "ETH" },
      sellAmount: { value: "1", unit: "erc20_wei" },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(quote.id).toBe("q_ok");
  });

  it("fails immediately for non-retryable 4xx responses", async () => {
    const fetchMock = vi.fn(async () => fail(400, { message: "bad request" }));
    const adapter = createAvnuSwapAdapter({ fetch: fetchMock });

    await expect(
      adapter.quote({
        walletAddress: "0xabc",
        pair: { sellToken: "STRK", buyToken: "ETH" },
        sellAmount: { value: "1", unit: "erc20_wei" },
      }),
    ).rejects.toBeInstanceOf(AvnuSwapApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps build response calls into dex plan", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok([{ quoteId: "q_1", buyAmount: "100" }]))
      .mockResolvedValueOnce(ok({
        calls: [
          {
            contractAddress: "0xswap",
            entrypoint: "swap_exact_tokens",
            calldata: ["0x1", "0x2"],
          },
        ],
      }));
    const adapter = createAvnuSwapAdapter({ fetch: fetchMock });

    const quote = await adapter.quote({
      walletAddress: "0xabc",
      pair: { sellToken: "STRK", buyToken: "ETH" },
      sellAmount: { value: "1", unit: "erc20_wei" },
    });
    const plan = await adapter.build({
      walletAddress: "0xabc",
      pair: quote.pair,
      quote,
    });

    expect(plan.calls).toHaveLength(1);
    expect(plan.dexCalls).toHaveLength(1);
    expect(plan.calls[0].contractAddress).toBe("0xswap");
    expect(plan.quoteId).toBe("q_1");
  });
});
