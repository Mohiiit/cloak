import type {
  X402ErrorCode,
  X402PaymentPayloadRequest,
  X402SettleRequest,
  X402SettleResponse,
  X402VerifyRequest,
  X402VerifyResponse,
} from "@cloak-wallet/sdk";
import { verifyChallengeSignature, isChallengeExpired } from "./challenge";
import { X402ReplayStore } from "./replay-store";
import {
  createX402ProofVerifier,
  type X402ProofVerifier,
} from "./proof-adapter";

export interface X402PolicyInput {
  payment: X402PaymentPayloadRequest;
  expectedToken: string;
  minAmount: string;
  expectedContextHash: string;
}

function reject(
  reasonCode: X402ErrorCode,
  paymentRef: string,
  retryable = false,
): X402VerifyResponse {
  return {
    status: "rejected",
    reasonCode,
    retryable,
    paymentRef,
  };
}

export class X402Facilitator {
  constructor(
    private readonly replayStore = new X402ReplayStore(),
    private readonly proofVerifier: X402ProofVerifier = createX402ProofVerifier(),
  ) {}

  async verify(req: X402VerifyRequest): Promise<X402VerifyResponse> {
    const paymentRef = `pay_${req.payment.replayKey}`;
    const existing = await this.replayStore.get(req.payment.replayKey);
    if (existing?.status === "settled") {
      return reject("REPLAY_DETECTED", paymentRef, false);
    }

    if (!verifyChallengeSignature(req.challenge)) {
      return reject("INVALID_PAYLOAD", paymentRef, false);
    }
    if (isChallengeExpired(req.challenge)) {
      return reject("EXPIRED_PAYMENT", paymentRef, false);
    }
    if (req.payment.contextHash !== req.challenge.contextHash) {
      return reject("CONTEXT_MISMATCH", paymentRef, false);
    }
    if (req.payment.token !== req.challenge.token) {
      return reject("POLICY_DENIED", paymentRef, false);
    }
    try {
      const amount = BigInt(req.payment.amount);
      const minAmount = BigInt(req.challenge.minAmount);
      if (amount < minAmount) {
        return reject("POLICY_DENIED", paymentRef, false);
      }
    } catch {
      return reject("INVALID_PAYLOAD", paymentRef, false);
    }
    const proofResult = await this.proofVerifier.verify({
      challenge: req.challenge,
      payment: req.payment,
    });
    if (!proofResult.ok) {
      return reject(proofResult.reasonCode || "INVALID_PAYLOAD", paymentRef, false);
    }
    return {
      status: "accepted",
      retryable: false,
      paymentRef,
    };
  }

  async settle(req: X402SettleRequest): Promise<X402SettleResponse> {
    const paymentRef = `pay_${req.payment.replayKey}`;
    const existing = await this.replayStore.get(req.payment.replayKey);
    if (existing?.status === "settled") {
      return {
        status: "settled",
        paymentRef: existing.payment_ref || paymentRef,
        txHash: existing.settlement_tx_hash ?? undefined,
      };
    }

    const verify = await this.verify(req);
    if (verify.status === "rejected") {
      await this.replayStore.markRejected(
        req.payment.replayKey,
        paymentRef,
        verify.reasonCode || "INVALID_PAYLOAD",
      );
      return {
        status: "rejected",
        paymentRef,
        reasonCode: verify.reasonCode,
      };
    }

    await this.replayStore.registerPending(req.payment.replayKey, paymentRef);

    const settled = {
      status: "settled",
      paymentRef,
      txHash: `0x${Buffer.from(paymentRef).toString("hex").slice(0, 62)}`,
    };
    await this.replayStore.markSettled(
      req.payment.replayKey,
      paymentRef,
      settled.txHash,
    );
    return settled;
  }
}
