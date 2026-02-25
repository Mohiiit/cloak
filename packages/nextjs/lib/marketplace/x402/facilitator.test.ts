import { beforeEach, describe, expect, it } from "vitest";
import { buildChallenge } from "./challenge";
import { X402Facilitator } from "./facilitator";
import { X402ReplayStore } from "./replay-store";

describe("X402Facilitator", () => {
  const replayStore = new X402ReplayStore();
  const facilitator = new X402Facilitator(replayStore);

  beforeEach(() => {
    replayStore.clearInMemory();
  });

  function makeEnvelope(overrides?: Partial<{ amount: string; contextHash: string; replayKey: string }>) {
    const challenge = buildChallenge({
      recipient: "0xabc123",
      token: "STRK",
      minAmount: "100",
      context: { run: "test" },
    });
    return {
      challenge,
      payment: {
        version: "1" as const,
        scheme: "cloak-shielded-x402" as const,
        challengeId: challenge.challengeId,
        tongoAddress: "tongo1",
        token: "STRK",
        amount: overrides?.amount ?? "100",
        proof: "proof-blob",
        replayKey: overrides?.replayKey ?? "rk_unit",
        contextHash: overrides?.contextHash ?? challenge.contextHash,
        expiresAt: challenge.expiresAt,
        nonce: "nonce",
        createdAt: new Date().toISOString(),
      },
    };
  }

  it("accepts valid envelopes on verify", async () => {
    const env = makeEnvelope();
    const res = await facilitator.verify(env);
    expect(res.status).toBe("accepted");
  });

  it("rejects amounts below policy minimum", async () => {
    const env = makeEnvelope({ amount: "99", replayKey: "rk_low" });
    const res = await facilitator.verify(env);
    expect(res.status).toBe("rejected");
    expect(res.reasonCode).toBe("POLICY_DENIED");
  });

  it("settles idempotently and detects replay on verify", async () => {
    const env = makeEnvelope({ replayKey: "rk_replay" });
    const first = await facilitator.settle(env);
    expect(first.status).toBe("settled");
    const second = await facilitator.settle(env);
    expect(second.status).toBe("settled");
    expect(second.txHash).toBe(first.txHash);
    const verifyAgain = await facilitator.verify(env);
    expect(verifyAgain.status).toBe("rejected");
    expect(verifyAgain.reasonCode).toBe("REPLAY_DETECTED");
  });
});

