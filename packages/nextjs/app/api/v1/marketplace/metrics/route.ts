import { NextRequest, NextResponse } from "next/server";
import { authenticate, AuthError } from "~~/app/api/v1/_lib/auth";
import { serverError, unauthorized } from "~~/app/api/v1/_lib/errors";
import { listAgentProfileRecords } from "~~/lib/marketplace/agents-repo";
import {
  computeFreshnessSnapshot,
  getRegistryMetricsSnapshot,
} from "~~/lib/marketplace/registry-metrics";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await authenticate(req);
    const profiles = await listAgentProfileRecords();
    return NextResponse.json({
      metrics: getRegistryMetricsSnapshot(),
      freshness: computeFreshnessSnapshot(profiles),
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    console.error("[GET /api/v1/marketplace/metrics]", err);
    return serverError("Failed to fetch marketplace metrics");
  }
}
