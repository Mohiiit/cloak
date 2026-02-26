import { NextRequest, NextResponse } from "next/server";
import { X402Facilitator } from "./facilitator";
import { buildChallenge } from "./challenge";
import {
  X402ChallengeSchema,
  X402PaymentPayloadSchema,
  validate,
  ValidationError,
} from "~~/app/api/v1/_lib/validation";
import { createTraceId, logAgenticEvent } from "~~/lib/observability/agentic";
import { incrementX402Metric } from "./metrics";

const PAYMENT_HEADER = "x-x402-payment";
const CHALLENGE_HEADER = "x-x402-challenge";
const DEFAULT_MAX_HEADER_BYTES = 32 * 1024;

export interface ShieldedPaywallOptions {
  recipient: string;
  token?: string;
  minAmount?: string;
  ttlSeconds?: number;
  context?: Record<string, unknown>;
  facilitator?: X402Facilitator;
}

export interface ShieldedPaywallResult {
  ok: true;
  paymentRef: string;
  settlementTxHash?: string;
}

export interface ShieldedPaywallPendingResult {
  ok: false;
  status: "pending";
  paymentRef: string;
  settlementTxHash?: string;
  reasonCode?: string;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
}

export async function shieldedPaywall(
  req: NextRequest,
  options: ShieldedPaywallOptions & {
    allowPendingSettlement?: boolean;
  },
): Promise<ShieldedPaywallResult | ShieldedPaywallPendingResult | NextResponse> {
  const traceId = createTraceId("x402-paywall");
  const facilitator = options.facilitator ?? new X402Facilitator();
  const paymentHeader = req.headers.get(PAYMENT_HEADER);
  const challengeHeader = req.headers.get(CHALLENGE_HEADER);
  const maxHeaderBytes = parsePositiveInt(
    process.env.X402_MAX_HEADER_BYTES,
    DEFAULT_MAX_HEADER_BYTES,
  );

  if (paymentHeader && paymentHeader.length > maxHeaderBytes) {
    return NextResponse.json(
      {
        error: "x402 payment header too large",
        code: "INVALID_PAYLOAD",
      },
      { status: 413 },
    );
  }
  if (challengeHeader && challengeHeader.length > maxHeaderBytes) {
    return NextResponse.json(
      {
        error: "x402 challenge header too large",
        code: "INVALID_PAYLOAD",
      },
      { status: 413 },
    );
  }

  if (!paymentHeader) {
    const challenge = buildChallenge({
      recipient: options.recipient,
      token: options.token,
      minAmount: options.minAmount,
      ttlSeconds: options.ttlSeconds,
      context: {
        method: req.method,
        path: req.nextUrl.pathname,
        ...(options.context || {}),
      },
    });
    logAgenticEvent({
      level: "info",
      event: "x402.paywall.challenge",
      traceId,
      metadata: {
        path: req.nextUrl.pathname,
        challengeId: challenge.challengeId,
      },
    });
    incrementX402Metric("paywall_required");
    return NextResponse.json(
      {
        error: "Payment required",
        code: 402,
        challenge,
      },
      {
        status: 402,
        headers: {
          [CHALLENGE_HEADER]: JSON.stringify(challenge),
          "x-agentic-trace-id": traceId,
        },
      },
    );
  }

  if (!challengeHeader) {
    return NextResponse.json(
      {
        error: "Missing challenge header for x402 payment",
        code: "INVALID_PAYLOAD",
      },
      { status: 400 },
    );
  }

  try {
    const challenge = validate(X402ChallengeSchema, JSON.parse(challengeHeader));
    const payment = validate(X402PaymentPayloadSchema, JSON.parse(paymentHeader));
    const verify = await facilitator.verify({ challenge, payment });
    if (verify.status !== "accepted") {
      return NextResponse.json(verify, { status: 402 });
    }
    const settle = await facilitator.settle({ challenge, payment });
    if (settle.status !== "settled") {
      if (settle.status === "pending" && options.allowPendingSettlement) {
        return {
          ok: false,
          status: "pending",
          paymentRef: settle.paymentRef,
          settlementTxHash: settle.txHash,
          reasonCode: settle.reasonCode,
        };
      }
      return NextResponse.json(settle, { status: 402 });
    }
    incrementX402Metric("paywall_paid");

    return {
      ok: true,
      paymentRef: settle.paymentRef,
      settlementTxHash: settle.txHash,
    };
  } catch (err) {
    if (err instanceof ValidationError) return err.response;
    return NextResponse.json(
      {
        error: "Invalid x402 headers",
        code: "INVALID_PAYLOAD",
      },
      { status: 400 },
    );
  }
}
