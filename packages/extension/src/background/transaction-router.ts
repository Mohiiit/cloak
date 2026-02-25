/**
 * Centralized transaction router for the Cloak extension.
 *
 * ALL on-chain transactions (popup messages + dApp RPC) go through this router.
 * It checks ward status and 2FA status, routing accordingly:
 *   1. Ward account →
 *      - ward 2FA OFF: sign locally in extension, then guardian stage (if required)
 *      - ward 2FA ON: ward-mobile stage first, then guardian stage (if required)
 *   2. 2FA enabled  → request2FAApproval (API + mobile signing)
 *   3. Otherwise    → direct SDK execution
 *
 * Gas estimation/retry for ward + guardian handoff is handled by SDK helpers.
 */

import {
  CloakClient,
  serializeCalls,
  formatWardAmount,
  getProvider,
  estimateWardInvokeFee,
  buildResourceBoundsFromEstimate,
  serializeResourceBounds,
  signHash,
} from "@cloak-wallet/sdk";
import type {
  TokenKey,
  AmountUnit,
  CanonicalAmount,
  WardExecutionDecision,
  WardPolicySnapshot,
} from "@cloak-wallet/sdk";
import { Account, hash, num, transaction } from "starknet";
import { check2FAEnabled, request2FAApproval } from "@/shared/two-factor";
import { requestWardApproval } from "@/shared/ward-approval";
import { getExtensionRuntime } from "@/shared/runtime";

type Action = "fund" | "transfer" | "withdraw" | "rollover" | "erc20_transfer";

interface TransactionOpts {
  amount?: string;
  recipient?: string;
  onStatusChange?: (status: string) => void;
}

interface LocalWardEnvelope {
  wardSigJson: string;
  nonce: string;
  resourceBoundsJson: string;
  txHash: string;
}

