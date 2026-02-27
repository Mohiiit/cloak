import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { swapRunnerRuntime } from "./swap-runner";

describe("swap runner runtime", () => {
  beforeEach(() => {
    process.env.STARKZAP_EXECUTOR_URL = "https://starkzap.test/execute";
    process.env.MARKETPLACE_RUNTIME_PROTOCOL = "starkzap";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          tx_hashes: ["0xswap"],
          receipt: { upstream: true },
        }),
        { status: 200 },
      ),
    );
  });

  afterEach(() => {
    delete process.env.STARKZAP_EXECUTOR_URL;
    delete process.env.MARKETPLACE_RUNTIME_PROTOCOL;
    vi.restoreAllMocks();
  });

  it("executes swap action", async () => {
    const result = await swapRunnerRuntime.execute({
      agentType: "swap_runner",
      action: "swap",
      params: {
        from_token: "STRK",
        to_token: "USDC",
        amount: "100",
      },
      operatorWallet: "0xabc",
      serviceWallet: "0xdef",
    });
    expect(result.status).toBe("completed");
    expect(result.executionTxHashes?.[0]).toMatch(/^0x/);
  });

  it("fails invalid swap action", async () => {
    const result = await swapRunnerRuntime.execute({
      agentType: "swap_runner",
      action: "stake",
      params: {},
      operatorWallet: "0xabc",
      serviceWallet: "0xdef",
    });
    expect(result.status).toBe("failed");
  });
});
