import { ec, num } from "starknet";

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
