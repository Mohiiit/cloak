import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stakingStewardRuntime } from "./staking-steward";

describe("staking steward full matrix", () => {
  beforeEach(() => {
    process.env.STARKZAP_EXECUTOR_URL = "https://starkzap.test/execute";
    process.env.MARKETPLACE_RUNTIME_PROTOCOL = "starkzap";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          tx_hashes: ["0xstake-matrix"],
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

  it("supports explicit calls payload for stake", async () => {
    const result = await stakingStewardRuntime.execute({
      agentType: "staking_steward",
      action: "stake",
      params: {
        calls: [
          {
            contractAddress: "0x1",
            entrypoint: "stake",
            calldata: ["0x10"],
          },
        ],
      },
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
