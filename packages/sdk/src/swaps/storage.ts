import { DEFAULT_SUPABASE_KEY, DEFAULT_SUPABASE_URL } from "../config";
import { SupabaseLite } from "../supabase";
import { normalizeAddress } from "../ward";

export type SwapExecutionStatus = "pending" | "running" | "confirmed" | "failed";
export type SwapExecutionStepStatus = "pending" | "running" | "success" | "failed" | "skipped";
export type SwapExecutionStepKey =
  | "quote"
  | "build_route"
  | "prepare_withdraw"
  | "prepare_fund"
  | "approve"
  | "compose"
  | "estimate_fee"
  | "submit"
  | "confirm"
  | "refresh";

export interface SwapExecutionRecord {
  id?: string;
  execution_id: string;
  wallet_address: string;
  ward_address?: string | null;
  tx_hash?: string | null;
  tx_hashes?: string[] | null;
  primary_tx_hash?: string | null;
  provider: "avnu";
  sell_token: string;
  buy_token: string;
  sell_amount_wei: string;
  estimated_buy_amount_wei: string;
  min_buy_amount_wei: string;
  buy_actual_amount_wei?: string | null;
  failure_step_key?: SwapExecutionStepKey | null;
  failure_reason?: string | null;
  route_meta?: Record<string, unknown> | null;
  status: SwapExecutionStatus;
  error_message?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface SwapExecutionStepRecord {
  id?: string;
  execution_id: string;
  step_key: SwapExecutionStepKey;
  step_order: number;
  attempt: number;
  status: SwapExecutionStepStatus;
  tx_hash?: string | null;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
  started_at?: string | null;
  finished_at?: string | null;
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

function createExecutionId(): string {
  return `swap_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalizeRecord(
  record: Omit<SwapExecutionRecord, "id" | "created_at" | "updated_at">,
): Record<string, unknown> {
  const txHashes = Array.isArray(record.tx_hashes)
    ? Array.from(new Set(record.tx_hashes.filter((hash): hash is string => !!hash)))
    : [];
  const primaryTxHash = record.primary_tx_hash || record.tx_hash || txHashes[0] || null;

  const row: Record<string, unknown> = {
    ...record,
    execution_id: record.execution_id || createExecutionId(),
    wallet_address: normalizeAddress(record.wallet_address),
    ward_address: record.ward_address ? normalizeAddress(record.ward_address) : null,
    tx_hash: record.tx_hash || primaryTxHash,
    primary_tx_hash: primaryTxHash,
    tx_hashes: txHashes.length > 0 ? txHashes : null,
  };

  for (const key of Object.keys(row)) {
    if (row[key] === undefined) row[key] = null;
  }
  return row;
}

function normalizeStepRecord(
  record: Omit<SwapExecutionStepRecord, "id" | "created_at" | "updated_at">,
): Record<string, unknown> {
  const row: Record<string, unknown> = {
    ...record,
    execution_id: record.execution_id,
    tx_hash: record.tx_hash || null,
    message: record.message || null,
    metadata: record.metadata || null,
    started_at: record.started_at || null,
    finished_at: record.finished_at || null,
  };
  for (const key of Object.keys(row)) {
    if (row[key] === undefined) row[key] = null;
  }
  return row;
}

function parseTxHashes(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const hashes = value.filter((entry): entry is string => typeof entry === "string" && !!entry);
  if (hashes.length === 0) return null;
  return Array.from(new Set(hashes));
}

function normalizeSwapRow(row: SwapExecutionRecord): SwapExecutionRecord {
  const txHashes = parseTxHashes((row as unknown as Record<string, unknown>).tx_hashes);
  return {
    ...row,
    execution_id: row.execution_id || row.id || createExecutionId(),
    tx_hash: row.tx_hash ?? row.primary_tx_hash ?? txHashes?.[0] ?? null,
    primary_tx_hash: row.primary_tx_hash ?? row.tx_hash ?? txHashes?.[0] ?? null,
    tx_hashes: txHashes,
  };
}

export async function saveSwapExecution(
  record: Omit<SwapExecutionRecord, "id" | "created_at" | "updated_at">,
  sb?: SupabaseLite,
): Promise<SwapExecutionRecord | null> {
  const client = sb || getDefaultSb();
  const row = normalizeRecord(record);
  try {
    const rows = await client.insert<SwapExecutionRecord>("swap_executions", row);
    return rows[0] ? normalizeSwapRow(rows[0]) : null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const missingExecutionIdColumn = message.includes("execution_id")
      && message.includes("swap_executions");
    if (missingExecutionIdColumn && row.tx_hash) {
      try {
        const legacyRow = {
          wallet_address: row.wallet_address,
          ward_address: row.ward_address,
          tx_hash: row.tx_hash,
          provider: row.provider,
          sell_token: row.sell_token,
          buy_token: row.buy_token,
          sell_amount_wei: row.sell_amount_wei,
          estimated_buy_amount_wei: row.estimated_buy_amount_wei,
          min_buy_amount_wei: row.min_buy_amount_wei,
          buy_actual_amount_wei: row.buy_actual_amount_wei,
          status: row.status === "running" ? "pending" : row.status,
          error_message: row.error_message,
        };
        const rows = await client.insert<SwapExecutionRecord>("swap_executions", legacyRow);
        return rows[0] ? normalizeSwapRow(rows[0]) : null;
      } catch (legacyErr) {
        console.warn("[swaps] saveSwapExecution legacy fallback failed:", legacyErr);
      }
    }
    console.warn("[swaps] saveSwapExecution failed:", err);
    return null;
  }
}

export async function updateSwapExecution(
  txHash: string,
  update: Partial<
    Omit<SwapExecutionRecord, "id" | "wallet_address" | "tx_hash" | "execution_id" | "created_at">
  >,
  sb?: SupabaseLite,
): Promise<void> {
  const client = sb || getDefaultSb();
  const body: Record<string, unknown> = { ...update };
  if (Array.isArray(body.tx_hashes)) {
    body.tx_hashes = parseTxHashes(body.tx_hashes) || null;
  }
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

export async function updateSwapExecutionByExecutionId(
  executionId: string,
  update: Partial<Omit<SwapExecutionRecord, "id" | "wallet_address" | "execution_id" | "created_at">>,
  sb?: SupabaseLite,
): Promise<void> {
  const client = sb || getDefaultSb();
  const body: Record<string, unknown> = { ...update };
  if (Array.isArray(body.tx_hashes)) {
    body.tx_hashes = parseTxHashes(body.tx_hashes) || null;
  }
  for (const key of Object.keys(body)) {
    if (body[key] === undefined) delete body[key];
  }
  if (Object.keys(body).length === 0) return;
  try {
    await client.update("swap_executions", `execution_id=eq.${executionId}`, body);
  } catch (err) {
    console.warn("[swaps] updateSwapExecutionByExecutionId failed:", err);
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
    const normalizedRow = normalizeSwapRow(row);
    const key = normalizedRow.execution_id || normalizedRow.tx_hash || normalizedRow.id || "";
    if (!key || seen.has(key)) continue;
    seen.add(key);
    all.push(normalizedRow);
  }

  all.sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  });

  return all.slice(0, limit);
}

export async function getSwapExecutionSteps(
  executionIds: string[],
  sb?: SupabaseLite,
): Promise<SwapExecutionStepRecord[]> {
  if (executionIds.length === 0) return [];
  const client = sb || getDefaultSb();
  const unique = Array.from(new Set(executionIds.filter(Boolean)));
  if (unique.length === 0) return [];
  try {
    const filters = `execution_id=in.(${unique.join(",")})`;
    return await client.select<SwapExecutionStepRecord>(
      "swap_execution_steps",
      filters,
      "created_at.asc",
    );
  } catch (err) {
    console.warn("[swaps] getSwapExecutionSteps failed:", err);
    return [];
  }
}

export async function upsertSwapExecutionStep(
  step: Omit<SwapExecutionStepRecord, "id" | "created_at" | "updated_at">,
  sb?: SupabaseLite,
): Promise<SwapExecutionStepRecord | null> {
  const client = sb || getDefaultSb();
  const row = normalizeStepRecord(step);
  const filters = `execution_id=eq.${step.execution_id}&step_key=eq.${step.step_key}&attempt=eq.${step.attempt}`;

  try {
    const existing = await client.select<SwapExecutionStepRecord>(
      "swap_execution_steps",
      filters,
      "updated_at.desc",
    );
    if (existing[0]?.id) {
      const updated = await client.update<SwapExecutionStepRecord>(
        "swap_execution_steps",
        `id=eq.${existing[0].id}`,
        row,
      );
      return updated[0] || existing[0];
    }
    const inserted = await client.insert<SwapExecutionStepRecord>("swap_execution_steps", row);
    return inserted[0] || null;
  } catch (err) {
    console.warn("[swaps] upsertSwapExecutionStep failed:", err);
    return null;
  }
}
