import { describe, expect, it } from "vitest";
import {
  StrictX402ProofVerifier,
  createX402ProofVerifier,
} from "./proof-adapter";
import { buildChallenge } from "./challenge";
import {
  createX402TongoProofEnvelope,
  encodeX402TongoProofEnvelope,
} from "../../../../sdk/src/x402";
import {
  createWithdrawProofBundle,
  ensureX402FacilitatorSecretForTests,
} from "./test-helpers";

function env(overrides: Partial<NodeJS.ProcessEnv>): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV ?? "test",
    ...overrides,
  };
}

function makeInput(proof: string) {
  ensureX402FacilitatorSecretForTests();
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

function makeEnvelopeProofWithTongoBundle(
  tamper = false,
  overrides?: {
    recipient?: string;
    paymentAmount?: string;
    bundleAmount?: string;
  },
) {
  const input = makeInput("");
  const recipient = overrides?.recipient || input.challenge.recipient;
  const paymentAmount = overrides?.paymentAmount || input.payment.amount;
  const bundleAmount = overrides?.bundleAmount || paymentAmount;
  input.payment.amount = paymentAmount;
  input.payment.proof = encodeX402TongoProofEnvelope(
    createX402TongoProofEnvelope({
      challenge: input.challenge,
      tongoAddress: input.payment.tongoAddress,
      amount: paymentAmount,
      replayKey: input.payment.replayKey,
      nonce: input.payment.nonce,
      settlementTxHash: "0x1234",
      attestor: "test-suite",
      tongoProof: createWithdrawProofBundle(recipient, bundleAmount, tamper),
    }),
  );
  return input;
}

function makeMismatchedEnvelopeProofWithTongoBundle() {
  const input = makeEnvelopeProofWithTongoBundle();
  const envelope = JSON.parse(input.payment.proof);
  envelope.intentHash = "f".repeat(64);
  input.payment.proof = encodeX402TongoProofEnvelope(envelope);
  return input;
}

describe("x402 proof adapter", () => {
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

  it("rejects strict envelope proof when tongo bundle is missing", async () => {
    const verifier = new StrictX402ProofVerifier();
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
    const result = await verifier.verify(input);
    expect(result.ok).toBe(false);
    expect(result.reasonCode).toBe("INVALID_TONGO_PROOF");
  });

  it("accepts strict envelope proof with valid tongo cryptographic proof bundle", async () => {
    const verifier = new StrictX402ProofVerifier();
    const result = await verifier.verify(makeEnvelopeProofWithTongoBundle());
    expect(result.ok).toBe(true);
    expect(result.settlementTxHash).toBe("0x1234");
  });

  it("rejects strict envelope proof with mismatched intent hash", async () => {
    const verifier = new StrictX402ProofVerifier();
    const result = await verifier.verify(makeMismatchedEnvelopeProofWithTongoBundle());
    expect(result.ok).toBe(false);
    expect(result.reasonCode).toBe("CONTEXT_MISMATCH");
  });

  it("rejects strict envelope proof with invalid tongo cryptographic proof bundle", async () => {
    const verifier = new StrictX402ProofVerifier();
    const result = await verifier.verify(makeEnvelopeProofWithTongoBundle(true));
    expect(result.ok).toBe(false);
    expect(result.reasonCode).toBe("INVALID_TONGO_PROOF");
  });

  it("rejects tongo proof when withdraw amount mismatches payment amount", async () => {
    const verifier = new StrictX402ProofVerifier();
    const result = await verifier.verify(
      makeEnvelopeProofWithTongoBundle(false, {
        paymentAmount: "100",
        bundleAmount: "101",
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.reasonCode).toBe("CONTEXT_MISMATCH");
  });

  it("rejects tongo proof when withdraw recipient mismatches challenge recipient", async () => {
    const verifier = new StrictX402ProofVerifier();
    const result = await verifier.verify(
      makeEnvelopeProofWithTongoBundle(false, {
        recipient: "0x9999",
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.reasonCode).toBe("CONTEXT_MISMATCH");
  });

  it("accepts payment amounts with surrounding whitespace", async () => {
    const verifier = new StrictX402ProofVerifier();
    const result = await verifier.verify(
      makeEnvelopeProofWithTongoBundle(false, {
        paymentAmount: "100\n",
        bundleAmount: "100",
      }),
    );
    expect(result.ok).toBe(true);
  });
});
