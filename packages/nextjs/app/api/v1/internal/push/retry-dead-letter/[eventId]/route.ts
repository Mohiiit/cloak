import { NextRequest, NextResponse } from "next/server";
import {
  notFound,
  serverError,
  unauthorized,
} from "../../../../_lib/errors";
import { isDispatchAuthorized } from "../../../../_lib/push/auth";
import { retryDeadLetterEvent } from "../../../../_lib/push/dispatcher";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    if (!isDispatchAuthorized(req)) {
      return unauthorized("Missing or invalid dispatch secret");
    }

    const { eventId } = await params;
    const updated = await retryDeadLetterEvent({ eventId });
    if (!updated) {
      return notFound("Dead-letter event not found");
    }

    return NextResponse.json(updated, { status: 200 });
  } catch (err) {
    console.error("[POST /api/v1/internal/push/retry-dead-letter/:eventId]", err);
    return serverError("Failed to retry dead-letter event");
  }
}

