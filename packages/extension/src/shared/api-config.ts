import { CloakApiClient } from "@cloak-wallet/sdk";

const STORAGE_KEY_URL = "cloak_api_url";
const STORAGE_KEY_KEY = "cloak_api_key";

// Default to the web app's origin (CloakApiClient appends /api/v1 internally)
const DEFAULT_API_URL = "http://localhost:3000";

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

let _client: CloakApiClient | null = null;

export async function getApiClient(): Promise<CloakApiClient> {
  if (!_client) {
    const config = await getApiConfig();
    _client = new CloakApiClient(config.url, config.key);
  }
  return _client;
}

// Reset singleton (call when config changes)
export function resetApiClient(): void {
  _client = null;
}
