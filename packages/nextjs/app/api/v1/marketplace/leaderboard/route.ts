import { NextRequest, NextResponse } from "next/server";
import { unauthorized, serverError } from "~~/app/api/v1/_lib/errors";
import { authenticate, AuthError } from "~~/app/api/v1/_lib/auth";
import { getMarketplaceFeatureFlags } from "~~/lib/marketplace/feature-flags";
import { computeLeaderboard } from "~~/lib/marketplace/leaderboard";
import type { AgentType, LeaderboardPeriod, LeaderboardResponse } from "@cloak-wallet/sdk";

export const runtime = "nodejs";

const VALID_PERIODS = new Set<LeaderboardPeriod>(["24h", "7d", "30d"]);

// ─── Simple TTL cache ────────────────────────────────────────────────────────

interface CacheEntry {
  response: LeaderboardResponse;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function getCacheTtl(): number {
  const raw = process.env.MARKETPLACE_LEADERBOARD_CACHE_TTL_MS;
  if (!raw) return 60_000;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60_000;
}

function cacheKey(
  period: string,
  capability?: string,
  agentType?: string,
): string {
  return `${period}:${capability || ""}:${agentType || ""}`;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

function parseIntParam(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw === null || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

export async function GET(req: NextRequest) {
  try {
    const flags = getMarketplaceFeatureFlags();
    if (!flags.leaderboardEnabled) {
      return NextResponse.json(
        { error: "Leaderboard feature is disabled", code: "FEATURE_DISABLED" },
        { status: 403 },
      );
    }

    // Auth is optional for leaderboard reads but lets us log the actor
    let actor = "anonymous";
    try {
      const auth = await authenticate(req);
      actor = auth.wallet_address;
    } catch {
      // allow unauthenticated reads
    }

    const periodRaw = req.nextUrl.searchParams.get("period") || "7d";
    const period = VALID_PERIODS.has(periodRaw as LeaderboardPeriod)
      ? (periodRaw as LeaderboardPeriod)
      : "7d";

    const capability =
      req.nextUrl.searchParams.get("capability") || undefined;
    const agentType = (req.nextUrl.searchParams.get("agent_type") ||
      undefined) as AgentType | undefined;
    const limit = parseIntParam(
      req.nextUrl.searchParams.get("limit"),
      50,
      1,
      100,
    );
    const offset = parseIntParam(
      req.nextUrl.searchParams.get("offset"),
      0,
      0,
      Number.MAX_SAFE_INTEGER,
    );

    // Check cache
    const key = cacheKey(period, capability, agentType);
    const ttl = getCacheTtl();
    const cached = cache.get(key);
    if (cached && Date.now() < cached.expiresAt) {
      const entries = cached.response.entries.slice(offset, offset + limit);
      return NextResponse.json({
        ...cached.response,
        entries,
        total: cached.response.total,
      });
    }

    const entries = await computeLeaderboard(period, {
      capability,
      agentType,
    });

    const response: LeaderboardResponse = {
      period,
      entries,
      total: entries.length,
      computed_at: new Date().toISOString(),
    };

    // Store in cache (full result, pagination applied on read)
    cache.set(key, { response, expiresAt: Date.now() + ttl });

    // Apply pagination to response
    const paginatedEntries = entries.slice(offset, offset + limit);
    return NextResponse.json({
      ...response,
      entries: paginatedEntries,
    });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    console.error("[GET /api/v1/marketplace/leaderboard]", err);
    return serverError("Failed to compute leaderboard");
  }
}
