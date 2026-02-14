// ─── Supabase configuration for 2FA approval system ─────────────────

import {
  SupabaseLite,
  DEFAULT_SUPABASE_URL,
  DEFAULT_SUPABASE_KEY,
} from "@cloak-wallet/sdk";

const STORAGE_KEY_URL = "cloak_supabase_url";
const STORAGE_KEY_KEY = "cloak_supabase_key";

export async function getSupabaseConfig(): Promise<{
  url: string;
  key: string;
}> {
  const result = await chrome.storage.local.get([STORAGE_KEY_URL, STORAGE_KEY_KEY]);
  return {
    url: result[STORAGE_KEY_URL] || DEFAULT_SUPABASE_URL,
    key: result[STORAGE_KEY_KEY] || DEFAULT_SUPABASE_KEY,
  };
}

export async function saveSupabaseConfig(
  url: string,
  key: string,
): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEY_URL]: url,
    [STORAGE_KEY_KEY]: key,
  });
}

// ─── Singleton getter ───────────────────────────────────────────────

let _client: SupabaseLite | null = null;

export async function getSupabaseLite(): Promise<SupabaseLite> {
  if (!_client) {
    const config = await getSupabaseConfig();
    _client = new SupabaseLite(config.url, config.key);
  }
  return _client;
}
