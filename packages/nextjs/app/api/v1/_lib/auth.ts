/**
 * API key authentication middleware.
 *
 * Reads the X-API-Key header, hashes it with SHA-256, looks up the hash
 * in the api_keys table, and resolves to the associated wallet_address.
 */

import { NextRequest } from "next/server";
import { getSupabase } from "./supabase";

export interface AuthContext {
  wallet_address: string;
  api_key_id: string;
}

interface ApiKeyRow {
  id: string;
  wallet_address: string;
  key_hash: string;
  created_at: string;
  revoked_at: string | null;
}

/**
 * Hash a raw API key using SHA-256.
 * Uses crypto.subtle which is available in both Node.js and Edge Runtime.
 */
export async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Authenticate an incoming request by its X-API-Key header.
 *
 * @throws Error with a descriptive message if authentication fails.
 *         The caller should catch this and return the appropriate HTTP error.
 */
export async function authenticate(req: NextRequest): Promise<AuthContext> {
  const apiKey = req.headers.get("X-API-Key") || req.headers.get("x-api-key");

  if (!apiKey) {
    throw new AuthError("Missing X-API-Key header");
  }

  if (apiKey.length < 16) {
    throw new AuthError("Invalid API key format");
  }

  const keyHash = await hashApiKey(apiKey);
  const sb = getSupabase();

  const rows = await sb.select<ApiKeyRow>(
    "api_keys",
    `key_hash=eq.${keyHash}`,
    { limit: 1 },
  );

  if (rows.length === 0) {
    throw new AuthError("Invalid API key");
  }

  const row = rows[0];

  if (row.revoked_at !== null) {
    throw new AuthError("API key has been revoked");
  }

  return {
    wallet_address: row.wallet_address,
    api_key_id: row.id,
  };
}

/**
 * Authentication error class.
 * Callers should catch this and return unauthorized() from errors.ts.
 */
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}
