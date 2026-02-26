import { describe, expect, it } from "vitest";
import {
  LenientX402ProofVerifier,
  StrictX402ProofVerifier,
  createX402ProofVerifier,
} from "./proof-adapter";
import { buildChallenge } from "./challenge";

function makeInput(proof: string) {
  const challenge = buildChallenge({
    recipient: "0xabc123",
    token: "STRK",
    minAmount: "100",
    context: { route: "runs" },
  });
  return {
    challenge,
    payment: {
      version: "1" as const,
      scheme: "cloak-shielded-x402" as const,
      challengeId: challenge.challengeId,
      tongoAddress: "tongo",
      token: challenge.token,
      amount: challenge.minAmount,
      proof,
      replayKey: "rk_proof",
      contextHash: challenge.contextHash,
      expiresAt: challenge.expiresAt,
      nonce: "nonce",
      createdAt: new Date().toISOString(),
    },
  };
}

describe("x402 proof adapter", () => {
  it("accepts lenient proofs", async () => {
    const verifier = new LenientX402ProofVerifier();
    const result = await verifier.verify(makeInput("proof-blob"));
    expect(result.ok).toBe(true);
  });

  it("rejects strict mode malformed proofs", async () => {
    const verifier = new StrictX402ProofVerifier();
    const result = await verifier.verify(makeInput("bad!"));
    expect(result.ok).toBe(false);
    expect(result.reasonCode).toBe("INVALID_PAYLOAD");
  });

  it("creates strict verifier from env", () => {
    const verifier = createX402ProofVerifier({
      X402_PROOF_VERIFIER_MODE: "strict",
    } as NodeJS.ProcessEnv);
    expect(verifier).toBeInstanceOf(StrictX402ProofVerifier);
  });
});
