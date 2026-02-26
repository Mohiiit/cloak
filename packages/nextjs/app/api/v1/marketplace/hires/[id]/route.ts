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
  UpdateAgentHireSchema,
  ValidationError,
  validate,
} from "~~/app/api/v1/_lib/validation";
import { getHireRecord, updateHireStatusRecord } from "~~/lib/marketplace/hires-repo";
import {
  consumeRateLimit,
  MARKETPLACE_RATE_LIMITS,
} from "~~/lib/marketplace/rate-limit";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authenticate(req);
    const writeLimit = consumeRateLimit(
      "marketplace:hires:write",
      auth.wallet_address,
      MARKETPLACE_RATE_LIMITS.hiresWrite,
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
    const { id } = await context.params;
    const hire = await getHireRecord(id);
    if (!hire) return notFound("Hire not found");
    if (hire.operator_wallet.toLowerCase() !== auth.wallet_address.toLowerCase()) {
      return forbidden("Only operator can update this hire");
    }
    const body = await req.json();
    const patch = validate(UpdateAgentHireSchema, body);
    if (!patch.status) {
      return badRequest("status is required");
    }
    const updated = await updateHireStatusRecord(id, patch.status);
    if (!updated) return notFound("Hire not found");
    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    if (err instanceof ValidationError) return err.response;
    if (err instanceof SyntaxError) return badRequest("Invalid JSON body");
    console.error("[PATCH /api/v1/marketplace/hires/[id]]", err);
    return serverError("Failed to update hire");
  }
}
