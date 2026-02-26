import { NextRequest, NextResponse } from "next/server";
import { unauthorized, serverError } from "~~/app/api/v1/_lib/errors";
import { X402ReconciliationWorker } from "~~/lib/marketplace/x402/reconcile";
import { createTraceId, logAgenticEvent } from "~~/lib/observability/agentic";
import { enforceX402RouteGuard } from "../_lib/guard";

export const runtime = "nodejs";

function readBearerToken(raw: string | null): string | null {
  if (!raw) return null;
  const [scheme, token] = raw.split(/\s+/, 2);
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== "bearer") return null;
  return token.trim();
}

function isAuthorized(req: NextRequest): boolean {
  const secret =
    process.env.X402_RECONCILE_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    "";
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  const bearer = readBearerToken(req.headers.get("authorization"));
  const header = req.headers.get("x-x402-reconcile-secret");
  return bearer === secret || header === secret;
}

function parseLimit(raw: string | null): number {
  if (!raw) return 50;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(1, Math.min(Math.trunc(parsed), 500));
}

export async function POST(req: NextRequest) {
  const traceId = createTraceId("x402-reconcile-route");
  try {
    if (!isAuthorized(req)) {
      return unauthorized("Missing or invalid reconciliation secret");
    }

    const guard = await enforceX402RouteGuard(req, "reconcile");
    if (guard instanceof NextResponse) return guard;

    const limit = parseLimit(req.nextUrl.searchParams.get("limit"));
    const worker = new X402ReconciliationWorker();
    const summary = await worker.run(limit);

    logAgenticEvent({
      level: "info",
      event: "x402.reconcile.route.completed",
      traceId,
      actor: guard.auth?.wallet_address,
      metadata: {
        actorKey: guard.actorKey,
        limit,
        summary,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        summary,
      },
      {
        status: 200,
        headers: {
          "x-agentic-trace-id": traceId,
        },
      },
    );
  } catch (error) {
    console.error("[POST /api/v1/marketplace/payments/x402/reconcile]", error);
    return serverError("Failed to reconcile x402 pending settlements");
  }
}
