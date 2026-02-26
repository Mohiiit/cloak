import { NextRequest, NextResponse } from "next/server";
import { authenticate, AuthError, type AuthContext } from "~~/app/api/v1/_lib/auth";
import { unauthorized } from "~~/app/api/v1/_lib/errors";
import {
  consumeRateLimit,
  MARKETPLACE_RATE_LIMITS,
  type RateLimitRule,
} from "~~/lib/marketplace/rate-limit";

export type X402RouteScope = "challenge" | "verify" | "settle" | "reconcile";

export interface X402RouteGuardResult {
  actorKey: string;
  auth?: AuthContext;
}

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (!raw) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }
  return fallback;
}

function resolveRateRule(scope: X402RouteScope): RateLimitRule {
  switch (scope) {
    case "challenge":
      return MARKETPLACE_RATE_LIMITS.x402Challenge;
    case "verify":
      return MARKETPLACE_RATE_LIMITS.x402Verify;
    case "settle":
      return MARKETPLACE_RATE_LIMITS.x402Settle;
    case "reconcile":
      return MARKETPLACE_RATE_LIMITS.x402Reconcile;
    default:
      return MARKETPLACE_RATE_LIMITS.x402Verify;
  }
}

function deriveAnonymousActor(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded
      .split(",")
      .map(item => item.trim())
      .find(Boolean);
    if (first) return `ip:${first}`;
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return `ip:${realIp.trim()}`;
  const userAgent = req.headers.get("user-agent");
  if (userAgent) return `ua:${userAgent.slice(0, 120)}`;
  return "anonymous";
}

export async function enforceX402RouteGuard(
  req: NextRequest,
  scope: X402RouteScope,
  options?: { requireAuth?: boolean },
): Promise<X402RouteGuardResult | NextResponse> {
  const requireAuth =
    options?.requireAuth ??
    parseBool(process.env.X402_ENDPOINTS_REQUIRE_AUTH, false);
  const hasApiKey = !!(
    req.headers.get("x-api-key") || req.headers.get("X-API-Key")
  );

  let auth: AuthContext | undefined;
  if (requireAuth || hasApiKey) {
    try {
      auth = await authenticate(req);
    } catch (error) {
      if (error instanceof AuthError) {
        return unauthorized(error.message);
      }
      throw error;
    }
  }

  const actorKey = auth?.wallet_address || deriveAnonymousActor(req);
  const limit = consumeRateLimit(
    `marketplace:x402:${scope}`,
    actorKey,
    resolveRateRule(scope),
  );
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: "Rate limit exceeded",
        code: "RATE_LIMITED",
        retry_after: limit.retryAfterSeconds,
      },
      { status: 429 },
    );
  }

  return {
    actorKey,
    auth,
  };
}
