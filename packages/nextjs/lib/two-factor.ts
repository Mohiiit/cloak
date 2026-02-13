/**
 * Two-Factor Authentication support for Cloak web app.
 *
 * Uses a lightweight Supabase client (fetch-based, no SDK dependency)
 * to coordinate 2FA approval requests between the web app and the mobile app.
 *
 * The web app CANNOT sign transactions (no private key access with external wallets).
 * Instead, it sends raw call data to Supabase. The mobile app (which holds both keys)
 * handles all signing and submits the final transaction.
 */

const STORAGE_KEY_SUPABASE_URL = "cloak_2fa_supabase_url";
const STORAGE_KEY_SUPABASE_KEY = "cloak_2fa_supabase_key";

const DEFAULT_SUPABASE_URL = "https://inrrwwpzglyywrrumxfr.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_TPLbWlk9ucpb6zLduRShvg_pq4K4cad";

// ---------------------------------------------------------------------------
// Supabase config helpers
// ---------------------------------------------------------------------------

export function getSupabaseConfig(): { url: string; key: string } {
  if (typeof window === "undefined") {
    return { url: DEFAULT_SUPABASE_URL, key: DEFAULT_SUPABASE_KEY };
  }
  const url = localStorage.getItem(STORAGE_KEY_SUPABASE_URL) || DEFAULT_SUPABASE_URL;
  const key = localStorage.getItem(STORAGE_KEY_SUPABASE_KEY) || DEFAULT_SUPABASE_KEY;
  return { url, key };
}

export function saveSupabaseConfig(url: string, key: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY_SUPABASE_URL, url);
  localStorage.setItem(STORAGE_KEY_SUPABASE_KEY, key);
}

// ---------------------------------------------------------------------------
// Lightweight Supabase REST client (no SDK required)
// ---------------------------------------------------------------------------

class SupabaseLite {
  private baseUrl: string;
  private apiKey: string;

  constructor(url: string, key: string) {
    this.baseUrl = url.replace(/\/$/, "");
    this.apiKey = key;
  }

  private headers(): Record<string, string> {
    return {
      apikey: this.apiKey,
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };
  }

  async insert<T = any>(table: string, data: Record<string, any>): Promise<T[]> {
    const res = await fetch(`${this.baseUrl}/rest/v1/${table}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Supabase insert failed (${res.status}): ${text}`);
    }
    return res.json();
  }

  async select<T = any>(
    table: string,
    filters?: Record<string, string>,
    orderBy?: string,
  ): Promise<T[]> {
    const params = new URLSearchParams();
    if (filters) {
      for (const [col, val] of Object.entries(filters)) {
        params.set(col, val);
      }
    }
    if (orderBy) {
      params.set("order", orderBy);
    }
    const url = `${this.baseUrl}/rest/v1/${table}?${params.toString()}`;
    const res = await fetch(url, {
      method: "GET",
      headers: this.headers(),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Supabase select failed (${res.status}): ${text}`);
    }
    return res.json();
  }

  async update<T = any>(
    table: string,
    filters: Record<string, string>,
    data: Record<string, any>,
  ): Promise<T[]> {
    const params = new URLSearchParams(filters);
    const res = await fetch(`${this.baseUrl}/rest/v1/${table}?${params.toString()}`, {
      method: "PATCH",
      headers: this.headers(),
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Supabase update failed (${res.status}): ${text}`);
    }
    return res.json();
  }
}

// ---------------------------------------------------------------------------
// 2FA helpers
// ---------------------------------------------------------------------------

function getClient(): SupabaseLite {
  const { url, key } = getSupabaseConfig();
  return new SupabaseLite(url, key);
}

/**
 * Normalize a hex address: lowercase, strip leading zeros after 0x prefix.
 * e.g. "0x03e836..." → "0x3e836..."
 */
function normalizeAddress(addr: string): string {
  const lower = addr.toLowerCase();
  if (!lower.startsWith("0x")) return lower;
  const stripped = lower.slice(2).replace(/^0+/, "");
  return "0x" + (stripped || "0");
}

/**
 * Check whether 2FA is enabled for the given wallet address.
 */
export async function check2FAEnabled(walletAddress: string): Promise<boolean> {
  try {
    const client = getClient();
    const normalized = normalizeAddress(walletAddress);
    const rows = await client.select("two_factor_configs", {
      wallet_address: `eq.${normalized}`,
    });
    return rows.length > 0;
  } catch (err) {
    console.warn("[2FA] Failed to check 2FA status:", err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Approval request types
// ---------------------------------------------------------------------------

export interface ApprovalRequestParams {
  walletAddress: string;
  action: string;
  token: string;
  amount?: string;
  recipient?: string;
  callsJson: string;
  sig1Json: string;
  nonce: string;
  resourceBoundsJson: string;
  txHash: string;
  onStatusChange?: (status: string) => void;
  signal?: AbortSignal;
}

export interface ApprovalResult {
  approved: boolean;
  txHash?: string;
  error?: string;
}

/**
 * Create an approval request in Supabase and poll until the mobile app
 * approves or rejects it (or until timeout / cancellation).
 *
 * Polls every 2 seconds with a 5 minute timeout.
 */
export async function request2FAApproval(
  params: ApprovalRequestParams,
): Promise<ApprovalResult> {
  const client = getClient();

  // Insert the approval request
  const rows = await client.insert("approval_requests", {
    wallet_address: normalizeAddress(params.walletAddress),
    action: params.action,
    token: params.token,
    amount: params.amount || null,
    recipient: params.recipient || null,
    calls_json: params.callsJson,
    sig1_json: params.sig1Json,
    nonce: params.nonce,
    resource_bounds_json: params.resourceBoundsJson,
    tx_hash: params.txHash,
    status: "pending",
  });

  if (!rows || rows.length === 0) {
    return { approved: false, error: "Failed to create approval request" };
  }

  const requestId = rows[0].id;

  // Poll every 2s for up to 5 minutes
  const POLL_INTERVAL = 2000;
  const TIMEOUT = 5 * 60 * 1000;
  const startTime = Date.now();

  return new Promise<ApprovalResult>((resolve) => {
    const poll = async () => {
      // Check if aborted
      if (params.signal?.aborted) {
        resolve({ approved: false, error: "Cancelled by user" });
        return;
      }

      // Check timeout
      if (Date.now() - startTime > TIMEOUT) {
        params.onStatusChange?.("timeout");
        resolve({ approved: false, error: "Approval request timed out (5 min)" });
        return;
      }

      try {
        const results = await client.select("approval_requests", {
          id: `eq.${requestId}`,
        });

        if (results.length > 0) {
          const req = results[0];

          if (req.status === "approved") {
            params.onStatusChange?.("approved");
            resolve({
              approved: true,
              txHash: req.final_tx_hash || req.tx_hash,
            });
            return;
          }

          if (req.status === "rejected") {
            params.onStatusChange?.("rejected");
            resolve({ approved: false, error: "Rejected on mobile device" });
            return;
          }

          if (req.status === "failed") {
            params.onStatusChange?.("rejected");
            resolve({ approved: false, error: req.error_message || "Transaction failed on mobile" });
            return;
          }

          // Still pending — update status
          params.onStatusChange?.("pending");
        }
      } catch (err) {
        console.warn("[2FA] Poll error:", err);
      }

      // Schedule next poll
      setTimeout(poll, POLL_INTERVAL);
    };

    // Listen for abort
    if (params.signal) {
      params.signal.addEventListener("abort", () => {
        resolve({ approved: false, error: "Cancelled by user" });
      }, { once: true });
    }

    // Start polling
    poll();
  });
}
