import { NextRequest, NextResponse } from "next/server";
import { X402Facilitator } from "~~/lib/marketplace/x402/facilitator";
import { badRequest, serverError } from "~~/app/api/v1/_lib/errors";
import {
  ValidationError,
  validate,
  X402SettleRequestSchema,
} from "~~/app/api/v1/_lib/validation";
import { createTraceId, logAgenticEvent } from "~~/lib/observability/agentic";

export const runtime = "nodejs";

const facilitator = new X402Facilitator();

export async function POST(req: NextRequest) {
  const traceId = createTraceId("x402-settle");
  try {
    const body = await req.json();
    const parsed = validate(X402SettleRequestSchema, body);
    const result = await facilitator.settle(parsed);

    logAgenticEvent({
      level: result.status === "settled" ? "info" : "warn",
      event: "x402.settle.completed",
      traceId,
      metadata: {
        challengeId: parsed.challenge.challengeId,
        paymentRef: result.paymentRef,
        status: result.status,
        reasonCode: result.reasonCode,
        txHash: result.txHash,
      },
    });

    return NextResponse.json(result, {
      status: 200,
      headers: {
        "x-agentic-trace-id": traceId,
      },
    });
  } catch (err) {
    if (err instanceof ValidationError) return err.response;
    if (err instanceof SyntaxError) return badRequest("Invalid JSON body");
    console.error("[POST /api/v1/marketplace/payments/x402/settle]", err);
    return serverError("Failed to settle x402 payment");
  }
}

