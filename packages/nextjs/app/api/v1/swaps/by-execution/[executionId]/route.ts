import { NextRequest, NextResponse } from "next/server";
import { authenticate, AuthError } from "../../../_lib/auth";
import { getSupabase } from "../../../_lib/supabase";
import { notFound, unauthorized, serverError } from "../../../_lib/errors";
import {
  UpdateSwapSchema,
  validate,
  ValidationError,
} from "../../../_lib/validation";

export const runtime = "nodejs";

// ─── PATCH /api/v1/swaps/by-execution/[executionId] ─────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ executionId: string }> },
) {
  try {
    await authenticate(req);

    const { executionId } = await params;
    const body = await req.json();
    const data = validate(UpdateSwapSchema, body);

    const sb = getSupabase();

    const updateData: Record<string, unknown> = { ...data };

    // Normalize tx_hashes if present
    if (Array.isArray(updateData.tx_hashes)) {
      const hashes = (updateData.tx_hashes as unknown[]).filter(
        (h): h is string => typeof h === "string" && !!h,
      );
      updateData.tx_hashes = hashes.length > 0 ? Array.from(new Set(hashes)) : null;
    }

    // Remove undefined fields
    for (const key of Object.keys(updateData)) {
      if (updateData[key] === undefined) delete updateData[key];
    }

    const rows = await sb.update(
      "swap_executions",
      `execution_id=eq.${executionId}`,
      updateData,
    );

    if (rows.length === 0) {
      return notFound("Swap execution not found");
    }

    return NextResponse.json(rows[0], { status: 200 });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    if (err instanceof ValidationError) return err.response;
    console.error("[PATCH /api/v1/swaps/by-execution/:executionId]", err);
    return serverError("Failed to update swap execution");
  }
}
