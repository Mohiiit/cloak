// ─── 2FA approval system via Supabase + on-chain ─────────────────────

import { getSupabaseLite } from "./supabase-config";

const POLL_INTERVAL_MS = 2000;
const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

const RPC_URL =
  "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/vH9MXIQ41pUGskqg5kTR8";

// ─── Address normalization ────────────────────────────────────────────

export function normalizeAddress(addr: string): string {
  const lower = addr.toLowerCase();
  if (!lower.startsWith("0x")) return lower;
  const stripped = lower.slice(2).replace(/^0+/, "");
  return "0x" + (stripped || "0");
}

// ─── Check if a wallet has 2FA enabled (on-chain first, Supabase fallback) ──

export async function check2FAEnabled(walletAddress: string): Promise<boolean> {
  // Try on-chain check first (CloakAccount contract)
  const onChain = await check2FAEnabledOnChain(walletAddress);
  if (onChain) return true;

  // Fallback to Supabase check (for OZ accounts or if on-chain check fails)
  try {
    const normalizedAddr = normalizeAddress(walletAddress);
    const sb = await getSupabaseLite();
    const rows = await sb.select("two_factor_configs", {
      wallet_address: `eq.${normalizedAddr}`,
      is_enabled: "eq.true",
    });
    return rows.length > 0;
  } catch (err) {
    console.warn("[2FA] Failed to check 2FA status:", err);
    return false;
  }
}

/**
 * Check if 2FA is enabled on-chain by reading the CloakAccount contract.
 * Returns false if the account is not a CloakAccount or if the call fails.
 */
export async function check2FAEnabledOnChain(walletAddress: string): Promise<boolean> {
  try {
    const { RpcProvider } = await import("starknet");
    const provider = new RpcProvider({ nodeUrl: RPC_URL });
    const result = await provider.callContract({
      contractAddress: walletAddress,
      entrypoint: "is_2fa_enabled",
      calldata: [],
    });
    return result[0] !== "0x0" && result[0] !== "0";
  } catch {
    // Not a CloakAccount or not deployed — 2FA not enabled on-chain
    return false;
  }
}

// ─── Request 2FA approval from mobile device ────────────────────────

export interface TwoFAApprovalParams {
  walletAddress: string;
  action: string;
  token: string;
  amount: string | null;
  recipient: string | null;
  callsJson: string;
  sig1Json: string;
  nonce: string;
  resourceBoundsJson: string;
  txHash: string;
  onStatusChange?: (status: string) => void;
  signal?: AbortSignal;
}

export interface TwoFAApprovalResult {
  approved: boolean;
  txHash?: string;
  error?: string;
}

export async function request2FAApproval(
  params: TwoFAApprovalParams,
): Promise<TwoFAApprovalResult> {
  const {
    walletAddress,
    action,
    token,
    amount,
    recipient,
    callsJson,
    sig1Json,
    nonce,
    resourceBoundsJson,
    txHash,
    onStatusChange,
    signal,
  } = params;

  const sb = await getSupabaseLite();
  const normalizedAddress = normalizeAddress(walletAddress);

  // 1. Insert the approval request
  onStatusChange?.("Submitting approval request...");
  let requestRow: any;
  try {
    requestRow = await sb.insert("approval_requests", {
      wallet_address: normalizedAddress,
      action,
      token,
      amount,
      recipient,
      calls_json: callsJson,
      sig1_json: sig1Json,
      nonce,
      resource_bounds_json: resourceBoundsJson,
      tx_hash: txHash,
      status: "pending",
    });
  } catch (err: any) {
    return { approved: false, error: `Failed to submit approval: ${err.message}` };
  }

  const requestId = requestRow?.id;
  if (!requestId) {
    return { approved: false, error: "Failed to get approval request ID" };
  }

  // 2. Poll for approval status
  onStatusChange?.("Waiting for mobile approval...");
  const startTime = Date.now();

  return new Promise<TwoFAApprovalResult>((resolve) => {
    const poll = async () => {
      // Check if cancelled
      if (signal?.aborted) {
        resolve({ approved: false, error: "Cancelled by user" });
        return;
      }

      // Check timeout
      if (Date.now() - startTime > TIMEOUT_MS) {
        onStatusChange?.("Request timed out");
        resolve({ approved: false, error: "Approval request timed out (5 minutes)" });
        return;
      }

      try {
        const rows = await sb.select("approval_requests", {
          id: `eq.${requestId}`,
        });
        const row = rows[0];

        if (!row) {
          resolve({ approved: false, error: "Approval request not found" });
          return;
        }

        if (row.status === "approved") {
          onStatusChange?.("Approved! Submitting transaction...");
          resolve({
            approved: true,
            txHash: row.final_tx_hash || row.tx_hash,
          });
          return;
        }

        if (row.status === "rejected") {
          onStatusChange?.("Rejected by mobile device");
          resolve({ approved: false, error: "Transaction rejected on mobile device" });
          return;
        }

        // Still pending, continue polling
        onStatusChange?.("Waiting for mobile approval...");

        setTimeout(poll, POLL_INTERVAL_MS);
      } catch (err: any) {
        console.warn("[2FA] Poll error:", err);
        // Continue polling on transient errors
        setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    // Also handle abort signal
    if (signal) {
      signal.addEventListener("abort", () => {
        resolve({ approved: false, error: "Cancelled by user" });
      }, { once: true });
    }

    poll();
  });
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
