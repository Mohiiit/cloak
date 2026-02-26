import { describe, expect, it, vi } from "vitest";
import { buildChallenge } from "./challenge";
import { X402SettlementExecutor } from "./settlement";

function env(overrides: Partial<NodeJS.ProcessEnv>): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV ?? "test",
    ...overrides,
  };
}

function makeInput() {
  const challenge = buildChallenge({
    recipient: "0xabc123",
    token: "STRK",
    minAmount: "100",
    context: { route: "/api/v1/marketplace/runs" },
  });
  return {
    challenge,
    payment: {
      version: "1" as const,
      scheme: "cloak-shielded-x402" as const,
      challengeId: challenge.challengeId,
      tongoAddress: "tongo1",
      token: challenge.token,
      amount: challenge.minAmount,
      proof: "proof",
      replayKey: "rk_settlement_test",
      contextHash: challenge.contextHash,
      expiresAt: challenge.expiresAt,
      nonce: "nonce_settlement_test",
      createdAt: new Date().toISOString(),
    },
  };
}

describe("x402 settlement executor", () => {
  it("fails when settlement tx hash is missing and legacy mode is disabled", async () => {
    const executor = new X402SettlementExecutor(env({
      X402_LEGACY_SETTLEMENT_COMPAT: "false",
    }));
    const decision = await executor.settle(makeInput());
    expect(decision.status).toBe("failed");
    expect(decision.reasonCode).toBe("SETTLEMENT_FAILED");
  });

  it("supports legacy compatibility fallback hash", async () => {
    const executor = new X402SettlementExecutor(env({
      X402_LEGACY_SETTLEMENT_COMPAT: "true",
    }));
    const decision = await executor.settle(makeInput());
    expect(decision.status).toBe("settled");
    expect(decision.txHash).toMatch(/^0x/);
  });

  it("returns pending when on-chain verification cannot find tx yet", async () => {
    const provider = {
      getTransactionReceipt: vi
        .fn()
        .mockRejectedValue(new Error("transaction hash not found")),
    };
    const executor = new X402SettlementExecutor(
      env({
        X402_LEGACY_SETTLEMENT_COMPAT: "false",
        X402_VERIFY_ONCHAIN_SETTLEMENT: "true",
      }),
      provider,
    );
    const input = makeInput();
    const decision = await executor.settle({
      ...input,
      settlementTxHash: "0x1234",
    });
    expect(decision.status).toBe("pending");
    expect(decision.txHash).toBe("0x1234");
  });

  it("marks settled when tx receipt is accepted", async () => {
    const provider = {
      getTransactionReceipt: vi.fn().mockResolvedValue({
        execution_status: "SUCCEEDED",
        finality_status: "ACCEPTED_ON_L2",
      }),
    };
    const executor = new X402SettlementExecutor(
      env({
        X402_LEGACY_SETTLEMENT_COMPAT: "false",
        X402_VERIFY_ONCHAIN_SETTLEMENT: "true",
      }),
      provider,
    );
    const input = makeInput();
    const decision = await executor.settle({
      ...input,
      settlementTxHash: "0x5678",
    });
    expect(decision.status).toBe("settled");
    expect(decision.txHash).toBe("0x5678");
  });
});
