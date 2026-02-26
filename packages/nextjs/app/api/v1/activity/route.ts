import { NextRequest, NextResponse } from "next/server";
import { normalizeAddress } from "@cloak-wallet/sdk";
import { authenticate, AuthError } from "../_lib/auth";
import { getSupabase, type SupabaseClient } from "../_lib/supabase";
import { badRequest, unauthorized, serverError } from "../_lib/errors";

export const runtime = "nodejs";

// ─── Types ──────────────────────────────────────────────────────────────────

type ActivitySource = "transaction" | "ward_request" | "agent_run";
type ActivityStatus =
  | "pending"
  | "confirmed"
  | "failed"
  | "rejected"
  | "gas_error"
  | "expired";

interface TransactionRow {
  id?: string;
  wallet_address: string;
  tx_hash: string;
  type: string;
  token: string;
  amount?: string | null;
  amount_unit?: string | null;
  recipient?: string | null;
  recipient_name?: string | null;
  note?: string | null;
  status: string;
  error_message?: string | null;
  account_type: string;
  ward_address?: string | null;
  fee?: string | null;
  network: string;
  platform?: string | null;
  created_at?: string;
}

interface SwapRow {
  id?: string;
  execution_id: string;
  wallet_address: string;
  ward_address?: string | null;
  tx_hash?: string | null;
  tx_hashes?: string[] | null;
  primary_tx_hash?: string | null;
  provider: string;
  sell_token: string;
  buy_token: string;
  sell_amount_wei: string;
  estimated_buy_amount_wei: string;
  min_buy_amount_wei: string;
  buy_actual_amount_wei?: string | null;
  failure_step_key?: string | null;
  failure_reason?: string | null;
  status: string;
  created_at?: string;
}

interface SwapStepRow {
  id?: string;
  execution_id: string;
  step_key: string;
  step_order: number;
  status: string;
  tx_hash?: string | null;
  message?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  created_at?: string;
}

interface WardApprovalRow {
  id: string;
  ward_address: string;
  guardian_address: string;
  action: string;
  token: string;
  amount: string | null;
  amount_unit?: string | null;
  recipient: string | null;
  status: string;
  tx_hash: string;
  final_tx_hash: string | null;
  error_message: string | null;
  created_at?: string;
  responded_at?: string | null;
}

interface AgentRunRow {
  id: string;
  hire_operator_wallet: string | null;
  agent_id: string;
  action: string;
  params: unknown;
  billable: boolean;
  status: string;
  payment_ref: string | null;
  settlement_tx_hash: string | null;
  execution_tx_hashes: unknown;
  result: unknown;
  created_at?: string;
  updated_at?: string | null;
}

interface ActivityRecord {
  id: string;
  source: ActivitySource;
  wallet_address: string;
  tx_hash: string;
  type: string;
  token: string;
  amount?: string | null;
  amount_unit?: string | null;
  recipient?: string | null;
  recipient_name?: string | null;
  note?: string | null;
  status: ActivityStatus;
  status_detail?: string;
  error_message?: string | null;
  account_type: string;
  ward_address?: string | null;
  fee?: string | null;
  network: string;
  platform?: string | null;
  created_at?: string;
  responded_at?: string | null;
  agent_run?: {
    run_id: string;
    agent_id: string;
    action: string;
    billable: boolean;
    payment_ref: string | null;
    settlement_tx_hash: string | null;
    execution_tx_hashes: string[] | null;
  } | null;
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

// ─── Helpers ────────────────────────────────────────────────────────────────

function asTimestamp(value?: string): number {
  if (!value) return 0;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function mapTransactionStatus(status: string): ActivityStatus {
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
    default:
      return "pending";
  }
}

function statusNoteForWardRequest(status: string): string | null {
  if (status === "pending_ward_sig") return "Waiting for ward signature";
  if (status === "pending_guardian") return "Waiting for guardian approval";
  if (status === "rejected") return "Request rejected";
  if (status === "gas_error") return "Gas too low, retry required";
  if (status === "expired") return "Request expired";
  return null;
}

function normalizeWardActionType(action?: string | null): string {
  const normalized = (action || "").trim().toLowerCase();
  if (!normalized) return "transfer";
  if (
    normalized === "deploy" ||
    normalized === "deploy_account" ||
    normalized === "deploy_contract"
  ) {
    return "deploy_ward";
  }
  if (normalized === "fund") return "fund_ward";
  if (normalized === "configure" || normalized === "configure_limits") {
    return "configure_ward";
  }
  return normalized;
}

function normalizeWardAmountUnit(row: WardApprovalRow): string | null {
  const unit = row.amount_unit;
  if (
    unit === "tongo_units" ||
    unit === "erc20_wei" ||
    unit === "erc20_display"
  ) {
    return unit;
  }
  if (row.action === "erc20_transfer") return "erc20_display";
  return row.amount ? "tongo_units" : null;
}

function mapAgentRunStatus(status: string): ActivityStatus {
  switch (status) {
    case "completed":
      return "confirmed";
    case "failed":
      return "failed";
    case "blocked_policy":
      return "rejected";
    case "queued":
    case "running":
    case "pending_payment":
    default:
      return "pending";
  }
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return null;
    } catch {
      return null;
    }
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function parseExecutionHashes(value: unknown): string[] | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (!Array.isArray(parsed)) return null;
      const hashes = parsed.filter(
        (entry): entry is string => typeof entry === "string",
      );
      return hashes.length > 0 ? hashes : null;
    } catch {
      return null;
    }
  }
  if (Array.isArray(value)) {
    const hashes = value.filter(
      (entry): entry is string => typeof entry === "string",
    );
    return hashes.length > 0 ? hashes : null;
  }
  return null;
}

