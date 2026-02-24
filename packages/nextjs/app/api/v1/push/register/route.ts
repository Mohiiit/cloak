import { NextRequest, NextResponse } from "next/server";
import { authenticate, AuthError } from "../../_lib/auth";
import { getSupabase } from "../../_lib/supabase";
import { unauthorized, serverError } from "../../_lib/errors";
import {
  PushRegisterSchema,
  validate,
  ValidationError,
} from "../../_lib/validation";

export const runtime = "nodejs";

// ─── POST /api/v1/push/register ─────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticate(req);

    const body = await req.json();
    const data = validate(PushRegisterSchema, body);

    const sb = getSupabase();

    await sb.upsert(
      "push_subscriptions",
      {
        wallet_address: auth.wallet_address,
        device_id: data.device_id,
        platform: data.platform,
        token: data.token ?? null,
        endpoint: data.endpoint ?? null,
        p256dh: data.p256dh ?? null,
        auth: data.auth ?? null,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      "wallet_address,device_id",
    );

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    if (err instanceof ValidationError) return err.response;
    console.error("[POST /api/v1/push/register]", err);
    return serverError("Failed to register push subscription");
  }
}
