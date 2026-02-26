import { NextRequest, NextResponse } from "next/server";
import { serverError, unauthorized } from "../../../_lib/errors";
import { isDispatchAuthorized } from "../../../_lib/push/auth";
import { getPushMetricSnapshot } from "../../../_lib/push/metrics";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    if (!isDispatchAuthorized(req)) {
      return unauthorized("Missing or invalid dispatch secret");
    }

    return NextResponse.json(
      {
        metrics: getPushMetricSnapshot(),
      },
      { status: 200 },
    );
  } catch (err) {
    console.error("[GET /api/v1/internal/push/metrics]", err);
    return serverError("Failed to fetch push dispatch metrics");
  }
}