function inferTokenFromAgentRunParams(
  params: Record<string, unknown> | null,
): string {
  if (!params) return "STRK";
  const direct = params.token;
  if (typeof direct === "string" && direct.trim())
    return direct.trim().toUpperCase();
  const sellToken = params.sell_token;
  if (typeof sellToken === "string" && sellToken.trim()) {
    return sellToken.trim().toUpperCase();
  }
  const fromToken = params.from_token;
  if (typeof fromToken === "string" && fromToken.trim()) {
    return fromToken.trim().toUpperCase();
  }
  const transfers = params.transfers;
  if (Array.isArray(transfers)) {
    for (const item of transfers) {
      if (!item || typeof item !== "object") continue;
      const token = (item as Record<string, unknown>).token;
      if (typeof token === "string" && token.trim()) {
        return token.trim().toUpperCase();
      }
    }
  }
  return "STRK";
}

function inferAmountFromAgentRunParams(
  params: Record<string, unknown> | null,
): string | null {
  if (!params) return null;
  const amount = params.amount;
  if (typeof amount === "string" && amount.trim()) return amount.trim();
  if (typeof amount === "number" && Number.isFinite(amount))
    return String(amount);
  const transfers = params.transfers;
  if (Array.isArray(transfers)) {
    for (const item of transfers) {
      if (!item || typeof item !== "object") continue;
      const transferAmount = (item as Record<string, unknown>).amount;
      if (typeof transferAmount === "string" && transferAmount.trim()) {
        return transferAmount.trim();
      }
      if (
        typeof transferAmount === "number" &&
        Number.isFinite(transferAmount)
      ) {
        return String(transferAmount);
      }
    }
  }
  return null;
}

function inferRecipientFromAgentRunParams(
  params: Record<string, unknown> | null,
): string | null {
  if (!params) return null;
  const to = params.to;
  if (typeof to === "string" && to.trim()) return to.trim();
  const recipient = params.recipient;
  if (typeof recipient === "string" && recipient.trim())
    return recipient.trim();
  const transfers = params.transfers;
  if (Array.isArray(transfers)) {
    for (const item of transfers) {
      if (!item || typeof item !== "object") continue;
      const transferTo = (item as Record<string, unknown>).to;
      if (typeof transferTo === "string" && transferTo.trim())
        return transferTo.trim();
    }
  }
  return null;
}

function extractAgentRunError(result: unknown): string | null {
  const resultObj = parseJsonObject(result);
  if (!resultObj) return null;
  const direct = resultObj.error;
  if (typeof direct === "string" && direct.trim()) return direct;
  const payload = resultObj.payload;
  if (payload && typeof payload === "object") {
    const nestedError = (payload as Record<string, unknown>).error;
    if (typeof nestedError === "string" && nestedError.trim())
      return nestedError;
  }
  return null;
}

