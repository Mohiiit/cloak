import { NextRequest, NextResponse } from "next/server";
import { authenticate, AuthError } from "~~/app/api/v1/_lib/auth";
import {
  badRequest,
  forbidden,
  unauthorized,
  serverError,
} from "~~/app/api/v1/_lib/errors";
import {
  createRunRecord,
  listRunRecords,
  updateRunRecord,
} from "~~/lib/marketplace/runs-repo";
import { shieldedPaywall } from "~~/lib/marketplace/x402/paywall";
import { createTraceId, logAgenticEvent } from "~~/lib/observability/agentic";
import { getHireRecord } from "~~/lib/marketplace/hires-repo";
import { getAgentProfileRecord } from "~~/lib/marketplace/agents-repo";
import type { AgentRunResponse } from "@cloak-wallet/sdk";
import {
  executeAgentRuntime,
  inferAgentType,
} from "~~/lib/marketplace/agents/runtime";
import {
  consumeRateLimit,
  MARKETPLACE_RATE_LIMITS,
} from "~~/lib/marketplace/rate-limit";

export const runtime = "nodejs";

interface CreateRunBody {
  hire_id: string;
  agent_id?: string;
  action: string;
  params?: Record<string, unknown>;
  billable?: boolean;
  token?: string;
  minAmount?: string;
  execute?: boolean;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticate(req);
    return NextResponse.json({
      runs: await listRunRecords({
        operatorWallet: auth.wallet_address,
      }),
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

    if (!body.hire_id || !body.action) {
      return badRequest("hire_id and action are required");
    }

    const hire = await getHireRecord(body.hire_id);
    if (hire && body.agent_id && hire.agent_id !== body.agent_id) {
      return badRequest("agent_id does not match hire");
    }
    if (
      hire &&
      hire.operator_wallet.toLowerCase() !== auth.wallet_address.toLowerCase()
    ) {
      return forbidden("Only operator can create runs for this hire");
    }
    const resolvedAgentId = hire?.agent_id || body.agent_id;
    if (!resolvedAgentId) {
      return badRequest("agent_id is required when hire does not exist");
    }
    const agentProfile = await getAgentProfileRecord(resolvedAgentId);

    let paymentRef: string | null = null;
    let settlementTxHash: string | null = null;

    if (body.billable ?? true) {
      const paywall = await shieldedPaywall(req, {
        recipient: process.env.CLOAK_AGENT_SERVICE_ADDRESS || auth.wallet_address,
        token: body.token,
        minAmount: body.minAmount,
        context: {
          hire_id: body.hire_id,
          agent_id: resolvedAgentId,
          action: body.action,
        },
      });
      if (paywall instanceof NextResponse) return paywall;
      paymentRef = paywall.paymentRef;
      settlementTxHash = paywall.settlementTxHash ?? null;
    }

    const run = await createRunRecord({
      hireId: body.hire_id,
      agentId: resolvedAgentId,
      hireOperatorWallet: hire?.operator_wallet ?? auth.wallet_address,
      action: body.action,
      params: body.params || {},
      billable: body.billable ?? true,
      paymentRef,
      settlementTxHash,
      agentTrustSnapshot: agentProfile?.trust_summary || null,
    });

    const shouldExecute = body.execute ?? true;
    const agentType = agentProfile?.agent_type || inferAgentType(resolvedAgentId);
    const finalizedRun =
      shouldExecute && agentType
        ? (await updateRunWithExecution(
            run,
            await executeAgentRuntime({
              agentType,
              action: body.action,
              params: body.params || {},
              operatorWallet: hire?.operator_wallet || auth.wallet_address,
              serviceWallet:
                agentProfile?.service_wallet || process.env.CLOAK_AGENT_SERVICE_ADDRESS || auth.wallet_address,
            }),
          ) || run)
        : run;

    logAgenticEvent({
      level: "info",
      event: "marketplace.runs.created",
      traceId,
      actor: auth.wallet_address,
      metadata: {
        runId: finalizedRun.id,
        hireId: finalizedRun.hire_id,
        billable: finalizedRun.billable,
        paymentRef: finalizedRun.payment_ref,
        status: finalizedRun.status,
      },
    });

    return NextResponse.json(finalizedRun, {
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

async function updateRunWithExecution(
  run: AgentRunResponse,
  execution: Awaited<ReturnType<typeof executeAgentRuntime>>,
) {
  return updateRunRecord(run.id, {
    status: execution.status === "completed" ? "completed" : "failed",
    execution_tx_hashes: execution.executionTxHashes,
    result: execution.result,
  });
}
