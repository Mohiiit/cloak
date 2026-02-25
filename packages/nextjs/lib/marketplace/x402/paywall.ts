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

const PAYMENT_HEADER = "x-x402-payment";
const CHALLENGE_HEADER = "x-x402-challenge";

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

export async function shieldedPaywall(
  req: NextRequest,
  options: ShieldedPaywallOptions,
): Promise<ShieldedPaywallResult | NextResponse> {
  const traceId = createTraceId("x402-paywall");
  const facilitator = options.facilitator ?? new X402Facilitator();
  const paymentHeader = req.headers.get(PAYMENT_HEADER);
  const challengeHeader = req.headers.get(CHALLENGE_HEADER);

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
      return NextResponse.json(settle, { status: 402 });
    }

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

