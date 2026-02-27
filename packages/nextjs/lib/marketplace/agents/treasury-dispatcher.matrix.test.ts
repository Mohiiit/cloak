import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { treasuryDispatcherRuntime } from "./treasury-dispatcher";

describe("treasury dispatcher full matrix", () => {
  beforeEach(() => {
    process.env.STARKZAP_EXECUTOR_URL = "https://starkzap.test/execute";
    process.env.MARKETPLACE_RUNTIME_PROTOCOL = "starkzap";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          tx_hashes: ["0xtreasury-matrix"],
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

  it("supports dispatch_batch", async () => {
    const result = await treasuryDispatcherRuntime.execute({
      agentType: "treasury_dispatcher",
      action: "dispatch_batch",
      params: {
        transfers: [{ to: "0x1", amount: "10" }],
      },
      operatorWallet: "0xabc",
      serviceWallet: "0xdef",
    });
    expect(result.status).toBe("completed");
  });

  it("supports sweep_idle", async () => {
    const result = await treasuryDispatcherRuntime.execute({
      agentType: "treasury_dispatcher",
      action: "sweep_idle",
      params: { target_vault: "0xvault" },
      operatorWallet: "0xabc",
      serviceWallet: "0xdef",
    });
    expect(result.status).toBe("completed");
  });

  it("supports explicit calls payload for dispatch", async () => {
    const result = await treasuryDispatcherRuntime.execute({
      agentType: "treasury_dispatcher",
      action: "dispatch_batch",
      params: {
        calls: [
          {
            contractAddress: "0x1",
            entrypoint: "transfer",
            calldata: ["0x2", "0x5", "0x0"],
          },
        ],
      },
      operatorWallet: "0xabc",
      serviceWallet: "0xdef",
    });
    expect(result.status).toBe("completed");
  });

  it("fails dispatch_batch without transfers", async () => {
    const result = await treasuryDispatcherRuntime.execute({
      agentType: "treasury_dispatcher",
      action: "dispatch_batch",
      params: {},
      operatorWallet: "0xabc",
      serviceWallet: "0xdef",
    });
    expect(result.status).toBe("failed");
  });

  it("fails sweep_idle without target_vault", async () => {
    const result = await treasuryDispatcherRuntime.execute({
      agentType: "treasury_dispatcher",
      action: "sweep_idle",
      params: {},
      operatorWallet: "0xabc",
      serviceWallet: "0xdef",
    });
    expect(result.status).toBe("failed");
  });
});
