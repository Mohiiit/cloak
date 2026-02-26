import { describe, expect, it } from "vitest";
import {
  LenientX402ProofVerifier,
  StrictX402ProofVerifier,
  createX402ProofVerifier,
} from "./proof-adapter";
import { buildChallenge } from "./challenge";
import {
  createX402TongoProofEnvelope,
  encodeX402TongoProofEnvelope,
} from "../../../../sdk/src/x402";

function env(overrides: Partial<NodeJS.ProcessEnv>): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV ?? "test",
    ...overrides,
  };
}

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

function makeEnvelopeProof() {
  const input = makeInput("");
  input.payment.proof = encodeX402TongoProofEnvelope(
    createX402TongoProofEnvelope({
      challenge: input.challenge,
      tongoAddress: input.payment.tongoAddress,
      amount: input.payment.amount,
      replayKey: input.payment.replayKey,
      nonce: input.payment.nonce,
      settlementTxHash: "0x1234",
      attestor: "test-suite",
    }),
  );
  return input;
}

function makeMismatchedEnvelopeProof() {
  const input = makeInput("");
  const envelope = createX402TongoProofEnvelope({
    challenge: input.challenge,
    tongoAddress: input.payment.tongoAddress,
    amount: input.payment.amount,
    replayKey: input.payment.replayKey,
    nonce: input.payment.nonce,
    settlementTxHash: "0x1234",
    attestor: "test-suite",
  });
  envelope.intentHash = "f".repeat(64);
  input.payment.proof = encodeX402TongoProofEnvelope(envelope);
  return input;
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
    const verifier = createX402ProofVerifier(env({
      X402_PROOF_VERIFIER_MODE: "strict",
    }));
    expect(verifier).toBeInstanceOf(StrictX402ProofVerifier);
  });

  it("accepts strict envelope proof and surfaces settlement tx hash", async () => {
    const verifier = new StrictX402ProofVerifier(false);
    const result = await verifier.verify(makeEnvelopeProof());
    expect(result.ok).toBe(true);
    expect(result.settlementTxHash).toBe("0x1234");
  });

  it("rejects strict envelope proof with mismatched intent hash", async () => {
    const verifier = new StrictX402ProofVerifier(false);
    const result = await verifier.verify(makeMismatchedEnvelopeProof());
    expect(result.ok).toBe(false);
    expect(result.reasonCode).toBe("CONTEXT_MISMATCH");
  });
});
