/**
 * useDualSigExecutor — Dual-sig execution for CloakAccount with 2FA.
 *
 * When 2FA is enabled, transactions must be signed with both the primary
 * and secondary keys. This hook wraps that flow:
 *   1. Biometric gate
 *   2. Load secondary private key
 *   3. Create DualKeySigner (signs with both keys)
 *   4. Estimate fee + execute with tip: 0
 */
import { useCallback } from "react";
import { Account, RpcProvider } from "starknet";
import { DEFAULT_RPC } from "@cloak-wallet/sdk";
import { useWallet } from "../lib/WalletContext";
import { useTwoFactor } from "../lib/TwoFactorContext";
import {
  DualKeySigner,
  getSecondaryPrivateKey,
  promptBiometric,
} from "../lib/twoFactor";

export function useDualSigExecutor() {
  const wallet = useWallet();
  const twoFactor = useTwoFactor();

  const executeDualSig = useCallback(
    async (calls: any[]): Promise<{ txHash: string }> => {
      if (!wallet.keys) throw new Error("No wallet");

      // 1. Biometric gate
      const authed = await promptBiometric("Authenticate transaction");
      if (!authed) throw new Error("Biometric authentication failed");

      // 2. Load secondary key
      const secondaryPk = await getSecondaryPrivateKey();
      if (!secondaryPk) throw new Error("Secondary key not found — re-enable 2FA");

      // 3. Create dual-sig account
      const dualSigner = new DualKeySigner(
        wallet.keys.starkPrivateKey,
        secondaryPk,
      );
      const provider = new RpcProvider({ nodeUrl: DEFAULT_RPC.sepolia });
      const account = new Account({
        provider,
        address: wallet.keys.starkAddress,
        signer: dualSigner,
      });

      // 4. Execute with tip: 0 (critical for pre-computed sig hash match)
      const nonce = await account.getNonce();
      const feeEstimate = await account.estimateInvokeFee(calls, { nonce });
      const tx = await account.execute(calls, {
        nonce,
        resourceBounds: feeEstimate.resourceBounds,
        tip: 0,
      });

      return { txHash: tx.transaction_hash };
    },
    [wallet.keys],
  );

  return { executeDualSig, is2FAEnabled: twoFactor.isEnabled };
}
