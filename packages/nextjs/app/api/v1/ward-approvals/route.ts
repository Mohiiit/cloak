import { NextRequest, NextResponse } from "next/server";
import { normalizeAddress } from "@cloak-wallet/sdk";
import { authenticate, AuthError } from "../_lib/auth";
import { getSupabase } from "../_lib/supabase";
import { unauthorized, serverError } from "../_lib/errors";
import { createTraceId, logAgenticEvent } from "~~/lib/observability/agentic";
import { enqueueWardApprovalEvent } from "../_lib/push/outbox";
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
  event_version?: number | null;
  updated_at?: string | null;
}

/**
 * POST /api/v1/ward-approvals
 * Create a new ward approval request.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticate(req);
    const traceId = createTraceId(`ward-approvals:create:${auth.wallet_address}`);

    const body = await req.json();
    const data = validate(CreateWardApprovalSchema, body);

    const sb = getSupabase();
    const nowIso = new Date().toISOString();

    const rows = await sb.insert<WardApprovalRow>("ward_approval_requests", {
      ...data,
      ward_address: normalizeAddress(data.ward_address),
      guardian_address: normalizeAddress(data.guardian_address),
      status: data.initial_status ?? "pending_ward_sig",
      event_version: 1,
      created_at: nowIso,
      responded_at: null,
      updated_at: nowIso,
    });

    const created = rows[0];
    if (created) {
      try {
        await enqueueWardApprovalEvent({
          sb,
          row: created,
          eventType: "ward_approval.created",
        });
      } catch (pushErr) {
        console.warn("[ward-approvals] failed to enqueue create event", pushErr);
      }
    }

    logAgenticEvent({
      level: "info",
      event: "ward_approvals.created",
      traceId,
      actor: auth.wallet_address,
      metadata: {
        approvalId: created?.id,
        status: created?.status,
      },
    });

    return NextResponse.json(created, { status: 201 });
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
    const includeAll = ["1", "true", "yes"].includes(
      (searchParams.get("include_all") || "").toLowerCase(),
    );
    const statusQueryValues = searchParams
      .getAll("status")
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter(Boolean);
    const statuses =
      statusQueryValues.length > 0
        ? Array.from(new Set(statusQueryValues))
        : (!includeAll && (ward || guardian))
          ? ["pending_ward_sig", "pending_guardian"]
          : [];
    const limitRaw = Number(searchParams.get("limit") || 50);
    const offsetRaw = Number(searchParams.get("offset") || 0);
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0
        ? Math.min(Math.floor(limitRaw), 200)
        : 50;
    const offset =
      Number.isFinite(offsetRaw) && offsetRaw >= 0
        ? Math.floor(offsetRaw)
        : 0;
    const updatedAfter = searchParams.get("updated_after");

    const filterParts: string[] = [];

    if (ward) {
      filterParts.push(`ward_address=eq.${normalizeAddress(ward)}`);
    }
    if (guardian) {
      filterParts.push(`guardian_address=eq.${normalizeAddress(guardian)}`);
    }
    if (statuses.length === 1) {
      filterParts.push(`status=eq.${statuses[0]}`);
    } else if (statuses.length > 1) {
      filterParts.push(`status=in.(${statuses.join(",")})`);
    }
    if (updatedAfter) {
      filterParts.push(`updated_at=gte.${updatedAfter}`);
    }

    const sb = getSupabase();

    const rows = await sb.select<WardApprovalRow>(
      "ward_approval_requests",
      filterParts.length > 0 ? filterParts.join("&") : undefined,
      {
        orderBy: "updated_at.desc",
        limit,
        offset,
      },
    );

    return NextResponse.json(rows);
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    console.error("[GET /api/v1/ward-approvals]", err);
    return serverError("Failed to fetch ward approval requests");
  }
}
