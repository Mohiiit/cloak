import { useState, useCallback, useEffect } from "react";
import {
  getActivityRecords,
  type ActivityRecord,
  type ActivitySource,
} from "@cloak-wallet/sdk";
import { getTxNotes, type TxMetadata } from "../lib/storage";
import { getApiClient } from "@/shared/api-config";

export interface TxEvent {
  txHash: string;
  source?: ActivitySource | "local";
  type: string;
  amount?: string;
  amount_unit?: string;
  to?: string;
  from?: string;
  note?: string;
  recipientName?: string;
  timestamp?: number;
  token?: string;
  status?: string;
  statusDetail?: string;
  errorMessage?: string;
  accountType?: string;
  wardAddress?: string;
  walletAddress?: string;
  fee?: string;
}

function recordToEvent(r: ActivityRecord): TxEvent {
  return {
    txHash: r.tx_hash,
    source: r.source,
    type: r.type === "transfer" ? "send" : r.type,
    amount: r.amount || undefined,
    amount_unit: r.amount_unit || undefined,
    to: r.recipient || undefined,
    note: r.note || undefined,
    recipientName: r.recipient_name || undefined,
    timestamp: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
    token: r.token || "STRK",
    status: r.status,
    statusDetail: r.status_detail || undefined,
    errorMessage: r.error_message || undefined,
    accountType: r.account_type || undefined,
    wardAddress: r.ward_address || undefined,
    walletAddress: r.wallet_address || undefined,
    fee: r.fee || undefined,
  };
}

export function useTxHistory(walletAddress?: string) {
  const [events, setEvents] = useState<TxEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!walletAddress) return;
    setIsLoading(true);
    setError(null);
    try {
      // Primary: API-backed unified activity feed
      const client = await getApiClient();
      const records = await getActivityRecords(walletAddress, 200, client);
      if (records.length > 0) {
        setEvents(records.map(recordToEvent));
        setIsLoading(false);
        return;
      }
    } catch {
      // Fall through to local fallback
    }
    try {
      // Fallback: local storage notes
      const notes = await getTxNotes();
      const local: TxEvent[] = Object.values(notes || {})
        .filter(Boolean)
        .map((m: TxMetadata) => ({
          txHash: m.txHash,
          type: m.type || "unknown",
          amount: m.amount,
          note: m.note,
          recipientName: m.recipientName,
          timestamp: m.timestamp,
          token: m.token,
        }))
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      setEvents(local);
    } catch {
      // Silenced
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => { refresh(); }, [refresh]);

  return { events, isLoading, error, refresh };
}
