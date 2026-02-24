import { NextRequest, NextResponse } from "next/server";
import { authenticate, AuthError } from "../../_lib/auth";
import { getSupabase } from "../../_lib/supabase";
import { badRequest, unauthorized, serverError } from "../../_lib/errors";
import {
  CreateViewingGrantSchema,
  validate,
  ValidationError,
} from "../../_lib/validation";

export const runtime = "nodejs";

// ─── POST /api/v1/compliance/viewing-grants ─────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticate(req);

    const body = await req.json();
    const data = validate(CreateViewingGrantSchema, body);

    const sb = getSupabase();

    const rows = await sb.insert("viewing_key_grants", {
      owner_address: auth.wallet_address,
      viewer_address: data.viewer_address,
      encrypted_viewing_key: data.encrypted_viewing_key,
      scope: data.scope,
      expires_at: data.expires_at ?? null,
      status: "active",
      created_at: new Date().toISOString(),
    });

    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    if (err instanceof ValidationError) return err.response;
    console.error("[POST /api/v1/compliance/viewing-grants]", err);
    return serverError("Failed to create viewing grant");
  }
}

// ─── GET /api/v1/compliance/viewing-grants ──────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticate(req);

    const role = req.nextUrl.searchParams.get("role") || "owner";
    const includeRevoked =
      req.nextUrl.searchParams.get("include_revoked") === "true";

    const sb = getSupabase();

    // Filter by role: owner sees grants they created, viewer sees grants shared with them
    const addressFilter =
      role === "viewer"
        ? `viewer_address=eq.${auth.wallet_address}`
        : `owner_address=eq.${auth.wallet_address}`;

    const filters = includeRevoked
      ? addressFilter
      : `${addressFilter}&status=eq.active`;

    const rows = await sb.select(
      "viewing_key_grants",
      filters,
      { orderBy: "created_at.desc" },
    );

    return NextResponse.json(rows);
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    console.error("[GET /api/v1/compliance/viewing-grants]", err);
    return serverError("Failed to fetch viewing grants");
  }
}
