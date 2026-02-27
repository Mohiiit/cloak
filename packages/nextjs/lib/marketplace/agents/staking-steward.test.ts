import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stakingStewardRuntime } from "./staking-steward";

describe("staking steward runtime", () => {
  beforeEach(() => {
    process.env.STARKZAP_EXECUTOR_URL = "https://starkzap.test/execute";
    process.env.MARKETPLACE_RUNTIME_PROTOCOL = "starkzap";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          tx_hashes: ["0xstake"],
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

  it("executes compound actions through starkzap adapter", async () => {
    const result = await stakingStewardRuntime.execute({
      agentType: "staking_steward",
      action: "compound",
      params: { token: "STRK" },
      operatorWallet: "0xabc",
      serviceWallet: "0xdef",
    });

    expect(result.status).toBe("completed");
    expect(result.executionTxHashes?.[0]).toMatch(/^0x/);
    expect(result.result.provider).toBe("starkzap");
  });

  it("compound does not require amount param", async () => {
    const result = await stakingStewardRuntime.execute({
      agentType: "staking_steward",
      action: "compound",
      params: {},
      operatorWallet: "0xabc",
      serviceWallet: "0xdef",
    });

    expect(result.status).toBe("completed");
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
