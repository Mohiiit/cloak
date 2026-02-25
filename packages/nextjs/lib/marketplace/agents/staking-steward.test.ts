import { describe, expect, it } from "vitest";
import { stakingStewardRuntime } from "./staking-steward";

describe("staking steward runtime", () => {
  it("executes stake actions through starkzap adapter", async () => {
    const result = await stakingStewardRuntime.execute({
      agentType: "staking_steward",
      action: "stake",
      params: { amount: "100", pool: "0xpool" },
      operatorWallet: "0xabc",
      serviceWallet: "0xdef",
    });

    expect(result.status).toBe("completed");
    expect(result.executionTxHashes?.[0]).toMatch(/^0x/);
    expect(result.result.provider).toBe("starkzap");
  });

  it("rejects unsupported staking action", async () => {
    const result = await stakingStewardRuntime.execute({
      agentType: "staking_steward",
      action: "swap",
      params: {},
      operatorWallet: "0xabc",
      serviceWallet: "0xdef",
    });
    expect(result.status).toBe("failed");
  });
});

