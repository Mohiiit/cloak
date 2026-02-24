import { NextRequest, NextResponse } from "next/server";
import { authenticate, AuthError } from "../../../../_lib/auth";
import { getSupabase } from "../../../../_lib/supabase";
import { notFound, unauthorized, serverError } from "../../../../_lib/errors";

export const runtime = "nodejs";

// ─── PATCH /api/v1/compliance/viewing-grants/[id]/revoke ────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authenticate(req);

    const { id } = await params;

    let reason: string | null = null;
    try {
      const body = await req.json();
      reason = body?.reason ?? null;
    } catch {
      // Body is optional for revocation
    }

    const sb = getSupabase();

    // Verify the grant exists and belongs to the authenticated user
    const existing = await sb.select<{
      id: string;
      owner_address: string;
      status: string;
    }>(
      "viewing_key_grants",
      `id=eq.${id}`,
      { limit: 1 },
    );

    if (existing.length === 0) {
      return notFound("Viewing grant not found");
    }

    if (existing[0].owner_address !== auth.wallet_address) {
      return unauthorized("Cannot revoke a grant you do not own");
    }

    const rows = await sb.update(
      "viewing_key_grants",
      `id=eq.${id}`,
      {
        status: "revoked",
        revoked_at: new Date().toISOString(),
        revocation_reason: reason,
      },
    );

    if (rows.length === 0) {
      return notFound("Viewing grant not found");
    }

    return NextResponse.json(rows[0], { status: 200 });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    console.error("[PATCH /api/v1/compliance/viewing-grants/:id/revoke]", err);
    return serverError("Failed to revoke viewing grant");
  }
}
