/**
 * Typed error response helpers for API routes.
 *
 * Every error response follows the shape:
 *   { error: string, code?: string }
 */

import { NextResponse } from "next/server";

interface ErrorBody {
  error: string;
  code?: string;
}

function errorResponse(
  status: number,
  message: string,
  code?: string,
): NextResponse<ErrorBody> {
  const body: ErrorBody = { error: message };
  if (code) body.code = code;
  return NextResponse.json(body, { status });
}

/** 400 Bad Request */
export function badRequest(message: string, code?: string): NextResponse<ErrorBody> {
  return errorResponse(400, message, code);
}

/** 401 Unauthorized */
export function unauthorized(message?: string): NextResponse<ErrorBody> {
  return errorResponse(401, message ?? "Unauthorized", "UNAUTHORIZED");
}

/** 403 Forbidden */
export function forbidden(message?: string): NextResponse<ErrorBody> {
  return errorResponse(403, message ?? "Forbidden", "FORBIDDEN");
}

/** 404 Not Found */
export function notFound(message?: string): NextResponse<ErrorBody> {
  return errorResponse(404, message ?? "Not found", "NOT_FOUND");
}

/** 409 Conflict */
export function conflict(message: string): NextResponse<ErrorBody> {
  return errorResponse(409, message, "CONFLICT");
}

/** 500 Internal Server Error */
export function serverError(message?: string): NextResponse<ErrorBody> {
  return errorResponse(
    500,
    message ?? "Internal server error",
    "INTERNAL_ERROR",
  );
}
