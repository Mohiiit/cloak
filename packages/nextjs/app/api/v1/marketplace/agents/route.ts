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
  listAgentProfiles,
  upsertAgentProfile,
} from "~~/lib/marketplace/agents-store";
import { verifyEndpointProofSet } from "~~/lib/marketplace/endpoint-proof";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await authenticate(req);
    const query = validate(
      DiscoverAgentsQuerySchema,
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    );
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    const agents = listAgentProfiles()
      .filter((agent) => {
        if (query.agent_type && agent.agent_type !== query.agent_type) return false;
        if (query.verified_only && !agent.verified) return false;
        if (
          query.capability &&
          !agent.capabilities.some(
            (capability) => capability.toLowerCase() === query.capability?.toLowerCase(),
          )
        ) {
          return false;
        }
        return true;
      })
      .slice(offset, offset + limit);

    return NextResponse.json({
      agents,
      pagination: {
        limit,
        offset,
        total: agents.length,
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
    const body = await req.json();
    const data = validate(RegisterAgentSchema, body);

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

    const profile = upsertAgentProfile(data);
    return NextResponse.json(profile, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    if (err instanceof ValidationError) return err.response;
    if (err instanceof SyntaxError) return badRequest("Invalid JSON body");
    console.error("[POST /api/v1/marketplace/agents]", err);
    return serverError("Failed to register agent");
  }
}
