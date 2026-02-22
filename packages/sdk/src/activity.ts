import { DEFAULT_SUPABASE_KEY, DEFAULT_SUPABASE_URL } from "./config";
import { SupabaseLite } from "./supabase";
import {
  getTransactions,
  type AccountType,
  type TransactionRecord,
  type TransactionType,
} from "./transactions";
import { normalizeAddress } from "./ward";
import type { AmountUnit } from "./token-convert";
import {
  getSwapExecutionSteps,
  getSwapExecutions,
  type SwapExecutionRecord,
  type SwapExecutionStepRecord,
} from "./swaps";

export type ActivitySource = "transaction" | "ward_request";

export type ActivityStatus =
  | "pending"
  | "confirmed"
  | "failed"
  | "rejected"
  | "gas_error"
  | "expired";

interface WardApprovalActivityRow {
  id: string;
  ward_address: string;
  guardian_address: string;
  action: string;
  token: string;
  amount: string | null;
  amount_unit?: AmountUnit | null;
  recipient: string | null;
  status: string;
  tx_hash: string;
  final_tx_hash: string | null;
  error_message: string | null;
  created_at?: string;
  responded_at?: string | null;
}

export interface ActivityRecord {
  id: string;
  source: ActivitySource;
  wallet_address: string;
  tx_hash: string;
  type: TransactionType | string;
  token: string;
  amount?: string | null;
  amount_unit?: AmountUnit | null;
  recipient?: string | null;
  recipient_name?: string | null;
  note?: string | null;
  status: ActivityStatus;
  status_detail?: string;
  error_message?: string | null;
  account_type: AccountType;
  ward_address?: string | null;
  fee?: string | null;
  network: string;
  platform?: string | null;
  created_at?: string;
  responded_at?: string | null;
  swap?: {
    execution_id?: string;
    provider: string;
    sell_token: string;
    buy_token: string;
    sell_amount_wei: string;
    estimated_buy_amount_wei: string;
    min_buy_amount_wei: string;
    buy_actual_amount_wei?: string | null;
    tx_hashes?: string[] | null;
    primary_tx_hash?: string | null;
    status?: string;
    failure_step_key?: string | null;
    failure_reason?: string | null;
    steps?: Array<{
      step_key: string;
      step_order: number;
      status: string;
      tx_hash?: string | null;
      message?: string | null;
      started_at?: string | null;
      finished_at?: string | null;
    }>;
  } | null;
}

let _sharedSb: SupabaseLite | null = null;

function getDefaultSb(): SupabaseLite {
  if (!_sharedSb) {
    _sharedSb = new SupabaseLite(DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_KEY);
  }
  return _sharedSb;
}