function toCanonicalAmount(
  amount: string | null | undefined,
  unit: AmountUnit,
): CanonicalAmount | null {
  if (!amount) return null;
  return { value: amount, unit };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

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

async function prepareLocalWardEnvelope(
  wardAddress: string,
  wardPrivateKey: string,
  calls: any[],
): Promise<LocalWardEnvelope> {
  const provider = getProvider();
  const [chainId, nonce, estimate] = await Promise.all([
    provider.getChainId(),
    provider.getNonceForAddress(wardAddress),
    estimateWardInvokeFee(provider as any, wardAddress, calls),
  ]);
  const resourceBounds = buildResourceBoundsFromEstimate(estimate, 1.5);
  const compiledCalldata = transaction.getExecuteCalldata(calls, "1");
  const txHash = num.toHex(hash.calculateInvokeTransactionHash({
    senderAddress: wardAddress,
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
  const wardSig = signHash(txHash, wardPrivateKey);
  return {
    wardSigJson: JSON.stringify(wardSig),
    nonce: nonce.toString(),
    resourceBoundsJson: serializeResourceBounds(resourceBounds),
    txHash,
  };
}

// ─── Main routing functions ──────────────────────────────────────────────────

/**
 * Route a named Cloak operation (fund/transfer/withdraw/rollover)
 * through ward → 2FA → direct execution.
 */
async function executeNamedAction(
  acct: any,
  action: Action,
  opts?: TransactionOpts,
): Promise<any> {
  if (action === "fund") return acct.fund(BigInt(opts?.amount!));
  if (action === "transfer") return acct.transfer(opts?.recipient!, BigInt(opts?.amount!));
  if (action === "withdraw") return acct.withdraw(BigInt(opts?.amount!));
  return acct.rollover();
}

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
  const runtime = await getExtensionRuntime();
  const rawAmount = opts?.amount?.toString() || null;
  const directExecutor = () => executeNamedAction(acct, action, opts);

  // 2. Ward check (takes priority over 2FA)
  const isWard = await runtime.ward.checkIfWardAccount(wallet.starkAddress);
  if (isWard) {
    let localWardEnvelope: LocalWardEnvelope | null | undefined = undefined;
    const routed = await runtime.router.execute({
      walletAddress: wallet.starkAddress,
      wardAddress: wallet.starkAddress,
      calls,
      meta: {
        type: action,
        token,
        amount: toCanonicalAmount(rawAmount, "tongo_units"),
        recipient: opts?.recipient || null,
        network: "sepolia",
        platform: "extension",
      },
      onStatusChange: (s) => notifyStatus(s, opts?.onStatusChange),
      executeDirect: directExecutor,
      executeWardApproval: async (
        decision: WardExecutionDecision,
        snapshot: WardPolicySnapshot,
      ) => {
        if (localWardEnvelope === undefined) {
          localWardEnvelope = snapshot.wardHas2fa
            ? null
            : await prepareLocalWardEnvelope(wallet.starkAddress, wallet.privateKey, calls);
        }
        const requestAmount = rawAmount
          ? formatWardAmount(rawAmount, token, action)
          : null;
        const wardResult = await requestWardApproval(
          {
            wardAddress: wallet.starkAddress,
            guardianAddress: snapshot.guardianAddress,
            action,
            token,
            amount: requestAmount,
            amountUnit: requestAmount ? "erc20_display" : null,
            recipient: opts?.recipient || null,
            callsJson,
            wardSigJson: localWardEnvelope?.wardSigJson || "[]",
            nonce: localWardEnvelope?.nonce || "",
            resourceBoundsJson: localWardEnvelope?.resourceBoundsJson || "{}",
            txHash: localWardEnvelope?.txHash || "",
            needsWard2fa: decision.needsWard2fa,
            needsGuardian: decision.needsGuardian,
            needsGuardian2fa: decision.needsGuardian2fa,
            onStatusChange: (status) => notifyStatus(status, opts?.onStatusChange),
          },
          localWardEnvelope ? { initialStatus: "pending_guardian" } : undefined,
        );
        notifyComplete(wardResult.approved, wardResult.txHash);
        return wardResult;
      },
    });

    if (routed.route === "ward_direct") {
      notifyComplete(true, routed.txHash);
    }
    return { txHash: routed.txHash };
  }

  // 3. 2FA check
  const is2FA = await check2FAEnabled(wallet.starkAddress);
  const routed = await runtime.router.execute({
    walletAddress: wallet.starkAddress,
    calls,
    is2FAEnabled: is2FA,
    meta: {
      type: action,
      token,
      amount: toCanonicalAmount(rawAmount, "tongo_units"),
      recipient: opts?.recipient || null,
      network: "sepolia",
      platform: "extension",
      directAccountType: "normal",
    },
    onStatusChange: (s) => notifyStatus(s, opts?.onStatusChange),
    executeDirect: directExecutor,
    execute2FA: async () => {
      const result = await request2FAApproval({
        walletAddress: wallet.starkAddress,
        action,
        token,
        amount: rawAmount,
        recipient: opts?.recipient || null,
        callsJson,
        sig1Json: "[]",
        nonce: "",
        resourceBoundsJson: "{}",
        txHash: "",
        onStatusChange: (status) => notifyStatus(status, opts?.onStatusChange),
      });
      notifyComplete(result.approved, result.txHash);
      return result;
    },
  });

  return { txHash: routed.txHash };
}

/**
 * Route raw Call[] (from dApp wallet_addInvokeTransaction)
 * through ward → 2FA → direct execution.
 */
export async function routeRawCalls(
  client: CloakClient,
  calls: any[],
  opts?: { onStatusChange?: (s: string) => void; action?: string; token?: string; amount?: string; recipient?: string },
): Promise<{ transaction_hash: string }> {
  const wallet = await client.getWallet();
  if (!wallet) throw new Error("No wallet connected");

  const callsJson = serializeCalls(calls);
  const runtime = await getExtensionRuntime();

  const wardAction = opts?.action || "invoke";
  const wardToken = opts?.token || "STRK";
  const wardAmount = opts?.amount || null;
  const wardRecipient = opts?.recipient || null;

  const directExecutor = async () => {
    const provider = getProvider();
    const account = new Account({
      provider,
      address: wallet.starkAddress,
      signer: wallet.privateKey,
    });
    return account.execute(calls);
  };

  const isWard = await runtime.ward.checkIfWardAccount(wallet.starkAddress);
  if (isWard) {
    let localWardEnvelope: LocalWardEnvelope | null | undefined = undefined;
    const routed = await runtime.router.execute({
      walletAddress: wallet.starkAddress,
      wardAddress: wallet.starkAddress,
      calls,
      meta: {
        type: (opts?.action || "transfer") as any,
        token: wardToken,
        amount: toCanonicalAmount(wardAmount, "erc20_display"),
        recipient: wardRecipient,
        network: "sepolia",
        platform: "extension",
      },
      onStatusChange: (s) => notifyStatus(s, opts?.onStatusChange),
      executeDirect: directExecutor,
      executeWardApproval: async (
        decision: WardExecutionDecision,
        snapshot: WardPolicySnapshot,
      ) => {
        if (localWardEnvelope === undefined) {
          localWardEnvelope = snapshot.wardHas2fa
            ? null
            : await prepareLocalWardEnvelope(wallet.starkAddress, wallet.privateKey, calls);
        }

        const formattedAmount = wardAmount
          ? formatWardAmount(wardAmount, wardToken, wardAction)
          : null;

        const wardResult = await requestWardApproval(
          {
            wardAddress: wallet.starkAddress,
            guardianAddress: snapshot.guardianAddress,
            action: wardAction,
            token: wardToken,
            amount: formattedAmount,
            amountUnit: formattedAmount ? "erc20_display" : null,
            recipient: wardRecipient,
            callsJson,
            wardSigJson: localWardEnvelope?.wardSigJson || "[]",
            nonce: localWardEnvelope?.nonce || "",
            resourceBoundsJson: localWardEnvelope?.resourceBoundsJson || "{}",
            txHash: localWardEnvelope?.txHash || "",
            needsWard2fa: decision.needsWard2fa,
            needsGuardian: decision.needsGuardian,
            needsGuardian2fa: decision.needsGuardian2fa,
            onStatusChange: (status) => notifyStatus(status, opts?.onStatusChange),
          },
          localWardEnvelope ? { initialStatus: "pending_guardian" } : undefined,
        );
        notifyComplete(wardResult.approved, wardResult.txHash);
        return wardResult;
      },
    });

    if (routed.route === "ward_direct") {
      notifyComplete(true, routed.txHash);
    }
    return { transaction_hash: routed.txHash };
  }

  const is2FA = await check2FAEnabled(wallet.starkAddress);
  const routed = await runtime.router.execute({
    walletAddress: wallet.starkAddress,
    calls,
    is2FAEnabled: is2FA,
    meta: {
      type: (opts?.action || "transfer") as any,
      token: wardToken,
      amount: toCanonicalAmount(wardAmount, "erc20_display"),
      recipient: wardRecipient,
      network: "sepolia",
      platform: "extension",
      directAccountType: "normal",
    },
    onStatusChange: (s) => notifyStatus(s, opts?.onStatusChange),
    executeDirect: directExecutor,
    execute2FA: async () => {
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
        onStatusChange: (status) => notifyStatus(status, opts?.onStatusChange),
      });
      notifyComplete(result.approved, result.txHash);
      return result;
    },
  });

  return { transaction_hash: routed.txHash };
}
