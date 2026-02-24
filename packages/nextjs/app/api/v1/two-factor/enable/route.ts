import { NextRequest, NextResponse } from "next/server";
import { normalizeAddress } from "@cloak-wallet/sdk";
import { authenticate, AuthError } from "../../_lib/auth";
import { getSupabase } from "../../_lib/supabase";
import { unauthorized, serverError } from "../../_lib/errors";
import { TwoFactorEnableSchema, validate, ValidationError } from "../../_lib/validation";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    await authenticate(req);

    const body = await req.json();
    const { wallet_address, secondary_public_key } = validate(TwoFactorEnableSchema, body);
    const normalized = normalizeAddress(wallet_address);
    const sb = getSupabase();

    await sb.upsert(
      "two_factor_configs",
      {
        wallet_address: normalized,
        secondary_public_key,
        updated_at: new Date().toISOString(),
      },
      "wallet_address",
    );

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    if (err instanceof ValidationError) return err.response;
    console.error("[POST /api/v1/two-factor/enable]", err);
    return serverError("Failed to enable 2FA");
  }
}
