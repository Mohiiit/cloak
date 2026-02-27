import { beforeEach, describe, expect, it } from "vitest";
import { buildChallenge } from "./challenge";
import { X402Facilitator } from "./facilitator";
import { X402ReplayStore } from "./replay-store";
import type { X402ProofVerifier } from "./proof-adapter";
import { createStrictX402Payment, ensureX402FacilitatorSecretForTests } from "./test-helpers";

describe("X402Facilitator", () => {
  const replayStore = new X402ReplayStore();
  const facilitator = new X402Facilitator(replayStore);

  beforeEach(() => {
    replayStore.clearInMemory();
  });

  function makeEnvelope(overrides?: Partial<{ amount: string; contextHash: string; replayKey: string }>) {
    ensureX402FacilitatorSecretForTests();
    const challenge = buildChallenge({
      recipient: "0xabc123",
      token: "STRK",
      minAmount: "100",
      context: { run: "test" },
    });
    const payment = createStrictX402Payment(challenge, {
      amount: overrides?.amount,
      replayKey: overrides?.replayKey,
      nonce: "nonce",
      tongoAddress: "tongo1",
    });
    return {
      challenge,
      payment: {
        ...payment,
        contextHash: overrides?.contextHash ?? payment.contextHash,
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

  it("rejects payments when proof verifier denies payload", async () => {
    const rejectingVerifier: X402ProofVerifier = {
      verify: () => ({
        ok: false,
        reasonCode: "INVALID_PAYLOAD",
      }),
    };
    const rejectingFacilitator = new X402Facilitator(replayStore, rejectingVerifier);
    const env = makeEnvelope({ replayKey: "rk_bad_proof" });
    const res = await rejectingFacilitator.verify(env);
    expect(res.status).toBe("rejected");
    expect(res.reasonCode).toBe("INVALID_PAYLOAD");
  });
});
