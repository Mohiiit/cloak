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
  getAgentProfile,
  updateAgentProfile,
} from "~~/lib/marketplace/agents-store";
import { adaptAgentProfileWithRegistry } from "~~/lib/marketplace/profile-adapter";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ agentId: string }> },
) {
  try {
    await authenticate(req);
    const { agentId } = await context.params;
    const profile = getAgentProfile(agentId);
    if (!profile) return notFound("Agent not found");
    const refreshOnchain = req.nextUrl.searchParams.get("refresh_onchain") === "true";
    if (!refreshOnchain) return NextResponse.json(profile);
    try {
      const adapted = await adaptAgentProfileWithRegistry(profile);
      return NextResponse.json(adapted);
    } catch {
      return NextResponse.json(profile);
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
    const profile = getAgentProfile(agentId);
    if (!profile) return notFound("Agent not found");
    if (profile.operator_wallet.toLowerCase() !== auth.wallet_address.toLowerCase()) {
      return forbidden("Only operator can update this agent");
    }

    const body = await req.json();
    const patch = validate(UpdateAgentProfileSchema, body);
    if (Object.keys(patch).length === 0) {
      return badRequest("At least one updatable field is required");
    }

    const updated = updateAgentProfile(agentId, patch);
    if (!updated) return notFound("Agent not found");
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    if (err instanceof ValidationError) return err.response;
    if (err instanceof SyntaxError) return badRequest("Invalid JSON body");
    console.error("[PATCH /api/v1/marketplace/agents/[agentId]]", err);
    return serverError("Failed to update agent profile");
  }
}
