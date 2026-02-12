import { useState, useCallback, useEffect } from "react";
import { sendMessage } from "@/shared/messages";
import { getTxNotes, type TxMetadata } from "../lib/storage";

export interface TxEvent {
  txHash: string;
  type: string;
  amount?: string;
  to?: string;
  from?: string;
  note?: string;
  recipientName?: string;
  timestamp?: number;
  token?: string;
}

export function useTxHistory() {
  const [events, setEvents] = useState<TxEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const history = await sendMessage({ type: "GET_TX_HISTORY", fromNonce: 0 });
      const notes = await getTxNotes();

      const enriched: TxEvent[] = (history || []).map((event: any) => {
        const txHash = event.txHash || event.transaction_hash || "";
        const meta = notes[txHash];
        return {
          txHash,
          type: event.type || meta?.type || "unknown",
          amount: event.amount,
          to: event.to,
          from: event.from,
          note: meta?.note,
          recipientName: meta?.recipientName,
          timestamp: meta?.timestamp || event.timestamp,
          token: meta?.token,
        };
      });

      enriched.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setEvents(enriched);
    } catch (err: any) {
      setError(err?.message || "Failed to fetch history");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { events, isLoading, error, refresh };
}
