import { NextRequest, NextResponse } from "next/server";
import { authenticate, AuthError } from "~~/app/api/v1/_lib/auth";
import { serverError, unauthorized } from "~~/app/api/v1/_lib/errors";
import {
  consumeRateLimit,
  MARKETPLACE_RATE_LIMITS,
} from "~~/lib/marketplace/rate-limit";
import { listAgentTypeDefinitions } from "~~/lib/marketplace/agent-types-catalog";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticate(req);
    const readLimit = consumeRateLimit(
      "marketplace:agent-types:read",
      auth.wallet_address,
      MARKETPLACE_RATE_LIMITS.agentsRead,
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

    const agentTypes = await listAgentTypeDefinitions();
    return NextResponse.json({
      agent_types: agentTypes,
      count: agentTypes.length,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    console.error("[GET /api/v1/marketplace/agent-types]", err);
    return serverError("Failed to list agent types");
  }
}
