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

type CachedAuthResult =
  | { kind: "ok"; context: AuthContext }
  | { kind: "invalid" }
  | { kind: "revoked" };

interface CachedAuthEntry {
  result: CachedAuthResult;
  expiresAtMs: number;
}

const API_KEY_AUTH_CACHE_TTL_MS = parsePositiveInt(
  process.env.API_KEY_AUTH_CACHE_TTL_MS,
  30_000,
);
const API_KEY_AUTH_NEGATIVE_CACHE_TTL_MS = parsePositiveInt(
  process.env.API_KEY_AUTH_NEGATIVE_CACHE_TTL_MS,
  10_000,
);
const API_KEY_AUTH_CACHE_MAX_ENTRIES = parsePositiveInt(
  process.env.API_KEY_AUTH_CACHE_MAX_ENTRIES,
  5000,
);
const apiKeyAuthCache = new Map<string, CachedAuthEntry>();

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function evictOneEntry(): void {
  const firstKey = apiKeyAuthCache.keys().next().value as string | undefined;
  if (firstKey) apiKeyAuthCache.delete(firstKey);
}

function ensureCacheCapacity(): void {
  if (apiKeyAuthCache.size < API_KEY_AUTH_CACHE_MAX_ENTRIES) return;

  const now = Date.now();
  for (const [key, entry] of apiKeyAuthCache.entries()) {
    if (entry.expiresAtMs <= now) apiKeyAuthCache.delete(key);
  }

  while (apiKeyAuthCache.size >= API_KEY_AUTH_CACHE_MAX_ENTRIES) {
    evictOneEntry();
  }
}

function readCachedAuth(keyHash: string): CachedAuthResult | null {
  const entry = apiKeyAuthCache.get(keyHash);
  if (!entry) return null;
  if (entry.expiresAtMs <= Date.now()) {
    apiKeyAuthCache.delete(keyHash);
    return null;
  }
  return entry.result;
}

function cacheAuthResult(
  keyHash: string,
  result: CachedAuthResult,
  ttlMs: number,
): void {
  ensureCacheCapacity();
  apiKeyAuthCache.set(keyHash, {
    result,
    expiresAtMs: Date.now() + Math.max(1, ttlMs),
  });
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
  const cached = readCachedAuth(keyHash);
  if (cached?.kind === "ok") {
    return cached.context;
  }
  if (cached?.kind === "invalid") {
    throw new AuthError("Invalid API key");
  }
  if (cached?.kind === "revoked") {
    throw new AuthError("API key has been revoked");
  }

  const sb = getSupabase();

  const rows = await sb.select<ApiKeyRow>(
    "api_keys",
    `key_hash=eq.${keyHash}`,
    { limit: 1 },
  );

  if (rows.length === 0) {
    cacheAuthResult(
      keyHash,
      { kind: "invalid" },
      API_KEY_AUTH_NEGATIVE_CACHE_TTL_MS,
    );
    throw new AuthError("Invalid API key");
  }

  const row = rows[0];

  if (row.revoked_at !== null) {
    cacheAuthResult(
      keyHash,
      { kind: "revoked" },
      API_KEY_AUTH_CACHE_TTL_MS,
    );
    throw new AuthError("API key has been revoked");
  }

  const context: AuthContext = {
    wallet_address: row.wallet_address,
    api_key_id: row.id,
  };
  cacheAuthResult(
    keyHash,
    { kind: "ok", context },
    API_KEY_AUTH_CACHE_TTL_MS,
  );
  return context;
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

// Test-only helper to keep auth unit tests deterministic.
export function __clearAuthCacheForTests(): void {
  apiKeyAuthCache.clear();
}
