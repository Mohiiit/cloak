import { NextRequest, NextResponse } from "next/server";
import { authenticate, AuthError } from "~~/app/api/v1/_lib/auth";
import {
  badRequest,
  unauthorized,
  serverError,
} from "~~/app/api/v1/_lib/errors";
import {
  createDelegationRecord,
  listDelegationRecords,
} from "~~/lib/marketplace/delegation-repo";
import { getMarketplaceFeatureFlags } from "~~/lib/marketplace/feature-flags";
import {
  createTraceId,
  logAgenticEvent,
} from "~~/lib/observability/agentic";
import type { CreateDelegationRequest } from "@cloak-wallet/sdk";

export const runtime = "nodejs";

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
    const flags = getMarketplaceFeatureFlags();
    if (!flags.delegationEnabled) {
      return NextResponse.json(
        { error: "Delegation feature is disabled", code: "FEATURE_DISABLED" },
        { status: 403 },
      );
    }

    const auth = await authenticate(req);
    const agentId = req.nextUrl.searchParams.get("agent_id") || undefined;
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

    const all = await listDelegationRecords(auth.wallet_address, agentId);
    return NextResponse.json({
      delegations: all.slice(offset, offset + limit),
      pagination: { limit, offset, total: all.length },
    });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    console.error("[GET /api/v1/marketplace/delegations]", err);
    return serverError("Failed to list delegations");
  }
}

export async function POST(req: NextRequest) {
  const traceId = createTraceId("delegation-create");
  try {
    const flags = getMarketplaceFeatureFlags();
    if (!flags.delegationEnabled) {
      return NextResponse.json(
        { error: "Delegation feature is disabled", code: "FEATURE_DISABLED" },
        { status: 403 },
      );
    }

    const auth = await authenticate(req);
    const body = (await req.json()) as CreateDelegationRequest;

    if (
      !body.agent_id ||
      !body.agent_type ||
      !body.token ||
      !body.max_per_run ||
      !body.total_allowance ||
      !body.valid_from ||
      !body.valid_until
    ) {
      return badRequest(
        "agent_id, agent_type, token, max_per_run, total_allowance, valid_from, valid_until are required",
      );
    }
    if (
      !body.allowed_actions ||
      !Array.isArray(body.allowed_actions) ||
      body.allowed_actions.length === 0
    ) {
      return badRequest("allowed_actions must be a non-empty array");
    }

    try {
      BigInt(body.max_per_run);
      BigInt(body.total_allowance);
    } catch {
      return badRequest("max_per_run and total_allowance must be valid numeric strings");
    }

    if (new Date(body.valid_until) <= new Date(body.valid_from)) {
      return badRequest("valid_until must be after valid_from");
    }

    const delegation = await createDelegationRecord(auth.wallet_address, body);

    logAgenticEvent({
      level: "info",
      event: "marketplace.delegation.created",
      traceId,
      actor: auth.wallet_address,
      metadata: {
        delegation_id: delegation.id,
        agent_id: delegation.agent_id,
        total_allowance: delegation.total_allowance,
        onchain_tx_hash: delegation.onchain_tx_hash,
        onchain_delegation_id: delegation.onchain_delegation_id,
        delegation_contract: delegation.delegation_contract,
      },
    });

    return NextResponse.json(delegation, {
      status: 201,
      headers: { "x-agentic-trace-id": traceId },
    });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    if (err instanceof SyntaxError) return badRequest("Invalid JSON body");
    console.error("[POST /api/v1/marketplace/delegations]", err);
    return serverError("Failed to create delegation");
  }
}
