/**
 * useTransactionRouter — Centralized transaction routing for mobile.
 *
 * ALL on-chain transactions go through this hook's `execute()` method.
 * It checks ward status and 2FA status, routing accordingly:
 *   1. Ward account → ward.initiateWardTransaction (Supabase + guardian pipeline)
 *   2. 2FA enabled  → executeDualSig (biometric + dual-key signing)
 *   3. Otherwise    → direct SDK execution via wallet context
 *
 * After every successful execute(), the transaction is persisted to Supabase
 * via `saveTransaction()` and confirmed in the background via `confirmTransaction()`.
 */
import { useCallback } from "react";
import { RpcProvider } from "starknet";
import {
  saveTransaction,
  confirmTransaction,
  DEFAULT_RPC,
} from "@cloak-wallet/sdk";
import { useWallet } from "../lib/WalletContext";
import { useWardContext } from "../lib/wardContext";
import { useDualSigExecutor } from "./useDualSigExecutor";
import { setTransactionRouterPath } from "../testing/transactionRouteTrace";

type Action = "fund" | "transfer" | "withdraw" | "rollover";

interface ExecuteParams {
  action: Action;
  token: string;
  amount?: string;
  recipient?: string;
  recipientName?: string;
  note?: string;
}

export function useTransactionRouter() {
  const wallet = useWallet();
  const ward = useWardContext();
  const { executeDualSig, is2FAEnabled } = useDualSigExecutor();

  const prepareCalls = useCallback(
    async (action: Action, amount?: string, recipient?: string) => {
      switch (action) {
        case "fund":
          return wallet.prepareFund(amount!);
        case "transfer":
          return wallet.prepareTransfer(amount!, recipient!);
        case "withdraw":
          return wallet.prepareWithdraw(amount!);
        case "rollover":
          return wallet.prepareRollover();
      }
    },
    [wallet],
  );

  /** Fire-and-forget: save tx to Supabase + confirm in background */
  const persistTransaction = useCallback(
    (
      txHash: string,
      params: ExecuteParams,
      accountType: "normal" | "ward" | "guardian",
    ) => {
      const walletAddress = wallet.keys?.starkAddress;
      if (!walletAddress) return;

      // Save the initial record as "pending"
      saveTransaction({
        wallet_address: walletAddress,
        tx_hash: txHash,
        type: params.action as any,
        token: params.token,
        amount: params.amount || null,
        recipient: params.recipient || null,
        recipient_name: params.recipientName || null,
        note: params.note || null,
        status: "pending",
        account_type: accountType,
        network: "sepolia",
        platform: "mobile",
      }).catch(() => {});

      // Confirm in background (updates status to confirmed/failed + fee)
      const provider = new RpcProvider({ nodeUrl: DEFAULT_RPC.sepolia });
      confirmTransaction(provider as any, txHash).catch(() => {});
    },
    [wallet.keys?.starkAddress],
  );

  const execute = useCallback(
    async (params: ExecuteParams): Promise<{ txHash: string }> => {
      const { action, token, amount, recipient } = params;

      // 1. Ward path — insert Supabase request + poll for guardian approval
      if (ward.isWard) {
        setTransactionRouterPath(is2FAEnabled ? "ward+2fa" : "ward");
        const { calls } = await prepareCalls(action, amount, recipient);
        const wardResult = await ward.initiateWardTransaction({
          action,
          token,
          amount,
          recipient,
          calls,
        });
        if (wardResult.approved && wardResult.txHash) {
          persistTransaction(wardResult.txHash, params, "ward");
          return { txHash: wardResult.txHash };
        }
        throw new Error(wardResult.error || "Ward approval failed");
      }

      // 2. 2FA path — biometric gate + dual-key signing
      if (is2FAEnabled) {
        setTransactionRouterPath("2fa");
        const { calls } = await prepareCalls(action, amount, recipient);
        const result = await executeDualSig(calls);
        persistTransaction(result.txHash, params, "normal");
        return result;
      }

      // 3. Direct execution
      setTransactionRouterPath("direct");
      let result: { txHash: string };
      switch (action) {
        case "fund":
          result = await wallet.fund(amount!);
          break;
        case "transfer":
          result = await wallet.transfer(amount!, recipient!);
          break;
        case "withdraw":
          result = await wallet.withdraw(amount!);
          break;
        case "rollover":
          result = await wallet.rollover();
          break;
      }
      persistTransaction(result.txHash, params, "normal");
      return result;
    },
    [wallet, ward, prepareCalls, executeDualSig, is2FAEnabled, persistTransaction],
  );

  return { execute };
}
