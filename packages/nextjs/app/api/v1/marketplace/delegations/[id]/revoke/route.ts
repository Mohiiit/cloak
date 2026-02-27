import { NextRequest, NextResponse } from "next/server";
import { authenticate, AuthError } from "~~/app/api/v1/_lib/auth";
import {
  badRequest,
  notFound,
  unauthorized,
  forbidden,
  serverError,
} from "~~/app/api/v1/_lib/errors";
import {
  getDelegationRecord,
  revokeDelegationRecord,
} from "~~/lib/marketplace/delegation-repo";
import { getMarketplaceFeatureFlags } from "~~/lib/marketplace/feature-flags";
import {
  createTraceId,
  logAgenticEvent,
} from "~~/lib/observability/agentic";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const traceId = createTraceId("delegation-revoke");
  try {
    const flags = getMarketplaceFeatureFlags();
    if (!flags.delegationEnabled) {
      return NextResponse.json(
        { error: "Delegation feature is disabled", code: "FEATURE_DISABLED" },
        { status: 403 },
      );
    }

    const auth = await authenticate(req);
    const { id } = await params;
    if (!id) return badRequest("Delegation ID is required");

    const existing = await getDelegationRecord(id);
    if (!existing) return notFound("Delegation not found");

    if (existing.operator_wallet !== auth.wallet_address) {
      return forbidden("Only the operator can revoke this delegation");
    }

    if (existing.status === "revoked") {
      return NextResponse.json(existing);
    }

    const revoked = await revokeDelegationRecord(id, auth.wallet_address);
    if (!revoked) return serverError("Failed to revoke delegation");

    logAgenticEvent({
      level: "info",
      event: "marketplace.delegation.revoked",
      traceId,
      actor: auth.wallet_address,
      metadata: {
        delegation_id: id,
        agent_id: revoked.agent_id,
        consumed_amount: revoked.consumed_amount,
      },
    });

    return NextResponse.json(revoked, {
      headers: { "x-agentic-trace-id": traceId },
    });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    console.error("[POST /api/v1/marketplace/delegations/[id]/revoke]", err);
    return serverError("Failed to revoke delegation");
  }
}
