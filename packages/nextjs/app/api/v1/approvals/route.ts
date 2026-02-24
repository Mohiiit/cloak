import { NextRequest, NextResponse } from "next/server";
import { normalizeAddress } from "@cloak-wallet/sdk";
import { authenticate, AuthError } from "../_lib/auth";
import { getSupabase } from "../_lib/supabase";
import { badRequest, unauthorized, serverError } from "../_lib/errors";
import { CreateApprovalSchema, validate, ValidationError } from "../_lib/validation";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    await authenticate(req);

    const body = await req.json();
    const data = validate(CreateApprovalSchema, body);
    const sb = getSupabase();

    const rows = await sb.insert("approval_requests", {
      ...data,
      wallet_address: normalizeAddress(data.wallet_address),
      status: "pending",
    });

    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    if (err instanceof ValidationError) return err.response;
    console.error("[POST /api/v1/approvals]", err);
    return serverError("Failed to create approval request");
  }
}

export async function GET(req: NextRequest) {
  try {
    await authenticate(req);

    const wallet = req.nextUrl.searchParams.get("wallet");
    if (!wallet) {
      return badRequest("Missing required query parameter: wallet");
    }

    const status = req.nextUrl.searchParams.get("status");
    const normalized = normalizeAddress(wallet);
    const sb = getSupabase();

    const filters: string[] = [`wallet_address=eq.${normalized}`];
    if (status) {
      filters.push(`status=eq.${status}`);
    }

    const rows = await sb.select(
      "approval_requests",
      filters.join("&"),
      { orderBy: "created_at.desc" },
    );

    return NextResponse.json(rows);
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    console.error("[GET /api/v1/approvals]", err);
    return serverError("Failed to fetch approval requests");
  }
}
