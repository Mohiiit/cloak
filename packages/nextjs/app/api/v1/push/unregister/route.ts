import { NextRequest, NextResponse } from "next/server";
import { authenticate, AuthError } from "../../_lib/auth";
import { getSupabase } from "../../_lib/supabase";
import { badRequest, unauthorized, serverError } from "../../_lib/errors";

export const runtime = "nodejs";

// ─── DELETE /api/v1/push/unregister ─────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  try {
    const auth = await authenticate(req);

    let body: { device_id?: string };
    try {
      body = await req.json();
    } catch {
      return badRequest("Missing request body with device_id");
    }

    const deviceId = body?.device_id;
    if (!deviceId) {
      return badRequest("Missing required field: device_id");
    }

    const sb = getSupabase();

    await sb.update(
      "push_subscriptions",
      `wallet_address=eq.${auth.wallet_address}&device_id=eq.${deviceId}`,
      { is_active: false },
    );

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    console.error("[DELETE /api/v1/push/unregister]", err);
    return serverError("Failed to unregister push subscription");
  }
}
