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
    delete process.env.STARKZAP_ALLOW_SIMULATED_EXECUTION;
    delete process.env.MARKETPLACE_STRICT_ONCHAIN_EXECUTION;
    vi.restoreAllMocks();
  });

  it("falls back to deterministic simulated tx hash by default", async () => {
    const result = await executeWithStarkZap(baseInput);
    expect(result.txHashes.length).toBe(1);
    expect(result.receipt.simulated).toBe(true);
  });

  it("throws when strict mode is enabled without executor URL", async () => {
    process.env.MARKETPLACE_STRICT_ONCHAIN_EXECUTION = "true";
    process.env.STARKZAP_ALLOW_SIMULATED_EXECUTION = "false";
    await expect(executeWithStarkZap(baseInput)).rejects.toThrow(
      /executor URL is required/i,
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

  it("falls back to simulated when executor fails and fallback is enabled", async () => {
    process.env.STARKZAP_EXECUTOR_URL = "https://starkzap.test/execute";
    process.env.STARKZAP_ALLOW_SIMULATED_EXECUTION = "true";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("boom", { status: 502 }),
    );

    const result = await executeWithStarkZap(baseInput);
    expect(result.txHashes.length).toBe(1);
    expect(result.receipt.simulated).toBe(true);
    expect(result.receipt.fallback_reason).toBeTruthy();
  });
});
