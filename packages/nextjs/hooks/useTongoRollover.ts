"use client";

import { useState, useCallback } from "react";
import { useTongo } from "~~/components/providers/TongoProvider";
import { useAccount } from "~~/hooks/useAccount";
import { useTransactionRouter } from "~~/hooks/useTransactionRouter";
import { padAddress } from "~~/lib/address";

interface UseTongoRolloverReturn {
  rollover: () => Promise<string | null>;
  isPending: boolean;
  isSuccess: boolean;
  txHash: string | null;
  error: string | null;
  reset: () => void;
}

export function useTongoRollover(): UseTongoRolloverReturn {
  const { tongoAccount } = useTongo();
  const { account, address } = useAccount();
  const { executeOrRoute } = useTransactionRouter();
  const [isPending, setIsPending] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rollover = useCallback(async (): Promise<string | null> => {
    if (!tongoAccount || !account || !address) {
      setError("Wallet not connected");
      return null;
    }

    setIsPending(true);
    setIsSuccess(false);
    setTxHash(null);
    setError(null);

    try {
      const rolloverOp = await tongoAccount.rollover({
        sender: padAddress(address),
      });

      const txHash = await executeOrRoute([rolloverOp.toCalldata()], {
        action: "rollover",
        token: "STRK",
      });
      setTxHash(txHash);
      setIsSuccess(true);
      return txHash;
    } catch (err: any) {
      console.error("Rollover failed:", err);
      setError(err?.message || "Failed to claim pending funds");
      return null;
    } finally {
      setIsPending(false);
    }
  }, [tongoAccount, account, address, executeOrRoute]);

  const reset = useCallback(() => {
    setIsPending(false);
    setIsSuccess(false);
    setTxHash(null);
    setError(null);
  }, []);

  return { rollover, isPending, isSuccess, txHash, error, reset };
}
