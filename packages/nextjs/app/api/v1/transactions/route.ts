import { NextRequest, NextResponse } from "next/server";
import { normalizeAddress } from "@cloak-wallet/sdk";
import { authenticate, AuthError } from "../_lib/auth";
import { getSupabase } from "../_lib/supabase";
import { badRequest, unauthorized, serverError } from "../_lib/errors";
import {
  SaveTransactionSchema,
  validate,
  ValidationError,
} from "../_lib/validation";

export const runtime = "nodejs";

// ─── POST /api/v1/transactions ──────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticate(req);

    const body = await req.json();
    const data = validate(SaveTransactionSchema, body);

    const sb = getSupabase();

    const row: Record<string, unknown> = {
      ...data,
      wallet_address: normalizeAddress(data.wallet_address),
      ward_address: data.ward_address
        ? normalizeAddress(data.ward_address)
        : null,
    };

    // Null out undefined optional fields for Supabase
    for (const key of Object.keys(row)) {
      if (row[key] === undefined) row[key] = null;
    }

    const rows = await sb.insert("transactions", row);
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    if (err instanceof ValidationError) return err.response;
    console.error("[POST /api/v1/transactions]", err);
    return serverError("Failed to save transaction");
  }
}

// ─── GET /api/v1/transactions ───────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticate(req);

    const wallet = req.nextUrl.searchParams.get("wallet");
    if (!wallet) {
      return badRequest("Missing required query parameter: wallet");
    }

    const limit = Math.min(
      Number(req.nextUrl.searchParams.get("limit") || "100"),
      500,
    );
    const offset = Number(req.nextUrl.searchParams.get("offset") || "0");
    const normalized = normalizeAddress(wallet);
    const sb = getSupabase();

    // Fan-out: query by wallet_address, by ward_address, AND by managed wards
    const [byWallet, byWard] = await Promise.all([
      sb.select<Record<string, unknown>>(
        "transactions",
        `wallet_address=eq.${normalized}`,
        { orderBy: "created_at.desc" },
      ),
      sb.select<Record<string, unknown>>(
        "transactions",
        `ward_address=eq.${normalized}`,
        { orderBy: "created_at.desc" },
      ),
    ]);

    // Look up managed wards for guardian fan-out
    let byManagedWards: Record<string, unknown>[] = [];
    try {
      const wardRows = await sb.select<{ ward_address: string }>(
        "ward_configs",
        `guardian_address=eq.${normalized}`,
      );
      const managedWards = Array.from(
        new Set(
          wardRows
            .map((row) => normalizeAddress(row.ward_address))
            .filter((addr) => addr !== "0x0"),
        ),
      );
      if (managedWards.length > 0) {
        const inClause = managedWards.join(",");
        byManagedWards = await sb.select<Record<string, unknown>>(
          "transactions",
          `wallet_address=in.(${inClause})`,
          { orderBy: "created_at.desc" },
        );
      }
    } catch (err) {
      console.warn("[GET /api/v1/transactions] managed ward lookup failed:", err);
    }

    // Deduplicate by tx_hash, preferring byWallet records
    const seen = new Set<string>();
    const all: Record<string, unknown>[] = [];
    for (const tx of [...byWallet, ...byWard, ...byManagedWards]) {
      const hash = tx.tx_hash as string;
      if (hash && !seen.has(hash)) {
        seen.add(hash);
        all.push(tx);
      }
    }

    // Sort by created_at descending
    all.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at as string).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at as string).getTime() : 0;
      return tb - ta;
    });

    // Apply offset and limit
    const page = all.slice(offset, offset + limit);
    return NextResponse.json(page);
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    console.error("[GET /api/v1/transactions]", err);
    return serverError("Failed to fetch transactions");
  }
}
