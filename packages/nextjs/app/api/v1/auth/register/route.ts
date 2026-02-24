import { NextRequest, NextResponse } from "next/server";
import { normalizeAddress } from "@cloak-wallet/sdk";
import { getSupabase } from "../../_lib/supabase";
import { hashApiKey } from "../../_lib/auth";
import { conflict, serverError } from "../../_lib/errors";
import { AuthRegisterSchema, validate, ValidationError } from "../../_lib/validation";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { wallet_address, public_key } = validate(AuthRegisterSchema, body);
    const normalized = normalizeAddress(wallet_address);
    const sb = getSupabase();

    // Check if wallet already registered
    const existing = await sb.select<{ id: string }>(
      "api_keys",
      `wallet_address=eq.${normalized}`,
      { limit: 1 },
    );

    if (existing.length > 0) {
      return conflict("Wallet already registered. Use your existing API key.");
    }

    // Generate new API key
    const apiKey = crypto.randomUUID();
    const keyHash = await hashApiKey(apiKey);

    await sb.insert("api_keys", {
      wallet_address: normalized,
      key_hash: keyHash,
      public_key: public_key ?? null,
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({ api_key: apiKey }, { status: 201 });
  } catch (err) {
    if (err instanceof ValidationError) return err.response;
    console.error("[POST /api/v1/auth/register]", err);
    return serverError("Failed to register wallet");
  }
}
