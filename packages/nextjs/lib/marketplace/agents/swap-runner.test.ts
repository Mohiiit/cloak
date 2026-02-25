import { describe, expect, it } from "vitest";
import { swapRunnerRuntime } from "./swap-runner";

describe("swap runner runtime", () => {
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

