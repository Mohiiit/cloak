import type {
  X402ErrorCode,
  X402PaymentPayloadRequest,
  X402VerifyRequest,
} from "@cloak-wallet/sdk";

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
    return parsed;
  } catch {
    return null;
  }
}

export class LenientX402ProofVerifier implements X402ProofVerifier {
  verify(input: X402ProofVerificationInput): X402ProofVerificationResult {
    const proof = input.payment.proof || "";
    if (proof.length < 4) {
      return {
        ok: false,
        reasonCode: "INVALID_PAYLOAD",
        details: "proof too short",
      };
    }
    return { ok: true };
  }
}

export class StrictX402ProofVerifier implements X402ProofVerifier {
  constructor(private readonly allowLegacyProof = true) {}

  verify(input: X402ProofVerificationInput): X402ProofVerificationResult {
    const proof = input.payment.proof || "";
    const envelope = parseEnvelope(proof);
    if (!envelope) {
      if (!this.allowLegacyProof) {
        return {
          ok: false,
          reasonCode: "INVALID_PAYLOAD",
          details: "proof envelope invalid",
        };
      }
      if (!/^[a-zA-Z0-9._:-]{8,4096}$/.test(proof)) {
        return {
          ok: false,
          reasonCode: "INVALID_PAYLOAD",
          details: "legacy proof format invalid",
        };
      }
      return { ok: true };
    }

    const expectedIntentHash = computeIntentHash(input);
    if (envelope.intentHash !== expectedIntentHash) {
      return {
        ok: false,
        reasonCode: "CONTEXT_MISMATCH",
        details: "proof intent hash mismatch",
      };
    }
    return {
      ok: true,
      proofEnvelope: envelope,
      settlementTxHash: envelope.settlementTxHash,
    };
  }
}

export function createX402ProofVerifier(
  env: NodeJS.ProcessEnv = process.env,
): X402ProofVerifier {
  const mode = (env.X402_PROOF_VERIFIER_MODE || "strict").trim().toLowerCase();
  if (mode === "strict") {
    const allowLegacy = (env.X402_LEGACY_PROOF_COMPAT || "true").trim().toLowerCase() !== "false";
    return new StrictX402ProofVerifier(allowLegacy);
  }
  return new LenientX402ProofVerifier();
}
