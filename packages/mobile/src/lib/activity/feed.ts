import {
  getActivityRecords,
  type ActivityRecord,
  type AmountUnit,
} from "@cloak-wallet/sdk";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getTxNotes, type TxMetadata } from "../storage";
import { getApiClient } from "../apiClient";
import { isMockMode } from "../../testing/runtimeConfig";

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
  executionId?: string;
  swap?: ActivityRecord["swap"] | null;
}

const ACTIVITY_CACHE_PREFIX = "cloak_activity_history_v1:";
const ACTIVITY_CACHE_TTL_MS = 60_000;

type ActivityCachePayload = {
  updatedAt: number;
  items: ActivityFeedItem[];
};

function activityCacheKey(walletAddress: string): string {
  return `${ACTIVITY_CACHE_PREFIX}${walletAddress.trim().toLowerCase()}`;
}

function sortByTimestampDesc(items: ActivityFeedItem[]): ActivityFeedItem[] {
  return [...items].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

async function saveActivityCache(
  walletAddress: string,
  items: ActivityFeedItem[],
): Promise<void> {
  try {
    const payload: ActivityCachePayload = {
      updatedAt: Date.now(),
      items: sortByTimestampDesc(items),
    };
    await AsyncStorage.setItem(
      activityCacheKey(walletAddress),
      JSON.stringify(payload),
    );
  } catch {
    // best-effort cache write
  }
}

async function readActivityCache(
  walletAddress: string,
): Promise<ActivityCachePayload | null> {
  try {
    const raw = await AsyncStorage.getItem(activityCacheKey(walletAddress));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as
      | ActivityCachePayload
      | ActivityFeedItem[]
      | null;

    // Backward compatibility: older cache shape may be a plain array.
    if (Array.isArray(parsed)) {
      return { updatedAt: 0, items: sortByTimestampDesc(parsed) };
    }

    if (!parsed || !Array.isArray(parsed.items)) return null;
    return {
      updatedAt: Number(parsed.updatedAt || 0),
      items: sortByTimestampDesc(parsed.items),
    };
  } catch {
    return null;
  }
}

export async function loadCachedActivityHistory(
  walletAddress: string,
  limit = 200,
): Promise<ActivityFeedItem[]> {
  const cache = await readActivityCache(walletAddress);
  if (!cache) return [];
  return cache.items.slice(0, Math.max(1, limit));
}

export async function isActivityCacheFresh(
  walletAddress: string,
  maxAgeMs = ACTIVITY_CACHE_TTL_MS,
): Promise<boolean> {
  const cache = await readActivityCache(walletAddress);
  if (!cache) return false;
  if (!cache.updatedAt) return false;
  return Date.now() - cache.updatedAt <= Math.max(1_000, maxAgeMs);
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
    executionId: row.swap?.execution_id || undefined,
    swap: row.swap ?? null,
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

function buildMockActivityFeed(now = Date.now()): ActivityFeedItem[] {
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const nowDate = new Date(now);
  const startToday = new Date(
    nowDate.getFullYear(),
    nowDate.getMonth(),
    nowDate.getDate(),
  ).getTime();
  const startYesterday = startToday - day;

  const pinToToday = (candidate: number): number => {
    const earliestToday = startToday + minute;
    return candidate < earliestToday ? earliestToday : candidate;
  };

  const pinToYesterday = (candidate: number): number => {
    const earliestYesterday = startYesterday + hour;
    const latestYesterday = startToday - minute;
    return Math.max(earliestYesterday, Math.min(candidate, latestYesterday));
  };

  return [
    {
      txHash: "0xmock_swap_strk_eth_1",
      source: "transaction",
      privacyLevel: "private",
      timestamp: pinToToday(now - 4 * minute),
      type: "swap",
      token: "STRK",
      amount: "12.00",
      amount_unit: "erc20_display",
      status: "pending",
      statusDetail: "Pending · route public->shielded · min 0.031 ETH",
      note: "Swap STRK -> ETH",
      swap: {
        provider: "AVNU",
        sell_token: "STRK",
        buy_token: "ETH",
        sell_amount_wei: "12000000000000000000",
        estimated_buy_amount_wei: "32000000000000000",
        min_buy_amount_wei: "31000000000000000",
        buy_actual_amount_wei: null,
      },
    },
    {
      txHash: "0xmock_fund_usdc_1",
      source: "transaction",
      privacyLevel: "private",
      timestamp: pinToToday(now - 15 * minute),
      type: "fund",
      token: "USDC",
      amount: "85.00",
      amount_unit: "erc20_display",
      status: "confirmed",
      statusDetail: "Public 420.50 USDC",
      note: "Shielded deposit (USDC)",
    },
    {
      txHash: "0xmock_approval_ward_1",
      source: "transaction",
      privacyLevel: "private",
      timestamp: pinToToday(now - 60 * minute),
      type: "approval",
      token: "STRK",
      amount: "25",
      amount_unit: "erc20_display",
      status: "confirmed",
      statusDetail: "Status: Confirmed",
      note: "Approval granted (ward spend)",
    },
    {
      txHash: "0xmock_withdraw_eth_1",
      source: "transaction",
      privacyLevel: "public",
      timestamp: pinToYesterday(now - 16 * hour),
      type: "withdraw",
      token: "ETH",
      amount: "0.200",
      amount_unit: "erc20_display",
      status: "confirmed",
      statusDetail: "to public wallet",
      note: "Unshielded 0.200 ETH",
    },
    {
      txHash: "0xmock_swap_eth_usdc_1",
      source: "transaction",
      privacyLevel: "private",
      timestamp: pinToYesterday(now - 18 * hour),
      type: "swap",
      token: "ETH",
      amount: "0.030",
      amount_unit: "erc20_display",
      status: "confirmed",
      statusDetail: "Confirmed · actual 79.8 USDC · min 79.2",
      note: "Swap ETH -> USDC",
      swap: {
        provider: "AVNU",
        sell_token: "ETH",
        buy_token: "USDC",
        sell_amount_wei: "30000000000000000",
        estimated_buy_amount_wei: "80000000",
        min_buy_amount_wei: "79200000",
        buy_actual_amount_wei: "79800000",
      },
    },
  ];
}

export async function loadActivityHistory(
  walletAddress: string,
  limit = 200,
  publicKey?: string,
): Promise<ActivityFeedItem[]> {
  try {
    const client = await getApiClient({ walletAddress, publicKey });
    const records = await getActivityRecords(walletAddress, limit, client);
    if (records.length > 0) {
      const items = records
        .map(activityToFeedItem)
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      await saveActivityCache(walletAddress, items);
      return items;
    }
  } catch {
    // fall through to local notes
  }

  const cached = await loadCachedActivityHistory(walletAddress, limit);
  if (cached.length > 0) return cached;

  const notes = await getTxNotes();
  const localItems = Object.values(notes || {})
    .filter(Boolean)
    .map((note) => localNoteToFeedItem(note as TxMetadata))
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  if (localItems.length > 0) {
    return localItems;
  }

  if (isMockMode()) {
    return buildMockActivityFeed()
      .slice(0, Math.max(1, limit))
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }

  return [];
}

export async function loadActivityByTxHash(
  walletAddress: string,
  txHash: string,
  publicKey?: string,
): Promise<ActivityFeedItem | null> {
  // 1. Check local notes first (instant, no network)
  try {
    const notes = await getTxNotes();
    const local = notes?.[txHash];
    if (local) return localNoteToFeedItem(local as TxMetadata);
  } catch {
    // fall through
  }

  // 2. Check cached activity history
  try {
    const cached = await loadCachedActivityHistory(walletAddress, 500);
    const match = cached.find((r) => r.txHash === txHash);
    if (match) return match;
  } catch {
    // fall through
  }

  // 3. Query API for recent activity and find by tx_hash
  try {
    const client = await getApiClient({ walletAddress, publicKey });
    const records = await getActivityRecords(walletAddress, 200, client);
    const match = records.find((r) => r.tx_hash === txHash);
    if (match) return activityToFeedItem(match);
  } catch {
    // fall through
  }

  // 4. Fallback: search mock data
  if (isMockMode()) {
    const mock = buildMockActivityFeed();
    return mock.find((row) => row.txHash === txHash) || null;
  }

  return null;
}
