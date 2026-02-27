import type {
  X402ErrorCode,
  X402PaymentPayloadRequest,
  X402VerifyRequest,
} from "@cloak-wallet/sdk";
import {
  isX402TongoProofBundle,
  verifyX402TongoProofBundle,
  type X402TongoProofBundle,
} from "./tongo-crypto-verifier";
import { pubKeyBase58ToAffine } from "../../../node_modules/@fatsolutions/tongo-sdk/src/types";

export interface X402ProofVerificationInput {
  challenge: X402VerifyRequest["challenge"];
  payment: X402PaymentPayloadRequest;
}

export interface X402ProofVerificationResult {
  ok: boolean;
  reasonCode?: X402ErrorCode;
  details?: string;
  proofEnvelope?: X402TongoProofEnvelope;
  settlementTxHash?: string;
}

export interface X402ProofVerifier {
  verify(
    input: X402ProofVerificationInput,
  ): Promise<X402ProofVerificationResult> | X402ProofVerificationResult;
}

export interface X402TongoProofEnvelope {
  envelopeVersion: "1";
  proofType: "tongo_attestation_v1";
  intentHash: string;
  settlementTxHash?: string;
  attestor?: string;
  issuedAt?: string;
  signature?: string;
  tongoProof?: X402TongoProofBundle;
  metadata?: Record<string, unknown>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stableStringify(input: Record<string, unknown>): string {
  return JSON.stringify(
    Object.keys(input)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = input[key];
        return acc;
      }, {}),
  );
}

function hashHex(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c;
    h2 = Math.imul(h2, 0x27d4eb2d);
  }
  const part1 = (h1 >>> 0).toString(16).padStart(8, "0");
  const part2 = (h2 >>> 0).toString(16).padStart(8, "0");
  return `${part1}${part2}${part1}${part2}${part1}${part2}${part1}${part2}`;
}

function computeIntentHash(input: X402ProofVerificationInput): string {
  return hashHex(
    stableStringify({
      challengeId: input.challenge.challengeId,
      contextHash: input.challenge.contextHash,
      recipient: input.challenge.recipient.toLowerCase(),
      token: input.challenge.token,
      tongoAddress: input.payment.tongoAddress,
      amount: input.payment.amount,
      replayKey: input.payment.replayKey,
      nonce: input.payment.nonce,
      expiresAt: input.challenge.expiresAt,
    }),
  );
}

