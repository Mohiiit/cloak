import { describe, expect, it } from "vitest";
import { stakingStewardRuntime } from "./staking-steward";

describe("staking steward full matrix", () => {
  it("supports stake action", async () => {
    const result = await stakingStewardRuntime.execute({
      agentType: "staking_steward",
      action: "stake",
      params: { amount: "10", pool: "0xpool1" },
      operatorWallet: "0xabc",
      serviceWallet: "0xdef",
    });
    expect(result.status).toBe("completed");
  });

  it("supports unstake action", async () => {
    const result = await stakingStewardRuntime.execute({
      agentType: "staking_steward",
      action: "unstake",
      params: { amount: "5", pool: "0xpool1" },
      operatorWallet: "0xabc",
      serviceWallet: "0xdef",
    });
    expect(result.status).toBe("completed");
  });

  it("supports rebalance action", async () => {
    const result = await stakingStewardRuntime.execute({
      agentType: "staking_steward",
      action: "rebalance",
      params: { from_pool: "0xpool1", to_pool: "0xpool2" },
      operatorWallet: "0xabc",
      serviceWallet: "0xdef",
    });
    expect(result.status).toBe("completed");
  });

  it("fails stake without amount", async () => {
    const result = await stakingStewardRuntime.execute({
      agentType: "staking_steward",
      action: "stake",
      params: { pool: "0xpool1" },
      operatorWallet: "0xabc",
      serviceWallet: "0xdef",
    });
    expect(result.status).toBe("failed");
  });

  it("fails rebalance without pools", async () => {
    const result = await stakingStewardRuntime.execute({
      agentType: "staking_steward",
      action: "rebalance",
      params: {},
      operatorWallet: "0xabc",
      serviceWallet: "0xdef",
    });
    expect(result.status).toBe("failed");
  });
});

