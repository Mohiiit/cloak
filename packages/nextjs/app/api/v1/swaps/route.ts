import { NextRequest, NextResponse } from "next/server";
import { normalizeAddress } from "@cloak-wallet/sdk";
import { authenticate, AuthError } from "../_lib/auth";
import { getSupabase } from "../_lib/supabase";
import { badRequest, unauthorized, serverError } from "../_lib/errors";
import {
  SaveSwapSchema,
  validate,
  ValidationError,
} from "../_lib/validation";

export const runtime = "nodejs";

// ─── POST /api/v1/swaps ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    await authenticate(req);

    const body = await req.json();
    const data = validate(SaveSwapSchema, body);

    const sb = getSupabase();

    // Normalize tx_hashes and primary_tx_hash
    const txHashes = Array.isArray(data.tx_hashes)
      ? Array.from(
          new Set(
            data.tx_hashes.filter(
              (hash): hash is string => typeof hash === "string" && !!hash,
            ),
          ),
        )
      : [];
    const primaryTxHash =
      data.primary_tx_hash || data.tx_hash || txHashes[0] || null;

    const row: Record<string, unknown> = {
      ...data,
      wallet_address: normalizeAddress(data.wallet_address),
      ward_address: data.ward_address
        ? normalizeAddress(data.ward_address)
        : null,
      tx_hash: data.tx_hash || primaryTxHash,
      primary_tx_hash: primaryTxHash,
      tx_hashes: txHashes.length > 0 ? txHashes : null,
    };

    // Null out undefined optional fields
    for (const key of Object.keys(row)) {
      if (row[key] === undefined) row[key] = null;
    }

    const rows = await sb.insert("swap_executions", row);
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    if (err instanceof ValidationError) return err.response;
    console.error("[POST /api/v1/swaps]", err);
    return serverError("Failed to save swap execution");
  }
}

// ─── GET /api/v1/swaps ─────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    await authenticate(req);

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

    // Fan-out: direct, ward, managed wards
    const [byWallet, byWard] = await Promise.all([
      sb.select<Record<string, unknown>>(
        "swap_executions",
        `wallet_address=eq.${normalized}`,
        { orderBy: "created_at.desc" },
      ),
      sb.select<Record<string, unknown>>(
        "swap_executions",
        `ward_address=eq.${normalized}`,
        { orderBy: "created_at.desc" },
      ),
    ]);

    // Managed wards fan-out
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
          "swap_executions",
          `wallet_address=in.(${inClause})`,
          { orderBy: "created_at.desc" },
        );
      }
    } catch (err) {
      console.warn("[GET /api/v1/swaps] managed ward lookup failed:", err);
    }

    // Deduplicate by execution_id or tx_hash
    const seen = new Set<string>();
    const all: Record<string, unknown>[] = [];
    for (const row of [...byWallet, ...byWard, ...byManagedWards]) {
      const key =
        (row.execution_id as string) ||
        (row.tx_hash as string) ||
        (row.id as string) ||
        "";
      if (key && !seen.has(key)) {
        seen.add(key);
        all.push(row);
      }
    }

    // Sort by created_at descending
    all.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at as string).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at as string).getTime() : 0;
      return tb - ta;
    });

    const page = all.slice(offset, offset + limit);
    return NextResponse.json(page);
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    console.error("[GET /api/v1/swaps]", err);
    return serverError("Failed to fetch swap executions");
  }
}
