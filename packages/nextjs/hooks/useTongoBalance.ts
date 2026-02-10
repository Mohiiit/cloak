"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTongo } from "~~/components/providers/TongoProvider";
import { TOKENS } from "~~/lib/tokens";
import { formatTokenAmount } from "~~/lib/tokens";
import { BALANCE_POLL_INTERVAL } from "~~/lib/constants";

interface TongoBalanceState {
  /** Shielded balance in Tongo units */
  balance: bigint;
  /** Pending incoming in Tongo units */
  pending: bigint;
  /** Account nonce */
  nonce: bigint;
  /** Human-readable shielded balance */
  shieldedDisplay: string;
  /** Human-readable pending balance */
  pendingDisplay: string;
  /** ERC20 value of shielded balance */
  shieldedErc20: bigint;
  /** ERC20 value of pending balance */
  pendingErc20: bigint;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useTongoBalance(): TongoBalanceState {
  const { tongoAccount, isInitialized, selectedToken } = useTongo();
  const [balance, setBalance] = useState(0n);
  const [pending, setPending] = useState(0n);
  const [nonce, setNonce] = useState(0n);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const tokenConfig = TOKENS[selectedToken];

  const fetchState = useCallback(async () => {
    if (!tongoAccount || !isInitialized) return;

    setIsLoading(true);
    setError(null);

    try {
      const state = await tongoAccount.state();
      setBalance(BigInt(state.balance));
      setPending(BigInt(state.pending));
      setNonce(BigInt(state.nonce));
    } catch (err: any) {
      console.error("Failed to fetch Tongo state:", err);
      setError(err?.message || "Failed to fetch balance");
    } finally {
      setIsLoading(false);
    }
  }, [tongoAccount, isInitialized]);

  // Initial fetch + polling
  useEffect(() => {
    fetchState();

    intervalRef.current = setInterval(fetchState, BALANCE_POLL_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchState]);

  // Convert Tongo units to ERC20 amounts for display
  const shieldedErc20 = balance * tokenConfig.rate;
  const pendingErc20 = pending * tokenConfig.rate;

  return {
    balance,
    pending,
    nonce,
    shieldedDisplay: formatTokenAmount(
      shieldedErc20,
      tokenConfig.decimals,
    ),
    pendingDisplay: formatTokenAmount(pendingErc20, tokenConfig.decimals),
    shieldedErc20,
    pendingErc20,
    isLoading,
    error,
    refresh: fetchState,
  };
}
