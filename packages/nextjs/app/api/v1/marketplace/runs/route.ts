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
import {
  createTraceId,
  logAgenticEvent,
  logMarketplaceFunnelEvent,
} from "~~/lib/observability/agentic";
import { getHireRecord } from "~~/lib/marketplace/hires-repo";
import { getAgentProfileRecord } from "~~/lib/marketplace/agents-repo";
import type { AgentRunResponse } from "@cloak-wallet/sdk";
import {
  executeAgentRuntime,
  getSupportedActionsForAgentType,
  inferAgentType,
  isSupportedActionForAgentType,
} from "~~/lib/marketplace/agents/runtime";
import {
  consumeRateLimit,
  MARKETPLACE_RATE_LIMITS,
} from "~~/lib/marketplace/rate-limit";
import {
  hashIdempotencyRequest,
  lookupIdempotencyRecord,
  saveIdempotencyRecord,
} from "~~/lib/marketplace/idempotency-store";

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

function parseIntParam(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw === null || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticate(req);
    const limit = parseIntParam(
      req.nextUrl.searchParams.get("limit"),
      50,
      1,
      100,
    );
    const offset = parseIntParam(
      req.nextUrl.searchParams.get("offset"),
      0,
      0,
      Number.MAX_SAFE_INTEGER,
    );
    const hireId = req.nextUrl.searchParams.get("hire_id") || undefined;
    const agentId = req.nextUrl.searchParams.get("agent_id") || undefined;
    const status = req.nextUrl.searchParams.get("status") || undefined;
    const all = await listRunRecords({
      operatorWallet: auth.wallet_address,
      hireId,
      agentId,
      status: status as AgentRunResponse["status"] | undefined,
    });
    return NextResponse.json({
      runs: all.slice(offset, offset + limit),
      pagination: {
        limit,
        offset,
        total: all.length,
      },
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
    const normalizedAction = body.action.trim().toLowerCase();
    if (!normalizedAction) {
      return badRequest("action must not be empty");
    }
    const idempotencyKey = req.headers.get("idempotency-key")?.trim() || null;
    const requestHash = hashIdempotencyRequest(body);
    if (idempotencyKey) {
      const cached = lookupIdempotencyRecord({
        scope: "marketplace:runs:create",
        actor: auth.wallet_address,
        idempotencyKey,
        requestHash,
      });
      if (cached.kind === "conflict") {
        return NextResponse.json(
          {
            error: "Idempotency key reused with a different payload",
            code: "IDEMPOTENCY_KEY_REUSED",
          },
          { status: 409 },
        );
      }
      if (cached.kind === "replay") {
        return NextResponse.json(cached.record.body, {
          status: cached.record.status,
          headers: {
            ...(cached.record.headers || {}),
            "x-idempotent-replay": "true",
            "x-idempotency-key": idempotencyKey,
          },
        });
      }
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
    const shouldExecute = body.execute ?? true;
    const agentType =
      agentProfile?.agent_type || inferAgentType(resolvedAgentId);
    if (shouldExecute) {
      if (!agentType) {
        return badRequest(`Unable to infer agent type for ${resolvedAgentId}`);
      }
      if (!isSupportedActionForAgentType(agentType, normalizedAction)) {
        const supported = getSupportedActionsForAgentType(agentType);
        return badRequest(
          `Action "${normalizedAction}" is not supported for ${agentType}. Supported actions: ${supported.join(", ")}`,
        );
      }
    }

    logMarketplaceFunnelEvent({
      stage: "run_requested",
      traceId,
      actor: auth.wallet_address,
      metadata: {
        hire_id: body.hire_id,
        agent_id: resolvedAgentId,
        action: normalizedAction,
        billable: body.billable ?? true,
      },
    });

    let paymentRef: string | null = null;
    let settlementTxHash: string | null = null;
    let pendingSettlement = false;
    let pendingReasonCode: string | undefined;

    if (body.billable ?? true) {
      const paywall = await shieldedPaywall(req, {
        recipient:
          agentProfile?.service_wallet ||
          process.env.CLOAK_AGENT_SERVICE_ADDRESS ||
          auth.wallet_address,
        token: body.token,
        minAmount: body.minAmount,
        context: {
          hire_id: body.hire_id,
          agent_id: resolvedAgentId,
          action: normalizedAction,
        },
        allowPendingSettlement: true,
      });
      if (paywall instanceof NextResponse) return paywall;
      paymentRef = paywall.paymentRef;
      settlementTxHash = paywall.settlementTxHash ?? null;
      pendingSettlement = !paywall.ok && paywall.status === "pending";
      pendingReasonCode = !paywall.ok ? paywall.reasonCode : undefined;
    }

    const run = await createRunRecord({
      hireId: body.hire_id,
      agentId: resolvedAgentId,
      hireOperatorWallet: hire?.operator_wallet ?? auth.wallet_address,
      action: normalizedAction,
      params: body.params || {},
      billable: body.billable ?? true,
      initialStatus: body.billable ?? true ? "pending_payment" : "queued",
      paymentRef,
      settlementTxHash,
      agentTrustSnapshot: agentProfile?.trust_summary || null,
    });

    let queuedRun = run;
    if (run.billable && !pendingSettlement) {
      queuedRun =
        (await updateRunRecord(run.id, {
          status: "queued",
          payment_evidence: {
            ...(run.payment_evidence || {
              scheme: "cloak-shielded-x402",
              payment_ref: run.payment_ref,
              settlement_tx_hash: run.settlement_tx_hash,
            }),
            state: "settled",
          },
        })) || run;
    }

    if (pendingSettlement) {
      const pendingRun =
        (await updateRunRecord(run.id, {
          status: "pending_payment",
          payment_evidence: {
            ...(run.payment_evidence || {
              scheme: "cloak-shielded-x402",
              payment_ref: run.payment_ref,
              settlement_tx_hash: run.settlement_tx_hash,
            }),
            state: "pending_payment",
          },
          result: {
            payment_status: "pending_settlement",
            reason_code: pendingReasonCode || null,
          },
        })) || run;

      logAgenticEvent({
        level: "info",
        event: "marketplace.funnel.run_pending_payment",
        traceId,
        actor: auth.wallet_address,
        metadata: {
          run_id: pendingRun.id,
          hire_id: pendingRun.hire_id,
          agent_id: pendingRun.agent_id,
          action: pendingRun.action,
          status: pendingRun.status,
          payment_ref: pendingRun.payment_ref,
          reason_code: pendingReasonCode || null,
        },
      });

      const responseHeaders: Record<string, string> = {
        "x-agentic-trace-id": traceId,
      };
      if (idempotencyKey) {
        responseHeaders["x-idempotency-key"] = idempotencyKey;
        saveIdempotencyRecord({
          scope: "marketplace:runs:create",
          actor: auth.wallet_address,
          idempotencyKey,
          requestHash,
          status: 202,
          body: pendingRun,
          headers: responseHeaders,
        });
      }

      return NextResponse.json(pendingRun, {
        status: 202,
        headers: responseHeaders,
      });
    }

    const runToExecute =
      shouldExecute && agentType
        ? (await updateRunRecord(queuedRun.id, { status: "running" })) || queuedRun
        : queuedRun;

    const finalizedRun =
      shouldExecute && agentType && runToExecute.status === "running"
        ? (await updateRunWithExecution(
            runToExecute,
            await executeAgentRuntime({
              agentType,
              action: normalizedAction,
              params: body.params || {},
              operatorWallet: hire?.operator_wallet || auth.wallet_address,
              serviceWallet:
                agentProfile?.service_wallet ||
                process.env.CLOAK_AGENT_SERVICE_ADDRESS ||
                auth.wallet_address,
            }),
          )) || runToExecute
        : runToExecute;

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
    logMarketplaceFunnelEvent({
      stage:
        finalizedRun.status === "completed" ? "run_completed" : "run_failed",
      traceId,
      actor: auth.wallet_address,
      metadata: {
        run_id: finalizedRun.id,
        hire_id: finalizedRun.hire_id,
        agent_id: finalizedRun.agent_id,
        action: finalizedRun.action,
        status: finalizedRun.status,
        payment_ref: finalizedRun.payment_ref,
      },
      level: finalizedRun.status === "completed" ? "info" : "warn",
    });

    const responseHeaders: Record<string, string> = {
      "x-agentic-trace-id": traceId,
    };
    if (idempotencyKey) {
      responseHeaders["x-idempotency-key"] = idempotencyKey;
      saveIdempotencyRecord({
        scope: "marketplace:runs:create",
        actor: auth.wallet_address,
        idempotencyKey,
        requestHash,
        status: 201,
        body: finalizedRun,
        headers: responseHeaders,
      });
    }

    return NextResponse.json(finalizedRun, {
      status: 201,
      headers: responseHeaders,
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
  const paymentEvidence =
    run.payment_evidence && run.billable
      ? {
          ...run.payment_evidence,
          state: execution.status === "completed" ? "settled" : "failed",
        }
      : run.payment_evidence;
  return updateRunRecord(run.id, {
    status: execution.status === "completed" ? "completed" : "failed",
    execution_tx_hashes: execution.executionTxHashes,
    payment_evidence: paymentEvidence,
    result: execution.result,
  });
}
