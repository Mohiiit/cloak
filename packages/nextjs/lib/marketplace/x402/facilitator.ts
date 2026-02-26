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
  type X402TongoProofEnvelope,
  type X402ProofVerifier,
} from "./proof-adapter";
import { X402SettlementExecutor } from "./settlement";
import { incrementX402Metric } from "./metrics";
import { createTraceId, logAgenticEvent } from "~~/lib/observability/agentic";

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
    private readonly settlementExecutor = new X402SettlementExecutor(),
  ) {}

  private async verifyInternal(req: X402VerifyRequest): Promise<{
    verify: X402VerifyResponse;
    proofEnvelope?: X402TongoProofEnvelope;
    settlementTxHash?: string;
  }> {
    const paymentRef = `pay_${req.payment.replayKey}`;
    const existing = await this.replayStore.get(req.payment.replayKey);
    if (existing?.status === "settled") {
      return {
        verify: reject("REPLAY_DETECTED", paymentRef, false),
      };
    }

    if (!verifyChallengeSignature(req.challenge)) {
      return {
        verify: reject("INVALID_PAYLOAD", paymentRef, false),
      };
    }
    if (isChallengeExpired(req.challenge)) {
      return {
        verify: reject("EXPIRED_PAYMENT", paymentRef, false),
      };
    }
    if (req.payment.contextHash !== req.challenge.contextHash) {
      return {
        verify: reject("CONTEXT_MISMATCH", paymentRef, false),
      };
    }
    if (req.payment.token !== req.challenge.token) {
      return {
        verify: reject("POLICY_DENIED", paymentRef, false),
      };
    }
    try {
      const amount = BigInt(req.payment.amount);
      const minAmount = BigInt(req.challenge.minAmount);
      if (amount < minAmount) {
        return {
          verify: reject("POLICY_DENIED", paymentRef, false),
        };
      }
    } catch {
      return {
        verify: reject("INVALID_PAYLOAD", paymentRef, false),
      };
    }
    const proofResult = await this.proofVerifier.verify({
      challenge: req.challenge,
      payment: req.payment,
    });
    if (!proofResult.ok) {
      return {
        verify: reject(
          proofResult.reasonCode || "INVALID_PAYLOAD",
          paymentRef,
          false,
        ),
      };
    }
    return {
      verify: {
        status: "accepted",
        retryable: false,
        paymentRef,
      },
      proofEnvelope: proofResult.proofEnvelope,
      settlementTxHash: proofResult.settlementTxHash,
    };
  }

  async verify(req: X402VerifyRequest): Promise<X402VerifyResponse> {
    const resolved = await this.verifyInternal(req);
    return resolved.verify;
  }

  async settle(req: X402SettleRequest): Promise<X402SettleResponse> {
    const paymentRef = `pay_${req.payment.replayKey}`;
    const traceId = createTraceId(`x402-facilitator-${req.payment.replayKey}`);
    const existing = await this.replayStore.get(req.payment.replayKey);
    if (existing?.status === "settled") {
      incrementX402Metric("replay_settled");
      return {
        status: "settled",
        paymentRef: existing.payment_ref || paymentRef,
        txHash: existing.settlement_tx_hash ?? undefined,
      };
    }

    const verifyResult = await this.verifyInternal(req);
    const verify = verifyResult.verify;
    if (verify.status === "rejected") {
      await this.replayStore.markRejected(
        req.payment.replayKey,
        paymentRef,
        verify.reasonCode || "INVALID_PAYLOAD",
      );
      incrementX402Metric("settle_rejected");
      incrementX402Metric("replay_rejected");
      logAgenticEvent({
        level: "warn",
        event: "x402.facilitator.settle.rejected",
        traceId,
        metadata: {
          paymentRef,
          replayKey: req.payment.replayKey,
          reasonCode: verify.reasonCode || "INVALID_PAYLOAD",
        },
      });
      return {
        status: "rejected",
        paymentRef,
        reasonCode: verify.reasonCode,
      };
    }

    await this.replayStore.registerPending(req.payment.replayKey, paymentRef);
    incrementX402Metric("replay_pending");

    const settlement = await this.settlementExecutor.settle({
      challenge: req.challenge,
      payment: req.payment,
      proofEnvelope: verifyResult.proofEnvelope,
      settlementTxHash: verifyResult.settlementTxHash,
    });
    if (settlement.status === "pending") {
      await this.replayStore.markPending(
        req.payment.replayKey,
        paymentRef,
        settlement.txHash ?? null,
      );
      incrementX402Metric("settle_pending");
      incrementX402Metric("replay_pending");
      logAgenticEvent({
        level: "info",
        event: "x402.facilitator.settle.pending",
        traceId,
        metadata: {
          paymentRef,
          replayKey: req.payment.replayKey,
          txHash: settlement.txHash || null,
          reasonCode: settlement.reasonCode || null,
        },
      });
      return {
        status: "pending",
        paymentRef,
        txHash: settlement.txHash,
        reasonCode: settlement.reasonCode,
      };
    }
    if (settlement.status === "failed") {
      await this.replayStore.markRejected(
        req.payment.replayKey,
        paymentRef,
        settlement.reasonCode || "SETTLEMENT_FAILED",
      );
      incrementX402Metric("settle_failed");
      incrementX402Metric("replay_rejected");
      logAgenticEvent({
        level: "warn",
        event: "x402.facilitator.settle.failed",
        traceId,
        metadata: {
          paymentRef,
          replayKey: req.payment.replayKey,
          txHash: settlement.txHash || null,
          reasonCode: settlement.reasonCode || "SETTLEMENT_FAILED",
          details: settlement.details || null,
        },
      });
      return {
        status: "failed",
        paymentRef,
        txHash: settlement.txHash,
        reasonCode: settlement.reasonCode || "SETTLEMENT_FAILED",
      };
    }

    if (!settlement.txHash) {
      await this.replayStore.markRejected(
        req.payment.replayKey,
        paymentRef,
        "SETTLEMENT_FAILED",
      );
      incrementX402Metric("settle_failed");
      incrementX402Metric("replay_rejected");
      return {
        status: "failed",
        paymentRef,
        reasonCode: "SETTLEMENT_FAILED",
      };
    }
    await this.replayStore.markSettled(
      req.payment.replayKey,
      paymentRef,
      settlement.txHash,
    );
    incrementX402Metric("settle_settled");
    incrementX402Metric("replay_settled");
    logAgenticEvent({
      level: "info",
      event: "x402.facilitator.settle.settled",
      traceId,
      metadata: {
        paymentRef,
        replayKey: req.payment.replayKey,
        txHash: settlement.txHash,
      },
    });
    return {
      status: "settled",
      paymentRef,
      txHash: settlement.txHash,
    };
  }
}
