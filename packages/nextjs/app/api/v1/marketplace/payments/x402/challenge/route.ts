import { NextRequest, NextResponse } from "next/server";
import { buildChallenge } from "~~/lib/marketplace/x402/challenge";
import { incrementX402Metric } from "~~/lib/marketplace/x402/metrics";
import { badRequest, serverError } from "~~/app/api/v1/_lib/errors";
import { logAgenticEvent, createTraceId } from "~~/lib/observability/agentic";

export const runtime = "nodejs";

interface ChallengeRequestBody {
  recipient?: string;
  token?: string;
  minAmount?: string;
  context?: Record<string, unknown>;
  network?: string;
  ttlSeconds?: number;
}

export async function POST(req: NextRequest) {
  const traceId = createTraceId("x402-challenge");
  try {
    const body = (await req.json()) as ChallengeRequestBody;
    if (!body.recipient) {
      return badRequest("recipient is required");
    }

    const challenge = buildChallenge({
      recipient: body.recipient,
      token: body.token,
      minAmount: body.minAmount,
      context: body.context,
      network: body.network,
      ttlSeconds: body.ttlSeconds,
    });
    incrementX402Metric("challenge_issued");

    logAgenticEvent({
      level: "info",
      event: "x402.challenge.issued",
      traceId,
      metadata: {
        challengeId: challenge.challengeId,
        recipient: challenge.recipient,
        token: challenge.token,
      },
    });

    return NextResponse.json(
      {
        challenge,
      },
      {
        status: 200,
        headers: {
          "x-x402-challenge": JSON.stringify(challenge),
          "x-agentic-trace-id": traceId,
        },
      },
    );
  } catch (err) {
    console.error("[POST /api/v1/marketplace/payments/x402/challenge]", err);
    return serverError("Failed to generate x402 challenge");
  }
}
