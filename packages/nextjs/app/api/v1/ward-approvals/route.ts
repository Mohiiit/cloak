import { NextRequest, NextResponse } from "next/server";
import { normalizeAddress } from "@cloak-wallet/sdk";
import { authenticate, AuthError } from "../_lib/auth";
import { getSupabase } from "../_lib/supabase";
import { unauthorized, serverError } from "../_lib/errors";
import {
  CreateWardApprovalSchema,
  validate,
  ValidationError,
} from "../_lib/validation";

export const runtime = "nodejs";

interface WardApprovalRow {
  id: string;
  ward_address: string;
  guardian_address: string;
  action: string;
  token: string;
  amount: string | null;
  amount_unit: string | null;
  recipient: string | null;
  calls_json: string;
  nonce: string;
  resource_bounds_json: string;
  tx_hash: string;
  ward_sig_json: string;
  ward_2fa_sig_json: string | null;
  guardian_sig_json: string | null;
  guardian_2fa_sig_json: string | null;
  needs_ward_2fa: boolean;
  needs_guardian: boolean;
  needs_guardian_2fa: boolean;
  status: string;
  final_tx_hash: string | null;
  error_message: string | null;
  created_at: string;
  responded_at: string | null;
}

/**
 * POST /api/v1/ward-approvals
 * Create a new ward approval request.
 */
export async function POST(req: NextRequest) {
  try {
    await authenticate(req);

    const body = await req.json();
    const data = validate(CreateWardApprovalSchema, body);

    const sb = getSupabase();

    const rows = await sb.insert<WardApprovalRow>("ward_approval_requests", {
      ...data,
      ward_address: normalizeAddress(data.ward_address),
      guardian_address: normalizeAddress(data.guardian_address),
      status: data.initial_status ?? "pending_ward_sig",
      created_at: new Date().toISOString(),
      responded_at: null,
    });

    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    if (err instanceof ValidationError) return err.response;
    console.error("[POST /api/v1/ward-approvals]", err);
    return serverError("Failed to create ward approval request");
  }
}

/**
 * GET /api/v1/ward-approvals?ward=0x...&guardian=0x...&status=pending_ward_sig,pending_guardian
 * List ward approval requests with optional filters.
 */
export async function GET(req: NextRequest) {
  try {
    await authenticate(req);

    const searchParams = req.nextUrl.searchParams;
    const ward = searchParams.get("ward");
    const guardian = searchParams.get("guardian");
    const status = searchParams.get("status");

    const filterParts: string[] = [];

    if (ward) {
      filterParts.push(`ward_address=eq.${normalizeAddress(ward)}`);
    }
    if (guardian) {
      filterParts.push(`guardian_address=eq.${normalizeAddress(guardian)}`);
    }
    if (status) {
      const statuses = status.split(",").map((s) => s.trim());
      if (statuses.length === 1) {
        filterParts.push(`status=eq.${statuses[0]}`);
      } else {
        filterParts.push(`status=in.(${statuses.join(",")})`);
      }
    }

    const sb = getSupabase();

    const rows = await sb.select<WardApprovalRow>(
      "ward_approval_requests",
      filterParts.length > 0 ? filterParts.join("&") : undefined,
      { orderBy: "created_at.desc" },
    );

    return NextResponse.json(rows);
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    console.error("[GET /api/v1/ward-approvals]", err);
    return serverError("Failed to fetch ward approval requests");
  }
}
