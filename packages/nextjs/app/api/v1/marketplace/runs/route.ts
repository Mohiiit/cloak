import { NextRequest, NextResponse } from "next/server";
import { authenticate, AuthError } from "~~/app/api/v1/_lib/auth";
import { parseX402Challenge } from "@cloak-wallet/sdk";
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
import {
  checkAgentOnchainIdentity,
  isOnchainIdentityEnforced,
} from "~~/lib/marketplace/onchain-identity";
import { computeChallengeContextHash } from "~~/lib/marketplace/x402/challenge";
import { getMarketplaceFeatureFlags } from "~~/lib/marketplace/feature-flags";
import {
  validateSpendAuthorization,
  consumeSpendAuthorization,
} from "~~/lib/marketplace/spend-authorization";
import type { SpendAuthorization, SpendAuthorizationEvidence } from "@cloak-wallet/sdk";

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
  spend_authorization?: SpendAuthorization;
  /** x402 challenge + payment embedded in body (avoids header size limits). */
  _x402?: {
    challenge: Record<string, unknown>;
    payment: Record<string, unknown>;
  };
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

interface RunIdentityContext extends Record<string, unknown> {
  hire_id: string;
  agent_id: string;
  action: string;
  operator_wallet: string | null;
  service_wallet: string | null;
  onchain_enforced: boolean;
  onchain_status: string;
  onchain_owner: string | null;
  onchain_reason: string | null;
}

function buildRunIdentityContext(input: {
  hireId: string;
  agentId: string;
  action: string;
  operatorWallet: string | null;
  serviceWallet: string | null;
  onchainIdentity: Awaited<ReturnType<typeof checkAgentOnchainIdentity>> | null;
}): RunIdentityContext {
  return {
    hire_id: input.hireId,
    agent_id: input.agentId,
    action: input.action,
    operator_wallet: input.operatorWallet,
    service_wallet: input.serviceWallet,
    onchain_enforced: !!input.onchainIdentity?.enforced,
    onchain_status: input.onchainIdentity?.status || "skipped",
    onchain_owner: input.onchainIdentity?.owner || null,
    onchain_reason: input.onchainIdentity?.reason || null,
  };
}

