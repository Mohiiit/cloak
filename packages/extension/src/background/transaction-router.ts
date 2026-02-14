/**
 * Centralized transaction router for the Cloak extension.
 *
 * ALL on-chain transactions (popup messages + dApp RPC) go through this router.
 * It checks ward status and 2FA status, routing accordingly:
 *   1. Ward account (no ward 2FA) → extension signs with ward key, sends to guardian
 *   2. Ward account (with ward 2FA) → full mobile pipeline (ward mobile + guardian)
 *   3. 2FA enabled  → request2FAApproval (Supabase + mobile signing)
 *   4. Otherwise    → direct SDK execution
 *
 * Gas: Uses dynamic fee estimation (starknet_estimateFee + SKIP_VALIDATE).
 * Retries on gas errors by re-estimating with a higher safety multiplier.
 */

import {
  CloakClient,
  DEFAULT_RPC,
  signHash,
  estimateWardInvokeFee,
  buildResourceBoundsFromEstimate,
  parseInsufficientGasError,
  serializeResourceBounds,
  SupabaseLite,
  normalizeAddress,
  formatWardAmount,
} from "@cloak-wallet/sdk";
import type { TokenKey, WardApprovalResult } from "@cloak-wallet/sdk";
import { Account, RpcProvider, hash, num, transaction } from "starknet";
import { check2FAEnabled, request2FAApproval } from "@/shared/two-factor";
import {
  checkIfWardAccount,
  getWardApprovalNeeds,
  requestWardApproval,
} from "@/shared/ward-approval";
import { getSupabaseConfig } from "@/shared/supabase-config";

type Action = "fund" | "transfer" | "withdraw" | "rollover";

