import { NextRequest, NextResponse } from "next/server";
import { badRequest, unauthorized } from "~~/app/api/v1/_lib/errors";
import {
  executeThroughStarkZapGateway,
  type StarkZapGatewayInput,
} from "~~/lib/marketplace/starkzap-gateway";
import { createTraceId, logAgenticEvent } from "~~/lib/observability/agentic";

export const runtime = "nodejs";

function readBearerToken(raw: string | null): string | null {
  if (!raw) return null;
  const [scheme, token] = raw.split(/\s+/, 2);
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== "bearer") return null;
  return token.trim();
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.STARKZAP_EXECUTOR_API_KEY?.trim() || "";
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  const bearer = readBearerToken(req.headers.get("authorization"));
  const header = req.headers.get("x-starkzap-executor-secret");
  return bearer === secret || header === secret;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseInput(body: unknown): StarkZapGatewayInput | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;

  if (
    !isNonEmptyString(record.agentType) ||
    !isNonEmptyString(record.action) ||
    !isNonEmptyString(record.operatorWallet) ||
    !isNonEmptyString(record.serviceWallet) ||
    !isNonEmptyString(record.protocol)
  ) {
    return null;
  }

  const params =
    record.params && typeof record.params === "object" && !Array.isArray(record.params)
      ? (record.params as Record<string, unknown>)
      : {};

  return {
    agentType: record.agentType,
    action: record.action,
    params,
    operatorWallet: record.operatorWallet,
    serviceWallet: record.serviceWallet,
    protocol: record.protocol,
  };
}

export async function POST(req: NextRequest) {
  const traceId = createTraceId("starkzap-execute-route");
  try {
    if (!isAuthorized(req)) {
      return unauthorized("Missing or invalid StarkZap executor secret");
    }

    const parsed = parseInput(await req.json());
    if (!parsed) {
      return badRequest(
        "Invalid payload. Required fields: agentType, action, operatorWallet, serviceWallet, protocol",
      );
    }

    const result = await executeThroughStarkZapGateway(parsed);
    const responseBody = {
      provider: "starkzap",
      tx_hashes: result.txHashes,
      receipt: {
        ...(result.receipt || {}),
        gateway_mode: result.mode,
      },
    };

    logAgenticEvent({
      level: "info",
      event: "starkzap.execute.completed",
      traceId,
      actor: parsed.operatorWallet,
      metadata: {
        protocol: parsed.protocol,
        action: parsed.action,
        tx_hashes: result.txHashes,
        gateway_mode: result.mode,
      },
    });

    return NextResponse.json(responseBody, {
      status: 200,
      headers: {
        "x-agentic-trace-id": traceId,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "starkzap execution failed";
    const status = /invalid payload/i.test(message) ? 400 : 502;

    logAgenticEvent({
      level: "error",
      event: "starkzap.execute.failed",
      traceId,
      metadata: {
        error: message,
      },
    });

    return NextResponse.json(
      {
        error: message,
        code: "STARKZAP_EXECUTION_FAILED",
      },
      { status },
    );
  }
}
