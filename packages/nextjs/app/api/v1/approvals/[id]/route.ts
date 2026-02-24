import { NextRequest, NextResponse } from "next/server";
import { authenticate, AuthError } from "../../_lib/auth";
import { getSupabase } from "../../_lib/supabase";
import { notFound, unauthorized, serverError } from "../../_lib/errors";
import { UpdateApprovalSchema, validate, ValidationError } from "../../_lib/validation";

export const runtime = "nodejs";

const TERMINAL_STATUSES = new Set(["approved", "rejected", "expired"]);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await authenticate(req);

    const { id } = await params;
    const sb = getSupabase();

    const rows = await sb.select(
      "approval_requests",
      `id=eq.${id}`,
    );

    if (rows.length === 0) {
      return notFound("Approval request not found");
    }

    return NextResponse.json(rows[0]);
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    console.error("[GET /api/v1/approvals/:id]", err);
    return serverError("Failed to fetch approval request");
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await authenticate(req);

    const { id } = await params;
    const body = await req.json();
    const data = validate(UpdateApprovalSchema, body);

    const sb = getSupabase();

    const updateData: Record<string, unknown> = { ...data };

    if (data.status && TERMINAL_STATUSES.has(data.status)) {
      updateData.responded_at = new Date().toISOString();
    }

    const rows = await sb.update(
      "approval_requests",
      `id=eq.${id}`,
      updateData,
    );

    if (rows.length === 0) {
      return notFound("Approval request not found");
    }

    return NextResponse.json(rows[0], { status: 200 });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    if (err instanceof ValidationError) return err.response;
    console.error("[PATCH /api/v1/approvals/:id]", err);
    return serverError("Failed to update approval request");
  }
}
