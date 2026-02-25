import { NextRequest, NextResponse } from "next/server";
import { authenticate, AuthError } from "~~/app/api/v1/_lib/auth";
import { serverError, unauthorized } from "~~/app/api/v1/_lib/errors";
import {
  DiscoverAgentsQuerySchema,
  ValidationError,
  validate,
} from "~~/app/api/v1/_lib/validation";
import { getAgentProfile } from "~~/lib/marketplace/agents-store";
import { selectDiscoveryAgentIds } from "~~/lib/marketplace/discovery-index";
import { rankDiscoveredAgents } from "~~/lib/marketplace/discovery-ranking";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await authenticate(req);
    const query = validate(
      DiscoverAgentsQuerySchema,
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    );

    const limit = query.limit ?? 25;
    const offset = query.offset ?? 0;
    const candidateIds = selectDiscoveryAgentIds({
      capability: query.capability,
      agentType: query.agent_type,
    });
    const candidates = candidateIds
      .map((agentId) => getAgentProfile(agentId))
      .filter((profile): profile is NonNullable<typeof profile> => !!profile)
      .filter((profile) => {
        if (query.verified_only && !profile.verified) return false;
        if (profile.status && profile.status !== "active") return false;
        return true;
      });

    const ranked = rankDiscoveredAgents(candidates, {
      capability: query.capability,
    });

    return NextResponse.json({
      agents: ranked.slice(offset, offset + limit),
      pagination: {
        limit,
        offset,
        total: ranked.length,
      },
      ranking_version: "v1",
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    if (err instanceof ValidationError) return err.response;
    console.error("[GET /api/v1/marketplace/discover]", err);
    return serverError("Failed to discover agents");
  }
}

