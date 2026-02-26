import { NextRequest } from "next/server";
import { getPushDispatchConfig } from "./config";

function readBearerToken(value: string | null): string | null {
  if (!value) return null;
  const [scheme, token] = value.trim().split(/\s+/);
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== "bearer") return null;
  return token.trim();
}

export function isDispatchAuthorized(req: NextRequest): boolean {
  const { dispatchSecret } = getPushDispatchConfig();
  if (!dispatchSecret) return false;

  const bearer =
    readBearerToken(req.headers.get("authorization")) ||
    readBearerToken(req.headers.get("Authorization"));
  if (bearer && bearer === dispatchSecret) return true;

  const direct =
    req.headers.get("x-push-dispatch-secret") ||
    req.headers.get("X-Push-Dispatch-Secret");
  return !!direct && direct === dispatchSecret;
}

