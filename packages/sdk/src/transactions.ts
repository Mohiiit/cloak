/**
 * Transaction tracking — persistent history in Supabase.
 *
 * All three frontends (web, extension, mobile) use these functions to save
 * and query transaction records. Records survive app reinstalls and are
 * available cross-device since they live in Supabase rather than local storage.
 */

import { SupabaseLite } from "./supabase";
import { normalizeAddress } from "./ward";
import { DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_KEY } from "./config";
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

let _sharedSb: SupabaseLite | null = null;

function getDefaultSb(): SupabaseLite {
  if (!_sharedSb) {
    _sharedSb = new SupabaseLite(DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_KEY);
  }
  return _sharedSb;
}

// ─── Core Functions ─────────────────────────────────────────────────────────

/**
 * Save a transaction record to Supabase.
 * Normalizes wallet_address and ward_address.
 * Fire-and-forget safe — callers should `.catch(() => {})`.
 */
export async function saveTransaction(
  record: Omit<TransactionRecord, "id" | "created_at">,
  sb?: SupabaseLite,
): Promise<TransactionRecord | null> {
  const client = sb || getDefaultSb();
  const row: Record<string, any> = {
    ...record,
    wallet_address: normalizeAddress(record.wallet_address),
    ward_address: record.ward_address ? normalizeAddress(record.ward_address) : null,
  };
  // Remove undefined fields
  for (const key of Object.keys(row)) {
    if (row[key] === undefined) row[key] = null;
  }
  try {
    const rows = await client.insert<TransactionRecord>("transactions", row);
    return rows[0] || null;
  } catch (err) {
    // Retry without amount_unit if column doesn't exist yet (migration not applied)
    if (row.amount_unit != null && String(err).includes("amount_unit")) {
      try {
        const { amount_unit: _, ...rowWithout } = row;
        const rows = await client.insert<TransactionRecord>("transactions", rowWithout as any);
        return rows[0] || null;
      } catch (retryErr) {
        console.warn("[transactions] saveTransaction retry failed:", retryErr);
        return null;
      }
    }
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
  sb?: SupabaseLite,
): Promise<void> {
  const client = sb || getDefaultSb();
  const data: Record<string, any> = { status };
  if (errorMessage !== undefined) data.error_message = errorMessage;
  if (fee !== undefined) data.fee = fee;
  try {
    await client.update("transactions", `tx_hash=eq.${txHash}`, data);
  } catch (err) {
    console.warn("[transactions] updateTransactionStatus failed:", err);
  }
}

/**
 * Fetch transactions for a wallet address.
 * Queries by wallet_address OR ward_address, deduplicates by tx_hash,
 * and returns sorted by created_at DESC.
 */
export async function getTransactions(
  walletAddress: string,
  limit = 100,
  sb?: SupabaseLite,
): Promise<TransactionRecord[]> {
  const client = sb || getDefaultSb();
  const normalized = normalizeAddress(walletAddress);

  // Fetch direct rows for this wallet and linked ward rows
  const [byWallet, byWard] = await Promise.all([
    client.select<TransactionRecord>(
      "transactions",
      `wallet_address=eq.${normalized}`,
      "created_at.desc",
    ),
    client.select<TransactionRecord>(
      "transactions",
      `ward_address=eq.${normalized}`,
      "created_at.desc",
    ),
  ]);

  // Guardian activity should include transactions initiated directly by managed wards.
  // We derive managed wards via ward_configs.guardian_address -> ward_address.
  let byManagedWards: TransactionRecord[] = [];
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
      byManagedWards = await client.select<TransactionRecord>(
        "transactions",
        `wallet_address=in.(${inClause})`,
        "created_at.desc",
      );
    }
  } catch (err) {
    console.warn("[transactions] managed ward lookup failed:", err);
  }

  // Deduplicate by tx_hash — prefer byWallet (user's own record) over byWard (other user's record)
  const seen = new Set<string>();
  const all: TransactionRecord[] = [];
  for (const tx of [...byWallet, ...byWard, ...byManagedWards]) {
    if (!seen.has(tx.tx_hash)) {
      seen.add(tx.tx_hash);
      all.push(tx);
    }
  }
  // If a tx_hash appears in BOTH byWallet and byWard, ensure byWallet version wins
  // (byWallet is iterated first, so this is already guaranteed by the loop above)

  // Sort descending by created_at
  all.sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  });

  return all.slice(0, limit);
}

/**
 * Wait for on-chain confirmation, then update status.
 * Reads fee from receipt if available.
 */
export async function confirmTransaction(
  provider: any,
  txHash: string,
  sb?: SupabaseLite,
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
      await updateTransactionStatus(txHash, "failed", revertReason || "Transaction reverted", fee, sb);
    } else {
      await updateTransactionStatus(txHash, "confirmed", undefined, fee, sb);
    }
  } catch (err: any) {
    await updateTransactionStatus(txHash, "failed", err?.message || "Confirmation failed", undefined, sb);
  }
}
