import { useState, useEffect, useCallback } from "react";
import { sendMessage } from "@/shared/messages";
import type { TokenKey, WalletInfo } from "@cloak-wallet/sdk";

export interface ShieldedBalances {
  balance: bigint;
  pending: bigint;
  nonce: bigint;
}

export function useExtensionWallet() {
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedToken, setSelectedToken] = useState<TokenKey>("STRK");
  const [balances, setBalances] = useState<ShieldedBalances>({ balance: 0n, pending: 0n, nonce: 0n });
  const [erc20Balance, setErc20Balance] = useState<bigint>(0n);
  const [isDeployed, setIsDeployed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if wallet exists on mount
  useEffect(() => {
    loadWallet();
  }, []);

  const loadWallet = useCallback(async () => {
    try {
      setLoading(true);
      const hasWallet = await sendMessage({ type: "HAS_WALLET" });
      if (hasWallet) {
        const w = await sendMessage({ type: "GET_WALLET" });
        setWallet(w);
        let deployed = await sendMessage({ type: "IS_DEPLOYED" });
        // Ward accounts are deployed by their guardian — check on-chain
        if (!deployed) {
          const isWard = await sendMessage({ type: "CHECK_WARD" });
          if (isWard) deployed = true;
        }
        setIsDeployed(deployed);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const createWallet = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const w = await sendMessage({ type: "CREATE_WALLET" });
      setWallet(w);
      return w;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const importWallet = useCallback(async (privateKey: string, address?: string) => {
    try {
      setLoading(true);
      setError(null);
      const w = await sendMessage({ type: "IMPORT_WALLET", privateKey, address });
      setWallet(w);
      // Check deployment status after import
      let deployed = await sendMessage({ type: "IS_DEPLOYED" });
      // Ward accounts are deployed by their guardian — check on-chain
      if (!deployed) {
        const isWard = await sendMessage({ type: "CHECK_WARD" });
        if (isWard) deployed = true;
      }
      setIsDeployed(deployed);
      return w;
    } catch (err: any) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearWallet = useCallback(async () => {
    await sendMessage({ type: "CLEAR_WALLET" });
    setWallet(null);
    setIsDeployed(false);
    setBalances({ balance: 0n, pending: 0n, nonce: 0n });
    setErc20Balance(0n);
  }, []);

  const deployAccount = useCallback(async () => {
    try {
      setError(null);
      const txHash = await sendMessage({ type: "DEPLOY_ACCOUNT" });
      setIsDeployed(true);
      return txHash;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }, []);

  const refreshBalances = useCallback(async () => {
    if (!wallet) return;
    try {
      const [state, erc20] = await Promise.all([
        sendMessage({ type: "GET_STATE", token: selectedToken }),
        sendMessage({ type: "GET_ERC20_BALANCE", token: selectedToken }),
      ]);
      setBalances({
        balance: BigInt(state.balance),
        pending: BigInt(state.pending),
        nonce: BigInt(state.nonce),
      });
      setErc20Balance(BigInt(erc20));
    } catch (err: any) {
      setError(err.message);
    }
  }, [wallet, selectedToken]);

  // Refresh balances when token changes
  useEffect(() => {
    if (wallet && isDeployed) {
      refreshBalances();
    }
  }, [wallet, selectedToken, isDeployed, refreshBalances]);

  const fund = useCallback(
    async (amount: bigint) => {
      try {
        setError(null);
        const result = await sendMessage({ type: "FUND", token: selectedToken, amount: amount.toString() });
        await refreshBalances();
        return result.txHash;
      } catch (err: any) {
        setError(err.message);
        return null;
      }
    },
    [selectedToken, refreshBalances],
  );

  const transfer = useCallback(
    async (to: string, amount: bigint) => {
      try {
        setError(null);
        const result = await sendMessage({ type: "TRANSFER", token: selectedToken, to, amount: amount.toString() });
        await refreshBalances();
        return result.txHash;
      } catch (err: any) {
        setError(err.message);
        return null;
      }
    },
    [selectedToken, refreshBalances],
  );

  const withdraw = useCallback(
    async (amount: bigint) => {
      try {
        setError(null);
        const result = await sendMessage({ type: "WITHDRAW", token: selectedToken, amount: amount.toString() });
        await refreshBalances();
        return result.txHash;
      } catch (err: any) {
        setError(err.message);
        return null;
      }
    },
    [selectedToken, refreshBalances],
  );

  const rollover = useCallback(async () => {
    try {
      setError(null);
      const result = await sendMessage({ type: "ROLLOVER", token: selectedToken });
      await refreshBalances();
      return result.txHash;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }, [selectedToken, refreshBalances]);

  return {
    wallet,
    loading,
    error,
    selectedToken,
    setSelectedToken,
    balances,
    erc20Balance,
    isDeployed,
    createWallet,
    importWallet,
    clearWallet,
    deployAccount,
    refreshBalances,
    fund,
    transfer,
    withdraw,
    rollover,
    setError,
  };
}