function asTimestamp(value?: string): number {
  if (!value) return 0;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function mapTransactionStatus(status: TransactionRecord["status"]): ActivityStatus {
  if (status === "confirmed") return "confirmed";
  if (status === "failed") return "failed";
  return "pending";
}

function mapWardRequestStatus(status: string): ActivityStatus {
  switch (status) {
    case "approved":
      return "confirmed";
    case "rejected":
      return "rejected";
    case "gas_error":
      return "gas_error";
    case "failed":
      return "failed";
    case "expired":
      return "expired";
    case "pending_guardian":
    case "pending_ward_sig":
    default:
      return "pending";
  }
}

function isAmountUnit(value: unknown): value is AmountUnit {
  return value === "tongo_units" || value === "erc20_wei" || value === "erc20_display";
}

function normalizeWardAmountUnit(row: WardApprovalActivityRow): AmountUnit | null {
  if (isAmountUnit(row.amount_unit)) return row.amount_unit;
  // Ward approval actions only carry display units for public transfer.
  if (row.action === "erc20_transfer") return "erc20_display";
  return row.amount ? "tongo_units" : null;
}

function statusNoteForWardRequest(status: string): string | null {
  if (status === "pending_ward_sig") return "Waiting for ward signature";
  if (status === "pending_guardian") return "Waiting for guardian approval";
  if (status === "rejected") return "Request rejected";
  if (status === "gas_error") return "Gas too low, retry required";
  if (status === "expired") return "Request expired";
  return null;
}

function mapTransactionToActivity(
  tx: TransactionRecord,
  swap?: SwapExecutionRecord | null,
  steps?: SwapExecutionStepRecord[],
): ActivityRecord {
  return {
    id: tx.tx_hash,
    source: "transaction",
    wallet_address: tx.wallet_address,
    tx_hash: tx.tx_hash,
    type: tx.type,
    token: tx.token,
    amount: tx.amount ?? null,
    amount_unit: tx.amount_unit ?? null,
    recipient: tx.recipient ?? null,
    recipient_name: tx.recipient_name ?? null,
    note: tx.note ?? null,
    status: mapTransactionStatus(tx.status),
    error_message: tx.error_message ?? null,
    account_type: tx.account_type,
    ward_address: tx.ward_address ?? null,
    fee: tx.fee ?? null,
    network: tx.network,
    platform: tx.platform ?? null,
    created_at: tx.created_at,
    swap: swap
      ? {
          execution_id: swap.execution_id,
          provider: swap.provider,
          sell_token: swap.sell_token,
          buy_token: swap.buy_token,
          sell_amount_wei: swap.sell_amount_wei,
          estimated_buy_amount_wei: swap.estimated_buy_amount_wei,
          min_buy_amount_wei: swap.min_buy_amount_wei,
          buy_actual_amount_wei: swap.buy_actual_amount_wei ?? null,
          tx_hashes: swap.tx_hashes ?? null,
          primary_tx_hash: swap.primary_tx_hash ?? swap.tx_hash ?? null,
          status: swap.status,
          failure_step_key: swap.failure_step_key ?? null,
          failure_reason: swap.failure_reason ?? null,
          steps: (steps || [])
            .slice()
            .sort((a, b) => a.step_order - b.step_order)
            .map((step) => ({
              step_key: step.step_key,
              step_order: step.step_order,
              status: step.status,
              tx_hash: step.tx_hash ?? null,
              message: step.message ?? null,
              started_at: step.started_at ?? null,
              finished_at: step.finished_at ?? null,
            })),
        }
      : null,
  };
}

function mapWardRequestToActivity(
  row: WardApprovalActivityRow,
  viewerAddress: string,
): ActivityRecord {
  const viewer = normalizeAddress(viewerAddress);
  const guardian = normalizeAddress(row.guardian_address);
  const walletAddress = guardian === viewer ? guardian : normalizeAddress(row.ward_address);
  const txHash = row.final_tx_hash || row.tx_hash || "";
  const note = statusNoteForWardRequest(row.status);

  return {
    id: row.id,
    source: "ward_request",
    wallet_address: walletAddress,
    tx_hash: txHash,
    type: (row.action || "transfer") as TransactionType,
    token: row.token || "STRK",
    amount: row.amount ?? null,
    amount_unit: normalizeWardAmountUnit(row),
    recipient: row.recipient ?? null,
    recipient_name: null,
    note,
    status: mapWardRequestStatus(row.status),
    status_detail: row.status,
    error_message: row.error_message ?? null,
    account_type: "guardian",
    ward_address: normalizeAddress(row.ward_address),
    fee: null,
    network: "sepolia",
    platform: "approval",
    created_at: row.created_at,
    responded_at: row.responded_at ?? null,
    swap: null,
  };
}

function shouldIncludeWardRequest(
  row: WardApprovalActivityRow,
  seenTxHashes: Set<string>,
): boolean {
  const hash = row.final_tx_hash || row.tx_hash || "";
  if (!hash) return true;
  return !seenTxHashes.has(hash);
}

async function fetchWardRequestsForViewer(
  client: SupabaseLite,
  viewerAddress: string,
): Promise<WardApprovalActivityRow[]> {
  const rows: WardApprovalActivityRow[] = [];
  const seen = new Set<string>();
  const queries = [
    `guardian_address=eq.${viewerAddress}`,
    `ward_address=eq.${viewerAddress}`,
  ];

  for (const filters of queries) {
    try {
      const result = await client.select<WardApprovalActivityRow>(
        "ward_approval_requests",
        filters,
        "created_at.desc",
      );
      for (const row of result) {
        if (!row?.id || seen.has(row.id)) continue;
        seen.add(row.id);
        rows.push(row);
      }
    } catch (err) {
      console.warn("[activity] ward request lookup failed:", err);
    }
  }

  if (rows.length > 1) {
    rows.sort((a, b) => asTimestamp(b.created_at) - asTimestamp(a.created_at));
  }

  return rows;
}

export async function getActivityRecords(
  walletAddress: string,
  limit = 100,
  sb?: SupabaseLite,
): Promise<ActivityRecord[]> {
  const client = sb || getDefaultSb();
  const normalized = normalizeAddress(walletAddress);
  const txRows = await getTransactions(normalized, Math.max(limit * 2, 200), client);
  const swapRows = await getSwapExecutions(normalized, Math.max(limit * 2, 200), client);
  const executionIds = Array.from(
    new Set(
      swapRows
        .map((row) => row.execution_id)
        .filter((id): id is string => !!id),
    ),
  );
  const swapStepRows = await getSwapExecutionSteps(executionIds, client);
  const swapStepsByExecutionId = new Map<string, SwapExecutionStepRecord[]>();
  for (const step of swapStepRows) {
    const rows = swapStepsByExecutionId.get(step.execution_id) || [];
    rows.push(step);
    swapStepsByExecutionId.set(step.execution_id, rows);
  }

  const swapsByTxHash = new Map<string, SwapExecutionRecord>();
  for (const swap of swapRows) {
    const hashes = new Set<string>();
    if (swap.tx_hash) hashes.add(swap.tx_hash);
    if (swap.primary_tx_hash) hashes.add(swap.primary_tx_hash);
    for (const hash of swap.tx_hashes || []) {
      if (hash) hashes.add(hash);
    }
    for (const hash of hashes) {
      swapsByTxHash.set(hash, swap);
    }
  }
  const seenTxHashes = new Set(
    txRows.map((row) => row.tx_hash).filter((hash): hash is string => !!hash),
  );

  const requestRows = await fetchWardRequestsForViewer(client, normalized);
  const requestActivities = requestRows
    .filter((row) => shouldIncludeWardRequest(row, seenTxHashes))
    .map((row) => mapWardRequestToActivity(row, normalized));

  const combined = [
    ...txRows.map((tx) => {
      const swap = swapsByTxHash.get(tx.tx_hash) || null;
      const steps = swap?.execution_id ? swapStepsByExecutionId.get(swap.execution_id) || [] : [];
      return mapTransactionToActivity(tx, swap, steps);
    }),
    ...requestActivities,
  ];

  combined.sort((a, b) => asTimestamp(b.created_at) - asTimestamp(a.created_at));
  return combined.slice(0, limit);
}
