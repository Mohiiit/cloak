import { NextRequest, NextResponse } from "next/server";
import { authenticate, AuthError } from "../../_lib/auth";
import { unauthorized, serverError } from "../../_lib/errors";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticate(req);

    return NextResponse.json({
      valid: true,
      wallet_address: auth.wallet_address,
    });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    console.error("[GET /api/v1/auth/verify]", err);
    return serverError("Failed to verify authentication");
  }
}
