import { ec, num } from "starknet";
import type { SupabaseLite } from "./supabase";
import { normalizeAddress } from "./ward";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TwoFactorAction = "fund" | "transfer" | "withdraw" | "rollover";
export type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "completed"
  | "failed"
  | "expired";

export interface TwoFactorConfig {
  id: string;
  wallet_address: string;
  secondary_public_key: string;
  enabled: boolean;
  created_at: string;
}

export interface ApprovalRequest {
  id: string;
  wallet_address: string;
  action: TwoFactorAction;
  token: string;
  amount: string | null;
  recipient: string | null;
  calls_json: string;
  sig1: string; // JSON: ["r1_hex", "s1_hex"]
  nonce: string;
  max_fee: string;
  tx_hash_hex: string;
  status: ApprovalStatus;
  result_tx_hash: string | null;
  error_message: string | null;
  created_at: string;
  expires_at: string;
  responded_at: string | null;
}

// ─── Signing utilities ────────────────────────────────────────────────────────

/**
 * Sign a transaction hash with a Stark private key.
 * Returns [r, s] as hex strings.
 */
export function signTransactionHash(
  txHash: string,
  privateKey: string,
): [string, string] {
  const sig = ec.starkCurve.sign(
    num.toHex(BigInt(txHash)),
    privateKey,
  );
  return [
    "0x" + sig.r.toString(16),
    "0x" + sig.s.toString(16),
  ];
}

/**
 * Combine two Stark ECDSA signatures into the flat format expected
 * by our CloakAccount contract: [r1, s1, r2, s2].
 */
export function combinedSignature(
  sig1: [string, string],
  sig2: [string, string],
): string[] {
  return [...sig1, ...sig2];
}

/**
 * Serialize Call[] to JSON for storage in Supabase.
 */
export function serializeCalls(calls: any[]): string {
  return JSON.stringify(
    calls.map((c) => ({
      contractAddress: c.contractAddress,
      entrypoint: c.entrypoint,
      calldata: c.calldata?.map((d: any) => d.toString()) ?? [],
    })),
  );
}

/**
 * Deserialize Call[] from JSON stored in Supabase.
 */
export function deserializeCalls(json: string): any[] {
  return JSON.parse(json);
}

// ─── 2FA Approval Request + Poll ─────────────────────────────────────────────

const TWOFA_POLL_INTERVAL = 2000;
const TWOFA_TIMEOUT = 5 * 60 * 1000; // 5 minutes

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
}

export interface TwoFAApprovalResult {
  approved: boolean;
  txHash?: string;
  error?: string;
}

/**
 * Insert a 2FA approval request into Supabase and poll for completion.
 * Platform-agnostic — accepts a SupabaseLite instance from the caller.
 */
export async function request2FAApproval(
  sb: SupabaseLite,
  params: TwoFAApprovalParams,
  onStatusChange?: (status: string) => void,
  signal?: AbortSignal,
): Promise<TwoFAApprovalResult> {
  const normalizedAddr = normalizeAddress(params.walletAddress);

  onStatusChange?.("Submitting approval request...");

  let rows: any[];
  try {
    rows = await sb.insert("approval_requests", {
      wallet_address: normalizedAddr,
      action: params.action,
      token: params.token,
      amount: params.amount,
      recipient: params.recipient,
      calls_json: params.callsJson,
      sig1_json: params.sig1Json,
      nonce: params.nonce,
      resource_bounds_json: params.resourceBoundsJson,
      tx_hash: params.txHash,
      status: "pending",
    });
  } catch (err: any) {
    return { approved: false, error: `Failed to submit approval: ${err.message}` };
  }

  const requestId = Array.isArray(rows) ? rows[0]?.id : (rows as any)?.id;
  if (!requestId) {
    return { approved: false, error: "Failed to get approval request ID" };
  }

  onStatusChange?.("Waiting for mobile approval...");
  const startTime = Date.now();

  return new Promise<TwoFAApprovalResult>((resolve) => {
    const poll = async () => {
      if (signal?.aborted) {
        resolve({ approved: false, error: "Cancelled by user" });
        return;
      }

      if (Date.now() - startTime > TWOFA_TIMEOUT) {
        onStatusChange?.("Request timed out");
        resolve({ approved: false, error: "Approval request timed out (5 min)" });
        return;
      }

      try {
        const results = await sb.select("approval_requests", `id=eq.${requestId}`);
        const row = results[0];

        if (!row) {
          resolve({ approved: false, error: "Approval request not found" });
          return;
        }

        if (row.status === "approved") {
          onStatusChange?.("Approved!");
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

        if (row.status === "failed") {
          onStatusChange?.("Failed");
          resolve({
            approved: false,
            error: row.error_message || "Transaction failed on mobile",
          });
          return;
        }

        onStatusChange?.("Waiting for mobile approval...");
        setTimeout(poll, TWOFA_POLL_INTERVAL);
      } catch (err) {
        console.warn("[2FA] Poll error:", err);
        setTimeout(poll, TWOFA_POLL_INTERVAL);
      }
    };

    if (signal) {
      signal.addEventListener(
        "abort",
        () => resolve({ approved: false, error: "Cancelled by user" }),
        { once: true },
      );
    }

    poll();
  });
}
