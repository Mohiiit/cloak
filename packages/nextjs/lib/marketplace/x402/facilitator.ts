import type {
  X402ErrorCode,
  X402PaymentPayloadRequest,
  X402SettleRequest,
  X402SettleResponse,
  X402VerifyRequest,
  X402VerifyResponse,
} from "@cloak-wallet/sdk";
import { verifyChallengeSignature, isChallengeExpired } from "./challenge";

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
  async verify(req: X402VerifyRequest): Promise<X402VerifyResponse> {
    const paymentRef = `pay_${req.payment.replayKey}`;
    if (!verifyChallengeSignature(req.challenge)) {
      return reject("INVALID_PAYLOAD", paymentRef, false);
    }
    if (isChallengeExpired(req.challenge)) {
      return reject("EXPIRED_PAYMENT", paymentRef, false);
    }
    if (req.payment.contextHash !== req.challenge.contextHash) {
      return reject("CONTEXT_MISMATCH", paymentRef, false);
    }
    return {
      status: "accepted",
      retryable: false,
      paymentRef,
    };
  }

  async settle(req: X402SettleRequest): Promise<X402SettleResponse> {
    const paymentRef = `pay_${req.payment.replayKey}`;
    const verify = await this.verify(req);
    if (verify.status === "rejected") {
      return {
        status: "rejected",
        paymentRef,
        reasonCode: verify.reasonCode,
      };
    }

    // Phase-08 skeleton: settlement hash is deterministic placeholder.
    return {
      status: "settled",
      paymentRef,
      txHash: `0x${Buffer.from(paymentRef).toString("hex").slice(0, 62)}`,
    };
  }
}

