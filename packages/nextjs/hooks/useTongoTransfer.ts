"use client";

import { useState, useCallback } from "react";
import { useTongo } from "~~/components/providers/TongoProvider";
import { useAccount } from "~~/hooks/useAccount";
import { useTransactionRouter } from "~~/hooks/useTransactionRouter";
import { padAddress } from "~~/lib/address";

interface UseTongoTransferReturn {
  transfer: (
    recipientTongoAddress: string,
    tongoAmount: bigint,
  ) => Promise<string | null>;
  isPending: boolean;
  isSuccess: boolean;
  txHash: string | null;
  error: string | null;
  reset: () => void;
}

export function useTongoTransfer(): UseTongoTransferReturn {
  const { tongoAccount } = useTongo();
  const { account, address } = useAccount();
  const { executeOrRoute } = useTransactionRouter();
  const [isPending, setIsPending] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const transfer = useCallback(
    async (
      recipientTongoAddress: string,
      tongoAmount: bigint,
    ): Promise<string | null> => {
      if (!tongoAccount || !account || !address) {
        setError("Wallet not connected");
        return null;
      }

      setIsPending(true);
      setIsSuccess(false);
      setTxHash(null);
      setError(null);

      try {
        // Import dynamically to avoid SSR issues
        const { pubKeyBase58ToAffine } = await import(
          "@fatsolutions/tongo-sdk"
        );
        const recipientPubKey = pubKeyBase58ToAffine(recipientTongoAddress);

        const transferOp = await tongoAccount.transfer({
          amount: tongoAmount,
          to: recipientPubKey,
          sender: padAddress(address),
        });

        const txHash = await executeOrRoute([transferOp.toCalldata()], {
          action: "transfer",
          token: "STRK",
          amount: tongoAmount.toString(),
          recipient: recipientTongoAddress,
        });
        setTxHash(txHash);
        setIsSuccess(true);
        return txHash;
      } catch (err: any) {
        console.error("Transfer failed:", err);
        setError(err?.message || "Failed to transfer");
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

  return { transfer, isPending, isSuccess, txHash, error, reset };
}
