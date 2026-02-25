/**
 * Transaction tracking — persistent history via CloakApiClient.
 *
 * All three frontends (web, extension, mobile) use these functions to save
 * and query transaction records. Records survive app reinstalls and are
 * available cross-device since they live server-side rather than in local storage.
 */

import { normalizeAddress } from "./ward";
import type { CloakApiClient } from "./api-client";
import type { TransactionResponse } from "./types/api";
import type { AmountUnit } from "./token-convert";

// ─── Types ──────────────────────────────────────────────────────────────────

export type TransactionStatus = "pending" | "confirmed" | "failed";
export type AccountType = "normal" | "ward" | "guardian";
export type TransactionType = "fund" | "transfer" | "withdraw" | "rollover" | "erc20_transfer" | "deploy_ward" | "fund_ward" | "configure_ward" | "shielded_swap";

export interface TransactionRecord {
  id?: string;
  wallet_address: string;
  tx_hash: string;
  type: TransactionType;
  token: string;
  amount?: string | null;
  amount_unit?: AmountUnit | null;
  recipient?: string | null;
  recipient_name?: string | null;
  note?: string | null;
  status: TransactionStatus;
  error_message?: string | null;
  account_type: AccountType;
  ward_address?: string | null;
  fee?: string | null;
  network: string;
  platform?: string | null;
  created_at?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function toTransactionRecord(res: TransactionResponse): TransactionRecord {
  return {
    id: res.id,
    wallet_address: res.wallet_address,
    tx_hash: res.tx_hash,
    type: res.type as TransactionType,
    token: res.token,
    amount: res.amount,
    amount_unit: res.amount_unit,
    recipient: res.recipient,
    recipient_name: res.recipient_name,
    note: res.note,
    status: res.status,
    error_message: res.error_message,
    account_type: res.account_type,
    ward_address: res.ward_address,
    fee: res.fee,
    network: res.network,
    platform: res.platform,
    created_at: res.created_at,
  };
}

// ─── Core Functions ─────────────────────────────────────────────────────────

/**
 * Save a transaction record via the backend API.
 * Normalizes wallet_address and ward_address.
 * Fire-and-forget safe — callers should `.catch(() => {})`.
 */
export async function saveTransaction(
  record: Omit<TransactionRecord, "id" | "created_at">,
  client: CloakApiClient,
): Promise<TransactionRecord | null> {
  try {
    const res = await client.saveTransaction({
      ...record,
      wallet_address: normalizeAddress(record.wallet_address),
      ward_address: record.ward_address ? normalizeAddress(record.ward_address) : null,
    });
    return toTransactionRecord(res);
  } catch (err) {
    console.warn("[transactions] saveTransaction failed:", err);
    return null;
  }
}

/**
 * Update a transaction's status (pending → confirmed/failed).
 * Optionally set error_message and fee.
 */
export async function updateTransactionStatus(
  txHash: string,
  status: TransactionStatus,
  errorMessage?: string,
  fee?: string,
  client?: CloakApiClient,
): Promise<void> {
  if (!client) return;
  const update: { status: TransactionStatus; error_message?: string | null; fee?: string | null } = { status };
  if (errorMessage !== undefined) update.error_message = errorMessage;
  if (fee !== undefined) update.fee = fee;
  try {
    await client.updateTransaction(txHash, update);
  } catch (err) {
    console.warn("[transactions] updateTransactionStatus failed:", err);
  }
}

/**
 * Fetch transactions for a wallet address.
 * The backend API handles fan-out (wallet + ward + managed wards) and dedup.
 */
export async function getTransactions(
  walletAddress: string,
  limit = 100,
  client?: CloakApiClient,
): Promise<TransactionRecord[]> {
  if (!client) return [];
  const normalized = normalizeAddress(walletAddress);
  try {
    const rows = await client.getTransactions(normalized, { limit });
    return rows.map(toTransactionRecord);
  } catch (err) {
    console.warn("[transactions] getTransactions failed:", err);
    return [];
  }
}

/**
 * Wait for on-chain confirmation, then update status.
 * Reads fee from receipt if available.
 */
export async function confirmTransaction(
  provider: any,
  txHash: string,
  client?: CloakApiClient,
): Promise<void> {
  try {
    const receipt = await provider.waitForTransaction(txHash);
    const isReverted = (receipt as any).execution_status === "REVERTED";
    const revertReason = (receipt as any).revert_reason;

    // Extract actual fee from receipt
    let fee: string | undefined;
    if ((receipt as any).actual_fee) {
      const feeObj = (receipt as any).actual_fee;
      fee = typeof feeObj === "object" ? feeObj.amount : String(feeObj);
    }

    if (isReverted) {
      await updateTransactionStatus(txHash, "failed", revertReason || "Transaction reverted", fee, client);
    } else {
      await updateTransactionStatus(txHash, "confirmed", undefined, fee, client);
    }
  } catch (err: any) {
    await updateTransactionStatus(txHash, "failed", err?.message || "Confirmation failed", undefined, client);
  }
}
