import { NextRequest, NextResponse } from "next/server";
import { authenticate, AuthError } from "~~/app/api/v1/_lib/auth";
import { badRequest, unauthorized, serverError } from "~~/app/api/v1/_lib/errors";
import { createRun, listRuns } from "~~/lib/marketplace/runs-store";
import { shieldedPaywall } from "~~/lib/marketplace/x402/paywall";
import { createTraceId, logAgenticEvent } from "~~/lib/observability/agentic";
import {
  consumeRateLimit,
  MARKETPLACE_RATE_LIMITS,
} from "~~/lib/marketplace/rate-limit";

export const runtime = "nodejs";

interface CreateRunBody {
  hire_id: string;
  agent_id: string;
  action: string;
  params?: Record<string, unknown>;
  billable?: boolean;
  token?: string;
  minAmount?: string;
}

export async function GET(req: NextRequest) {
  try {
    await authenticate(req);
    return NextResponse.json({
      runs: listRuns(),
    });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    console.error("[GET /api/v1/marketplace/runs]", err);
    return serverError("Failed to list runs");
  }
}

export async function POST(req: NextRequest) {
  const traceId = createTraceId("marketplace-runs-post");
  try {
    const auth = await authenticate(req);
    const writeLimit = consumeRateLimit(
      "marketplace:runs:write",
      auth.wallet_address,
      MARKETPLACE_RATE_LIMITS.runsWrite,
    );
    if (!writeLimit.allowed) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          code: "RATE_LIMITED",
          retry_after: writeLimit.retryAfterSeconds,
        },
        { status: 429 },
      );
    }
    const body = (await req.json()) as CreateRunBody;

    if (!body.hire_id || !body.agent_id || !body.action) {
      return badRequest("hire_id, agent_id and action are required");
    }

    let paymentRef: string | null = null;
    let settlementTxHash: string | null = null;

    if (body.billable ?? true) {
      const paywall = await shieldedPaywall(req, {
        recipient: process.env.CLOAK_AGENT_SERVICE_ADDRESS || auth.wallet_address,
        token: body.token,
        minAmount: body.minAmount,
        context: {
          hire_id: body.hire_id,
          agent_id: body.agent_id,
          action: body.action,
        },
      });
      if (paywall instanceof NextResponse) return paywall;
      paymentRef = paywall.paymentRef;
      settlementTxHash = paywall.settlementTxHash ?? null;
    }

    const run = createRun({
      hireId: body.hire_id,
      agentId: body.agent_id,
      action: body.action,
      params: body.params || {},
      billable: body.billable ?? true,
      paymentRef,
      settlementTxHash,
    });

    logAgenticEvent({
      level: "info",
      event: "marketplace.runs.created",
      traceId,
      actor: auth.wallet_address,
      metadata: {
        runId: run.id,
        hireId: run.hire_id,
        billable: run.billable,
        paymentRef: run.payment_ref,
      },
    });

    return NextResponse.json(run, {
      status: 201,
      headers: {
        "x-agentic-trace-id": traceId,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    if (err instanceof SyntaxError) return badRequest("Invalid JSON body");
    console.error("[POST /api/v1/marketplace/runs]", err);
    return serverError("Failed to create run");
  }
}
