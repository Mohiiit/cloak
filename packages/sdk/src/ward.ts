/**
 * Ward module — Pure ward logic consolidated from web, extension, and mobile.
 *
 * All functions are platform-agnostic (no React, no browser/mobile APIs).
 * On-chain reads use starknet.js RpcProvider.
 * Supabase operations accept a SupabaseLite instance from the caller.
 */
import { ec, num, hash, transaction, RpcProvider } from "starknet";
import type { SupabaseLite } from "./supabase";
import { TOKENS, formatTokenAmount } from "./tokens";
import type { TokenKey } from "./types";
import { DEFAULT_RPC } from "./config";

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
  maxPerTx?: string;
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

export interface WardApprovalRequestOptions {
  /**
   * Initial DB status for the inserted request.
   * Defaults to "pending_ward_sig".
   */
  initialStatus?: "pending_ward_sig" | "pending_guardian";
  /**
   * Optional hook to run immediately after request insertion and before polling.
   * Useful for mobile-originated flows that can auto-sign locally.
   */
  onRequestCreated?: (request: WardApprovalRequest) => Promise<void> | void;
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

// ─── Dynamic Fee Estimation ──────────────────────────────────────────────────

export interface FeeEstimate {
  l1Gas: bigint;
  l1GasPrice: bigint;
  l2Gas: bigint;
  l2GasPrice: bigint;
  l1DataGas: bigint;
  l1DataGasPrice: bigint;
  overallFee: bigint;
}

/**
 * Estimate invoke fee for a ward/CloakAccount transaction using
 * `starknet_estimateFee` with SKIP_VALIDATE (bypasses __validate__ signature check).
 *
 * This works for CloakWard and CloakAccount+2FA where normal estimateInvokeFee fails.
 */
export async function estimateWardInvokeFee(
  provider: RpcProvider,
  senderAddress: string,
  calls: any[],
): Promise<FeeEstimate> {
  const nonce = await provider.getNonceForAddress(senderAddress);
  const compiledCalldata = transaction.getExecuteCalldata(calls, "1");

  // Extract RPC URL from provider internals
  const rpcUrl =
    (provider as any).channel?.nodeUrl ||
    (provider as any).nodeUrl ||
    DEFAULT_RPC.sepolia;

  // High ceiling resource bounds so estimation doesn't fail due to limits
  const ceilingBounds = {
    l1_gas: { max_amount: "0x100000", max_price_per_unit: "0x2540be400" },
    l2_gas: { max_amount: "0xf42400", max_price_per_unit: "0x2540be400" },
    l1_data_gas: { max_amount: "0x10000", max_price_per_unit: "0x2540be400" },
  };

  const invokeBase = {
    type: "INVOKE",
    sender_address: num.toHex(senderAddress),
    calldata: compiledCalldata.map((c: any) => num.toHex(BigInt(c))),
    version: "0x3",
    nonce: num.toHex(nonce),
    resource_bounds: ceilingBounds,
    tip: "0x0",
    paymaster_data: [],
    account_deployment_data: [],
  };

  const requestVariants = [
    {
      ...invokeBase,
      signature: [] as string[],
      nonce_data_availability_mode: "L1",
      fee_data_availability_mode: "L1",
    },
    {
      ...invokeBase,
      signature: [] as string[],
      nonce_data_availability_mode: 0,
      fee_data_availability_mode: 0,
    },
    {
      ...invokeBase,
      signature: ["0x0"],
      nonce_data_availability_mode: "L1",
      fee_data_availability_mode: "L1",
    },
    {
      ...invokeBase,
      signature: ["0x0"],
      nonce_data_availability_mode: 0,
      fee_data_availability_mode: 0,
    },
  ];

  let lastError: Error | null = null;

  for (const request of requestVariants) {
    const blockIds = ["pre_confirmed", "latest"];
    for (const blockId of blockIds) {
      const rpcParamShapes = [
        {
          request,
          simulation_flags: ["SKIP_VALIDATE"],
          block_id: blockId,
        },
        [request, ["SKIP_VALIDATE"], blockId],
        {
          request: [request],
          simulation_flags: ["SKIP_VALIDATE"],
          block_id: blockId,
        },
        [[request], ["SKIP_VALIDATE"], blockId],
      ];

      for (const params of rpcParamShapes) {
        const response = await fetch(rpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "starknet_estimateFee",
            params,
          }),
        });

        const rawText = await response.text();
        let json: any = null;
        if (rawText.trim().length > 0) {
          try {
            json = JSON.parse(rawText);
          } catch {
            lastError = new Error(
              `Fee estimation failed: invalid JSON response (HTTP ${response.status})`,
            );
            continue;
          }
        }

        if (json?.error) {
          const rpcErrMsg = json.error.message || JSON.stringify(json.error);
          lastError = new Error(`Fee estimation failed: ${rpcErrMsg}`);
          continue;
        }

        if (!response.ok) {
          const bodySnippet = rawText.slice(0, 240);
          lastError = new Error(
            `Fee estimation failed: HTTP ${response.status} ${response.statusText}${bodySnippet ? ` - ${bodySnippet}` : ""}`,
          );
          continue;
        }

        const rawResult = json?.result;
        const result = Array.isArray(rawResult) ? rawResult[0] : rawResult;
        if (!result) {
          lastError = new Error("No fee estimation result returned");
          continue;
        }

        const l1Gas = BigInt(result.l1_gas_consumed ?? "0");
        const l1GasPrice = BigInt(result.l1_gas_price ?? "0");
        const l2Gas = BigInt(result.l2_gas_consumed ?? result.gas_consumed ?? "0");
        const l2GasPrice = BigInt(result.l2_gas_price ?? result.gas_price ?? "0");
        const l1DataGas = BigInt(result.l1_data_gas_consumed ?? result.data_gas_consumed ?? "0");
        const l1DataGasPrice = BigInt(result.l1_data_gas_price ?? result.data_gas_price ?? "0");

        if (l1Gas === 0n && l2Gas === 0n && l1DataGas === 0n) {
          lastError = new Error(
            `Fee estimation returned zero resources for all categories: ${JSON.stringify(result)}`,
          );
          continue;
        }

        return {
          l1Gas,
          l1GasPrice,
          l2Gas,
          l2GasPrice,
          l1DataGas,
          l1DataGasPrice,
          overallFee: BigInt(result.overall_fee || "0"),
        };
      }
    }
  }

  throw lastError || new Error("Fee estimation failed");
}

