"use client";

import { useState, useCallback } from "react";
import { useTongo } from "~~/components/providers/TongoProvider";
import { useAccount } from "~~/hooks/useAccount";
import { padAddress } from "~~/lib/address";

interface UseTongoFundReturn {
  fund: (tongoAmount: bigint) => Promise<string | null>;
  isPending: boolean;
  isSuccess: boolean;
  txHash: string | null;
  error: string | null;
  reset: () => void;
}

export function useTongoFund(): UseTongoFundReturn {
  const { tongoAccount } = useTongo();
  const { account, address } = useAccount();
  const [isPending, setIsPending] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fund = useCallback(
    async (tongoAmount: bigint): Promise<string | null> => {
      if (!tongoAccount || !account || !address) {
        setError("Wallet not connected");
        return null;
      }

      setIsPending(true);
      setIsSuccess(false);
      setTxHash(null);
      setError(null);

      try {
        const fundOp = await tongoAccount.fund({
          amount: tongoAmount,
          sender: padAddress(address),
        });

        const calls = [];
        if (fundOp.approve) {
          calls.push(fundOp.approve);
        }
        calls.push(fundOp.toCalldata());

        const tx = await account.execute(calls);
        setTxHash(tx.transaction_hash);
        setIsSuccess(true);
        return tx.transaction_hash;
      } catch (err: any) {
        console.error("Fund failed:", err);
        setError(err?.message || "Failed to shield funds");
        return null;
      } finally {
        setIsPending(false);
      }
    },
    [tongoAccount, account, address],
  );

  const reset = useCallback(() => {
    setIsPending(false);
    setIsSuccess(false);
    setTxHash(null);
    setError(null);
  }, []);

  return { fund, isPending, isSuccess, txHash, error, reset };
}
