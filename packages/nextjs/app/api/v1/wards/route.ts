import { NextRequest, NextResponse } from "next/server";
import { normalizeAddress } from "@cloak-wallet/sdk";
import { authenticate, AuthError } from "../_lib/auth";
import { getSupabase } from "../_lib/supabase";
import { badRequest, unauthorized, serverError } from "../_lib/errors";
import {
  CreateWardConfigSchema,
  validate,
  ValidationError,
} from "../_lib/validation";

export const runtime = "nodejs";

interface WardConfigRow {
  id: string;
  ward_address: string;
  guardian_address: string;
  ward_public_key: string;
  guardian_public_key: string;
  status: string;
  require_guardian_for_all: boolean;
  spending_limit_per_tx: string | null;
  max_per_tx: string | null;
  pseudo_name: string | null;
  created_at: string;
  updated_at: string | null;
}

/**
 * POST /api/v1/wards
 * Create a new ward config.
 */
export async function POST(req: NextRequest) {
  try {
    await authenticate(req);

    const body = await req.json();
    const data = validate(CreateWardConfigSchema, body);

    const sb = getSupabase();

    const rows = await sb.insert<WardConfigRow>("ward_configs", {
      ...data,
      ward_address: normalizeAddress(data.ward_address),
      guardian_address: normalizeAddress(data.guardian_address),
      status: "active",
      require_guardian_for_all: true,
      created_at: new Date().toISOString(),
    });

    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    if (err instanceof ValidationError) return err.response;
    console.error("[POST /api/v1/wards]", err);
    return serverError("Failed to create ward config");
  }
}

/**
 * GET /api/v1/wards?guardian=0x...
 * List ward configs for a guardian.
 */
export async function GET(req: NextRequest) {
  try {
    await authenticate(req);

    const guardian = req.nextUrl.searchParams.get("guardian");
    if (!guardian) {
      return badRequest("Missing required query parameter: guardian");
    }

    const normalized = normalizeAddress(guardian);
    const sb = getSupabase();

    const rows = await sb.select<WardConfigRow>(
      "ward_configs",
      `guardian_address=eq.${normalized}&status=neq.removed`,
      { orderBy: "created_at.desc" },
    );

    return NextResponse.json(rows);
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    console.error("[GET /api/v1/wards]", err);
    return serverError("Failed to fetch ward configs");
  }
}
