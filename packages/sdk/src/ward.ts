/**
 * Ward module — Pure ward logic consolidated from web, extension, and mobile.
 *
 * All functions are platform-agnostic (no React, no browser/mobile APIs).
 * On-chain reads use starknet.js RpcProvider.
 * Supabase operations accept a SupabaseLite instance from the caller.
 */
import { ec, num, RpcProvider } from "starknet";
import type { SupabaseLite } from "./supabase";

// ─── Constants ────────────────────────────────────────────────────────────────

const WARD_ACCOUNT_TYPE = "0x57415244"; // "WARD" as felt252

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WardApprovalNeeds {
  needsGuardian: boolean;
  guardianAddress: string;
  wardHas2fa: boolean;
  guardianHas2fa: boolean;
}

export interface WardInfo {
  guardianAddress: string;
  guardianPublicKey: string;
  isGuardian2faEnabled: boolean;
  is2faEnabled: boolean;
  isFrozen: boolean;
  spendingLimitPerTx: string;
  requireGuardianForAll: boolean;
}

export interface WardApprovalRequest {
  id: string;
  ward_address: string;
  guardian_address: string;
  action: string;
  token: string;
  amount: string | null;
  recipient: string | null;
  calls_json: string;
  nonce: string;
  resource_bounds_json: string;
  tx_hash: string;
  ward_sig_json: string | null;
  ward_2fa_sig_json: string | null;
  guardian_sig_json: string | null;
  guardian_2fa_sig_json: string | null;
  needs_ward_2fa: boolean;
  needs_guardian: boolean;
  needs_guardian_2fa: boolean;
  status: string;
  final_tx_hash: string | null;
  error_message: string | null;
  created_at: string;
  expires_at: string;
  responded_at: string | null;
}

export interface WardApprovalParams {
  wardAddress: string;
  guardianAddress: string;
  action: string;
  token: string;
  amount: string | null;
  recipient: string | null;
  callsJson: string;
  wardSigJson: string;
  nonce: string;
  resourceBoundsJson: string;
  txHash: string;
  needsWard2fa: boolean;
  needsGuardian: boolean;
  needsGuardian2fa: boolean;
}

export interface WardApprovalResult {
  approved: boolean;
  txHash?: string;
  error?: string;
}

// ─── Address Normalization ────────────────────────────────────────────────────

/**
 * Normalize a hex address: lowercase, strip leading zeros after 0x prefix.
 * e.g. "0x03e836..." → "0x3e836..."
 */
export function normalizeAddress(addr: string): string {
  const lower = addr.toLowerCase();
  if (!lower.startsWith("0x")) return lower;
  const stripped = lower.slice(2).replace(/^0+/, "");
  return "0x" + (stripped || "0");
}

// ─── On-Chain Reads ───────────────────────────────────────────────────────────

/**
 * Check if an address is a CloakWard account by calling get_account_type().
 * Returns true if the on-chain result is "WARD" (0x57415244).
 */
export async function checkIfWardAccount(
  provider: RpcProvider,
  address: string,
): Promise<boolean> {
  try {
    const result = await provider.callContract({
      contractAddress: address,
      entrypoint: "get_account_type",
      calldata: [],
    });
    return result[0] === WARD_ACCOUNT_TYPE;
  } catch {
    return false;
  }
}

/**
 * Fetch ward approval needs: guardian address, 2FA flags, require-guardian flag.
 * Returns null if the account is not a ward.
 */
export async function fetchWardApprovalNeeds(
  provider: RpcProvider,
  wardAddress: string,
): Promise<WardApprovalNeeds | null> {
  try {
    const typeResult = await provider.callContract({
      contractAddress: wardAddress,
      entrypoint: "get_account_type",
      calldata: [],
    });
    if (typeResult[0] !== WARD_ACCOUNT_TYPE) return null;

    const [guardianAddr, ward2fa, guardian2fa, reqGuardian] = await Promise.all([
      provider.callContract({
        contractAddress: wardAddress,
        entrypoint: "get_guardian_address",
        calldata: [],
      }),
      provider.callContract({
        contractAddress: wardAddress,
        entrypoint: "is_2fa_enabled",
        calldata: [],
      }),
      provider.callContract({
        contractAddress: wardAddress,
        entrypoint: "is_guardian_2fa_enabled",
        calldata: [],
      }),
      provider.callContract({
        contractAddress: wardAddress,
        entrypoint: "is_require_guardian_for_all",
        calldata: [],
      }),
    ]);

    return {
      needsGuardian: reqGuardian[0] !== "0x0",
      guardianAddress: guardianAddr[0],
      wardHas2fa: ward2fa[0] !== "0x0",
      guardianHas2fa: guardian2fa[0] !== "0x0",
    };
  } catch (err) {
    console.warn("[Ward] Failed to check ward needs:", err);
    return null;
  }
}

