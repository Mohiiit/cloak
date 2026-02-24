import { NextRequest, NextResponse } from "next/server";
import { normalizeAddress } from "@cloak-wallet/sdk";
import { authenticate, AuthError } from "../../_lib/auth";
import { getSupabase } from "../../_lib/supabase";
import { unauthorized, serverError } from "../../_lib/errors";

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
 * GET /api/v1/ward-approvals/history?ward=0x...&guardian=0x...&limit=50&offset=0
 * Paginated history of ward approval requests.
 */
export async function GET(req: NextRequest) {
  try {
    await authenticate(req);

    const searchParams = req.nextUrl.searchParams;
    const ward = searchParams.get("ward");
    const guardian = searchParams.get("guardian");
    const limitParam = searchParams.get("limit");
    const offsetParam = searchParams.get("offset");

    const filterParts: string[] = [];

    if (ward) {
      filterParts.push(`ward_address=eq.${normalizeAddress(ward)}`);
    }
    if (guardian) {
      filterParts.push(`guardian_address=eq.${normalizeAddress(guardian)}`);
    }

    const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 50, 200) : 50;
    const offset = offsetParam ? Math.max(parseInt(offsetParam, 10) || 0, 0) : 0;

    const sb = getSupabase();

    const rows = await sb.select<WardApprovalRow>(
      "ward_approval_requests",
      filterParts.length > 0 ? filterParts.join("&") : undefined,
      {
        orderBy: "created_at.desc",
        limit,
        offset,
      },
    );

    return NextResponse.json(rows);
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    console.error("[GET /api/v1/ward-approvals/history]", err);
    return serverError("Failed to fetch ward approval history");
  }
}
