import { DEFAULT_SUPABASE_KEY, DEFAULT_SUPABASE_URL } from "../config";
import { SupabaseLite } from "../supabase";
import { normalizeAddress } from "../ward";

export type SwapExecutionStatus = "pending" | "confirmed" | "failed";

export interface SwapExecutionRecord {
  id?: string;
  wallet_address: string;
  ward_address?: string | null;
  tx_hash: string;
  provider: "avnu";
  sell_token: string;
  buy_token: string;
  sell_amount_wei: string;
  estimated_buy_amount_wei: string;
  min_buy_amount_wei: string;
  buy_actual_amount_wei?: string | null;
  status: SwapExecutionStatus;
  error_message?: string | null;
  created_at?: string;
  updated_at?: string;
}

let _sharedSb: SupabaseLite | null = null;

function getDefaultSb(): SupabaseLite {
  if (!_sharedSb) {
    _sharedSb = new SupabaseLite(DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_KEY);
  }
  return _sharedSb;
}

function normalizeRecord(
  record: Omit<SwapExecutionRecord, "id" | "created_at" | "updated_at">,
): Record<string, unknown> {
  const row: Record<string, unknown> = {
    ...record,
    wallet_address: normalizeAddress(record.wallet_address),
    ward_address: record.ward_address ? normalizeAddress(record.ward_address) : null,
  };

  for (const key of Object.keys(row)) {
    if (row[key] === undefined) row[key] = null;
  }
  return row;
}

export async function saveSwapExecution(
  record: Omit<SwapExecutionRecord, "id" | "created_at" | "updated_at">,
  sb?: SupabaseLite,
): Promise<SwapExecutionRecord | null> {
  const client = sb || getDefaultSb();
  const row = normalizeRecord(record);
  try {
    const rows = await client.insert<SwapExecutionRecord>("swap_executions", row);
    return rows[0] || null;
  } catch (err) {
    console.warn("[swaps] saveSwapExecution failed:", err);
    return null;
  }
}

export async function updateSwapExecution(
  txHash: string,
  update: Partial<Omit<SwapExecutionRecord, "id" | "wallet_address" | "tx_hash" | "created_at">>,
  sb?: SupabaseLite,
): Promise<void> {
  const client = sb || getDefaultSb();
  const body: Record<string, unknown> = { ...update };
  for (const key of Object.keys(body)) {
    if (body[key] === undefined) delete body[key];
  }
  if (Object.keys(body).length === 0) return;
  try {
    await client.update("swap_executions", `tx_hash=eq.${txHash}`, body);
  } catch (err) {
    console.warn("[swaps] updateSwapExecution failed:", err);
  }
}

export async function getSwapExecutions(
  walletAddress: string,
  limit = 100,
  sb?: SupabaseLite,
): Promise<SwapExecutionRecord[]> {
  const client = sb || getDefaultSb();
  const normalized = normalizeAddress(walletAddress);

  const [byWallet, byWard] = await Promise.all([
    client.select<SwapExecutionRecord>(
      "swap_executions",
      `wallet_address=eq.${normalized}`,
      "created_at.desc",
    ),
    client.select<SwapExecutionRecord>(
      "swap_executions",
      `ward_address=eq.${normalized}`,
      "created_at.desc",
    ),
  ]);

  let byManagedWards: SwapExecutionRecord[] = [];
  try {
    const wardRows = await client.select<{ ward_address: string }>(
      "ward_configs",
      `guardian_address=eq.${normalized}`,
    );
    const managedWards = Array.from(
      new Set(
        wardRows
          .map((row) => normalizeAddress(row.ward_address))
          .filter((addr) => addr !== "0x0"),
      ),
    );
    if (managedWards.length > 0) {
      const inClause = managedWards.join(",");
      byManagedWards = await client.select<SwapExecutionRecord>(
        "swap_executions",
        `wallet_address=in.(${inClause})`,
        "created_at.desc",
      );
    }
  } catch (err) {
    console.warn("[swaps] managed ward lookup failed:", err);
  }

  const seen = new Set<string>();
  const all: SwapExecutionRecord[] = [];
  for (const row of [...byWallet, ...byWard, ...byManagedWards]) {
    const key = row.tx_hash || row.id || "";
    if (!key || seen.has(key)) continue;
    seen.add(key);
    all.push(row);
  }

  all.sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  });

  return all.slice(0, limit);
}
