import { NextRequest, NextResponse } from "next/server";
import { authenticate, AuthError } from "~~/app/api/v1/_lib/auth";
import {
  forbidden,
  serverError,
  unauthorized,
} from "~~/app/api/v1/_lib/errors";
import {
  CreateAgentHireSchema,
  ValidationError,
  validate,
} from "~~/app/api/v1/_lib/validation";
import { getAgentProfile } from "~~/lib/marketplace/agents-store";
import { createHire, listHires } from "~~/lib/marketplace/hires-store";
import {
  consumeRateLimit,
  MARKETPLACE_RATE_LIMITS,
} from "~~/lib/marketplace/rate-limit";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticate(req);
    const readLimit = consumeRateLimit(
      "marketplace:hires:read",
      auth.wallet_address,
      MARKETPLACE_RATE_LIMITS.hiresRead,
    );
    if (!readLimit.allowed) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          code: "RATE_LIMITED",
          retry_after: readLimit.retryAfterSeconds,
        },
        { status: 429 },
      );
    }
    const hires = listHires({
      operatorWallet: auth.wallet_address,
      agentId: req.nextUrl.searchParams.get("agent_id") || undefined,
    });
    return NextResponse.json({ hires });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    console.error("[GET /api/v1/marketplace/hires]", err);
    return serverError("Failed to list hires");
  }
}

export async function POST(req: NextRequest) {
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
    const body = await req.json();
    const data = validate(CreateAgentHireSchema, body);

    if (data.operator_wallet.toLowerCase() !== auth.wallet_address.toLowerCase()) {
      return forbidden("operator_wallet must match authenticated wallet");
    }

    const profile = getAgentProfile(data.agent_id);
    if (!profile || profile.status !== "active") {
      return NextResponse.json(
        { error: "Agent is unavailable", code: "AGENT_UNAVAILABLE" },
        { status: 409 },
      );
    }

    const hire = createHire(data);
    return NextResponse.json(hire, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    if (err instanceof ValidationError) return err.response;
    console.error("[POST /api/v1/marketplace/hires]", err);
    return serverError("Failed to create hire");
  }
}
