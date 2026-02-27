import {
  getActivityRecords,
  type ActivityRecord,
  type AmountUnit,
  type AgentHireResponse,
  type AgentRunResponse,
} from '@cloak-wallet/sdk';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTxNotes, type TxMetadata } from '../storage';
import { getApiClient } from '../apiClient';
import {
  listMarketplaceHires,
  listMarketplaceRuns,
  listMarketplaceDelegations,
} from '../marketplaceApi';
import { isMockMode } from '../../testing/runtimeConfig';

export interface ActivityFeedItem {
  txHash: string;
  source?: 'transaction' | 'ward_request' | 'agent_run' | 'local';
  recipient?: string;
  recipientName?: string;
  note?: string;
  privacyLevel: 'public' | 'friends' | 'private';
  timestamp: number;
  type: TxMetadata['type'] | string;
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
  agentRun?: ActivityRecord['agent_run'] | null;
  swap?: ActivityRecord['swap'] | null;
  _fullRun?: AgentRunResponse;
}

type LoadActivityByTxHashOptions = {
  network?: boolean;
  limit?: number;
};

const ACTIVITY_CACHE_PREFIX = 'cloak_activity_history_v1:';
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
    txHash: row.tx_hash || '',
    source: row.source,
    recipient: row.recipient || undefined,
    recipientName: row.recipient_name || undefined,
    note: row.note || undefined,
    privacyLevel: 'private',
    timestamp: toTimestamp(row.created_at),
    type: row.type === 'transfer' ? 'send' : (row.type as any),
    token: row.token || 'STRK',
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
    agentRun: row.agent_run ?? null,
    swap: row.swap ?? null,
  };
}