/**
 * Fetch full ward info from on-chain (guardian, 2FA, frozen, limits, etc).
 */
export async function fetchWardInfo(
  provider: RpcProvider,
  address: string,
): Promise<WardInfo | null> {
  try {
    const [
      guardianAddr,
      guardianPubKey,
      guardian2fa,
      ward2fa,
      frozen,
      limitPerTx,
      reqGuardian,
    ] = await Promise.all([
      provider.callContract({ contractAddress: address, entrypoint: "get_guardian_address", calldata: [] }),
      provider.callContract({ contractAddress: address, entrypoint: "get_guardian_public_key", calldata: [] }),
      provider.callContract({ contractAddress: address, entrypoint: "is_guardian_2fa_enabled", calldata: [] }),
      provider.callContract({ contractAddress: address, entrypoint: "is_2fa_enabled", calldata: [] }),
      provider.callContract({ contractAddress: address, entrypoint: "is_frozen", calldata: [] }),
      provider.callContract({ contractAddress: address, entrypoint: "get_spending_limit_per_tx", calldata: [] }),
      provider.callContract({ contractAddress: address, entrypoint: "is_require_guardian_for_all", calldata: [] }),
    ]);

    return {
      guardianAddress: guardianAddr[0],
      guardianPublicKey: guardianPubKey[0],
      isGuardian2faEnabled: guardian2fa[0] !== "0x0",
      is2faEnabled: ward2fa[0] !== "0x0",
      isFrozen: frozen[0] !== "0x0",
      spendingLimitPerTx: limitPerTx[0],
      requireGuardianForAll: reqGuardian[0] !== "0x0",
    };
  } catch (err) {
    console.warn("[Ward] Failed to read ward info:", err);
    return null;
  }
}

// ─── Signing Helpers ──────────────────────────────────────────────────────────

/**
 * Sign a transaction hash with a Stark private key.
 * Returns [r, s] as hex strings.
 */
export function signHash(txHash: string, privateKey: string): [string, string] {
  const sig = ec.starkCurve.sign(txHash, privateKey);
  return [num.toHex(sig.r), num.toHex(sig.s)];
}

/**
 * Assemble the full ward signature chain from individual signatures.
 * Order: [ward_sig, ward_2fa_sig?, guardian_sig, guardian_2fa_sig?]
 */
export function assembleWardSignature(
  request: WardApprovalRequest,
  guardianSig?: [string, string],
  guardian2faSig?: [string, string],
): string[] {
  const sig: string[] = [];
  if (request.ward_sig_json) sig.push(...JSON.parse(request.ward_sig_json));
  if (request.ward_2fa_sig_json) sig.push(...JSON.parse(request.ward_2fa_sig_json));
  if (guardianSig) sig.push(...guardianSig);
  if (guardian2faSig) sig.push(...guardian2faSig);
  return sig;
}

// ─── Gas Price Helpers ────────────────────────────────────────────────────────

export interface BlockGasPrices {
  l1GasPrice: bigint;
  l1DataGasPrice: bigint;
}

/**
 * Fetch current gas prices from the latest block with a 3x safety margin.
 */
export async function getBlockGasPrices(
  provider: RpcProvider,
): Promise<BlockGasPrices> {
  const block = await provider.getBlockWithTxHashes("latest") as any;
  return {
    l1GasPrice: BigInt(block.l1_gas_price?.price_in_fri || "1") * 3n,
    l1DataGasPrice: BigInt(block.l1_data_gas_price?.price_in_fri || "1") * 3n,
  };
}

/**
 * Build resource bounds for a ward invoke v3 transaction.
 */
export function buildWardResourceBounds(gasPrices: BlockGasPrices): any {
  return {
    l1_gas: { max_amount: 0n, max_price_per_unit: gasPrices.l1GasPrice },
    l2_gas: { max_amount: 800000n, max_price_per_unit: 100000000000n },
    l1_data_gas: { max_amount: 256n, max_price_per_unit: gasPrices.l1DataGasPrice },
  };
}

