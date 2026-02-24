import { NextRequest, NextResponse } from "next/server";
import { normalizeAddress } from "@cloak-wallet/sdk";
import { authenticate, AuthError } from "../../_lib/auth";
import { getSupabase } from "../../_lib/supabase";
import { badRequest, unauthorized, serverError } from "../../_lib/errors";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await authenticate(req);

    const wallet = req.nextUrl.searchParams.get("wallet");
    if (!wallet) {
      return badRequest("Missing required query parameter: wallet");
    }

    const normalized = normalizeAddress(wallet);
    const sb = getSupabase();

    const rows = await sb.select<{
      wallet_address: string;
      secondary_public_key: string;
    }>("two_factor_configs", `wallet_address=eq.${normalized}`);

    if (rows.length === 0) {
      return NextResponse.json({ enabled: false });
    }

    return NextResponse.json({
      enabled: true,
      secondary_public_key: rows[0].secondary_public_key,
    });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    console.error("[GET /api/v1/two-factor/status]", err);
    return serverError("Failed to fetch 2FA status");
  }
}