/**
 * Build resource bounds from a fee estimate with a safety multiplier.
 * @param estimate - result from estimateWardInvokeFee()
 * @param safetyMultiplier - multiplier on max_amount values (default 1.5)
 */
export function buildResourceBoundsFromEstimate(
  estimate: FeeEstimate,
  safetyMultiplier = 1.5,
): any {
  // Use BigInt math to avoid precision loss on large values
  const multiplierBp = BigInt(Math.round(safetyMultiplier * 10000));
  const mul = (v: bigint) => (v * multiplierBp + 9999n) / 10000n; // ceiling division
  const minOneWhenNonZero = (v: bigint) => (v > 0n ? (v < 1n ? 1n : v) : 0n);
  const amountWithSafety = (v: bigint) => minOneWhenNonZero(mul(v));
  const priceWithSafety = (v: bigint) => minOneWhenNonZero(v * 2n);
  return {
    l1_gas: {
      max_amount: amountWithSafety(estimate.l1Gas),
      max_price_per_unit: priceWithSafety(estimate.l1GasPrice),
    },
    l2_gas: {
      max_amount: amountWithSafety(estimate.l2Gas),
      max_price_per_unit: priceWithSafety(estimate.l2GasPrice),
    },
    l1_data_gas: {
      max_amount: amountWithSafety(estimate.l1DataGas),
      max_price_per_unit: priceWithSafety(estimate.l1DataGasPrice),
    },
  };
}

/**
 * @deprecated Use estimateWardInvokeFee() + buildResourceBoundsFromEstimate() instead.
 * Kept for backward compatibility during migration.
 */
export function buildWardResourceBounds(gasPrices: BlockGasPrices, multiplier = 1.5): any {
  const multiplierBp = BigInt(Math.round(multiplier * 10000));
  const applyMultiplier = (base: bigint) => (base * multiplierBp + 9999n) / 10000n;
  return {
    l1_gas: { max_amount: 0n, max_price_per_unit: gasPrices.l1GasPrice },
    l2_gas: { max_amount: applyMultiplier(900000n), max_price_per_unit: 100000000000n },
    l1_data_gas: { max_amount: applyMultiplier(256n), max_price_per_unit: gasPrices.l1DataGasPrice },
  };
}

// ─── Amount Formatting ──────────────────────────────────────────────────────

/**
 * Format a ward transaction amount for display.
 * Returns human-readable string like "0.5 STRK" or "Claim pending balance".
 */
export function formatWardAmount(
  amount: string | null | undefined,
  tokenKey: string,
  action: string,
): string {
  if (!amount || action === "rollover") return "Claim pending balance";
  const token = TOKENS[tokenKey as TokenKey];
  if (!token) return `${amount} units`;
  // erc20_transfer amounts are already in ERC-20 display format (e.g. "1" = 1 STRK)
  if (action === "erc20_transfer") {
    return `${amount} ${token.symbol}`;
  }
  // Shielded ops: amount is in tongo units — convert to display
  const erc20Amount = BigInt(amount) * token.rate;
  return `${formatTokenAmount(erc20Amount, token.decimals)} ${token.symbol}`;
}

/**
 * Parse a sequencer "Insufficient max" gas error.
 * Returns the resource type and amounts, or null if not a gas error.
 *
 * Example error: "Insufficient max L2Gas: max amount: 800000, actual used: 809800."
 */
