import { NextResponse } from "next/server";
import { getX402MetricSnapshot } from "~~/lib/marketplace/x402/metrics";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    metrics: getX402MetricSnapshot(),
    generatedAt: new Date().toISOString(),
  });
}

