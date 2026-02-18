"use client";

import { useState, useEffect, useCallback } from "react";
import { getTransactions, type TransactionRecord } from "@cloak-wallet/sdk";
import { useAccount } from "~~/hooks/useAccount";
import { getTxNotes, type TxMetadata } from "~~/lib/storage";

export interface TongoEvent {
  txHash: string;
  type: "fund" | "transferIn" | "transferOut" | "withdraw" | "rollover" | "ragequit" | string;
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
  // Supabase fields
  status?: string;
  errorMessage?: string;
  accountType?: string;
  fee?: string;
}

interface UseTongoHistoryReturn {
  events: TongoEvent[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

function recordToEvent(r: TransactionRecord): TongoEvent {
  let type: string = r.type;
  if (type === "transfer") type = "transferOut";
  return {
    txHash: r.tx_hash,
    type,
    amount: r.amount ? BigInt(r.amount) : undefined,
    to: r.recipient || undefined,
    note: r.note || undefined,
    counterpartyName: r.recipient_name || undefined,
    timestamp: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
    token: r.token || "STRK",
    status: r.status,
    errorMessage: r.error_message || undefined,
    accountType: r.account_type || undefined,
    fee: r.fee || undefined,
  };
}

export function useTongoHistory(): UseTongoHistoryReturn {
  const { address } = useAccount();
  const [events, setEvents] = useState<TongoEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!address) return;

    setIsLoading(true);
    setError(null);

    try {
      // Primary: Supabase
      const records = await getTransactions(address);
      if (records.length > 0) {
        setEvents(records.map(recordToEvent));
        return;
      }
    } catch {
      // Fall through to local fallback
    }
    try {
      // Fallback: local storage notes
      const localNotes = getTxNotes();
      const local: TongoEvent[] = Object.values(localNotes || {})
        .filter(Boolean)
        .map((m: TxMetadata) => ({
          txHash: m.txHash,
          type: m.type === "send" ? "transferOut" : m.type || "fund",
          note: m.note,
          privacyLevel: m.privacyLevel,
          counterpartyName: m.recipientName,
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
  }, [address]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { events, isLoading, error, refresh: fetchHistory };
}