export function parseInsufficientGasError(errorMsg: string): {
  resource: string;
  maxAmount: number;
  actualUsed: number;
  suggestedMultiplier: number;
} | null {
  const match = errorMsg.match(
    /Insufficient max (\w+):\s*max amount:\s*(\d+),\s*actual used:\s*(\d+)/i,
  );
  if (!match) return null;
  const maxAmount = parseInt(match[2], 10);
  const actualUsed = parseInt(match[3], 10);
  // Suggest multiplier that covers actual + 30% headroom
  const suggestedMultiplier = Math.ceil((actualUsed / maxAmount) * 1.3 * 100) / 100;
  return {
    resource: match[1],
    maxAmount,
    actualUsed,
    suggestedMultiplier: Math.max(suggestedMultiplier, 1.5),
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

// ─── Fee Formatting & Retry Utilities ──────────────────────────────────────────

/**
 * Format a fee amount in human-readable form (e.g., "0.0012 STRK").
 * Defaults to STRK (18 decimals) if no symbol provided.
 */
export function formatFeeForUser(
  feeWei: bigint,
  tokenSymbol = "STRK",
  decimals = 18,
): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = feeWei / divisor;
  const remainder = feeWei % divisor;
  const remainderStr = remainder.toString().padStart(decimals, "0");
  const trimmed = remainderStr.slice(0, 6).replace(/0+$/, "") || "0";
  const formatted = remainder === 0n ? whole.toString() : `${whole}.${trimmed}`;
  return `${formatted} ${tokenSymbol}`;
}

/**
 * Information about a fee retry — used to display fee retry modals.
 */
export interface FeeRetryInfo {
  /** The max fee that was set for the failed tx */
  estimatedFee: string;
  /** The actual fee needed (parsed from error) */
  actualNeeded: string;
  /** The suggested fee with safety margin for retry */
  suggestedFee: string;
  /** Suggested safety multiplier for the retry */
  suggestedMultiplier: number;
  /** Whether the user's balance is too low even for the suggested fee */
  insufficientBalance: boolean;
  /** Balance needed to cover the suggested fee (in wei) */
  balanceNeededWei: bigint;
  /** Human-readable balance needed */
  balanceNeeded: string;
  /** Human-readable current balance */
  currentBalance: string;
}

/**
 * Build fee retry info from an error message and current balance.
 * Returns null if the error is not a gas/fee error.
 */
export function buildFeeRetryInfo(
  errorMsg: string,
  currentBalanceWei: bigint,
  tokenSymbol = "STRK",
  decimals = 18,
): FeeRetryInfo | null {
  const gasInfo = parseInsufficientGasError(errorMsg);
  if (!gasInfo) return null;

  // The fee values from parseInsufficientGasError are gas units, not wei.
  // To get the fee in wei, we'd need the gas price. For UX purposes,
  // we show the multiplier and let the retry handle exact calculation.
  const estimatedFee = formatFeeForUser(BigInt(gasInfo.maxAmount), "gas units", 0);
  const actualNeeded = formatFeeForUser(BigInt(gasInfo.actualUsed), "gas units", 0);
  const suggestedGas = BigInt(Math.ceil(gasInfo.actualUsed * 1.3));
  const suggestedFee = formatFeeForUser(suggestedGas, "gas units", 0);

  return {
    estimatedFee,
    actualNeeded,
    suggestedFee,
    suggestedMultiplier: gasInfo.suggestedMultiplier,
    insufficientBalance: false, // We can't reliably check without gas price context
    balanceNeededWei: 0n,
    balanceNeeded: formatFeeForUser(0n, tokenSymbol, decimals),
    currentBalance: formatFeeForUser(currentBalanceWei, tokenSymbol, decimals),
  };
}

/**
 * Create an RPC provider for the given network.
 * Centralizes provider creation to avoid duplication across frontends.
 */
export function getProvider(network: "sepolia" | "mainnet" = "sepolia"): RpcProvider {
  return new RpcProvider({ nodeUrl: DEFAULT_RPC[network] });
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
  options?: WardApprovalRequestOptions,
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
      status: options?.initialStatus || "pending_ward_sig",
    });
  } catch (err: any) {
    return { approved: false, error: `Failed to submit ward approval: ${err.message}` };
  }

  const requestId = Array.isArray(rows) ? rows[0]?.id : (rows as any)?.id;
  if (!requestId) {
    return { approved: false, error: "Failed to get ward approval request ID" };
  }

  if (options?.onRequestCreated) {
    try {
      const inserted = Array.isArray(rows) ? rows[0] : (rows as any);
      await options.onRequestCreated(inserted as WardApprovalRequest);
    } catch (err: any) {
      return {
        approved: false,
        error: `Failed to process ward request: ${err?.message || String(err)}`,
      };
    }
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
