import { NextRequest, NextResponse } from "next/server";
import { normalizeAddress } from "@cloak-wallet/sdk";
import { authenticate, AuthError } from "../../_lib/auth";
import { getSupabase } from "../../_lib/supabase";
import {
  notFound,
  unauthorized,
  serverError,
} from "../../_lib/errors";
import {
  UpdateWardConfigSchema,
  validate,
  ValidationError,
} from "../../_lib/validation";

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
 * GET /api/v1/wards/[address]
 * Get a single ward config by ward address.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  try {
    await authenticate(req);

    const { address } = await params;
    const normalized = normalizeAddress(address);
    const sb = getSupabase();

    const rows = await sb.select<WardConfigRow>(
      "ward_configs",
      `ward_address=eq.${normalized}`,
      { limit: 1 },
    );

    if (rows.length === 0) {
      return notFound("Ward config not found");
    }

    return NextResponse.json(rows[0]);
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    console.error("[GET /api/v1/wards/:address]", err);
    return serverError("Failed to fetch ward config");
  }
}

/**
 * PATCH /api/v1/wards/[address]
 * Update a ward config by ward address.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  try {
    await authenticate(req);

    const body = await req.json();
    const data = validate(UpdateWardConfigSchema, body);

    const { address } = await params;
    const normalized = normalizeAddress(address);
    const sb = getSupabase();

    const rows = await sb.update<WardConfigRow>(
      "ward_configs",
      `ward_address=eq.${normalized}`,
      {
        ...data,
        updated_at: new Date().toISOString(),
      },
    );

    if (rows.length === 0) {
      return notFound("Ward config not found");
    }

    return NextResponse.json(rows[0]);
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    if (err instanceof ValidationError) return err.response;
    console.error("[PATCH /api/v1/wards/:address]", err);
    return serverError("Failed to update ward config");
  }
}
