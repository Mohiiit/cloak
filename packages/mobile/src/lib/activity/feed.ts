import {
  getActivityRecords,
  SupabaseLite,
  type ActivityRecord,
  type AmountUnit,
} from "@cloak-wallet/sdk";
import { getTxNotes, type TxMetadata } from "../storage";
import { getSupabaseConfig } from "../twoFactor";

export interface ActivityFeedItem {
  txHash: string;
  source?: "transaction" | "ward_request" | "local";
  recipient?: string;
  recipientName?: string;
  note?: string;
  privacyLevel: "public" | "friends" | "private";
  timestamp: number;
  type: TxMetadata["type"] | string;
  token: string;
  amount?: string;
  amount_unit?: AmountUnit | null;
  status?: string;
  statusDetail?: string;
  errorMessage?: string;
  accountType?: string;
  fee?: string;
  wardAddress?: string;
  walletAddress?: string;
}

function toTimestamp(value?: string): number {
  if (!value) return Date.now();
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : Date.now();
}

function activityToFeedItem(row: ActivityRecord): ActivityFeedItem {
  return {
    txHash: row.tx_hash || "",
    source: row.source,
    recipient: row.recipient || undefined,
    recipientName: row.recipient_name || undefined,
    note: row.note || undefined,
    privacyLevel: "private",
    timestamp: toTimestamp(row.created_at),
    type: row.type === "transfer" ? "send" : (row.type as any),
    token: row.token || "STRK",
    amount: row.amount || undefined,
    amount_unit: row.amount_unit || undefined,
    status: row.status,
    statusDetail: row.status_detail,
    errorMessage: row.error_message || undefined,
    accountType: row.account_type || undefined,
    fee: row.fee || undefined,
    wardAddress: row.ward_address || undefined,
    walletAddress: row.wallet_address || undefined,
  };
}

function localNoteToFeedItem(note: TxMetadata): ActivityFeedItem {
  return {
    txHash: note.txHash,
    source: "local",
    recipient: note.recipient,
    recipientName: note.recipientName,
    note: note.note,
    privacyLevel: note.privacyLevel,
    timestamp: note.timestamp,
    type: note.type,
    token: note.token,
    amount: note.amount,
  };
}

export async function loadActivityHistory(
  walletAddress: string,
  limit = 200,
): Promise<ActivityFeedItem[]> {
  try {
    const { url, key } = await getSupabaseConfig();
    const sb = new SupabaseLite(url, key);
    const records = await getActivityRecords(walletAddress, limit, sb);
    if (records.length > 0) {
      return records
        .map(activityToFeedItem)
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    }
  } catch {
    // fall through to local notes
  }

  const notes = await getTxNotes();
  return Object.values(notes || {})
    .filter(Boolean)
    .map((note) => localNoteToFeedItem(note as TxMetadata))
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

export async function loadActivityByTxHash(
  walletAddress: string,
  txHash: string,
): Promise<ActivityFeedItem | null> {
  const rows = await loadActivityHistory(walletAddress, 500);
  return rows.find((row) => row.txHash === txHash) || null;
}
