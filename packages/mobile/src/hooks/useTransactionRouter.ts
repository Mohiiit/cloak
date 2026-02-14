/**
 * useTransactionRouter — Centralized transaction routing for mobile.
 *
 * ALL on-chain transactions go through this hook's `execute()` method.
 * It checks ward status and 2FA status, routing accordingly:
 *   1. Ward account → ward.initiateWardTransaction (Supabase + guardian pipeline)
 *   2. 2FA enabled  → executeDualSig (biometric + dual-key signing)
 *   3. Otherwise    → direct SDK execution via wallet context
 */
import { useCallback } from "react";
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
          return { txHash: wardResult.txHash };
        }
        throw new Error(wardResult.error || "Ward approval failed");
      }

      // 2. 2FA path — biometric gate + dual-key signing
      if (is2FAEnabled) {
        setTransactionRouterPath("2fa");
        const { calls } = await prepareCalls(action, amount, recipient);
        return executeDualSig(calls);
      }

      // 3. Direct execution
      setTransactionRouterPath("direct");
      switch (action) {
        case "fund":
          return wallet.fund(amount!);
        case "transfer":
          return wallet.transfer(amount!, recipient!);
        case "withdraw":
          return wallet.withdraw(amount!);
        case "rollover":
          return wallet.rollover();
      }
    },
    [wallet, ward, prepareCalls, executeDualSig, is2FAEnabled],
  );

  return { execute };
}
