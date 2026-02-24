import { NextRequest, NextResponse } from "next/server";
import { normalizeAddress } from "@cloak-wallet/sdk";
import { authenticate, AuthError } from "../../_lib/auth";
import { getSupabase } from "../../_lib/supabase";
import { badRequest, unauthorized, serverError } from "../../_lib/errors";

export const runtime = "nodejs";

export async function DELETE(req: NextRequest) {
  try {
    await authenticate(req);

    const body = await req.json();
    const { wallet_address } = body ?? {};

    if (!wallet_address || typeof wallet_address !== "string") {
      return badRequest("Missing required field: wallet_address");
    }

    const normalized = normalizeAddress(wallet_address);
    const sb = getSupabase();

    await sb.del("two_factor_configs", `wallet_address=eq.${normalized}`);

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    console.error("[DELETE /api/v1/two-factor/disable]", err);
    return serverError("Failed to disable 2FA");
  }
}