function buildRunChallengeContext(
  req: NextRequest,
  identityContext: RunIdentityContext,
): Record<string, unknown> {
  return {
    method: req.method,
    path: req.nextUrl.pathname,
    ...identityContext,
  };
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
    console.log(`[GET /runs] wallet=${auth.wallet_address} total=${all.length} statuses=${all.map(r => `${r.id}:${r.status}`).join(",")}`);
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
    const onchainIdentityEnforced = isOnchainIdentityEnforced();
    if (onchainIdentityEnforced && !agentProfile) {
      return badRequest(
        "Agent profile is required when on-chain identity enforcement is enabled",
      );
    }
    const onchainIdentity = agentProfile
      ? await checkAgentOnchainIdentity({
          agentId: resolvedAgentId,
          operatorWallet: agentProfile.operator_wallet,
        })
      : null;
    if (onchainIdentity?.enforced && onchainIdentity.status === "mismatch") {
      return NextResponse.json(
        {
          error: "Agent on-chain identity mismatch",
          code: "ONCHAIN_IDENTITY_MISMATCH",
          details: onchainIdentity.reason,
        },
        { status: 409 },
      );
    }

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
    const serviceWallet =
      agentProfile?.service_wallet ||
      process.env.CLOAK_AGENT_SERVICE_ADDRESS ||
      auth.wallet_address;
    // Resolve minAmount: prefer request body, then agent pricing (Tongo units),
    // then fall back to X402_DEFAULTS.minAmount (also Tongo units).
    const agentPricingAmount =
      typeof agentProfile?.pricing?.amount === "string"
        ? agentProfile.pricing.amount
        : typeof agentProfile?.pricing?.amount === "number"
          ? String(agentProfile.pricing.amount)
          : undefined;
    const resolvedMinAmount = body.minAmount || agentPricingAmount || undefined;
    const identityContext = buildRunIdentityContext({
      hireId: body.hire_id,
      agentId: resolvedAgentId,
      action: normalizedAction,
      operatorWallet: agentProfile?.operator_wallet || null,
      serviceWallet: agentProfile?.service_wallet || null,
      onchainIdentity,
    });

    if (body.billable ?? true) {
      // x402 data may be in body._x402 (large ZK proofs exceed header limits)
      // or in traditional x-x402-payment / x-x402-challenge headers.
      const x402Body = body._x402 ?? undefined;
      const hasPayment = !!x402Body || !!req.headers.get("x-x402-payment");
      if (hasPayment) {
        const challengeRaw = x402Body
          ? JSON.stringify(x402Body.challenge)
          : req.headers.get("x-x402-challenge");
        if (!challengeRaw) {
          return badRequest("Missing challenge for x402 payment");
        }
        let challengeContextHash: string | null = null;
        try {
          challengeContextHash = parseX402Challenge(challengeRaw).contextHash;
        } catch {
          return badRequest("Invalid x402 challenge");
        }
        const expectedContextHash = computeChallengeContextHash(
          buildRunChallengeContext(req, identityContext),
        );
        if (challengeContextHash !== expectedContextHash) {
          return NextResponse.json(
            {
              error: "x402 challenge context no longer matches current on-chain identity",
              code: "ONCHAIN_IDENTITY_CONTEXT_MISMATCH",
            },
            { status: 409 },
          );
        }
      }

      // Extract Tongo address from agent pricing for shielded transfer payments.
      const agentTongoRecipient =
        typeof agentProfile?.pricing?.tongo_address === "string"
          ? agentProfile.pricing.tongo_address
          : undefined;
      const paywall = await shieldedPaywall(req, {
        recipient: serviceWallet,
        tongoRecipient: agentTongoRecipient,
        token: body.token,
        minAmount: resolvedMinAmount,
        context: identityContext,
        allowPendingSettlement: true,
        x402Body,
      });
      if (paywall instanceof NextResponse) return paywall;
      paymentRef = paywall.paymentRef;
      settlementTxHash = paywall.settlementTxHash ?? null;
      pendingSettlement = !paywall.ok && paywall.status === "pending";
      pendingReasonCode = !paywall.ok ? paywall.reasonCode : undefined;
    }

    // ─── Spend Authorization ───────────────────────────────────────────────
    let delegationEvidence: SpendAuthorizationEvidence | null = null;
    const flags = getMarketplaceFeatureFlags();
    if (body.spend_authorization) {
      // Consume the spend authorization whenever the client provides one,
      // regardless of whether enforcement is mandatory. This allows the
      // on-chain consume_and_transfer path to execute even when
      // spendAuthRequired is false (opt-in delegation).
      const spendAuth = body.spend_authorization;
      const spendValidation = await validateSpendAuthorization(spendAuth);
      if (!spendValidation.valid) {
        return badRequest(
          `Spend authorization rejected: ${spendValidation.reason}`,
          "SPEND_AUTH_REJECTED",
        );
      }
      // Delegated funds go to the agent signer (the account that executes the
      // on-chain operation), NOT the service wallet. The x402 fee is the agent's
      // payment; the delegation provides operational capital.
      const delegationRecipient =
        process.env.BASIC_PROTOCOL_SIGNER_ADDRESS ||
        process.env.ERC8004_SIGNER_ADDRESS ||
        serviceWallet;
      try {
        delegationEvidence = await consumeSpendAuthorization(spendAuth, delegationRecipient);
      } catch (err) {
        return badRequest(
          err instanceof Error ? err.message : "Spend authorization consume failed",
          "SPEND_AUTH_CONSUME_FAILED",
        );
      }
    } else if (flags.spendAuthRequired) {
      return badRequest(
        "spend_authorization is required when spend auth enforcement is enabled",
        "SPEND_AUTH_REQUIRED",
      );
    }

    const createdRun = await createRunRecord({
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
    const run =
      body.billable ?? true
        ? (await updateRunRecord(createdRun.id, {
            payment_evidence: {
              ...(createdRun.payment_evidence || {
                scheme: "cloak-shielded-x402",
                payment_ref: createdRun.payment_ref,
                settlement_tx_hash: createdRun.settlement_tx_hash,
              }),
              identity_context: identityContext,
            } as unknown as AgentRunResponse["payment_evidence"],
            ...(delegationEvidence
              ? { delegation_evidence: delegationEvidence }
              : {}),
          })) || createdRun
        : delegationEvidence
          ? (await updateRunRecord(createdRun.id, {
              delegation_evidence: delegationEvidence,
            })) || createdRun
          : createdRun;

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
              ...(delegationEvidence && body.spend_authorization
                ? {
                    delegationContext: {
                      spendAuthorization: body.spend_authorization,
                      evidence: delegationEvidence,
                    },
                  }
                : {}),
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
        finalizedRun.status === "completed"
          ? "run_completed"
          : finalizedRun.status === "running"
            ? "run_executing"
            : "run_failed",
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
  const nextPaymentState: NonNullable<
    NonNullable<AgentRunResponse["payment_evidence"]>["state"]
  > = execution.status === "completed" ? "settled" : "failed";
  const paymentEvidence =
    run.payment_evidence && run.billable
      ? {
          ...run.payment_evidence,
          state: nextPaymentState,
        }
      : run.payment_evidence;
  // If the agent runtime returned delegation_evidence in its result,
  // promote it to the top-level field so it's visible in the run response.
  const executionDelegation =
    execution.result?.delegation_evidence as SpendAuthorizationEvidence | undefined;
  return updateRunRecord(run.id, {
    status: execution.status === "completed" ? "completed" : "failed",
    execution_tx_hashes: execution.executionTxHashes,
    payment_evidence: paymentEvidence,
    result: execution.result,
    ...(executionDelegation && !run.delegation_evidence
      ? { delegation_evidence: executionDelegation }
      : {}),
  });
}
