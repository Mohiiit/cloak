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
import { getAgentProfileRecord } from "~~/lib/marketplace/agents-repo";
import { createHireRecord, listHireRecords } from "~~/lib/marketplace/hires-repo";
import {
  consumeRateLimit,
  MARKETPLACE_RATE_LIMITS,
} from "~~/lib/marketplace/rate-limit";

export const runtime = "nodejs";

function parseIntParam(raw: string | null, fallback: number, min: number, max: number): number {
  if (raw === null || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

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
    const limit = parseIntParam(req.nextUrl.searchParams.get("limit"), 50, 1, 100);
    const offset = parseIntParam(req.nextUrl.searchParams.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER);
    const status = req.nextUrl.searchParams.get("status") || undefined;
    const all = await listHireRecords({
      operatorWallet: auth.wallet_address,
      agentId: req.nextUrl.searchParams.get("agent_id") || undefined,
      status: status as "active" | "paused" | "revoked" | undefined,
    });
    const hires = all.slice(offset, offset + limit);
    return NextResponse.json({
      hires,
      pagination: {
        limit,
        offset,
        total: all.length,
      },
    });
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

    const profile = await getAgentProfileRecord(data.agent_id);
    if (!profile || profile.status !== "active") {
      return NextResponse.json(
        { error: "Agent is unavailable", code: "AGENT_UNAVAILABLE" },
        { status: 409 },
      );
    }

    const hire = await createHireRecord(data);
    return NextResponse.json(hire, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    if (err instanceof ValidationError) return err.response;
    console.error("[POST /api/v1/marketplace/hires]", err);
    return serverError("Failed to create hire");
  }
}
