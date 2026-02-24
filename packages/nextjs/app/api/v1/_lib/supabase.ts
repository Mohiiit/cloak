/**
 * Server-only Supabase client using service_role key.
 * This is the ONLY thing that talks to Supabase — no client ever does.
 *
 * All operations go through PostgREST REST endpoints with the service_role
 * key, giving full bypass of RLS for server-side operations.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

class SupabaseError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "SupabaseError";
    this.status = status;
    this.body = body;
  }
}

function baseHeaders(): Record<string, string> {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

function restUrl(table: string): string {
  return `${SUPABASE_URL}/rest/v1/${table}`;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text().catch(() => null);
    }
    throw new SupabaseError(
      `Supabase ${res.status}: ${typeof body === "object" && body !== null && "message" in body ? (body as { message: string }).message : res.statusText}`,
      res.status,
      body,
    );
  }

  // 204 or empty body
  const text = await res.text();
  if (!text) return [] as unknown as T;

  return JSON.parse(text) as T;
}

/**
 * Insert one or more rows into a table.
 * Returns the inserted row(s) as an array.
 */
async function insert<T>(table: string, data: Record<string, unknown> | Record<string, unknown>[]): Promise<T[]> {
  const res = await fetch(restUrl(table), {
    method: "POST",
    headers: baseHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse<T[]>(res);
}

/**
 * Select rows from a table with PostgREST filters.
 *
 * @param table - Table name
 * @param filters - PostgREST query string, e.g. "key=eq.value&status=eq.pending"
 * @param options - Optional select columns, ordering, limit, offset
 */
async function select<T>(
  table: string,
  filters?: string,
  options?: {
    columns?: string;
    orderBy?: string;
    limit?: number;
    offset?: number;
  },
): Promise<T[]> {
  const params = new URLSearchParams();

  if (options?.columns) {
    params.set("select", options.columns);
  }
  if (options?.orderBy) {
    params.set("order", options.orderBy);
  }
  if (options?.limit !== undefined) {
    params.set("limit", String(options.limit));
  }
  if (options?.offset !== undefined) {
    params.set("offset", String(options.offset));
  }

  // Merge PostgREST filters into params.
  // Filters use format "key=eq.value&other=in.(a,b)" — must split on first "=" only.
  if (filters) {
    for (const part of filters.split("&")) {
      const idx = part.indexOf("=");
      if (idx > 0) {
        params.set(part.slice(0, idx), part.slice(idx + 1));
      }
    }
  }

  const qs = params.toString();
  const url = `${restUrl(table)}${qs ? `?${qs}` : ""}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      ...baseHeaders(),
      Prefer: "return=representation",
    },
  });
  return handleResponse<T[]>(res);
}

/**
 * Update rows matching PostgREST filters.
 * Returns the updated row(s).
 */
async function update<T>(
  table: string,
  filters: string,
  data: Record<string, unknown>,
): Promise<T[]> {
  const url = `${restUrl(table)}?${filters}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: baseHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse<T[]>(res);
}

/**
 * Delete rows matching PostgREST filters.
 * Returns the deleted row(s).
 */
async function del<T>(table: string, filters: string): Promise<T[]> {
  const url = `${restUrl(table)}?${filters}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: baseHeaders(),
  });
  return handleResponse<T[]>(res);
}

/**
 * Upsert one or more rows into a table.
 * Uses PostgREST's Prefer: resolution=merge-duplicates header.
 * Returns the upserted row(s).
 *
 * @param onConflict - Comma-separated list of columns for conflict resolution
 */
async function upsert<T>(
  table: string,
  data: Record<string, unknown> | Record<string, unknown>[],
  onConflict?: string,
): Promise<T[]> {
  const headers = baseHeaders();
  headers["Prefer"] = "return=representation,resolution=merge-duplicates";

  const url = onConflict
    ? `${restUrl(table)}?on_conflict=${encodeURIComponent(onConflict)}`
    : restUrl(table);

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  return handleResponse<T[]>(res);
}

/** The server-side Supabase client interface. */
export interface SupabaseClient {
  insert: typeof insert;
  select: typeof select;
  update: typeof update;
  del: typeof del;
  upsert: typeof upsert;
}

const client: SupabaseClient = { insert, select, update, del, upsert };

/**
 * Get the server-side Supabase client.
 * Validates that required environment variables are set.
 * Throws immediately if SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.
 */
export function getSupabase(): SupabaseClient {
  if (!SUPABASE_URL) {
    throw new Error(
      "SUPABASE_URL environment variable is not set. Cannot connect to Supabase.",
    );
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY environment variable is not set. Cannot connect to Supabase.",
    );
  }
  return client;
}

export { SupabaseError };
