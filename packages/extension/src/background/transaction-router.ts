/**
 * Centralized transaction router for the Cloak extension.
 *
 * ALL on-chain transactions (popup messages + dApp RPC) go through this router.
 * It checks ward status and 2FA status, routing accordingly:
 *   1. Ward account →
 *      - ward 2FA OFF: sign locally in extension, then guardian stage (if required)
 *      - ward 2FA ON: ward-mobile stage first, then guardian stage (if required)
 *   2. 2FA enabled  → request2FAApproval (Supabase + mobile signing)
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
  saveTransaction,
  confirmTransaction,
} from "@cloak-wallet/sdk";
import type { TokenKey, WardApprovalResult } from "@cloak-wallet/sdk";
import { Account, hash, num, transaction } from "starknet";
import { check2FAEnabled, request2FAApproval } from "@/shared/two-factor";
import {
  checkIfWardAccount,
  getWardApprovalNeeds,
  requestWardApproval,
} from "@/shared/ward-approval";

type Action = "fund" | "transfer" | "withdraw" | "rollover";

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
    if (!wardNeeds) throw new Error("Failed to read ward approval requirements from chain");

    // Ward + no ward-2FA: sign locally in extension first.
    // If guardian is not required, execute directly.
    const needsLocalWardSignature = !wardNeeds.wardHas2fa;
    if (needsLocalWardSignature && !wardNeeds.needsGuardian) {
      let result: any;
      if (action === "fund") result = await acct.fund(BigInt(opts?.amount!));
      else if (action === "transfer") result = await acct.transfer(opts?.recipient!, BigInt(opts?.amount!));
      else if (action === "withdraw") result = await acct.withdraw(BigInt(opts?.amount!));
      else result = await acct.rollover();

      const txHash = result.txHash || result.transaction_hash;
      if (txHash) {
        saveTransaction({
          wallet_address: wallet.starkAddress,
          tx_hash: txHash,
          type: action,
          token,
          amount: opts?.amount || null,
          recipient: opts?.recipient || null,
          status: "pending",
          account_type: "ward",
          network: "sepolia",
          platform: "extension",
        }).catch(() => {});
        const provider = getProvider();
        confirmTransaction(provider, txHash).catch(() => {});
      }
      return result;
    }

    const rawAmount = opts?.amount?.toString() || null;
    const localWardEnvelope = needsLocalWardSignature
      ? await prepareLocalWardEnvelope(wallet.starkAddress, wallet.privateKey, calls)
      : null;

    const wardResult = await requestWardApproval(
      {
        wardAddress: wallet.starkAddress,
        guardianAddress: wardNeeds.guardianAddress,
        action,
        token,
        amount: formatWardAmount(rawAmount, token, action),
        recipient: opts?.recipient || null,
        callsJson,
        wardSigJson: localWardEnvelope?.wardSigJson || "[]",
        nonce: localWardEnvelope?.nonce || "",
        resourceBoundsJson: localWardEnvelope?.resourceBoundsJson || "{}",
        txHash: localWardEnvelope?.txHash || "",
        needsWard2fa: wardNeeds.wardHas2fa,
        needsGuardian: wardNeeds.needsGuardian,
        needsGuardian2fa: wardNeeds.guardianHas2fa,
        onStatusChange: (s) => notifyStatus(s, opts?.onStatusChange),
      },
      needsLocalWardSignature ? { initialStatus: "pending_guardian" } : undefined,
    );
    notifyComplete(wardResult.approved, wardResult.txHash);
    if (wardResult.approved && wardResult.txHash) {
      saveTransaction({
        wallet_address: wallet.starkAddress,
        tx_hash: wardResult.txHash,
        type: action,
        token,
        amount: opts?.amount || null,
        recipient: opts?.recipient || null,
        status: "pending",
        account_type: "ward",
        network: "sepolia",
        platform: "extension",
      }).catch(() => {});
      const provider = getProvider();
      confirmTransaction(provider, wardResult.txHash).catch(() => {});
      return { txHash: wardResult.txHash };
    }
    throw new Error(wardResult.error || "Ward approval failed");
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
      saveTransaction({
        wallet_address: wallet.starkAddress,
        tx_hash: result.txHash,
        type: action,
        token,
        amount: opts?.amount || null,
        recipient: opts?.recipient || null,
        status: "pending",
        account_type: "normal",
        network: "sepolia",
        platform: "extension",
      }).catch(() => {});
      const provider = getProvider();
      confirmTransaction(provider, result.txHash).catch(() => {});
      return { txHash: result.txHash };
    }
    throw new Error(result.error || "Transaction not approved");
  }

  // 4. Direct execution
  let directResult: any;
  if (action === "fund") directResult = await acct.fund(BigInt(opts?.amount!));
  else if (action === "transfer") directResult = await acct.transfer(opts?.recipient!, BigInt(opts?.amount!));
  else if (action === "withdraw") directResult = await acct.withdraw(BigInt(opts?.amount!));
  else directResult = await acct.rollover();

  const directTxHash = directResult.txHash || directResult.transaction_hash;
  if (directTxHash) {
    saveTransaction({
      wallet_address: wallet.starkAddress,
      tx_hash: directTxHash,
      type: action,
      token,
      amount: opts?.amount || null,
      recipient: opts?.recipient || null,
      status: "pending",
      account_type: "normal",
      network: "sepolia",
      platform: "extension",
    }).catch(() => {});
    const provider = getProvider();
    confirmTransaction(provider, directTxHash).catch(() => {});
  }
  return directResult;
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
    if (!wardNeeds) throw new Error("Failed to read ward approval requirements from chain");

    const needsLocalWardSignature = !wardNeeds.wardHas2fa;
    if (needsLocalWardSignature && !wardNeeds.needsGuardian) {
      const provider = getProvider();
      const account = new Account({
        provider,
        address: wallet.starkAddress,
        signer: wallet.privateKey,
      });
      const result = await account.execute(calls);
      const rawTxHash = result.transaction_hash;
      if (rawTxHash) {
        saveTransaction({
          wallet_address: wallet.starkAddress,
          tx_hash: rawTxHash,
          type: "transfer",
          token: "STRK",
          amount: null,
          recipient: null,
          status: "pending",
          account_type: "ward",
          network: "sepolia",
          platform: "extension",
        }).catch(() => {});
        confirmTransaction(provider, rawTxHash).catch(() => {});
      }
      return { transaction_hash: rawTxHash };
    }

    const localWardEnvelope = needsLocalWardSignature
      ? await prepareLocalWardEnvelope(wallet.starkAddress, wallet.privateKey, calls)
      : null;

    const wardResult = await requestWardApproval(
      {
        wardAddress: wallet.starkAddress,
        guardianAddress: wardNeeds.guardianAddress,
        action: "invoke",
        token: "STRK",
        amount: null,
        recipient: null,
        callsJson,
        wardSigJson: localWardEnvelope?.wardSigJson || "[]",
        nonce: localWardEnvelope?.nonce || "",
        resourceBoundsJson: localWardEnvelope?.resourceBoundsJson || "{}",
        txHash: localWardEnvelope?.txHash || "",
        needsWard2fa: wardNeeds.wardHas2fa,
        needsGuardian: wardNeeds.needsGuardian,
        needsGuardian2fa: wardNeeds.guardianHas2fa,
        onStatusChange: (s) => notifyStatus(s, opts?.onStatusChange),
      },
      needsLocalWardSignature ? { initialStatus: "pending_guardian" } : undefined,
    );
    notifyComplete(wardResult.approved, wardResult.txHash);
    if (wardResult.approved && wardResult.txHash) {
      saveTransaction({
        wallet_address: wallet.starkAddress,
        tx_hash: wardResult.txHash,
        type: "transfer",
        token: "STRK",
        amount: null,
        recipient: null,
        status: "pending",
        account_type: "ward",
        network: "sepolia",
        platform: "extension",
      }).catch(() => {});
      const provider = getProvider();
      confirmTransaction(provider, wardResult.txHash).catch(() => {});
      return { transaction_hash: wardResult.txHash };
    }
    throw new Error(wardResult.error || "Ward approval failed");
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
      saveTransaction({
        wallet_address: wallet.starkAddress,
        tx_hash: result.txHash,
        type: "transfer",
        token: "STRK",
        amount: null,
        recipient: null,
        status: "pending",
        account_type: "normal",
        network: "sepolia",
        platform: "extension",
      }).catch(() => {});
      const provider = getProvider();
      confirmTransaction(provider, result.txHash).catch(() => {});
      return { transaction_hash: result.txHash };
    }
    throw new Error(result.error || "Transaction not approved");
  }

  // Direct execution
  const provider = getProvider();
  const account = new Account({
    provider,
    address: wallet.starkAddress,
    signer: wallet.privateKey,
  });
  const directRawResult = await account.execute(calls);
  const directRawTxHash = directRawResult.transaction_hash;
  if (directRawTxHash) {
    saveTransaction({
      wallet_address: wallet.starkAddress,
      tx_hash: directRawTxHash,
      type: "transfer",
      token: "STRK",
      amount: null,
      recipient: null,
      status: "pending",
      account_type: "normal",
      network: "sepolia",
      platform: "extension",
    }).catch(() => {});
    confirmTransaction(provider, directRawTxHash).catch(() => {});
  }
  return { transaction_hash: directRawTxHash };
}
