import { NextRequest, NextResponse } from "next/server";
import { badRequest, serverError, unauthorized } from "../../../_lib/errors";
import { isDispatchAuthorized } from "../../../_lib/push/auth";
import { dispatchWardApprovalPushEvents } from "../../../_lib/push/dispatcher";

export const runtime = "nodejs";

function parseMaxEvents(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(Math.floor(n), 200);
}

function parseBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  const normalized = value.toLowerCase().trim();
  return ["1", "true", "yes", "on"].includes(normalized);
}

export async function POST(req: NextRequest) {
  try {
    if (!isDispatchAuthorized(req)) {
      return unauthorized("Missing or invalid dispatch secret");
    }

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const maxEvents = parseMaxEvents(body.max_events);
    if (body.max_events !== undefined && maxEvents === undefined) {
      return badRequest("Invalid max_events value");
    }

    const summary = await dispatchWardApprovalPushEvents({
      maxEvents,
      dryRun: parseBoolean(body.dry_run),
    });

    return NextResponse.json(summary, { status: 200 });
  } catch (err) {
    console.error("[POST /api/v1/internal/push/dispatch]", err);
    return serverError("Failed to dispatch push notifications");
  }
}

export async function GET(req: NextRequest) {
  try {
    if (!isDispatchAuthorized(req)) {
      return unauthorized("Missing or invalid dispatch secret");
    }
    const summary = await dispatchWardApprovalPushEvents();
    return NextResponse.json(summary, { status: 200 });
  } catch (err) {
    console.error("[GET /api/v1/internal/push/dispatch]", err);
    return serverError("Failed to dispatch push notifications");
  }
}