function localNoteToFeedItem(note: TxMetadata): ActivityFeedItem {
  return {
    txHash: note.txHash,
    source: 'local',
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

function mergeLocalNoteWithRemote(
  remote: ActivityFeedItem,
  local?: ActivityFeedItem | null,
): ActivityFeedItem {
  if (!local) return remote;
  return {
    ...remote,
    // Keep locally-authored metadata only when backend doesn't have a value.
    recipient: remote.recipient || local.recipient,
    recipientName: remote.recipientName || local.recipientName,
    note: remote.note || local.note,
    // Preserve local privacy hint for UI semantics.
    privacyLevel: local.privacyLevel || remote.privacyLevel,
    // Backfill sparse backend rows from local cache when needed.
    amount: remote.amount ?? local.amount,
    token: remote.token || local.token,
    type: remote.type || local.type,
    timestamp: remote.timestamp || local.timestamp,
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
      txHash: '0xmock_swap_strk_eth_1',
      source: 'transaction',
      privacyLevel: 'private',
      timestamp: pinToToday(now - 4 * minute),
      type: 'swap',
      token: 'STRK',
      amount: '12.00',
      amount_unit: 'erc20_display',
      status: 'pending',
      statusDetail: 'Pending · route public->shielded · min 0.031 ETH',
      note: 'Swap STRK -> ETH',
      swap: {
        provider: 'AVNU',
        sell_token: 'STRK',
        buy_token: 'ETH',
        sell_amount_wei: '12000000000000000000',
        estimated_buy_amount_wei: '32000000000000000',
        min_buy_amount_wei: '31000000000000000',
        buy_actual_amount_wei: null,
      },
    },
    {
      txHash: '0xmock_fund_usdc_1',
      source: 'transaction',
      privacyLevel: 'private',
      timestamp: pinToToday(now - 15 * minute),
      type: 'fund',
      token: 'USDC',
      amount: '85.00',
      amount_unit: 'erc20_display',
      status: 'confirmed',
      statusDetail: 'Public 420.50 USDC',
      note: 'Shielded deposit (USDC)',
    },
    {
      txHash: '0xmock_approval_ward_1',
      source: 'transaction',
      privacyLevel: 'private',
      timestamp: pinToToday(now - 60 * minute),
      type: 'approval',
      token: 'STRK',
      amount: '25',
      amount_unit: 'erc20_display',
      status: 'confirmed',
      statusDetail: 'Status: Confirmed',
      note: 'Approval granted (ward spend)',
    },
    {
      txHash: '0xmock_withdraw_eth_1',
      source: 'transaction',
      privacyLevel: 'public',
      timestamp: pinToYesterday(now - 16 * hour),
      type: 'withdraw',
      token: 'ETH',
      amount: '0.200',
      amount_unit: 'erc20_display',
      status: 'confirmed',
      statusDetail: 'to public wallet',
      note: 'Unshielded 0.200 ETH',
    },
    {
      txHash: '0xmock_swap_eth_usdc_1',
      source: 'transaction',
      privacyLevel: 'private',
      timestamp: pinToYesterday(now - 18 * hour),
      type: 'swap',
      token: 'ETH',
      amount: '0.030',
      amount_unit: 'erc20_display',
      status: 'confirmed',
      statusDetail: 'Confirmed · actual 79.8 USDC · min 79.2',
      note: 'Swap ETH -> USDC',
      swap: {
        provider: 'AVNU',
        sell_token: 'ETH',
        buy_token: 'USDC',
        sell_amount_wei: '30000000000000000',
        estimated_buy_amount_wei: '80000000',
        min_buy_amount_wei: '79200000',
        buy_actual_amount_wei: '79800000',
      },
    },
  ];
}

function hireToFeedItem(hire: AgentHireResponse): ActivityFeedItem {
  return {
    txHash: hire.id,
    source: 'agent_run',
    privacyLevel: 'private',
    timestamp: toTimestamp(hire.created_at),
    type: 'agent_hire',
    token: 'STRK',
    status: hire.status === 'active' ? 'confirmed' : hire.status,
    note: `Hired agent ${hire.agent_id}`,
    walletAddress: hire.operator_wallet || undefined,
  };
}

function prettyAgentAction(action: string | undefined): string {
  if (!action) return 'Agent Run';
  const clean = action.replace(/^agent_/, '');
  return clean
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function runToFeedItem(run: AgentRunResponse): ActivityFeedItem {
  const action = prettyAgentAction(run.action);
  const token = (run.params as Record<string, unknown>)?.token as string || 'STRK';
  const runAmount = (run.params as Record<string, unknown>)?.amount as string | undefined;
  const feeAmount = run.payment_evidence?.payment_ref ? '1' : undefined;
  const isPayment = run.billable && run.settlement_tx_hash;
  const note = isPayment
    ? `${action} · Fee paid`
    : `${action}`;
  const statusDetail = run.status === 'completed'
    ? run.execution_tx_hashes?.length
      ? `Completed · ${run.execution_tx_hashes.length} tx`
      : 'Completed'
    : run.status === 'failed'
      ? (run.result as Record<string, unknown>)?.reason_code
        ? `Failed: ${(run.result as Record<string, unknown>).reason_code}`
        : 'Failed'
      : run.status === 'pending_payment'
        ? 'Awaiting settlement'
        : run.status === 'running'
          ? 'Running...'
          : run.status;

  return {
    txHash: run.settlement_tx_hash || run.id,
    source: 'agent_run',
    privacyLevel: 'private',
    timestamp: toTimestamp(run.created_at),
    type: run.action?.startsWith('agent_') ? run.action : `agent_${run.action || 'run'}`,
    token,
    amount: runAmount || feeAmount,
    amount_unit: runAmount ? 'erc20_display' : 'tongo_units',
    status: run.status === 'completed' ? 'confirmed' : run.status === 'failed' ? 'failed' : 'pending',
    statusDetail,
    note,
    agentRun: {
      agent_id: run.agent_id,
      hire_id: run.hire_id,
      action: run.action,
      status: run.status,
    },
    walletAddress: run.hire_operator_wallet || undefined,
    _fullRun: run,
  };
}

/** Convert a wei string to human-readable with up to 4 significant decimals. */
function fromWeiFeed(wei: string, token: string): string {
  const decimals = token === 'USDC' ? 6 : 18;
  const raw = BigInt(wei || '0');
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const frac = raw % divisor;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole}.${fracStr.slice(0, 4)}`;
}

function delegationToFeedItem(
  delegation: import('@cloak-wallet/sdk').DelegationResponse,
): ActivityFeedItem {
  const isRevoked = delegation.status === 'revoked';
  const token = delegation.token || 'STRK';
  const consumedDisplay = fromWeiFeed(delegation.consumed_amount, token);
  const totalDisplay = fromWeiFeed(delegation.total_allowance, token);
  return {
    txHash: delegation.onchain_tx_hash || delegation.id,
    source: 'agent_run',
    privacyLevel: 'private',
    timestamp: toTimestamp(isRevoked && delegation.revoked_at ? delegation.revoked_at : delegation.created_at),
    type: isRevoked ? 'agent_delegation_revoked' : 'agent_delegation',
    token,
    amount: totalDisplay,
    amount_unit: 'erc20_display',
    status: isRevoked ? 'confirmed' : delegation.status === 'active' ? 'confirmed' : 'pending',
    statusDetail: isRevoked
      ? `Revoked · ${consumedDisplay}/${totalDisplay} used`
      : `${consumedDisplay}/${totalDisplay} consumed`,
    note: isRevoked
      ? `Delegation revoked (${delegation.agent_id})`
      : `Delegation for ${delegation.agent_id}`,
  };
}

async function loadMarketplaceActivity(
  walletAddress: string,
): Promise<ActivityFeedItem[]> {
  try {
    const wallet = { walletAddress };
    const [hires, runs, delegations] = await Promise.all([
      listMarketplaceHires({ wallet }).catch(() => [] as AgentHireResponse[]),
      listMarketplaceRuns({ wallet }).catch(() => [] as AgentRunResponse[]),
      listMarketplaceDelegations({}).catch(
        () => [] as import('@cloak-wallet/sdk').DelegationResponse[],
      ),
    ]);
    const hireItems = hires.map(hireToFeedItem);
    const runItems = runs.map(runToFeedItem);
    // Only show delegation items that don't already have a corresponding run.
    // Runs with delegation_evidence already display delegation info inline.
    const runAgentIds = new Set(runs.map(r => r.agent_id));
    const delegationItems = delegations
      .filter(d => d.status === 'revoked' || !runAgentIds.has(d.agent_id))
      .map(delegationToFeedItem);
    return [...hireItems, ...runItems, ...delegationItems];
  } catch {
    return [];
  }
}

export async function loadActivityHistory(
  walletAddress: string,
  limit = 200,
  publicKey?: string,
): Promise<ActivityFeedItem[]> {
  const marketplaceItems = await loadMarketplaceActivity(walletAddress);

  try {
    const client = await getApiClient({ walletAddress, publicKey });
    const records = await getActivityRecords(walletAddress, limit, client);
    if (records.length > 0) {
      const coreItems = records.map(activityToFeedItem);
      // Merge _fullRun from marketplace items onto matching core items
      const marketplaceByHash = new Map(
        marketplaceItems
          .filter(m => m._fullRun)
          .map(m => [m.txHash, m._fullRun!]),
      );
      for (const item of coreItems) {
        const fullRun = marketplaceByHash.get(item.txHash);
        if (fullRun) item._fullRun = fullRun;
      }
      // Deduplicate marketplace items that already appear in core activity
      const coreHashes = new Set(coreItems.map(i => i.txHash));
      const uniqueMarketplace = marketplaceItems.filter(
        m => !coreHashes.has(m.txHash),
      );
      const items = [...coreItems, ...uniqueMarketplace].sort(
        (a, b) => (b.timestamp || 0) - (a.timestamp || 0),
      );
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
    .map(note => localNoteToFeedItem(note as TxMetadata));

  const combined = [...localItems, ...marketplaceItems].sort(
    (a, b) => (b.timestamp || 0) - (a.timestamp || 0),
  );
  if (combined.length > 0) {
    return combined;
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
  options: LoadActivityByTxHashOptions = {},
): Promise<ActivityFeedItem | null> {
  const { network = true, limit = 200 } = options;
  let localMatch: ActivityFeedItem | null = null;

  // 1. Check local notes first (instant, no network)
  try {
    const notes = await getTxNotes();
    const local = notes?.[txHash];
    if (local) localMatch = localNoteToFeedItem(local as TxMetadata);
  } catch {
    // fall through
  }

  // 2. Check cached activity history
  let cachedMatch: ActivityFeedItem | null = null;
  try {
    const cached = await loadCachedActivityHistory(walletAddress, 500);
    cachedMatch = cached.find(r => r.txHash === txHash) || null;
    // Fast path for detail views: return cached data immediately.
    if (cachedMatch && !network) {
      return mergeLocalNoteWithRemote(cachedMatch, localMatch);
    }
  } catch {
    // fall through
  }

  if (!network && localMatch) {
    return localMatch;
  }

  // 3. Query API for recent activity and find by tx_hash
  try {
    const client = await getApiClient({ walletAddress, publicKey });
    const records = await getActivityRecords(walletAddress, limit, client);
    if (records.length > 0) {
      const items = records
        .map(activityToFeedItem)
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      await saveActivityCache(walletAddress, items);
    }
    const match = records.find(r => r.tx_hash === txHash);
    if (match) {
      return mergeLocalNoteWithRemote(activityToFeedItem(match), localMatch);
    }
  } catch {
    // fall through
  }

  if (cachedMatch) {
    return mergeLocalNoteWithRemote(cachedMatch, localMatch);
  }

  if (localMatch) {
    return localMatch;
  }

  // 4. Fallback: search mock data
  if (isMockMode()) {
    const mock = buildMockActivityFeed();
    return mock.find(row => row.txHash === txHash) || null;
  }

  return null;
}
