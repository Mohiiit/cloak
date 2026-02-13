// ─── Supabase configuration for 2FA approval system ─────────────────

const DEFAULT_SUPABASE_URL = "https://inrrwwpzglyywrrumxfr.supabase.co";
const DEFAULT_SUPABASE_KEY =
  "sb_publishable_TPLbWlk9ucpb6zLduRShvg_pq4K4cad";

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

// ─── Lightweight Supabase client using fetch ─────────────────────────

export class SupabaseLite {
  private url: string;
  private key: string;

  constructor(url: string, key: string) {
    this.url = url;
    this.key = key;
  }

  private headers(): Record<string, string> {
    return {
      apikey: this.key,
      Authorization: `Bearer ${this.key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };
  }

  async insert<T = any>(table: string, data: Record<string, any>): Promise<T> {
    const res = await fetch(`${this.url}/rest/v1/${table}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Supabase insert failed: ${res.status} ${text}`);
    }
    const json = await res.json();
    return Array.isArray(json) ? json[0] : json;
  }

  async select<T = any>(
    table: string,
    filters?: Record<string, string>,
    orderBy?: { column: string; ascending?: boolean },
  ): Promise<T[]> {
    const params = new URLSearchParams();
    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        params.set(key, value);
      }
    }
    if (orderBy) {
      params.set(
        "order",
        `${orderBy.column}.${orderBy.ascending ? "asc" : "desc"}`,
      );
    }
    const qs = params.toString();
    const res = await fetch(
      `${this.url}/rest/v1/${table}${qs ? `?${qs}` : ""}`,
      {
        method: "GET",
        headers: this.headers(),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Supabase select failed: ${res.status} ${text}`);
    }
    return res.json();
  }

  async update<T = any>(
    table: string,
    filters: Record<string, string>,
    data: Record<string, any>,
  ): Promise<T> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      params.set(key, value);
    }
    const qs = params.toString();
    const res = await fetch(
      `${this.url}/rest/v1/${table}${qs ? `?${qs}` : ""}`,
      {
        method: "PATCH",
        headers: this.headers(),
        body: JSON.stringify(data),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Supabase update failed: ${res.status} ${text}`);
    }
    const json = await res.json();
    return Array.isArray(json) ? json[0] : json;
  }
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