interface TransactionOpts {
  amount?: string;
  recipient?: string;
  onStatusChange?: (status: string) => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function serializeCalls(calls: any[]): string {
  return JSON.stringify(
    calls.map((cl: any) => ({
      contractAddress: cl.contractAddress || cl.contract_address,
      entrypoint: cl.entrypoint || cl.entry_point,
      calldata: (cl.calldata || []).map((d: any) => d.toString()),
    })),
  );
}

function notifyStatus(status: string, onStatusChange?: (s: string) => void) {
  onStatusChange?.(status);
  chrome.runtime
    .sendMessage({ type: "2FA_STATUS_UPDATE", status })
    .catch(() => {});
}

function notifyComplete(approved: boolean, txHash?: string) {
  chrome.runtime
    .sendMessage({ type: "2FA_COMPLETE", approved, txHash })
    .catch(() => {});
}

// ─── Ward signing from extension (no ward 2FA) ──────────────────────────────

const WARD_POLL_INTERVAL = 2000;
const WARD_TIMEOUT = 10 * 60 * 1000;
const MAX_GAS_RETRIES = 2;

/**
 * When ward 2FA is disabled, the extension signs with the ward key directly,
 * inserts request as pending_guardian, and polls for guardian completion.
 * Auto-retries on gas errors by re-estimating dynamically.
 */
async function signAndRequestGuardian(
  wallet: { starkAddress: string; privateKey: string },
  calls: any[],
  guardianAddress: string,
  action: string,
  token: string,
  amount: string | null,
  recipient: string | null,
  needsGuardian2fa: boolean,
  onStatusChange?: (s: string) => void,
): Promise<WardApprovalResult> {
  let safetyMultiplier = 1.5;

  for (let attempt = 0; attempt <= MAX_GAS_RETRIES; attempt++) {
    const result = await signAndSubmitWardRequest(
      wallet, calls, guardianAddress, action, token,
      amount, recipient, needsGuardian2fa, safetyMultiplier, onStatusChange,
    );

    // Check if it was a gas error that we can retry
    if (!result.approved && result.error) {
      const gasInfo = parseInsufficientGasError(result.error);
      if (gasInfo && attempt < MAX_GAS_RETRIES) {
        safetyMultiplier = gasInfo.suggestedMultiplier;
        notifyStatus(
          `Gas too low (needed ${gasInfo.actualUsed}, had ${gasInfo.maxAmount}). Re-estimating...`,
          onStatusChange,
        );
        continue;
      }
    }
    return result;
  }

  return { approved: false, error: "Max gas retries exceeded" };
}

async function signAndSubmitWardRequest(
  wallet: { starkAddress: string; privateKey: string },
  calls: any[],
  guardianAddress: string,
  action: string,
  token: string,
  amount: string | null,
  recipient: string | null,
  needsGuardian2fa: boolean,
  safetyMultiplier: number,
  onStatusChange?: (s: string) => void,
): Promise<WardApprovalResult> {
  const provider = new RpcProvider({ nodeUrl: DEFAULT_RPC.sepolia });

  notifyStatus("Estimating gas...", onStatusChange);

  // 1. Dynamic fee estimation with SKIP_VALIDATE
  const estimate = await estimateWardInvokeFee(provider, wallet.starkAddress, calls);
  const resourceBounds = buildResourceBoundsFromEstimate(estimate, safetyMultiplier);
  const nonce = await provider.getNonceForAddress(wallet.starkAddress);

  // 2. Compute tx hash
  const chainId = await provider.getChainId();
  const compiledCalldata = transaction.getExecuteCalldata(calls, "1");
  const txHash = num.toHex(hash.calculateInvokeTransactionHash({
    senderAddress: wallet.starkAddress,
    version: "0x3",
    compiledCalldata,
    chainId,
    nonce,
    accountDeploymentData: [],
    nonceDataAvailabilityMode: 0,
    feeDataAvailabilityMode: 0,
    resourceBounds,
    tip: 0,
    paymasterData: [],
  }));

  // 3. Sign with ward key
  const wardSig = signHash(txHash, wallet.privateKey);

  // 4. Insert request as pending_guardian (skip ward mobile)
  const rbJson = serializeResourceBounds(resourceBounds);
  const callsJson = serializeCalls(calls);
  const { url, key } = await getSupabaseConfig();
  const sb = new SupabaseLite(url, key);

  const normalizedWard = normalizeAddress(wallet.starkAddress);
  const normalizedGuardian = normalizeAddress(guardianAddress);

  notifyStatus("Waiting for guardian approval...", onStatusChange);

  // Format amount for human-readable display on guardian side
  const formattedAmount = formatWardAmount(amount, token, action);

  let rows: any[];
  try {
    rows = await sb.insert("ward_approval_requests", {
      ward_address: normalizedWard,
      guardian_address: normalizedGuardian,
      action,
      token,
      amount: formattedAmount,
      recipient,
      calls_json: callsJson,
      nonce: nonce.toString(),
      resource_bounds_json: rbJson,
      tx_hash: txHash,
      ward_sig_json: JSON.stringify(wardSig),
      needs_ward_2fa: false,
      needs_guardian: true,
      needs_guardian_2fa: needsGuardian2fa,
      status: "pending_guardian",
      responded_at: new Date().toISOString(),
    });
  } catch (err: any) {
    return { approved: false, error: `Failed to submit ward request: ${err.message}` };
  }

  const requestId = Array.isArray(rows) ? rows[0]?.id : (rows as any)?.id;
  if (!requestId) {
    return { approved: false, error: "Failed to get ward request ID" };
  }

  // 5. Poll for guardian completion
  const startTime = Date.now();
  return new Promise<WardApprovalResult>((resolve) => {
    const poll = async () => {
      if (Date.now() - startTime > WARD_TIMEOUT) {
        resolve({ approved: false, error: "Guardian approval timed out" });
        return;
      }
      try {
        const data = await sb.select(
          "ward_approval_requests",
          `id=eq.${requestId}`,
        );
        const req = data?.[0];
        if (!req) {
          setTimeout(poll, WARD_POLL_INTERVAL);
          return;
        }
        if (req.status === "approved" && req.final_tx_hash) {
          notifyStatus("Guardian approved!", onStatusChange);
          resolve({ approved: true, txHash: req.final_tx_hash });
        } else if (req.status === "rejected") {
          resolve({ approved: false, error: "Guardian rejected the request" });
        } else if (req.status === "gas_error") {
          // Guardian hit a gas error — return it so we can retry with higher bounds
          resolve({ approved: false, error: req.error_message || "Insufficient gas" });
        } else {
          setTimeout(poll, WARD_POLL_INTERVAL);
        }
      } catch {
        setTimeout(poll, WARD_POLL_INTERVAL);
      }
    };
    poll();
  });
}

// ─── Main routing functions ──────────────────────────────────────────────────

/**
 * Route a named Cloak operation (fund/transfer/withdraw/rollover)
 * through ward → 2FA → direct execution.
 */
export async function routeTransaction(
  client: CloakClient,
  action: Action,
  token: TokenKey,
  opts?: TransactionOpts,
): Promise<any> {
  const wallet = await client.getWallet();
  if (!wallet) throw new Error("No wallet connected");

  const acct = client.account(token);

  // 1. Prepare calls for the action
  let calls: any[];
  if (action === "fund") {
    calls = (await acct.prepareFund(BigInt(opts?.amount!))).calls;
  } else if (action === "transfer") {
    calls = (await acct.prepareTransfer(opts?.recipient!, BigInt(opts?.amount!))).calls;
  } else if (action === "withdraw") {
    calls = (await acct.prepareWithdraw(BigInt(opts?.amount!))).calls;
  } else {
    calls = (await acct.prepareRollover()).calls;
  }

  const callsJson = serializeCalls(calls);

  // 2. Ward check (takes priority over 2FA)
  const isWard = await checkIfWardAccount(wallet.starkAddress);
  if (isWard) {
    const wardNeeds = await getWardApprovalNeeds(wallet.starkAddress);
    if (wardNeeds) {
      if (wardNeeds.wardHas2fa) {
        // Ward 2FA enabled → full mobile pipeline (ward mobile signs with both keys)
        const rawAmount = opts?.amount?.toString() || null;
        const wardResult = await requestWardApproval({
          wardAddress: wallet.starkAddress,
          guardianAddress: wardNeeds.guardianAddress,
          action,
          token,
          amount: formatWardAmount(rawAmount, token, action),
          recipient: opts?.recipient || null,
          callsJson,
          wardSigJson: "[]",
          nonce: "",
          resourceBoundsJson: "{}",
          txHash: "",
          needsWard2fa: true,
          needsGuardian: wardNeeds.needsGuardian,
          needsGuardian2fa: wardNeeds.guardianHas2fa,
          onStatusChange: (s) => notifyStatus(s, opts?.onStatusChange),
        });
        notifyComplete(wardResult.approved, wardResult.txHash);
        if (wardResult.approved && wardResult.txHash) {
          return { txHash: wardResult.txHash };
        }
        throw new Error(wardResult.error || "Ward approval failed");
      }

      if (wardNeeds.needsGuardian) {
        // No ward 2FA but guardian needed → extension signs, sends to guardian
        const wardResult = await signAndRequestGuardian(
          wallet,
          calls,
          wardNeeds.guardianAddress,
          action,
          token,
          opts?.amount?.toString() || null,
          opts?.recipient || null,
          wardNeeds.guardianHas2fa,
          opts?.onStatusChange,
        );
        notifyComplete(wardResult.approved, wardResult.txHash);
        if (wardResult.approved && wardResult.txHash) {
          return { txHash: wardResult.txHash };
        }
        throw new Error(wardResult.error || "Ward approval failed");
      }
    }
  }

  // 3. 2FA check
  const is2FA = await check2FAEnabled(wallet.starkAddress);
  if (is2FA) {
    const result = await request2FAApproval({
      walletAddress: wallet.starkAddress,
      action,
      token,
      amount: opts?.amount?.toString() || null,
      recipient: opts?.recipient || null,
      callsJson,
      sig1Json: "[]",
      nonce: "",
      resourceBoundsJson: "{}",
      txHash: "",
      onStatusChange: (s) => notifyStatus(s, opts?.onStatusChange),
    });
    notifyComplete(result.approved, result.txHash);
    if (result.approved && result.txHash) {
      return { txHash: result.txHash };
    }
    throw new Error(result.error || "Transaction not approved");
  }

  // 4. Direct execution
  if (action === "fund") return acct.fund(BigInt(opts?.amount!));
  if (action === "transfer") return acct.transfer(opts?.recipient!, BigInt(opts?.amount!));
  if (action === "withdraw") return acct.withdraw(BigInt(opts?.amount!));
  return acct.rollover();
}

/**
 * Route raw Call[] (from dApp wallet_addInvokeTransaction)
 * through ward → 2FA → direct execution.
 */
export async function routeRawCalls(
  client: CloakClient,
  calls: any[],
  opts?: { onStatusChange?: (s: string) => void },
): Promise<{ transaction_hash: string }> {
  const wallet = await client.getWallet();
  if (!wallet) throw new Error("No wallet connected");

  const callsJson = serializeCalls(calls);

  // Ward check
  const isWard = await checkIfWardAccount(wallet.starkAddress);
  if (isWard) {
    const wardNeeds = await getWardApprovalNeeds(wallet.starkAddress);
    if (wardNeeds) {
      if (wardNeeds.wardHas2fa) {
        // Ward 2FA → full mobile pipeline
        const wardResult = await requestWardApproval({
          wardAddress: wallet.starkAddress,
          guardianAddress: wardNeeds.guardianAddress,
          action: "invoke",
          token: "STRK",
          amount: null,
          recipient: null,
          callsJson,
          wardSigJson: "[]",
          nonce: "",
          resourceBoundsJson: "{}",
          txHash: "",
          needsWard2fa: true,
          needsGuardian: wardNeeds.needsGuardian,
          needsGuardian2fa: wardNeeds.guardianHas2fa,
          onStatusChange: (s) => notifyStatus(s, opts?.onStatusChange),
        });
        notifyComplete(wardResult.approved, wardResult.txHash);
        if (wardResult.approved && wardResult.txHash) {
          return { transaction_hash: wardResult.txHash };
        }
        throw new Error(wardResult.error || "Ward approval failed");
      }

      if (wardNeeds.needsGuardian) {
        // No ward 2FA → extension signs, sends to guardian
        const wardResult = await signAndRequestGuardian(
          wallet,
          calls,
          wardNeeds.guardianAddress,
          "invoke",
          "STRK",
          null,
          null,
          wardNeeds.guardianHas2fa,
          opts?.onStatusChange,
        );
        notifyComplete(wardResult.approved, wardResult.txHash);
        if (wardResult.approved && wardResult.txHash) {
          return { transaction_hash: wardResult.txHash };
        }
        throw new Error(wardResult.error || "Ward approval failed");
      }
    }
  }

  // 2FA check
  const is2FA = await check2FAEnabled(wallet.starkAddress);
  if (is2FA) {
    const result = await request2FAApproval({
      walletAddress: wallet.starkAddress,
      action: "invoke",
      token: "STRK",
      amount: null,
      recipient: null,
      callsJson,
      sig1Json: "[]",
      nonce: "",
      resourceBoundsJson: "{}",
      txHash: "",
      onStatusChange: (s) => notifyStatus(s, opts?.onStatusChange),
    });
    notifyComplete(result.approved, result.txHash);
    if (result.approved && result.txHash) {
      return { transaction_hash: result.txHash };
    }
    throw new Error(result.error || "Transaction not approved");
  }

  // Direct execution
  const provider = new RpcProvider({ nodeUrl: DEFAULT_RPC.sepolia });
  const account = new Account({
    provider,
    address: wallet.starkAddress,
    signer: wallet.privateKey,
  });
  const result = await account.execute(calls);
  return { transaction_hash: result.transaction_hash };
}
