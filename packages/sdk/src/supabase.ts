/**
 * Lightweight Supabase PostgREST client.
 * No heavy SDK dependency — just fetch-based REST calls.
 */
export class SupabaseLite {
  private url: string;
  private anonKey: string;

  constructor(url: string, anonKey: string) {
    // Strip trailing slash
    this.url = url.replace(/\/$/, "");
    this.anonKey = anonKey;
  }

  private headers(): Record<string, string> {
    return {
      apikey: this.anonKey,
      Authorization: `Bearer ${this.anonKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };
  }

  /**
   * INSERT a row into a table.
   * Returns the inserted row(s).
   */
  async insert<T = any>(table: string, data: Record<string, any>): Promise<T[]> {
    const res = await fetch(`${this.url}/rest/v1/${table}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Supabase insert error: ${res.status} ${err}`);
    }
    return res.json();
  }

  /**
   * SELECT rows from a table with optional PostgREST filters.
   * @param filters - PostgREST query string, e.g. "wallet_address=eq.0x123&status=eq.pending"
   * @param orderBy - e.g. "created_at.desc"
   */
  async select<T = any>(
    table: string,
    filters?: string,
    orderBy?: string,
  ): Promise<T[]> {
    const params = new URLSearchParams();
    if (filters) {
      // Parse "key=value&key2=value2" into individual params
      for (const part of filters.split("&")) {
        const idx = part.indexOf("=");
        if (idx > 0) {
          params.append(part.slice(0, idx), part.slice(idx + 1));
        }
      }
    }
    if (orderBy) {
      params.append("order", orderBy);
    }

    const qs = params.toString();
    const url = `${this.url}/rest/v1/${table}${qs ? `?${qs}` : ""}`;

    const res = await fetch(url, {
      method: "GET",
      headers: { ...this.headers(), Prefer: "return=representation" },
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Supabase select error: ${res.status} ${err}`);
    }
    return res.json();
  }

  /**
   * UPDATE rows matching PostgREST filters.
   * @param filters - e.g. "id=eq.some-uuid"
   */
  async update<T = any>(
    table: string,
    filters: string,
    data: Record<string, any>,
  ): Promise<T[]> {
    const params = new URLSearchParams();
    for (const part of filters.split("&")) {
      const idx = part.indexOf("=");
      if (idx > 0) {
        params.append(part.slice(0, idx), part.slice(idx + 1));
      }
    }

    const url = `${this.url}/rest/v1/${table}?${params.toString()}`;

    const res = await fetch(url, {
      method: "PATCH",
      headers: this.headers(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Supabase update error: ${res.status} ${err}`);
    }
    return res.json();
  }

  /**
   * DELETE rows matching PostgREST filters.
   */
  async delete(table: string, filters: string): Promise<void> {
    const params = new URLSearchParams();
    for (const part of filters.split("&")) {
      const idx = part.indexOf("=");
      if (idx > 0) {
        params.append(part.slice(0, idx), part.slice(idx + 1));
      }
    }

    const url = `${this.url}/rest/v1/${table}?${params.toString()}`;
    const res = await fetch(url, {
      method: "DELETE",
      headers: this.headers(),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Supabase delete error: ${res.status} ${err}`);
    }
  }

  /**
   * Subscribe to Supabase Realtime changes on a table (polling fallback).
   * Uses simple polling since we don't want to add WebSocket deps.
   * @returns cleanup function
   */
  poll(
    table: string,
    filters: string,
    intervalMs: number,
    callback: (rows: any[]) => void,
  ): () => void {
    let active = true;
    const tick = async () => {
      if (!active) return;
      try {
        const rows = await this.select(table, filters, "created_at.desc");
        callback(rows);
      } catch {
        // Silently retry next tick
      }
      if (active) setTimeout(tick, intervalMs);
    };
    tick();
    return () => {
      active = false;
    };
  }
}
