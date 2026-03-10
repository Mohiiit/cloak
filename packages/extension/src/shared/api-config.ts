import { CloakApiClient } from "@cloak-wallet/sdk";
import { ec } from "starknet";

const STORAGE_KEY_URL = "cloak_api_url";
const STORAGE_KEY_KEY = "cloak_api_key";

// SDK storage keys (must match packages/sdk/src/client.ts)
const SDK_PK_KEY = "private_key";
const SDK_ADDRESS_KEY = "stark_address";

// Default to the web app's origin (CloakApiClient appends /api/v1 internally)
const DEFAULT_API_URL = "https://cloak-backend-vert.vercel.app";

let validatedApiKey: string | null = null;
let validatedAtMs = 0;
const VALIDATION_TTL_MS = 60_000; // Re-verify after 60s

// Mutex: only one ensureApiKey call runs at a time
let ensureApiKeyPromise: Promise<{ url: string; key: string }> | null = null;

export async function getApiConfig(): Promise<{ url: string; key: string }> {
  const result = await chrome.storage.local.get([STORAGE_KEY_URL, STORAGE_KEY_KEY]);
  return {
    url: result[STORAGE_KEY_URL] || DEFAULT_API_URL,
    key: result[STORAGE_KEY_KEY] || "",
  };
}

export async function saveApiConfig(url: string, key: string): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEY_URL]: url,
    [STORAGE_KEY_KEY]: key,
  });
}

/**
 * Register with the backend to obtain an API key.
 */
async function registerApiKey(
  url: string,
  walletAddress: string,
  publicKey: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wallet_address: walletAddress,
        public_key: publicKey,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { api_key?: string };
    return typeof data.api_key === "string" && data.api_key.length > 0
      ? data.api_key
      : null;
  } catch {
    return null;
  }
}

/**
 * Read wallet credentials from chrome.storage (written by the SDK's ExtensionStorageAdapter).
 */
async function getWalletCredentials(): Promise<{ address: string; publicKey: string } | null> {
  const result = await chrome.storage.local.get([SDK_PK_KEY, SDK_ADDRESS_KEY]);
  const pk = result[SDK_PK_KEY];
  const address = result[SDK_ADDRESS_KEY];
  if (!pk || !address) return null;

  try {
    const publicKey = "0x" + ec.starkCurve.getStarkKey(pk).replace(/^0x/, "");
    return { address, publicKey };
  } catch {
    return null;
  }
}

/**
 * Ensure we have a valid API key — verify existing or register a new one.
 */
async function ensureApiKeyImpl(
  config: { url: string; key: string },
): Promise<{ url: string; key: string }> {
  const currentKey = config.key.trim();

  if (currentKey.length > 0) {
    // Still within TTL — reuse without network call
    if (validatedApiKey === currentKey && (Date.now() - validatedAtMs) < VALIDATION_TTL_MS) {
      return config;
    }

    // Verify with backend
    try {
      const res = await fetch(`${config.url.replace(/\/$/, "")}/api/v1/auth/verify`, {
        method: "GET",
        headers: { "X-API-Key": currentKey },
      });
      if (res.ok) {
        validatedApiKey = currentKey;
        validatedAtMs = Date.now();
        return config;
      }
      // Key is invalid — clear cache and fall through to re-register
      validatedApiKey = null;
      validatedAtMs = 0;
    } catch {
      // Transient error — keep using existing key
      return config;
    }
  }

  // No key or invalid — register a new one
  const creds = await getWalletCredentials();
  if (!creds) return config;

  const apiKey = await registerApiKey(config.url, creds.address, creds.publicKey);
  if (!apiKey) return config;

  await chrome.storage.local.set({ [STORAGE_KEY_KEY]: apiKey });
  validatedApiKey = apiKey;
  validatedAtMs = Date.now();
  return { ...config, key: apiKey };
}

/** Serialized wrapper — prevents concurrent registration races. */
function ensureApiKey(
  config: { url: string; key: string },
): Promise<{ url: string; key: string }> {
  if (ensureApiKeyPromise) return ensureApiKeyPromise;
  ensureApiKeyPromise = ensureApiKeyImpl(config).finally(() => {
    ensureApiKeyPromise = null;
  });
  return ensureApiKeyPromise;
}

let _client: CloakApiClient | null = null;

export async function getApiClient(): Promise<CloakApiClient> {
  if (!_client || !validatedApiKey) {
    const config = await getApiConfig();
    const resolved = await ensureApiKey(config);
    _client = new CloakApiClient(resolved.url, resolved.key);
  }
  return _client;
}

// Reset singleton (call when config changes, wallet changes, or 401 received)
export function resetApiClient(): void {
  _client = null;
  validatedApiKey = null;
  validatedAtMs = 0;
}
