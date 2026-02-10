"use client";

import { useState, useEffect, useCallback } from "react";
import { useTongo } from "~~/components/providers/TongoProvider";
import { getTxNotes, type TxMetadata } from "~~/lib/storage";

export interface TongoEvent {
  txHash: string;
  type: "fund" | "transferIn" | "transferOut" | "withdraw" | "rollover" | "ragequit";
  blockNumber?: number;
  nonce?: number;
  amount?: bigint;
  to?: string;
  from?: string;
  // Enriched from local storage
  note?: string;
  privacyLevel?: string;
  counterpartyName?: string;
  timestamp?: number;
  token?: string;
}

interface UseTongoHistoryReturn {
  events: TongoEvent[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useTongoHistory(): UseTongoHistoryReturn {
  const { tongoAccount, isInitialized } = useTongo();
  const [events, setEvents] = useState<TongoEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!tongoAccount || !isInitialized) return;

    setIsLoading(true);
    setError(null);

    try {
      const history = await tongoAccount.getTxHistory(0);
      const localNotes = getTxNotes();

      const enriched: TongoEvent[] = (history || []).map((event: any) => {
        const txHash = event.txHash || event.transaction_hash || "";
        const localMeta = localNotes[txHash];

        return {
          txHash,
          type: event.type || "fund",
          blockNumber: event.blockNumber,
          nonce: event.nonce,
          amount: event.amount ? BigInt(event.amount) : undefined,
          to: event.to,
          from: event.from,
          note: localMeta?.note,
          privacyLevel: localMeta?.privacyLevel,
          counterpartyName: localMeta?.recipientName || localMeta?.senderName,
          timestamp: localMeta?.timestamp || event.timestamp,
          token: localMeta?.token,
        };
      });

      // Sort by most recent first
      enriched.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setEvents(enriched);
    } catch (err: any) {
      console.error("Failed to fetch history:", err);
      setError(err?.message || "Failed to fetch transaction history");
    } finally {
      setIsLoading(false);
    }
  }, [tongoAccount, isInitialized]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { events, isLoading, error, refresh: fetchHistory };
}
