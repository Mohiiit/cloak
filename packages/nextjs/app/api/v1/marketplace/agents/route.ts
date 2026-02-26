import { NextRequest, NextResponse } from "next/server";
import { authenticate, AuthError } from "~~/app/api/v1/_lib/auth";
import {
  badRequest,
  forbidden,
  serverError,
  unauthorized,
} from "~~/app/api/v1/_lib/errors";
import {
  DiscoverAgentsQuerySchema,
  RegisterAgentSchema,
  ValidationError,
  validate,
} from "~~/app/api/v1/_lib/validation";
import {
  getAgentProfileRecord,
  listAgentProfileRecords,
  upsertAgentProfileRecord,
} from "~~/lib/marketplace/agents-repo";
import { verifyEndpointProofSet } from "~~/lib/marketplace/endpoint-proof";
import { adaptAgentProfileWithRegistry } from "~~/lib/marketplace/profile-adapter";
import {
  consumeRateLimit,
  MARKETPLACE_RATE_LIMITS,
} from "~~/lib/marketplace/rate-limit";
import {
  incrementRegistryMetric,
} from "~~/lib/marketplace/registry-metrics";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticate(req);
    const readLimit = consumeRateLimit(
      "marketplace:agents:read",
      auth.wallet_address,
      MARKETPLACE_RATE_LIMITS.agentsRead,
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
    const statusFilter = req.nextUrl.searchParams.get("status");
    const refreshOnchain = req.nextUrl.searchParams.get("refresh_onchain") === "true";
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    let agents = (await listAgentProfileRecords())
      .filter((agent) => {
        if (query.agent_type && agent.agent_type !== query.agent_type) return false;
        if (query.verified_only && !agent.verified) return false;
        if (statusFilter && agent.status !== statusFilter) return false;
        if (
          query.capability &&
          !agent.capabilities.some(
            (capability) => capability.toLowerCase() === query.capability?.toLowerCase(),
          )
        ) {
          return false;
        }
        return true;
      });

    if (refreshOnchain) {
      incrementRegistryMetric("onchain_refreshes");
      agents = await Promise.all(
        agents.map(async (agent) => {
          try {
            return await adaptAgentProfileWithRegistry(agent);
          } catch {
            return agent;
          }
        }),
      );
    }

    const total = agents.length;
    const paged = agents.slice(offset, offset + limit);
    return NextResponse.json({
      agents: paged,
      pagination: {
        limit,
        offset,
        total,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    if (err instanceof ValidationError) return err.response;
    console.error("[GET /api/v1/marketplace/agents]", err);
    return serverError("Failed to list agents");
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticate(req);
    const writeLimit = consumeRateLimit(
      "marketplace:agents:write",
      auth.wallet_address,
      MARKETPLACE_RATE_LIMITS.agentsWrite,
    );
    if (!writeLimit.allowed) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          code: "RATE_LIMITED",
          retry_after: writeLimit.retryAfterSeconds,
        },
        { status: 429 },
      );
    }
    const body = await req.json();
    const data = validate(RegisterAgentSchema, body);
    const existing = await getAgentProfileRecord(data.agent_id);

    if (auth.wallet_address.toLowerCase() !== data.operator_wallet.toLowerCase()) {
      return forbidden("operator_wallet must match authenticated wallet");
    }
    if (!data.endpoint_proofs || data.endpoint_proofs.length === 0) {
      return badRequest("endpoint_proofs are required");
    }

    const proofCheck = verifyEndpointProofSet({
      operatorWallet: data.operator_wallet,
      endpoints: data.endpoints,
      proofs: data.endpoint_proofs,
    });
    if (!proofCheck.ok) {
      return badRequest(proofCheck.reason || "Invalid endpoint proofs");
    }

    const profile = await upsertAgentProfileRecord(data);
    incrementRegistryMetric(existing ? "profiles_updated" : "profiles_registered");
    return NextResponse.json(profile, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    if (err instanceof ValidationError) return err.response;
    if (err instanceof SyntaxError) return badRequest("Invalid JSON body");
    console.error("[POST /api/v1/marketplace/agents]", err);
    return serverError("Failed to register agent");
  }
}
