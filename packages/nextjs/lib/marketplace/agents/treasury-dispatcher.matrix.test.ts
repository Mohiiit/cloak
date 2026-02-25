import { describe, expect, it } from "vitest";
import { treasuryDispatcherRuntime } from "./treasury-dispatcher";

describe("treasury dispatcher full matrix", () => {
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

