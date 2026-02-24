import { NextRequest, NextResponse } from "next/server";
import { authenticate, AuthError } from "../../_lib/auth";
import { getSupabase } from "../../_lib/supabase";
import { badRequest, unauthorized, serverError } from "../../_lib/errors";
import {
  UpsertSwapStepSchema,
  validate,
  ValidationError,
} from "../../_lib/validation";

export const runtime = "nodejs";

// ─── POST /api/v1/swaps/steps ──────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    await authenticate(req);

    const body = await req.json();
    const data = validate(UpsertSwapStepSchema, body);

    const sb = getSupabase();

    const row: Record<string, unknown> = {
      ...data,
      tx_hash: data.tx_hash || null,
      message: data.message || null,
      metadata: data.metadata || null,
      started_at: data.started_at || null,
      finished_at: data.finished_at || null,
    };

    // Null out undefined optional fields
    for (const key of Object.keys(row)) {
      if (row[key] === undefined) row[key] = null;
    }

    // Upsert: check if step already exists for this execution_id + step_key + attempt
    const filters = `execution_id=eq.${data.execution_id}&step_key=eq.${data.step_key}&attempt=eq.${data.attempt}`;
    const existing = await sb.select<{ id: string }>(
      "swap_execution_steps",
      filters,
      { orderBy: "updated_at.desc", limit: 1 },
    );

    if (existing.length > 0 && existing[0].id) {
      // Update existing step
      const updated = await sb.update(
        "swap_execution_steps",
        `id=eq.${existing[0].id}`,
        row,
      );
      return NextResponse.json(updated[0] || existing[0], { status: 200 });
    }

    // Insert new step
    const inserted = await sb.insert("swap_execution_steps", row);
    return NextResponse.json(inserted[0], { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    if (err instanceof ValidationError) return err.response;
    console.error("[POST /api/v1/swaps/steps]", err);
    return serverError("Failed to upsert swap step");
  }
}

// ─── GET /api/v1/swaps/steps ───────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    await authenticate(req);

    const executionIdsRaw = req.nextUrl.searchParams.get("execution_ids");
    if (!executionIdsRaw) {
      return badRequest("Missing required query parameter: execution_ids");
    }

    const executionIds = executionIdsRaw
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    if (executionIds.length === 0) {
      return NextResponse.json([]);
    }

    const sb = getSupabase();
    const inClause = executionIds.join(",");
    const rows = await sb.select(
      "swap_execution_steps",
      `execution_id=in.(${inClause})`,
      { orderBy: "created_at.asc" },
    );

    return NextResponse.json(rows);
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    console.error("[GET /api/v1/swaps/steps]", err);
    return serverError("Failed to fetch swap steps");
  }
}
