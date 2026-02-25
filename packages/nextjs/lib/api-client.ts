import { CloakApiClient } from "@cloak-wallet/sdk";

const STORAGE_KEY_API_URL = "cloak_api_url";
const STORAGE_KEY_API_KEY = "cloak_api_key";

// Default to same-origin for the web app.
// CloakApiClient appends /api/v1 to the baseUrl internally.
const DEFAULT_API_URL = typeof window !== "undefined" ? window.location.origin : "";

export function getApiConfig(): { url: string; key: string } {
  if (typeof window === "undefined") return { url: DEFAULT_API_URL, key: "" };
  const url = localStorage.getItem(STORAGE_KEY_API_URL) || DEFAULT_API_URL;
  const key = localStorage.getItem(STORAGE_KEY_API_KEY) || "";
  return { url, key };
}

export function saveApiConfig(url: string, key: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY_API_URL, url);
  localStorage.setItem(STORAGE_KEY_API_KEY, key);
}

export function getClient(): CloakApiClient {
  const { url, key } = getApiConfig();
  return new CloakApiClient(url, key);
}
