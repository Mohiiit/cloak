import { afterEach, describe, expect, it, vi } from "vitest";
import { executeWithStarkZap } from "./starkzap-adapter";

const baseInput = {
  agentType: "swap_runner",
  action: "swap",
  params: { from_token: "USDC", to_token: "STRK", amount: "25" },
  operatorWallet: "0xoperator",
  serviceWallet: "0xservice",
  protocol: "starkzap-swap",
};

describe("starkzap adapter", () => {
  afterEach(() => {
    delete process.env.STARKZAP_EXECUTOR_URL;
    delete process.env.STARKZAP_EXECUTOR_API_KEY;
    vi.restoreAllMocks();
  });

  it("throws when executor URL is missing", async () => {
    await expect(executeWithStarkZap(baseInput)).rejects.toThrow(
      /STARKZAP_EXECUTOR_URL is required/i,
    );
  });

  it("uses live executor when available", async () => {
    process.env.STARKZAP_EXECUTOR_URL = "https://starkzap.test/execute";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            tx_hashes: ["0x1234"],
            receipt: { provider_receipt: true },
          }),
          { status: 200 },
        ),
      );

    const result = await executeWithStarkZap(baseInput);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.txHashes).toEqual(["0x1234"]);
    expect(result.receipt.simulated).toBe(false);
  });

  it("throws when executor fails", async () => {
    process.env.STARKZAP_EXECUTOR_URL = "https://starkzap.test/execute";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("boom", { status: 502 }),
    );

    await expect(executeWithStarkZap(baseInput)).rejects.toThrow(
      /starkzap executor failed: 502/i,
    );
  });

  it("surfaces rpc-style error responses clearly", async () => {
    process.env.STARKZAP_EXECUTOR_URL = "https://starkzap.test/rpc";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32600,
            message: "Invalid request",
          },
          id: null,
        }),
        { status: 200 },
      ),
    );

    await expect(executeWithStarkZap(baseInput)).rejects.toThrow(
      /starkzap executor returned rpc error: Invalid request/i,
    );
  });
});