// ─── Resource Bounds Serialization ────────────────────────────────────────────

/**
 * Serialize resource bounds (with BigInt values) to JSON-safe format.
 * BigInt → hex string for Supabase JSON storage.
 */
export function serializeResourceBounds(resourceBounds: any): string {
  return JSON.stringify(resourceBounds, (_k, v) =>
    typeof v === "bigint" ? "0x" + v.toString(16) : v,
  );
}

/**
 * Deserialize resource bounds JSON from Supabase back to BigInt values.
 */
export function deserializeResourceBounds(json: string): any {
  const raw = JSON.parse(json);
  const result: any = {};
  for (const key of Object.keys(raw)) {
    const entry = raw[key];
    result[key] = {
      max_amount: BigInt(entry.max_amount),
      max_price_per_unit: BigInt(entry.max_price_per_unit),
    };
  }
  return result;
}

// ─── Ward Approval Request + Poll ─────────────────────────────────────────────

const POLL_INTERVAL = 2000;
const TIMEOUT = 10 * 60 * 1000; // 10 minutes

/**
 * Insert a ward approval request into Supabase and poll for completion.
 * Platform-agnostic — accepts a SupabaseLite instance from the caller.
 */
export async function requestWardApproval(
  sb: SupabaseLite,
  params: WardApprovalParams,
  onStatusChange?: (status: string) => void,
  signal?: AbortSignal,
): Promise<WardApprovalResult> {
  const normalizedWard = normalizeAddress(params.wardAddress);
  const normalizedGuardian = normalizeAddress(params.guardianAddress);

  onStatusChange?.("Submitting ward approval request...");

  let rows: any[];
  try {
    rows = await sb.insert("ward_approval_requests", {
      ward_address: normalizedWard,
      guardian_address: normalizedGuardian,
      action: params.action,
      token: params.token,
      amount: params.amount,
      recipient: params.recipient,
      calls_json: params.callsJson,
      nonce: params.nonce,
      resource_bounds_json: params.resourceBoundsJson,
      tx_hash: params.txHash || "",
      ward_sig_json: params.wardSigJson,
      needs_ward_2fa: params.needsWard2fa,
      needs_guardian: params.needsGuardian,
      needs_guardian_2fa: params.needsGuardian2fa,
      status: "pending_ward_sig",
    });
  } catch (err: any) {
    return { approved: false, error: `Failed to submit ward approval: ${err.message}` };
  }

  const requestId = Array.isArray(rows) ? rows[0]?.id : (rows as any)?.id;
  if (!requestId) {
    return { approved: false, error: "Failed to get ward approval request ID" };
  }

  onStatusChange?.("Waiting for ward mobile signing...");
  const startTime = Date.now();

  return new Promise<WardApprovalResult>((resolve) => {
    const poll = async () => {
      if (signal?.aborted) {
        resolve({ approved: false, error: "Cancelled by user" });
        return;
      }

      if (Date.now() - startTime > TIMEOUT) {
        onStatusChange?.("Request timed out");
        resolve({ approved: false, error: "Ward approval timed out (10 min)" });
        return;
      }

      try {
        const results = await sb.select("ward_approval_requests", `id=eq.${requestId}`);
        const row = results[0];

        if (!row) {
          resolve({ approved: false, error: "Ward approval request not found" });
          return;
        }

        if (row.status === "approved") {
          onStatusChange?.("Approved!");
          resolve({ approved: true, txHash: row.final_tx_hash || row.tx_hash });
          return;
        }

        if (row.status === "rejected") {
          onStatusChange?.("Rejected");
          resolve({ approved: false, error: "Ward transaction rejected" });
          return;
        }

        if (row.status === "failed") {
          onStatusChange?.("Failed");
          resolve({
            approved: false,
            error: row.error_message || "Ward transaction failed",
          });
          return;
        }

        // Intermediate status updates
        if (row.status === "pending_guardian") {
          onStatusChange?.("Waiting for guardian approval...");
        } else if (row.status === "pending_ward_sig") {
          onStatusChange?.("Waiting for ward mobile signing...");
        } else {
          onStatusChange?.(`Status: ${row.status}`);
        }

        setTimeout(poll, POLL_INTERVAL);
      } catch (err) {
        console.warn("[Ward] Poll error:", err);
        setTimeout(poll, POLL_INTERVAL);
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
