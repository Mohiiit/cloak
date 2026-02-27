import { NextRequest, NextResponse } from "next/server";
import { authenticate, AuthError } from "~~/app/api/v1/_lib/auth";
import {
  badRequest,
  forbidden,
  notFound,
  serverError,
  unauthorized,
} from "~~/app/api/v1/_lib/errors";
import {
  UpdateAgentProfileSchema,
  ValidationError,
  validate,
} from "~~/app/api/v1/_lib/validation";
import {
  getAgentProfileRecord,
  updateAgentProfileRecord,
} from "~~/lib/marketplace/agents-repo";
import { adaptAgentProfileWithRegistry } from "~~/lib/marketplace/profile-adapter";
import { incrementRegistryMetric } from "~~/lib/marketplace/registry-metrics";
import { checkAgentOnchainIdentity } from "~~/lib/marketplace/onchain-identity";
import { reconcilePendingAgentRegistrationWrite } from "~~/lib/marketplace/onchain-registration";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ agentId: string }> },
) {
  try {
    await authenticate(req);
    const { agentId } = await context.params;
    const profile = await getAgentProfileRecord(agentId);
    if (!profile) return notFound("Agent not found");
    const refreshOnchain = req.nextUrl.searchParams.get("refresh_onchain") === "true";
    if (!refreshOnchain) return NextResponse.json(profile);
    incrementRegistryMetric("onchain_refreshes");
    const writeOutcome = await reconcilePendingAgentRegistrationWrite({
      status: profile.onchain_write_status,
      txHash: profile.onchain_write_tx_hash,
    });
    const maybeUpdatedProfile = writeOutcome
      ? ((await updateAgentProfileRecord(agentId, {
          onchain_write_status: writeOutcome.status,
          onchain_write_tx_hash: writeOutcome.txHash,
          onchain_write_reason: writeOutcome.reason,
          onchain_write_checked_at: writeOutcome.checkedAt,
        })) ?? profile)
      : profile;
    try {
      const adapted = await adaptAgentProfileWithRegistry(maybeUpdatedProfile);
      return NextResponse.json(adapted);
    } catch {
      return NextResponse.json(maybeUpdatedProfile);
    }
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    console.error("[GET /api/v1/marketplace/agents/[agentId]]", err);
    return serverError("Failed to fetch agent profile");
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ agentId: string }> },
) {
  try {
    const auth = await authenticate(req);
    const { agentId } = await context.params;
    const profile = await getAgentProfileRecord(agentId);
    if (!profile) return notFound("Agent not found");
    if (profile.operator_wallet.toLowerCase() !== auth.wallet_address.toLowerCase()) {
      return forbidden("Only operator can update this agent");
    }

    const body = await req.json();
    const patch = validate(UpdateAgentProfileSchema, body);
    if (Object.keys(patch).length === 0) {
      return badRequest("At least one updatable field is required");
    }
    const onchainIdentity = await checkAgentOnchainIdentity({
      agentId,
      operatorWallet: profile.operator_wallet,
    });
    if (onchainIdentity.enforced && onchainIdentity.status === "mismatch") {
      return NextResponse.json(
        {
          error: "On-chain identity mismatch",
          code: "ONCHAIN_IDENTITY_MISMATCH",
          details: onchainIdentity.reason,
        },
        { status: 409 },
      );
    }

    const updated = await updateAgentProfileRecord(agentId, patch);
    if (!updated) return notFound("Agent not found");
    incrementRegistryMetric("profiles_updated");
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    if (err instanceof ValidationError) return err.response;
    if (err instanceof SyntaxError) return badRequest("Invalid JSON body");
    console.error("[PATCH /api/v1/marketplace/agents/[agentId]]", err);
    return serverError("Failed to update agent profile");
  }
}
