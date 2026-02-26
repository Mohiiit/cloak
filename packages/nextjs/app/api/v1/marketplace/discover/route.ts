import { NextRequest, NextResponse } from "next/server";
import { authenticate, AuthError } from "~~/app/api/v1/_lib/auth";
import { serverError, unauthorized } from "~~/app/api/v1/_lib/errors";
import {
  DiscoverAgentsQuerySchema,
  ValidationError,
  validate,
} from "~~/app/api/v1/_lib/validation";
import { listAgentProfileRecords } from "~~/lib/marketplace/agents-repo";
import { rankDiscoveredAgents } from "~~/lib/marketplace/discovery-ranking";
import { adaptAgentProfileWithRegistry } from "~~/lib/marketplace/profile-adapter";
import {
  consumeRateLimit,
  MARKETPLACE_RATE_LIMITS,
} from "~~/lib/marketplace/rate-limit";
import { incrementRegistryMetric } from "~~/lib/marketplace/registry-metrics";
import {
  createTraceId,
  logMarketplaceFunnelEvent,
} from "~~/lib/observability/agentic";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const traceId = createTraceId("marketplace-discover-get");
  try {
    const auth = await authenticate(req);
    const readLimit = consumeRateLimit(
      "marketplace:discover:read",
      auth.wallet_address,
      MARKETPLACE_RATE_LIMITS.discoverRead,
    );
    if (!readLimit.allowed) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          code: "RATE_LIMITED",
          retry_after: readLimit.retryAfterSeconds,
        },
        { status: 429 },
      );
    }
    const query = validate(
      DiscoverAgentsQuerySchema,
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    );
    const refreshOnchain = req.nextUrl.searchParams.get("refresh_onchain") === "true";
    incrementRegistryMetric("discovery_queries");
    if (refreshOnchain) incrementRegistryMetric("onchain_refreshes");

    const limit = query.limit ?? 25;
    const offset = query.offset ?? 0;
    const candidates = (await listAgentProfileRecords())
      .filter((profile) => {
        if (query.agent_type && profile.agent_type !== query.agent_type) return false;
        if (
          query.capability &&
          !profile.capabilities.some(
            capability => capability.toLowerCase() === query.capability?.toLowerCase(),
          )
        ) {
          return false;
        }
        return true;
      })
      .filter((profile) => {
        if (query.verified_only && !profile.verified) return false;
        if (profile.status && profile.status !== "active") return false;
        return true;
      });

    const enriched = refreshOnchain
      ? await Promise.all(
          candidates.map(async (candidate) => {
            try {
              return await adaptAgentProfileWithRegistry(candidate);
            } catch {
              return candidate;
            }
          }),
        )
      : candidates;

    const ranked = rankDiscoveredAgents(enriched, {
      capability: query.capability,
    });

    const paged = ranked.slice(offset, offset + limit);
    logMarketplaceFunnelEvent({
      stage: "discover_loaded",
      traceId,
      actor: auth.wallet_address,
      metadata: {
        query: {
          capability: query.capability ?? null,
          agent_type: query.agent_type ?? null,
          verified_only: !!query.verified_only,
          refresh_onchain: refreshOnchain,
        },
        result_count: paged.length,
        total_ranked: ranked.length,
      },
    });

    return NextResponse.json(
      {
        agents: paged,
        pagination: {
          limit,
          offset,
          total: ranked.length,
        },
        ranking_version: "v1",
        generated_at: new Date().toISOString(),
      },
      {
        headers: {
          "x-agentic-trace-id": traceId,
        },
      },
    );
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    if (err instanceof ValidationError) return err.response;
    console.error("[GET /api/v1/marketplace/discover]", err);
    return serverError("Failed to discover agents");
  }
}
