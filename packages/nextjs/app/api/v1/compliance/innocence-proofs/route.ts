import { NextRequest, NextResponse } from "next/server";
import { authenticate, AuthError } from "../../_lib/auth";
import { getSupabase } from "../../_lib/supabase";
import { unauthorized, serverError } from "../../_lib/errors";
import {
  CreateInnocenceProofSchema,
  validate,
  ValidationError,
} from "../../_lib/validation";

export const runtime = "nodejs";

// ─── POST /api/v1/compliance/innocence-proofs ───────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticate(req);

    const body = await req.json();
    const data = validate(CreateInnocenceProofSchema, body);

    const sb = getSupabase();

    const rows = await sb.insert("innocence_proofs", {
      owner_address: auth.wallet_address,
      proof_hash: data.proof_hash,
      circuit_version: data.circuit_version,
      nullifier_hash: data.nullifier_hash ?? null,
      note: data.note ?? null,
      created_at: new Date().toISOString(),
    });

    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    if (err instanceof ValidationError) return err.response;
    console.error("[POST /api/v1/compliance/innocence-proofs]", err);
    return serverError("Failed to create innocence proof");
  }
}

// ─── GET /api/v1/compliance/innocence-proofs ────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticate(req);

    const sb = getSupabase();

    const rows = await sb.select(
      "innocence_proofs",
      `owner_address=eq.${auth.wallet_address}`,
      { orderBy: "created_at.desc" },
    );

    return NextResponse.json(rows);
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    console.error("[GET /api/v1/compliance/innocence-proofs]", err);
    return serverError("Failed to fetch innocence proofs");
  }
}
