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
import { requestWardApproval } from "~~/lib/ward-approval";
import {
  check2FAEnabled,
  request2FAApproval,
} from "~~/lib/two-factor";
import {
  serializeCalls,
  formatWardAmount,
  type CanonicalAmount,
} from "@cloak-wallet/sdk";
import type { AmountUnit } from "@cloak-wallet/sdk";
import { getWebRuntime } from "~~/lib/runtime";

interface TransactionMeta {
  action: string;
  token?: string;
  amount?: string;
  recipient?: string;
}

/** Determine the correct amount_unit based on the action type. */
function getAmountUnit(action: string): AmountUnit {
  if (action === "erc20_transfer") return "erc20_display";
  // All shielded operations store amounts in tongo units
  return "tongo_units";
}

function toCanonicalAmount(
  amount: string | undefined,
  action: string,
): CanonicalAmount | null {
  if (!amount) return null;
  return { value: amount, unit: getAmountUnit(action) };
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

      const runtime = getWebRuntime();
      const callsJson = serializeCalls(calls);
      const token = meta.token || "STRK";
      const amount = meta.amount;
      const recipient = meta.recipient || null;

      const isWard = await runtime.ward.checkIfWardAccount(address);
      if (isWard) {
        const routed = await runtime.router.execute({
          walletAddress: address,
          wardAddress: address,
          calls,
          meta: {
            type: (meta.action || "transfer") as any,
            token,
            amount: toCanonicalAmount(amount, meta.action),
            recipient,
            network: "sepolia",
            platform: "web",
          },
          executeDirect: async () => {
            if (!account) throw new Error("Wallet not connected");
            const tx = await account.execute(calls);
            return { txHash: tx.transaction_hash };
          },
          executeWardApproval: async (decision, snapshot) => {
            return requestWardApproval({
              wardAddress: address,
              guardianAddress: snapshot.guardianAddress,
              action: meta.action,
              token,
              amount: formatWardAmount(amount || null, token, meta.action),
              recipient,
              callsJson,
              wardSigJson: "[]",
              nonce: "",
              resourceBoundsJson: "{}",
              txHash: "",
              needsWard2fa: decision.needsWard2fa,
              needsGuardian: decision.needsGuardian,
              needsGuardian2fa: decision.needsGuardian2fa,
            });
          },
        });
        return routed.txHash;
      }

      const is2FA = await check2FAEnabled(address);
      const routed = await runtime.router.execute({
        walletAddress: address,
        calls,
        is2FAEnabled: is2FA,
        meta: {
          type: (meta.action || "transfer") as any,
          token,
          amount: toCanonicalAmount(amount, meta.action),
          recipient,
          network: "sepolia",
          platform: "web",
          directAccountType: "normal",
        },
        executeDirect: async () => {
          if (!account) throw new Error("Wallet not connected");
          const tx = await account.execute(calls);
          return { txHash: tx.transaction_hash };
        },
        execute2FA: async () => {
          return request2FAApproval({
            walletAddress: address,
            action: meta.action,
            token,
            amount,
            recipient: recipient || undefined,
            callsJson,
            sig1Json: "[]",
            nonce: "",
            resourceBoundsJson: "{}",
            txHash: "",
          });
        },
      });
      return routed.txHash;
    },
    [account, address],
  );

  return { executeOrRoute };
}
