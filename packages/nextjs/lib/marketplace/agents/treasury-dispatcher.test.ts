import { describe, expect, it } from "vitest";
import { treasuryDispatcherRuntime } from "./treasury-dispatcher";

describe("treasury dispatcher runtime", () => {
  it("executes dispatch_batch actions", async () => {
    const result = await treasuryDispatcherRuntime.execute({
      agentType: "treasury_dispatcher",
      action: "dispatch_batch",
      params: {
        transfers: [
          { to: "0x1", amount: "100" },
          { to: "0x2", amount: "200" },
        ],
      },
      operatorWallet: "0xabc",
      serviceWallet: "0xdef",
    });
    expect(result.status).toBe("completed");
    expect(result.executionTxHashes?.[0]).toMatch(/^0x/);
  });

  it("fails invalid treasury action", async () => {
    const result = await treasuryDispatcherRuntime.execute({
      agentType: "treasury_dispatcher",
      action: "stake",
      params: {},
      operatorWallet: "0xabc",
      serviceWallet: "0xdef",
    });
    expect(result.status).toBe("failed");
  });
});