/** Fan-out query pattern: direct + ward + managed wards, deduplicated. */
async function fanOutQuery<T extends object>(
  sb: SupabaseClient,
  table: string,
  normalized: string,
  deduplicateKey: string,
): Promise<T[]> {
  const [byWallet, byWard] = await Promise.all([
    sb.select<T>(table, `wallet_address=eq.${normalized}`, {
      orderBy: "created_at.desc",
    }),
    sb.select<T>(table, `ward_address=eq.${normalized}`, {
      orderBy: "created_at.desc",
    }),
  ]);

  let byManagedWards: T[] = [];
  try {
    const wardRows = await sb.select<{ ward_address: string }>(
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
      byManagedWards = await sb.select<T>(
        table,
        `wallet_address=in.(${inClause})`,
        { orderBy: "created_at.desc" },
      );
    }
  } catch (err) {
    console.warn(`[activity] managed ward lookup for ${table} failed:`, err);
  }

  const seen = new Set<string>();
  const all: T[] = [];
  for (const row of [...byWallet, ...byWard, ...byManagedWards]) {
    const key =
      ((row as Record<string, unknown>)[deduplicateKey] as string) || "";
    if (key && !seen.has(key)) {
      seen.add(key);
      all.push(row);
    }
  }

  return all;
}

