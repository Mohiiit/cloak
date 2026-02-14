"use client";

/**
 * useTransactionRouter — Centralized transaction routing for the web app.
 *
 * Wraps `account.execute(calls)` with ward/2FA checks.
 * If the connected wallet is a ward or has 2FA enabled, transactions
 * are routed through Supabase approval pipelines (signed by mobile app).
 * Otherwise, transactions execute directly via the connected wallet.
 */
import { useCallback } from "react";
import { useAccount } from "~~/hooks/useAccount";
import {
  checkWardApprovalNeeds,
  requestWardApproval,
} from "~~/lib/ward-approval";
import {
  check2FAEnabled,
  request2FAApproval,
} from "~~/lib/two-factor";
import { serializeCalls, formatWardAmount } from "@cloak-wallet/sdk";

interface TransactionMeta {
  action: string;
  token?: string;
  amount?: string;
  recipient?: string;
}

export function useTransactionRouter() {
  const { account, address } = useAccount();

  /**
   * Execute calls through ward → 2FA → direct pipeline.
   * Returns the transaction hash on success, throws on failure.
   */
  const executeOrRoute = useCallback(
    async (calls: any[], meta: TransactionMeta): Promise<string> => {
      if (!address) throw new Error("Wallet not connected");

      const callsJson = serializeCalls(calls);

      // 1. Ward check — fetch on-chain ward config (returns null for non-ward accounts)
      const wardNeeds = await checkWardApprovalNeeds(address);
      if (wardNeeds && (wardNeeds.wardHas2fa || wardNeeds.needsGuardian)) {
        const wardResult = await requestWardApproval({
          wardAddress: address,
          guardianAddress: wardNeeds.guardianAddress,
          action: meta.action,
          token: meta.token || "STRK",
          amount: formatWardAmount(meta.amount || null, meta.token || "STRK", meta.action),
          recipient: meta.recipient || null,
          callsJson,
          wardSigJson: "[]",
          nonce: "",
          resourceBoundsJson: "{}",
          txHash: "",
          needsWard2fa: wardNeeds.wardHas2fa,
          needsGuardian: wardNeeds.needsGuardian,
          needsGuardian2fa: wardNeeds.guardianHas2fa,
        });
        if (wardResult.approved && wardResult.txHash) {
          return wardResult.txHash;
        }
        throw new Error(wardResult.error || "Ward approval failed");
      }

      // 2. 2FA check (only if not a ward — wards have their own 2FA pipeline)
      if (!wardNeeds) {
        const is2FA = await check2FAEnabled(address);
        if (is2FA) {
          const result = await request2FAApproval({
            walletAddress: address,
            action: meta.action,
            token: meta.token || "STRK",
            amount: meta.amount,
            recipient: meta.recipient,
            callsJson,
            sig1Json: "[]",
            nonce: "",
            resourceBoundsJson: "{}",
            txHash: "",
          });
          if (result.approved && result.txHash) {
            return result.txHash;
          }
          throw new Error(result.error || "Transaction not approved");
        }
      }

      // 3. Direct execution via connected wallet
      if (!account) throw new Error("Wallet not connected");
      const tx = await account.execute(calls);
      return tx.transaction_hash;
    },
    [account, address],
  );

  return { executeOrRoute };
}
