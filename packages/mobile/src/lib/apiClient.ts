/**
 * apiClient.ts — CloakApiClient factory for mobile.
 *
 * Replaces the old Supabase config with a centralized API config.
 * Stores API URL and key in AsyncStorage.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CloakApiClient } from "@cloak-wallet/sdk";

const STORAGE_KEY_URL = "cloak_api_url";
const STORAGE_KEY_KEY = "cloak_api_key";
const STORAGE_KEY_STARK_ADDRESS = "cloak_stark_address";
const STORAGE_KEY_STARK_PUBLIC_KEY = "cloak_stark_pubkey";

const DEFAULT_API_URL = "https://cloak-backend-vert.vercel.app";

type ApiConfig = {
  url: string;
  key: string;
};

type ApiClientOptions = {
  walletAddress?: string;
  publicKey?: string;
};

let validatedApiKey: string | null = null;

function toHexString(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;
  if (/^0x[0-9a-fA-F]+$/.test(raw)) return raw.toLowerCase();
  if (/^\d+$/.test(raw)) return `0x${BigInt(raw).toString(16)}`;
  return null;
}

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

    if (!res.ok) {
      return null;
    }

    const data = (await res.json()) as { api_key?: string };
    return typeof data.api_key === "string" && data.api_key.length > 0
      ? data.api_key
      : null;
  } catch {
    return null;
  }
}

async function ensureApiKey(
  config: ApiConfig,
  options?: ApiClientOptions,
): Promise<ApiConfig> {
  const currentKey = config.key.trim();
  if (currentKey.length > 0) {
    if (validatedApiKey === currentKey) return config;
    try {
      const verifyRes = await fetch(
        `${config.url.replace(/\/$/, "")}/api/v1/auth/verify`,
        {
          method: "GET",
          headers: { "X-API-Key": currentKey },
        },
      );
      if (verifyRes.ok) {
        validatedApiKey = currentKey;
        return config;
      }
    } catch {
      // If verify fails due transient network, keep using the existing key.
      return config;
    }
  }

  const [storedWalletAddress, storedPublicKey] = await Promise.all([
    AsyncStorage.getItem(STORAGE_KEY_STARK_ADDRESS),
    AsyncStorage.getItem(STORAGE_KEY_STARK_PUBLIC_KEY),
  ]);

  const walletAddress = toHexString(
    options?.walletAddress ?? storedWalletAddress,
  );
  const publicKey = toHexString(options?.publicKey ?? storedPublicKey);

  if (!walletAddress || !publicKey) return config;

  const apiKey = await registerApiKey(config.url, walletAddress, publicKey);
  if (!apiKey) return config;

  await AsyncStorage.setItem(STORAGE_KEY_KEY, apiKey);
  validatedApiKey = apiKey;
  return { ...config, key: apiKey };
}

export async function getApiConfig(): Promise<{ url: string; key: string }> {
  const [url, key] = await Promise.all([
    AsyncStorage.getItem(STORAGE_KEY_URL),
    AsyncStorage.getItem(STORAGE_KEY_KEY),
  ]);
  return {
    url: url || DEFAULT_API_URL,
    key: key || "",
  };
}

export async function saveApiConfig(url: string, key: string): Promise<void> {
  await Promise.all([
    AsyncStorage.setItem(STORAGE_KEY_URL, url),
    AsyncStorage.setItem(STORAGE_KEY_KEY, key),
  ]);
}

export async function getApiClient(
  options?: ApiClientOptions,
): Promise<CloakApiClient> {
  const config = await getApiConfig();
  const resolved = await ensureApiKey(config, options);
  return new CloakApiClient(resolved.url, resolved.key);
}
