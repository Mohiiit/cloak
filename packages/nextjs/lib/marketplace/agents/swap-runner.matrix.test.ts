import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { swapRunnerRuntime } from "./swap-runner";

describe("swap runner full matrix", () => {
  beforeEach(() => {
    process.env.STARKZAP_EXECUTOR_URL = "https://starkzap.test/execute";
    process.env.MARKETPLACE_RUNTIME_PROTOCOL = "starkzap";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          tx_hashes: ["0xswap-matrix"],
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

  it("supports swap action", async () => {
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
  });

  it("supports dca_tick action", async () => {
    const result = await swapRunnerRuntime.execute({
      agentType: "swap_runner",
      action: "dca_tick",
      params: {
        strategy_id: "strat_1",
      },
      operatorWallet: "0xabc",
      serviceWallet: "0xdef",
    });
    expect(result.status).toBe("completed");
  });

  it("supports explicit calls payload for swap", async () => {
    const result = await swapRunnerRuntime.execute({
      agentType: "swap_runner",
      action: "swap",
      params: {
        calls: [
          {
            contractAddress: "0x1",
            entrypoint: "swap",
            calldata: ["0x1", "0x2", "0x3"],
          },
        ],
      },
      operatorWallet: "0xabc",
      serviceWallet: "0xdef",
    });
    expect(result.status).toBe("completed");
  });

  it("fails swap without token params", async () => {
    const result = await swapRunnerRuntime.execute({
      agentType: "swap_runner",
      action: "swap",
      params: { amount: "100" },
      operatorWallet: "0xabc",
      serviceWallet: "0xdef",
    });
    expect(result.status).toBe("failed");
  });

  it("fails dca_tick without strategy id", async () => {
    const result = await swapRunnerRuntime.execute({
      agentType: "swap_runner",
      action: "dca_tick",
      params: {},
      operatorWallet: "0xabc",
      serviceWallet: "0xdef",
    });
    expect(result.status).toBe("failed");
  });
});
