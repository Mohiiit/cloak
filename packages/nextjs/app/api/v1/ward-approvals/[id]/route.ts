import { NextRequest, NextResponse } from "next/server";
import { authenticate, AuthError } from "../../_lib/auth";
import { getSupabase } from "../../_lib/supabase";
import {
  notFound,
  unauthorized,
  serverError,
} from "../../_lib/errors";
import { createTraceId, logAgenticEvent } from "~~/lib/observability/agentic";
import { enqueueWardApprovalEvent } from "../../_lib/push/outbox";
import {
  UpdateWardApprovalSchema,
  validate,
  ValidationError,
} from "../../_lib/validation";

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

/** Statuses that indicate the approval flow has terminated. */
const TERMINAL_STATUSES = new Set([
  "approved",
  "rejected",
  "failed",
  "gas_error",
  "expired",
]);

async function findWardApprovalById(
  id: string,
  columns?: string,
): Promise<{ sb: ReturnType<typeof getSupabase>; row: WardApprovalRow | null }> {
  const sb = getSupabase();
  const options: { limit: number; columns?: string } = { limit: 1 };
  if (columns) options.columns = columns;
  const rows = await sb.select<WardApprovalRow>(
    "ward_approval_requests",
    `id=eq.${id}`,
    options,
  );
  return {
    sb,
    row: rows[0] || null,
  };
}

/**
 * GET /api/v1/ward-approvals/[id]
 * Get a single ward approval request by ID.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await authenticate(req);

    const { id } = await params;
    const view = req.nextUrl.searchParams.get("view");
    const columns =
      view === "status"
        ? "id,status,tx_hash,final_tx_hash,error_message,created_at,responded_at,updated_at"
        : undefined;
    const { row } = await findWardApprovalById(id, columns);
    if (!row) {
      return notFound("Ward approval request not found");
    }

    return NextResponse.json(row);
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    console.error("[GET /api/v1/ward-approvals/:id]", err);
    return serverError("Failed to fetch ward approval request");
  }
}

/**
 * PATCH /api/v1/ward-approvals/[id]
 * Update a ward approval request.
 *
 * Accepts snake_case field names matching the DB columns.
 * For terminal statuses (approved, rejected, failed, gas_error, expired),
 * auto-sets responded_at to now unless explicitly provided.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authenticate(req);
    const traceId = createTraceId(`ward-approvals:update:${auth.wallet_address}`);

    const body = await req.json();
    const data = validate(UpdateWardApprovalSchema, body);

    const { id } = await params;
    const { sb, row: existing } = await findWardApprovalById(id);
    if (!existing) {
      return notFound("Ward approval request not found");
    }

    // Build the update payload from validated fields.
    const update: Record<string, unknown> = {};

    if (data.status !== undefined) update.status = data.status;
    if (data.nonce !== undefined) update.nonce = data.nonce;
    if (data.resource_bounds_json !== undefined)
      update.resource_bounds_json = data.resource_bounds_json;
    if (data.tx_hash !== undefined) update.tx_hash = data.tx_hash;
    if (data.ward_sig_json !== undefined)
      update.ward_sig_json = data.ward_sig_json;
    if (data.ward_2fa_sig_json !== undefined)
      update.ward_2fa_sig_json = data.ward_2fa_sig_json;
    if (data.guardian_sig_json !== undefined)
      update.guardian_sig_json = data.guardian_sig_json;
    if (data.guardian_2fa_sig_json !== undefined)
      update.guardian_2fa_sig_json = data.guardian_2fa_sig_json;
    if (data.final_tx_hash !== undefined)
      update.final_tx_hash = data.final_tx_hash;
    if (data.error_message !== undefined)
      update.error_message = data.error_message;

    const statusChanged =
      data.status !== undefined && data.status !== existing.status;
    const existingVersion = Number(existing.event_version);
    const useCas = statusChanged && Number.isFinite(existingVersion) && existingVersion >= 1;

    // Auto-set responded_at for terminal statuses unless explicitly provided.
    if (data.status && TERMINAL_STATUSES.has(data.status)) {
      update.responded_at = new Date().toISOString();
    }

    if (statusChanged) {
      const currentVersion =
        Number.isFinite(existingVersion) && existingVersion >= 1
          ? existingVersion
          : 1;
      update.event_version = Math.max(1, Math.trunc(currentVersion) + 1);
    }

    update.updated_at = new Date().toISOString();

    const rows = await sb.update<WardApprovalRow>(
      "ward_approval_requests",
      useCas ? `id=eq.${id}&event_version=eq.${existingVersion}` : `id=eq.${id}`,
      update,
    );

    if (rows.length === 0) {
      // CAS miss can happen under concurrent updates.
      const latestRows = await sb.select<WardApprovalRow>(
        "ward_approval_requests",
        `id=eq.${id}`,
        { limit: 1 },
      );
      if (latestRows.length === 0) {
        return notFound("Ward approval request not found");
      }
      return NextResponse.json(latestRows[0]);
    }

    const updated = rows[0];
    if (statusChanged) {
      try {
        await enqueueWardApprovalEvent({
          sb,
          row: updated,
          eventType: "ward_approval.status_changed",
          previousStatus: existing.status,
        });
      } catch (pushErr) {
        console.warn(
          "[ward-approvals] failed to enqueue status_changed event",
          pushErr,
        );
      }
    }

    logAgenticEvent({
      level: "info",
      event: "ward_approvals.updated",
      traceId,
      actor: auth.wallet_address,
      metadata: {
        approvalId: id,
        status: updated.status,
        previousStatus: existing.status,
        statusChanged,
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    if (err instanceof ValidationError) return err.response;
    console.error("[PATCH /api/v1/ward-approvals/:id]", err);
    return serverError("Failed to update ward approval request");
  }
}
