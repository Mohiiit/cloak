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
}

export interface X402ProofVerifier {
  verify(
    input: X402ProofVerificationInput,
  ): Promise<X402ProofVerificationResult> | X402ProofVerificationResult;
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
  verify(input: X402ProofVerificationInput): X402ProofVerificationResult {
    const proof = input.payment.proof || "";
    // Keep strict mode deterministic and backwards compatible with current demo payloads.
    // Production deployments can swap this adapter with a zk verifier implementation.
    if (!/^[a-zA-Z0-9._:-]{8,4096}$/.test(proof)) {
      return {
        ok: false,
        reasonCode: "INVALID_PAYLOAD",
        details: "proof format invalid",
      };
    }
    return { ok: true };
  }
}

export function createX402ProofVerifier(
  env: NodeJS.ProcessEnv = process.env,
): X402ProofVerifier {
  const mode = (env.X402_PROOF_VERIFIER_MODE || "lenient").trim().toLowerCase();
  if (mode === "strict") return new StrictX402ProofVerifier();
  return new LenientX402ProofVerifier();
}
