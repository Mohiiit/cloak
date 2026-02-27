// @vitest-environment node

import { describe, expect, it } from "vitest";
import { buildChallenge } from "~~/lib/marketplace/x402/challenge";
import { X402SettlementExecutor } from "~~/lib/marketplace/x402/settlement";

const liveTxHash = process.env.X402_LIVE_SETTLEMENT_TX_HASH;
const liveRpcUrl =
  process.env.CLOAK_SEPOLIA_RPC_URL || process.env.NEXT_PUBLIC_SEPOLIA_PROVIDER_URL;
const runLive = !!liveTxHash && !!liveRpcUrl;
const liveDescribe = runLive ? describe : describe.skip;

function env(overrides: Partial<NodeJS.ProcessEnv>): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV ?? "test",
    ...overrides,
  };
}

liveDescribe("x402 on-chain settlement smoke (Sepolia)", () => {
  it("verifies a real settlement tx hash against Sepolia RPC", async () => {
    const challenge = buildChallenge({
      recipient: "0xabc123",
      token: "STRK",
      minAmount: "1",
      context: { route: "/api/v1/marketplace/runs", smoke: true },
    });
    const payment = {
      version: "1" as const,
      scheme: "cloak-shielded-x402" as const,
      challengeId: challenge.challengeId,
      tongoAddress: "tongo-live-smoke",
      token: challenge.token,
      amount: challenge.minAmount,
      proof: "proof-live-smoke",
      replayKey: "rk_live_smoke",
      contextHash: challenge.contextHash,
      expiresAt: challenge.expiresAt,
      nonce: "nonce_live_smoke",
      createdAt: new Date().toISOString(),
    };

    const executor = new X402SettlementExecutor(env({
      CLOAK_SEPOLIA_RPC_URL: liveRpcUrl!,
      X402_VERIFY_ONCHAIN_SETTLEMENT: "true",
    }));

    const decision = await executor.settle({
      challenge,
      payment,
      settlementTxHash: liveTxHash!,
    });

    expect(["settled", "pending"]).toContain(decision.status);
    expect(decision.txHash).toBe(liveTxHash);
  });
});
