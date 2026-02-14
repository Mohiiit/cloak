"use client";

import { useState, useCallback } from "react";
import { useTongo } from "~~/components/providers/TongoProvider";
import { useAccount } from "~~/hooks/useAccount";
import { useTransactionRouter } from "~~/hooks/useTransactionRouter";
import { padAddress } from "~~/lib/address";

interface UseTongoWithdrawReturn {
  withdraw: (tongoAmount: bigint) => Promise<string | null>;
  isPending: boolean;
  isSuccess: boolean;
  txHash: string | null;
  error: string | null;
  reset: () => void;
}

export function useTongoWithdraw(): UseTongoWithdrawReturn {
  const { tongoAccount } = useTongo();
  const { account, address } = useAccount();
  const { executeOrRoute } = useTransactionRouter();
  const [isPending, setIsPending] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const withdraw = useCallback(
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
        const withdrawOp = await tongoAccount.withdraw({
          amount: tongoAmount,
          to: padAddress(address),
          sender: padAddress(address),
        });

        const txHash = await executeOrRoute([withdrawOp.toCalldata()], {
          action: "withdraw",
          token: "STRK",
          amount: tongoAmount.toString(),
        });
        setTxHash(txHash);
        setIsSuccess(true);
        return txHash;
      } catch (err: any) {
        console.error("Withdraw failed:", err);
        setError(err?.message || "Failed to unshield funds");
        return null;
      } finally {
        setIsPending(false);
      }
    },
    [tongoAccount, account, address, executeOrRoute],
  );

  const reset = useCallback(() => {
    setIsPending(false);
    setIsSuccess(false);
    setTxHash(null);
    setError(null);
  }, []);

  return { withdraw, isPending, isSuccess, txHash, error, reset };
}