// ─── GET /api/v1/activity ───────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    await authenticate(req);

    const wallet = req.nextUrl.searchParams.get("wallet");
    if (!wallet) {
      return badRequest("Missing required query parameter: wallet");
    }

    const limit = Math.min(
      Number(req.nextUrl.searchParams.get("limit") || "100"),
      500,
    );
    const offset = Number(req.nextUrl.searchParams.get("offset") || "0");
    const normalized = normalizeAddress(wallet);
    const sb = getSupabase();

    // 1. Get transactions with fan-out
    const txRows = await fanOutQuery<TransactionRow>(
      sb,
      "transactions",
      normalized,
      "tx_hash",
    );

    // 2. Get swap_executions with fan-out
    const swapRows = await fanOutQuery<SwapRow>(
      sb,
      "swap_executions",
      normalized,
      "execution_id",
    );

    // 3. Get swap_execution_steps for all execution_ids
    const executionIds = Array.from(
      new Set(
        swapRows
          .map((row) => row.execution_id)
          .filter((id): id is string => !!id),
      ),
    );

    let swapStepRows: SwapStepRow[] = [];
    if (executionIds.length > 0) {
      try {
        const inClause = executionIds.join(",");
        swapStepRows = await sb.select<SwapStepRow>(
          "swap_execution_steps",
          `execution_id=in.(${inClause})`,
          { orderBy: "created_at.asc" },
        );
      } catch (err) {
        console.warn("[activity] swap steps lookup failed:", err);
      }
    }

    // Group steps by execution_id
    const swapStepsByExecutionId = new Map<string, SwapStepRow[]>();
    for (const step of swapStepRows) {
      const rows = swapStepsByExecutionId.get(step.execution_id) || [];
      rows.push(step);
      swapStepsByExecutionId.set(step.execution_id, rows);
    }

    // Index swaps by all their tx hashes for fast lookup
    const swapsByTxHash = new Map<string, SwapRow>();
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

    // 4. Get ward_approval_requests for the viewer
    let wardRows: WardApprovalRow[] = [];
    try {
      const [asGuardian, asWard] = await Promise.all([
        sb.select<WardApprovalRow>(
          "ward_approval_requests",
          `guardian_address=eq.${normalized}`,
          { orderBy: "created_at.desc" },
        ),
        sb.select<WardApprovalRow>(
          "ward_approval_requests",
          `ward_address=eq.${normalized}`,
          { orderBy: "created_at.desc" },
        ),
      ]);

      const seenIds = new Set<string>();
      for (const row of [...asGuardian, ...asWard]) {
        if (row?.id && !seenIds.has(row.id)) {
          seenIds.add(row.id);
          wardRows.push(row);
        }
      }
    } catch (err) {
      console.warn("[activity] ward request lookup failed:", err);
    }

    // 5. Get marketplace agent runs for the operator wallet
    let agentRunRows: AgentRunRow[] = [];
    try {
      agentRunRows = await sb.select<AgentRunRow>(
        "agent_runs",
        `hire_operator_wallet=eq.${normalized}`,
        { orderBy: "created_at.desc" },
      );
    } catch (err) {
      console.warn("[activity] marketplace run lookup failed:", err);
    }

    // 6. Map transactions to activity records (attach swap data)
    const seenTxHashes = new Set(
      txRows.map((row) => row.tx_hash).filter(Boolean),
    );

    const txActivities: ActivityRecord[] = txRows.map((tx) => {
      const swap = swapsByTxHash.get(tx.tx_hash) || null;
      const steps = swap?.execution_id
        ? swapStepsByExecutionId.get(swap.execution_id) || []
        : [];

      return {
        id: tx.tx_hash,
        source: "transaction" as const,
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
        agent_run: null,
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
              steps: steps
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
    });

    // 7. Map ward requests to activity records (skip if tx_hash already in transactions)
    const wardActivities: ActivityRecord[] = wardRows
      .filter((row) => {
        const hash = row.final_tx_hash || row.tx_hash || "";
        if (!hash) return true;
        return !seenTxHashes.has(hash);
      })
      .map((row) => {
        const viewer = normalized;
        const guardian = normalizeAddress(row.guardian_address);
        const walletAddr =
          guardian === viewer ? guardian : normalizeAddress(row.ward_address);
        const txHash = row.final_tx_hash || row.tx_hash || "";
        const note = statusNoteForWardRequest(row.status);

        return {
          id: row.id,
          source: "ward_request" as const,
          wallet_address: walletAddr,
          tx_hash: txHash,
          type: normalizeWardActionType(row.action),
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
          agent_run: null,
          swap: null,
        };
      });

    // 8. Map marketplace agent runs to activity records
    const agentRunActivities: ActivityRecord[] = agentRunRows
      .map((run) => {
        const params = parseJsonObject(run.params);
        const executionTxHashes = parseExecutionHashes(run.execution_tx_hashes);
        const amount = inferAmountFromAgentRunParams(params);
        const txHash =
          run.settlement_tx_hash ||
          executionTxHashes?.[0] ||
          `agent_run:${run.id}`;
        return {
          id: run.id,
          source: "agent_run" as const,
          wallet_address: run.hire_operator_wallet || normalized,
          tx_hash: txHash,
          type: "agent_run",
          token: inferTokenFromAgentRunParams(params),
          amount,
          amount_unit: amount ? "erc20_display" : null,
          recipient: inferRecipientFromAgentRunParams(params),
          recipient_name: run.agent_id,
          note: `Agent ${run.agent_id} · ${run.action}`,
          status: mapAgentRunStatus(run.status),
          status_detail: run.status,
          error_message: extractAgentRunError(run.result),
          account_type: "normal",
          ward_address: null,
          fee: null,
          network: "sepolia",
          platform: "marketplace",
          created_at: run.created_at,
          responded_at: run.updated_at ?? null,
          agent_run: {
            run_id: run.id,
            agent_id: run.agent_id,
            action: run.action,
            billable: run.billable,
            payment_ref: run.payment_ref,
            settlement_tx_hash: run.settlement_tx_hash,
            execution_tx_hashes: executionTxHashes,
          },
          swap: null,
        };
      })
      .filter((row) => {
        if (!row.tx_hash) return true;
        return !seenTxHashes.has(row.tx_hash);
      });

    // 9. Combine, sort by created_at desc
    const combined = [
      ...txActivities,
      ...wardActivities,
      ...agentRunActivities,
    ];
    combined.sort(
      (a, b) => asTimestamp(b.created_at) - asTimestamp(a.created_at),
    );

    // 10. Apply offset/limit and return with pagination metadata
    const total = combined.length;
    const page = combined.slice(offset, offset + limit);
    const hasMore = offset + limit < total;

    return NextResponse.json({
      records: page,
      total,
      has_more: hasMore,
    });
  } catch (err) {
    if (err instanceof AuthError) return unauthorized(err.message);
    console.error("[GET /api/v1/activity]", err);
    return serverError("Failed to fetch activity feed");
  }
}
