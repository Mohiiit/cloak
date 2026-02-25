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

const DEFAULT_API_URL = "http://localhost:3000";

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

export async function getApiClient(): Promise<CloakApiClient> {
  const { url, key } = await getApiConfig();
  return new CloakApiClient(url, key);
}
