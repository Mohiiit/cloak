import { NextRequest, NextResponse } from "next/server";
import { authenticate, AuthError } from "../../_lib/auth";
import { getSupabase } from "../../_lib/supabase";
import { notFound, unauthorized, serverError } from "../../_lib/errors";
import {
  UpdateTransactionSchema,
  validate,
  ValidationError,
} from "../../_lib/validation";

export const runtime = "nodejs";

// ─── PATCH /api/v1/transactions/[txHash] ────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ txHash: string }> },
) {
  try {
    await authenticate(req);

    const { txHash } = await params;
    const body = await req.json();
    const data = validate(UpdateTransactionSchema, body);

    const sb = getSupabase();

    const updateData: Record<string, unknown> = { ...data };
    // Clean undefined fields
    for (const key of Object.keys(updateData)) {
      if (updateData[key] === undefined) delete updateData[key];
    }

    const rows = await sb.update(
      "transactions",
      `tx_hash=eq.${txHash}`,
      updateData,
    );

    if (rows.length === 0) {
      return notFound("Transaction not found");
    }

    return NextResponse.json(rows[0], { status: 200 });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    if (err instanceof ValidationError) return err.response;
    console.error("[PATCH /api/v1/transactions/:txHash]", err);
    return serverError("Failed to update transaction");
  }
}
