import type { CloakApiClient } from "../api-client";
import type { SwapResponse, SwapStepResponse } from "../types/api";
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

function toSwapExecutionRecord(res: SwapResponse): SwapExecutionRecord {
  return {
    id: res.id,
    execution_id: res.execution_id,
    wallet_address: res.wallet_address,
    ward_address: res.ward_address,
    tx_hash: res.tx_hash,
    primary_tx_hash: res.primary_tx_hash,
    tx_hashes: res.tx_hashes,
    provider: res.provider as "avnu",
    sell_token: res.sell_token,
    buy_token: res.buy_token,
    sell_amount_wei: res.sell_amount_wei,
    estimated_buy_amount_wei: res.estimated_buy_amount_wei,
    min_buy_amount_wei: res.min_buy_amount_wei,
    buy_actual_amount_wei: res.buy_actual_amount_wei,
    failure_step_key: res.failure_step_key as SwapExecutionStepKey | null,
    failure_reason: res.failure_reason,
    route_meta: res.route_meta,
    status: res.status,
    error_message: res.error_message,
    created_at: res.created_at,
  };
}

function toSwapStepRecord(res: SwapStepResponse): SwapExecutionStepRecord {
  return {
    id: res.id,
    execution_id: res.execution_id,
    step_key: res.step_key as SwapExecutionStepKey,
    step_order: res.step_order,
    attempt: res.attempt,
    status: res.status as SwapExecutionStepStatus,
    tx_hash: res.tx_hash,
    message: res.message,
    metadata: res.metadata,
    started_at: res.started_at,
    finished_at: res.finished_at,
    created_at: res.created_at,
  };
}

export async function saveSwapExecution(
  record: Omit<SwapExecutionRecord, "id" | "created_at" | "updated_at">,
  client: CloakApiClient,
): Promise<SwapExecutionRecord | null> {
  const row = normalizeRecord(record);
  try {
    const res = await client.saveSwap({
      execution_id: row.execution_id as string,
      wallet_address: row.wallet_address as string,
      ward_address: row.ward_address as string | null,
      tx_hash: row.tx_hash as string | null,
      primary_tx_hash: row.primary_tx_hash as string | null,
      tx_hashes: row.tx_hashes as string[] | null,
      provider: row.provider as string,
      sell_token: row.sell_token as string,
      buy_token: row.buy_token as string,
      sell_amount_wei: row.sell_amount_wei as string,
      estimated_buy_amount_wei: row.estimated_buy_amount_wei as string,
      min_buy_amount_wei: row.min_buy_amount_wei as string,
      buy_actual_amount_wei: row.buy_actual_amount_wei as string | null,
      failure_step_key: row.failure_step_key as string | null,
      failure_reason: row.failure_reason as string | null,
      route_meta: row.route_meta as Record<string, unknown> | null,
      status: row.status as SwapExecutionStatus,
      error_message: row.error_message as string | null,
    });
    return toSwapExecutionRecord(res);
  } catch (err) {
    console.warn("[swaps] saveSwapExecution failed:", err);
    return null;
  }
}

export async function updateSwapExecution(
  txHash: string,
  update: Partial<
    Omit<SwapExecutionRecord, "id" | "wallet_address" | "tx_hash" | "execution_id" | "created_at">
  >,
  client: CloakApiClient,
): Promise<void> {
  const body: Record<string, unknown> = { ...update };
  if (Array.isArray(body.tx_hashes)) {
    body.tx_hashes = parseTxHashes(body.tx_hashes) || null;
  }
  for (const key of Object.keys(body)) {
    if (body[key] === undefined) delete body[key];
  }
  if (Object.keys(body).length === 0) return;
  try {
    await client.updateSwap(txHash, {
      status: body.status as SwapExecutionStatus | undefined,
      tx_hash: body.tx_hash as string | null | undefined,
      primary_tx_hash: body.primary_tx_hash as string | null | undefined,
      tx_hashes: body.tx_hashes as string[] | null | undefined,
      buy_actual_amount_wei: body.buy_actual_amount_wei as string | null | undefined,
      failure_step_key: body.failure_step_key as string | null | undefined,
      failure_reason: body.failure_reason as string | null | undefined,
      error_message: body.error_message as string | null | undefined,
    });
  } catch (err) {
    console.warn("[swaps] updateSwapExecution failed:", err);
  }
}

export async function updateSwapExecutionByExecutionId(
  executionId: string,
  update: Partial<Omit<SwapExecutionRecord, "id" | "wallet_address" | "execution_id" | "created_at">>,
  client: CloakApiClient,
): Promise<void> {
  const body: Record<string, unknown> = { ...update };
  if (Array.isArray(body.tx_hashes)) {
    body.tx_hashes = parseTxHashes(body.tx_hashes) || null;
  }
  for (const key of Object.keys(body)) {
    if (body[key] === undefined) delete body[key];
  }
  if (Object.keys(body).length === 0) return;
  try {
    await client.updateSwapByExecutionId(executionId, {
      status: body.status as SwapExecutionStatus | undefined,
      tx_hash: body.tx_hash as string | null | undefined,
      primary_tx_hash: body.primary_tx_hash as string | null | undefined,
      tx_hashes: body.tx_hashes as string[] | null | undefined,
      buy_actual_amount_wei: body.buy_actual_amount_wei as string | null | undefined,
      failure_step_key: body.failure_step_key as string | null | undefined,
      failure_reason: body.failure_reason as string | null | undefined,
      error_message: body.error_message as string | null | undefined,
    });
  } catch (err) {
    console.warn("[swaps] updateSwapExecutionByExecutionId failed:", err);
  }
}

export async function getSwapExecutions(
  walletAddress: string,
  limit = 100,
  client: CloakApiClient,
): Promise<SwapExecutionRecord[]> {
  const normalized = normalizeAddress(walletAddress);
  try {
    const swaps = await client.getSwaps(normalized, { limit });
    return swaps.map(toSwapExecutionRecord);
  } catch (err) {
    console.warn("[swaps] getSwapExecutions failed:", err);
    return [];
  }
}

export async function getSwapExecutionSteps(
  executionIds: string[],
  client: CloakApiClient,
): Promise<SwapExecutionStepRecord[]> {
  if (executionIds.length === 0) return [];
  const unique = Array.from(new Set(executionIds.filter(Boolean)));
  if (unique.length === 0) return [];
  try {
    const steps = await client.getSwapSteps(unique);
    return steps.map(toSwapStepRecord);
  } catch (err) {
    console.warn("[swaps] getSwapExecutionSteps failed:", err);
    return [];
  }
}

export async function upsertSwapExecutionStep(
  step: Omit<SwapExecutionStepRecord, "id" | "created_at" | "updated_at">,
  client: CloakApiClient,
): Promise<SwapExecutionStepRecord | null> {
  const row = normalizeStepRecord(step);
  try {
    const res = await client.upsertSwapStep({
      execution_id: row.execution_id as string,
      step_key: row.step_key as string,
      step_order: row.step_order as number,
      attempt: row.attempt as number,
      status: row.status as SwapExecutionStepStatus,
      tx_hash: row.tx_hash as string | null,
      message: row.message as string | null,
      metadata: row.metadata as Record<string, unknown> | null,
      started_at: row.started_at as string | null,
      finished_at: row.finished_at as string | null,
    });
    return toSwapStepRecord(res);
  } catch (err) {
    console.warn("[swaps] upsertSwapExecutionStep failed:", err);
    return null;
  }
}