function parseEnvelope(proof: string): X402TongoProofEnvelope | null {
  try {
    const parsed = JSON.parse(proof) as X402TongoProofEnvelope;
    if (!isObject(parsed)) return null;
    if (parsed.envelopeVersion !== "1") return null;
    if (parsed.proofType !== "tongo_attestation_v1") return null;
    if (typeof parsed.intentHash !== "string" || parsed.intentHash.length < 16) {
      return null;
    }
    if (
      parsed.settlementTxHash &&
      !/^0x[0-9a-fA-F]+$/.test(parsed.settlementTxHash)
    ) {
      return null;
    }
    if (
      parsed.tongoProof !== undefined &&
      !isX402TongoProofBundle(parsed.tongoProof)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function toBigIntOrNull(value: unknown): bigint | null {
  try {
    if (typeof value === "bigint") return value;
    if (typeof value === "number" && Number.isInteger(value)) {
      return BigInt(value);
    }
    if (typeof value === "string") {
      const normalized = value.trim();
      if (/^-?(0x[0-9a-fA-F]+|\d+)$/.test(normalized)) {
        return BigInt(normalized);
      }
    }
    return null;
  } catch {
    return null;
  }
}

function verifyWithdrawSemanticBinding(
  proofBundle: X402TongoProofBundle,
  input: X402ProofVerificationInput,
): X402ProofVerificationResult {
  if (!isObject(proofBundle.inputs)) {
    return {
      ok: false,
      reasonCode: "INVALID_TONGO_PROOF",
      details: "tongo proof inputs missing",
    };
  }

  const inputAmount = toBigIntOrNull(proofBundle.inputs.amount);
  const paymentAmount = toBigIntOrNull(input.payment.amount);
  if (inputAmount === null || paymentAmount === null) {
    return {
      ok: false,
      reasonCode: "INVALID_TONGO_PROOF",
      details: "tongo withdraw amount is not parseable",
    };
  }
  if (inputAmount !== paymentAmount) {
    return {
      ok: false,
      reasonCode: "CONTEXT_MISMATCH",
      details: "tongo withdraw amount does not match x402 payment amount",
    };
  }

  const withdrawalRecipient = toBigIntOrNull(proofBundle.inputs.to);
  const challengeRecipient = toBigIntOrNull(input.challenge.recipient);
  if (withdrawalRecipient === null || challengeRecipient === null) {
    return {
      ok: false,
      reasonCode: "INVALID_TONGO_PROOF",
      details: "tongo withdraw recipient is not parseable",
    };
  }
  if (withdrawalRecipient !== challengeRecipient) {
    return {
      ok: false,
      reasonCode: "CONTEXT_MISMATCH",
      details: "tongo withdraw recipient does not match x402 challenge recipient",
    };
  }

  return { ok: true };
}

function verifyTransferSemanticBinding(
  proofBundle: X402TongoProofBundle,
  input: X402ProofVerificationInput,
): X402ProofVerificationResult {
  if (!isObject(proofBundle.inputs)) {
    return {
      ok: false,
      reasonCode: "INVALID_TONGO_PROOF",
      details: "tongo proof inputs missing",
    };
  }

  const inputAmount = toBigIntOrNull(proofBundle.inputs.amount);
  const paymentAmount = toBigIntOrNull(input.payment.amount);
  if (inputAmount === null || paymentAmount === null) {
    return {
      ok: false,
      reasonCode: "INVALID_TONGO_PROOF",
      details: "tongo transfer amount is not parseable",
    };
  }
  if (inputAmount !== paymentAmount) {
    return {
      ok: false,
      reasonCode: "CONTEXT_MISMATCH",
      details: "tongo transfer amount does not match x402 payment amount",
    };
  }

  // For shielded transfers, the proof's `to` field is an affine point {x, y}.
  // Compare against the challenge's tongoRecipient (base58 Tongo address).
  const tongoRecipient = (input.challenge as unknown as Record<string, unknown>).tongoRecipient;
  if (typeof tongoRecipient !== "string" || !tongoRecipient) {
    return {
      ok: false,
      reasonCode: "CONTEXT_MISMATCH",
      details: "challenge missing tongoRecipient for shielded transfer verification",
    };
  }

  try {
    const expectedPoint = pubKeyBase58ToAffine(tongoRecipient);
    const proofTo = proofBundle.inputs.to;
    if (!isObject(proofTo) || !("x" in proofTo) || !("y" in proofTo)) {
      return {
        ok: false,
        reasonCode: "INVALID_TONGO_PROOF",
        details: "tongo transfer recipient is not an affine point",
      };
    }
    const proofX = toBigIntOrNull(proofTo.x);
    const proofY = toBigIntOrNull(proofTo.y);
    if (proofX === null || proofY === null) {
      return {
        ok: false,
        reasonCode: "INVALID_TONGO_PROOF",
        details: "tongo transfer recipient point coordinates not parseable",
      };
    }
    if (proofX !== expectedPoint.x || proofY !== expectedPoint.y) {
      return {
        ok: false,
        reasonCode: "CONTEXT_MISMATCH",
        details: "tongo transfer recipient does not match challenge tongoRecipient",
      };
    }
  } catch {
    return {
      ok: false,
      reasonCode: "INVALID_TONGO_PROOF",
      details: "failed to decode tongoRecipient base58 address",
    };
  }

  return { ok: true };
}

function verifyTongoProofSemanticBinding(
  proofBundle: X402TongoProofBundle,
  input: X402ProofVerificationInput,
): X402ProofVerificationResult {
  if (proofBundle.operation === "withdraw") {
    return verifyWithdrawSemanticBinding(proofBundle, input);
  }
  if (proofBundle.operation === "transfer") {
    return verifyTransferSemanticBinding(proofBundle, input);
  }
  return {
    ok: false,
    reasonCode: "CONTEXT_MISMATCH",
    details: `unsupported tongo payment operation: ${proofBundle.operation}`,
  };
}

export class StrictX402ProofVerifier implements X402ProofVerifier {
  constructor(
    private readonly enableTongoCryptoVerification = true,
    private readonly requireTongoProofBundle = true,
    private readonly trustSettlementTxHash = true,
  ) {}

  verify(input: X402ProofVerificationInput): X402ProofVerificationResult {
    const proof = input.payment.proof || "";
    const envelope = parseEnvelope(proof);
    if (!envelope) {
      return {
        ok: false,
        reasonCode: "INVALID_PAYLOAD",
        details: "proof envelope invalid",
      };
    }

    const expectedIntentHash = computeIntentHash(input);
    if (envelope.intentHash !== expectedIntentHash) {
      return {
        ok: false,
        reasonCode: "CONTEXT_MISMATCH",
        details: "proof intent hash mismatch",
      };
    }

    // If the envelope contains a valid settlement tx hash and
    // trustSettlementTxHash is enabled, skip tongo proof verification.
    // The settlement executor will verify the tx receipt on-chain
    // (execution_status, finality_status, actual token movement).
    if (this.trustSettlementTxHash && envelope.settlementTxHash) {
      return {
        ok: true,
        proofEnvelope: envelope,
        settlementTxHash: envelope.settlementTxHash,
      };
    }

    if (this.requireTongoProofBundle && !envelope.tongoProof) {
      return {
        ok: false,
        reasonCode: "INVALID_TONGO_PROOF",
        details: "missing tongo proof bundle",
      };
    }

    if (this.enableTongoCryptoVerification && envelope.tongoProof) {
      const cryptoResult = verifyX402TongoProofBundle(envelope.tongoProof);
      if (!cryptoResult.ok) {
        return {
          ok: false,
          reasonCode: "INVALID_TONGO_PROOF",
          details: cryptoResult.details || "tongo proof verification failed",
        };
      }
    }

    if (envelope.tongoProof) {
      const semanticBinding = verifyTongoProofSemanticBinding(
        envelope.tongoProof,
        input,
      );
      if (!semanticBinding.ok) {
        return semanticBinding;
      }
    }

    return {
      ok: true,
      proofEnvelope: envelope,
      settlementTxHash: envelope.settlementTxHash,
    };
  }
}

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (!raw) return fallback;
  const value = raw
    .replace(/\\r/gi, "")
    .replace(/\\n/gi, "")
    .replace(/\r/g, "")
    .replace(/\n/g, "")
    .trim()
    .toLowerCase();
  if (!value) return fallback;
  if (value === "true" || value === "1" || value === "yes") return true;
  if (value === "false" || value === "0" || value === "no") return false;
  return fallback;
}

export function createX402ProofVerifier(
  env: NodeJS.ProcessEnv = process.env,
): X402ProofVerifier {
  const mode = (env.X402_PROOF_VERIFIER_MODE || "strict")
    .replace(/\\r/gi, "")
    .replace(/\\n/gi, "")
    .replace(/\r/g, "")
    .replace(/\n/g, "")
    .trim()
    .toLowerCase();
  if (mode !== "strict") {
    throw new Error("X402_PROOF_VERIFIER_MODE must be strict");
  }
  const enableTongoCryptoVerification = parseBool(
    env.X402_TONGO_CRYPTO_VERIFY,
    true,
  );
  const requireTongoProofBundle = parseBool(
    env.X402_REQUIRE_TONGO_PROOF_BUNDLE,
    true,
  );
  // When a valid settlement tx hash is present in the envelope, trust it
  // and skip tongo proof crypto verification. The settlement executor
  // verifies the tx receipt on-chain (execution status, finality, token movement).
  const trustSettlementTxHash = parseBool(
    env.X402_TRUST_SETTLEMENT_TX_HASH,
    true,
  );

  return new StrictX402ProofVerifier(
    enableTongoCryptoVerification,
    requireTongoProofBundle,
    trustSettlementTxHash,
  );
}
