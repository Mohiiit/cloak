import { describe, expect, it } from "vitest";
import { swapRunnerRuntime } from "./swap-runner";

describe("swap runner full matrix", () => {
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

