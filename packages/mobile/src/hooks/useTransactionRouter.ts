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
import { Account, RpcProvider, CallData, uint256 } from "starknet";
import {
  createCloakRuntime,
  SupabaseLite,
  DEFAULT_RPC,
  TOKENS,
  parseTokenAmount,
  type AmountUnit,
} from "@cloak-wallet/sdk";
import { useWallet } from "../lib/WalletContext";
import { useWardContext } from "../lib/wardContext";
import { useDualSigExecutor } from "./useDualSigExecutor";
import { setTransactionRouterPath } from "../testing/transactionRouteTrace";
import { getSupabaseConfig } from "../lib/twoFactor";

type Action = "fund" | "transfer" | "withdraw" | "rollover" | "erc20_transfer";

interface ExecuteParams {
  action: Action;
  token: string;
  amount?: string;
  recipient?: string;
  recipientName?: string;
  note?: string;
}

function getAmountUnit(action: Action): AmountUnit {
  return action === "erc20_transfer" ? "erc20_display" : "tongo_units";
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
        case "erc20_transfer": {
          const cfg = TOKENS[wallet.selectedToken];
          const amountWei = parseTokenAmount(amount!, cfg.decimals);
          const call = {
            contractAddress: cfg.erc20Address,
            entrypoint: "transfer",
            calldata: CallData.compile({
              recipient: recipient!,
              amount: uint256.bnToUint256(amountWei),
            }),
          };
          return { calls: [call] };
        }
      }
    },
    [wallet],
  );

  const buildRuntime = useCallback(async () => {
    const { url, key } = await getSupabaseConfig();
    return createCloakRuntime({
      network: "sepolia",
      provider: new RpcProvider({ nodeUrl: DEFAULT_RPC.sepolia }),
      supabase: new SupabaseLite(url, key),
    });
  }, []);

  const execute = useCallback(
    async (params: ExecuteParams): Promise<{ txHash: string }> => {
      const { action, token, amount, recipient } = params;
      const walletAddress = wallet.keys?.starkAddress;
      if (!walletAddress) throw new Error("No wallet connected");
      const { calls } = await prepareCalls(action, amount, recipient);
      const runtime = await buildRuntime();

      const directExecutor = async (): Promise<{ txHash: string }> => {
        switch (action) {
          case "fund":
            return wallet.fund(amount!);
          case "transfer":
            return wallet.transfer(amount!, recipient!);
          case "withdraw":
            return wallet.withdraw(amount!);
          case "rollover":
            return wallet.rollover();
          case "erc20_transfer": {
            const provider = new RpcProvider({ nodeUrl: DEFAULT_RPC.sepolia });
            const account = new Account({
              provider,
              address: wallet.keys!.starkAddress,
              signer: wallet.keys!.starkPrivateKey,
            } as any);
            const nonce = await account.getNonce();
            const feeEstimate = await account.estimateInvokeFee(calls, { nonce });
            const tx = await account.execute(calls, {
              nonce,
              resourceBounds: feeEstimate.resourceBounds,
            });
            return { txHash: tx.transaction_hash };
          }
        }
      };

      // 1. Ward path — insert Supabase request + poll for guardian approval
      if (ward.isWard) {
        const routed = await runtime.router.execute({
          walletAddress,
          wardAddress: walletAddress,
          calls,
          meta: {
            type: action as any,
            token,
            amount: amount ? { value: amount, unit: getAmountUnit(action) } : null,
            recipient: recipient || null,
            recipientName: params.recipientName || null,
            note: params.note || null,
            network: "sepolia",
            platform: "mobile",
          },
          executeDirect: async () => {
            setTransactionRouterPath("ward");
            return directExecutor();
          },
          executeWardApproval: async (decision, snapshot) => {
            setTransactionRouterPath(decision.needsWard2fa ? "ward+2fa" : "ward");
            return ward.initiateWardTransaction({
              action,
              token,
              amount,
              recipient,
              calls,
              policyOverride: {
                guardianAddress: snapshot.guardianAddress,
                needsWard2fa: decision.needsWard2fa,
                needsGuardian: decision.needsGuardian,
                needsGuardian2fa: decision.needsGuardian2fa,
              },
            });
          },
        });
        return { txHash: routed.txHash };
      }

      // 2. 2FA path — biometric gate + dual-key signing
      const routed = await runtime.router.execute({
        walletAddress,
        calls,
        is2FAEnabled,
        meta: {
          type: action as any,
          token,
          amount: amount ? { value: amount, unit: getAmountUnit(action) } : null,
          recipient: recipient || null,
          recipientName: params.recipientName || null,
          note: params.note || null,
          network: "sepolia",
          platform: "mobile",
          directAccountType: "normal",
        },
        executeDirect: async () => {
          setTransactionRouterPath("direct");
          return directExecutor();
        },
        execute2FA: async () => {
          setTransactionRouterPath("2fa");
          const result = await executeDualSig(calls);
          return { approved: true, txHash: result.txHash };
        },
      });

      return { txHash: routed.txHash };
    },
    [wallet, ward, prepareCalls, buildRuntime, executeDualSig, is2FAEnabled],
  );

  return { execute };
}
