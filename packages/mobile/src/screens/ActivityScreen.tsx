import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import {
  ArrowDownLeft,
  ArrowUpFromLine,
  Bot,
  Key,
  Plus,
  RefreshCw,
  Repeat,
  Shield,
  ShieldOff,
  ShieldPlus,
} from 'lucide-react-native';
import { convertAmount, type AmountUnit } from '@cloak-wallet/sdk';
import { useWallet } from '../lib/WalletContext';
import { useWardContext } from '../lib/wardContext';
import { type TxMetadata } from '../lib/storage';
import {
  colors,
  spacing,
  fontSize,
  borderRadius,
  typography,
} from '../lib/theme';
import { testIDs, testProps } from '../testing/testIDs';
import {
  isActivityCacheFresh,
  loadActivityHistory,
  loadCachedActivityHistory,
  type ActivityFeedItem,
} from '../lib/activity/feed';
import {
  GUARDIAN_WARD_TYPES,
  WARD_ADMIN_TYPES,
  hasAmountFromAny,
  toDisplayAmountFromAny,
} from '../lib/activity/amounts';
import { TOKENS, type TokenKey } from '../lib/tokens';

type FilterKey = 'all' | 'shielded' | 'public' | 'swap' | 'approvals';
type TxCategory = 'shielded' | 'public' | 'swap' | 'approvals';
const ACTIVITY_CACHE_REFRESH_INTERVAL_MS = 60_000;

interface TxMetadataExtended extends Omit<ActivityFeedItem, 'type'> {
  type: TxMetadata['type'] | string;
}

interface IconMeta {
  icon: React.ReactNode;
  background: string;
}

interface AmountMeta {
  primary: string;
  secondary?: string;
  color: string;
}

function sectionForDate(timestamp: number): 'Today' | 'Yesterday' | 'Earlier' {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'Earlier';
  const now = new Date();
  const startToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const startYesterday = startToday - 24 * 60 * 60 * 1000;
  const ts = date.getTime();
  if (ts >= startToday) return 'Today';
  if (ts >= startYesterday) return 'Yesterday';
  return 'Earlier';
}

function formatRelativeTime(timestamp: number): string {
  const delta = Date.now() - timestamp;
  const minutes = Math.floor(delta / (60 * 1000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function normalizeToken(token?: string | null): TokenKey {
  if (token === 'ETH' || token === 'USDC' || token === 'STRK') return token;
  return 'STRK';
}

function isAmountUnit(unit: unknown): unit is AmountUnit {
  return (
    unit === 'tongo_units' || unit === 'erc20_wei' || unit === 'erc20_display'
  );
}

function formatFromWei(
  value: string | null | undefined,
  token: TokenKey,
): string {
  if (!value) return '0';
  try {
    return convertAmount({ value, unit: 'erc20_wei', token }, 'erc20_display');
  } catch {
    return '0';
  }
}

function weiToTongoUnits(
  value: string | null | undefined,
  token: TokenKey,
): string {
  if (!value) return '0';
  try {
    return (BigInt(value) / TOKENS[token].rate).toString();
  } catch {
    return '0';
  }
}

function displayToTongoUnits(
  value: string | null | undefined,
  token: TokenKey,
): string {
  if (!value) return '0';
  const literal = literalDisplayAmount(value) || value;
  if (!/^\d+(\.\d+)?$/.test(literal.trim())) return '0';
  try {
    return convertAmount(
      { value: literal.trim(), unit: 'erc20_display', token },
      'tongo_units',
    );
  } catch {
    return '0';
  }
}

function literalDisplayAmount(value: string | null | undefined): string | null {
  if (!value) return null;
  const stripped = value.replace(/\s*(STRK|ETH|USDC)\s*$/i, '').trim();
  return stripped || null;
}

function isApprovalTx(tx: TxMetadataExtended): boolean {
  if (tx.type === 'approval') return true;
  if (tx.source === 'ward_request') return true;
  if (WARD_ADMIN_TYPES.includes(tx.type as any)) return true;
  if (
    tx.accountType === 'guardian' &&
    GUARDIAN_WARD_TYPES.includes(tx.type as any)
  )
    return true;
  return false;
}

function normalizedActivityType(tx: TxMetadataExtended): string {
  if (tx.source !== 'ward_request') return tx.type;
  switch (tx.type) {
    case 'deploy':
    case 'deploy_account':
    case 'deploy_contract':
      return 'deploy_ward';
    case 'fund':
      return 'fund_ward';
    case 'configure':
    case 'configure_limits':
      return 'configure_ward';
    default:
      return tx.type;
  }
}

function categoryForTx(tx: TxMetadataExtended): TxCategory {
  if (tx.type === 'swap' || !!tx.swap) return 'swap';
  if (isApprovalTx(tx)) return 'approvals';
  if (tx.type === 'erc20_transfer' || tx.type === 'withdraw') return 'public';
  return 'shielded';
}

function matchesFilter(tx: TxMetadataExtended, filter: FilterKey): boolean {
  if (filter === 'all') return true;
  return categoryForTx(tx) === filter;
}

function statusLabel(status?: string): string {
  switch (status) {
    case 'confirmed':
      return 'Confirmed';
    case 'pending':
      return 'Pending';
    case 'failed':
      return 'Failed';
    case 'rejected':
      return 'Rejected';
    case 'expired':
      return 'Expired';
    case 'gas_error':
      return 'Gas Retry';
    default:
      return 'Pending';
  }
}

function resolveWardLabel(
  tx: TxMetadataExtended,
  wardNameLookup?: (addr: string) => string | undefined,
): string {
  if (tx.recipientName) return tx.recipientName;
  if (tx.wardAddress && wardNameLookup) {
    const name = wardNameLookup(tx.wardAddress);
    if (name) return name;
  }
  return 'Ward';
}

function getSwapTitle(tx: TxMetadataExtended): string {
  if (tx.note && tx.note.toLowerCase().startsWith('swap')) return tx.note;
  const sellToken = normalizeToken(tx.swap?.sell_token || tx.token);
  const buyToken = normalizeToken(tx.swap?.buy_token || tx.token);
  return `Swap ${sellToken} -> ${buyToken}`;
}

function prettyStepKey(stepKey: string): string {
  return stepKey
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getSwapProgressLabel(tx: TxMetadataExtended): string | null {
  const steps = tx.swap?.steps || [];
  if (steps.length === 0) return null;
  const completed = steps.filter(step => step.status === 'success').length;
  const running = steps.find(step => step.status === 'running');
  const failed = steps.find(step => step.status === 'failed');
  if (failed) return `Failed at ${prettyStepKey(failed.step_key)}`;
  if (running) return `${prettyStepKey(running.step_key)} in progress`;
  if (tx.status === 'confirmed')
    return `${completed}/${steps.length} steps complete`;
  return `${completed}/${steps.length} steps`;
}

function getTxTitle(
  tx: TxMetadataExtended,
  wardNameLookup?: (addr: string) => string | undefined,
  myAddress?: string,
): string {
  const type = normalizedActivityType(tx);
  if (tx.source === 'agent_run') {
    return tx.note || `Agent ${tx.agentRun?.agent_id || 'run'}`;
  }
  if (tx.type === 'swap' || tx.swap) return getSwapTitle(tx);
  if (type === 'approval') return tx.note || 'Approval';
  if (type === 'fund')
    return tx.note || `Shielded deposit (${normalizeToken(tx.token)})`;

  if (myAddress && tx.walletAddress && tx.wardAddress) {
    const myNorm = myAddress.toLowerCase().replace(/^0x0+/, '0x');
    const wardNorm = tx.wardAddress.toLowerCase().replace(/^0x0+/, '0x');
    const walletNorm = tx.walletAddress.toLowerCase().replace(/^0x0+/, '0x');
    if (myNorm === wardNorm && myNorm !== walletNorm) {
      if (type === 'fund_ward') return 'Received from Guardian';
      if (type === 'configure_ward')
        return tx.note || 'Guardian configured account';
      if (type === 'deploy_ward') return 'Account deployed by Guardian';
    }
  }

  const isGuardianSubmittedWardOp =
    tx.accountType === 'guardian' && GUARDIAN_WARD_TYPES.includes(type as any);
  if (isGuardianSubmittedWardOp) {
    return resolveWardLabel(tx, wardNameLookup);
  }

  const token = normalizeToken(tx.token);
  const tokenAmount = `${toDisplayAmountFromAny(tx.amount, tx.amount_unit, token, tx.type)} ${token}`;
  switch (type) {
    case 'withdraw':
      return tx.note || `Unshielded ${tokenAmount}`;
    case 'erc20_transfer':
      return tx.recipientName
        ? `Sent to ${tx.recipientName} (Public)`
        : 'Public send';
    case 'send':
      return tx.recipientName ? `Sent to ${tx.recipientName}` : 'Sent payment';
    case 'receive':
      return 'Received shielded';
    case 'rollover':
      return 'Claimed pending funds';
    case 'deploy_ward':
      return 'Deployed ward contract';
    case 'fund_ward':
      return tx.note || 'Funded ward account';
    case 'configure_ward':
      return tx.note || 'Configured ward';
    default:
      return 'Transaction';
  }
}

function getTxIconMeta(tx: TxMetadataExtended): IconMeta {
  const type = normalizedActivityType(tx);
  const category = categoryForTx(tx);

  if (tx.source === 'agent_run') {
    return {
      icon: <Bot size={18} color={colors.primaryLight} />,
      background: 'rgba(96, 165, 250, 0.14)',
    };
  }

  if (type === 'deploy_ward') {
    return {
      icon: <Shield size={18} color="#38BDF8" />,
      background: 'rgba(56, 189, 248, 0.14)',
    };
  }
  if (type === 'fund_ward') {
    return {
      icon: <Plus size={18} color={colors.success} />,
      background: 'rgba(16, 185, 129, 0.14)',
    };
  }
  if (type === 'configure_ward') {
    return {
      icon: <Key size={18} color={colors.secondary} />,
      background: 'rgba(139, 92, 246, 0.14)',
    };
  }
  if (category === 'swap') {
    return {
      icon: <Repeat size={18} color={colors.warning} />,
      background: 'rgba(245, 158, 11, 0.12)',
    };
  }
  if (type === 'fund') {
    return {
      icon: <ShieldPlus size={18} color={colors.success} />,
      background: 'rgba(16, 185, 129, 0.12)',
    };
  }
  if (category === 'approvals') {
    return {
      icon: <ShieldPlus size={18} color={colors.success} />,
      background: 'rgba(16, 185, 129, 0.12)',
    };
  }
  if (type === 'withdraw') {
    return {
      icon: <ShieldOff size={18} color={colors.secondary} />,
      background: 'rgba(139, 92, 246, 0.12)',
    };
  }
  if (type === 'receive') {
    return {
      icon: <ArrowDownLeft size={18} color={colors.success} />,
      background: 'rgba(16, 185, 129, 0.12)',
    };
  }
  if (type === 'erc20_transfer') {
    return {
      icon: <ArrowUpFromLine size={18} color="#F97316" />,
      background: 'rgba(249, 115, 22, 0.12)',
    };
  }
  return {
    icon: <ArrowUpFromLine size={18} color={colors.primary} />,
    background: 'rgba(59, 130, 246, 0.12)',
  };
}

function getTxLeftSubtitle(tx: TxMetadataExtended): string {
  const type = normalizedActivityType(tx);
  const category = categoryForTx(tx);
  if (tx.source === 'agent_run') {
    return `${formatRelativeTime(tx.timestamp)} · Agents`;
  }
  if (category === 'swap') {
    const progress = getSwapProgressLabel(tx);
    if (progress) return progress;
    return tx.statusDetail || `${statusLabel(tx.status)} · Swap`;
  }
  if (category === 'approvals') {
    if (type === 'approval') {
      return `${formatRelativeTime(tx.timestamp)} · Approvals`;
    }
    if (
      type === 'deploy_ward' ||
      type === 'fund_ward' ||
      type === 'configure_ward'
    ) {
      return `${formatRelativeTime(tx.timestamp)} · Wards`;
    }
    if (tx.statusDetail === 'pending_ward_sig')
      return 'Waiting for ward signature';
    if (tx.statusDetail === 'pending_guardian')
      return 'Waiting for guardian approval';
    return `${formatRelativeTime(tx.timestamp)} · Approvals`;
  }
  if (category === 'public') {
    if (tx.type === 'withdraw') {
      const section = sectionForDate(tx.timestamp);
      const when =
        section === 'Yesterday'
          ? 'Yesterday'
          : formatRelativeTime(tx.timestamp);
      return `${when} · Public`;
    }
    return `${formatRelativeTime(tx.timestamp)} · Public`;
  }
  return `${formatRelativeTime(tx.timestamp)} · Shielded`;
}

function getTxAmountMeta(tx: TxMetadataExtended): AmountMeta {
  const type = normalizedActivityType(tx);
  const token = normalizeToken(tx.token);
  const hasAmount = hasAmountFromAny(tx.amount, tx.amount_unit, token, tx.type);
  const displayAmount = toDisplayAmountFromAny(
    tx.amount,
    tx.amount_unit,
    token,
    tx.type,
  );
  const category = categoryForTx(tx);

  if (category === 'swap') {
    const sellToken = normalizeToken(tx.swap?.sell_token || tx.token);
    const buyToken = normalizeToken(tx.swap?.buy_token || tx.token);
    const literalSellAmount =
      tx.amount_unit === 'erc20_display'
        ? literalDisplayAmount(tx.amount)
        : null;
    const sellAmount =
      literalSellAmount ||
      (tx.swap?.sell_amount_wei
        ? formatFromWei(tx.swap.sell_amount_wei, sellToken)
        : displayAmount);
    let secondary = tx.statusDetail || undefined;
    if (tx.swap?.estimated_buy_amount_wei && tx.swap?.min_buy_amount_wei) {
      const minBuy = formatFromWei(tx.swap.min_buy_amount_wei, buyToken);
      if (tx.status === 'confirmed' && tx.swap.buy_actual_amount_wei) {
        const actual = formatFromWei(tx.swap.buy_actual_amount_wei, buyToken);
        secondary = `Actual ${actual} ${buyToken} / Min ${minBuy} ${buyToken}`;
      } else {
        const estimate = formatFromWei(
          tx.swap.estimated_buy_amount_wei,
          buyToken,
        );
        secondary = `Est ${estimate} ${buyToken} / Min ${minBuy} ${buyToken}`;
      }
    }
    return {
      primary: `-${sellAmount} ${sellToken}`,
      secondary,
      color: colors.warning,
    };
  }

  if (category === 'approvals') {
    if (type === 'deploy_ward') {
      return {
        primary: 'Deploy Ward',
        secondary: tx.statusDetail || `Status: ${statusLabel(tx.status)}`,
        color: '#38BDF8',
      };
    }
    if (type === 'fund_ward') {
      return {
        primary: hasAmount ? `Fund ${displayAmount} ${token}` : 'Fund Ward',
        secondary: tx.statusDetail || `Status: ${statusLabel(tx.status)}`,
        color: colors.success,
      };
    }
    if (type === 'configure_ward') {
      return {
        primary: 'Configure Ward',
        secondary: tx.statusDetail || `Status: ${statusLabel(tx.status)}`,
        color: colors.secondary,
      };
    }
    const primary = hasAmount ? `Limit ${displayAmount} ${token}` : 'Approval';
    const secondary = tx.statusDetail || `Status: ${statusLabel(tx.status)}`;
    return { primary, secondary, color: colors.success };
  }

  if (!hasAmount) {
    return {
      primary: statusLabel(tx.status),
      secondary: tx.statusDetail || undefined,
      color: colors.textSecondary,
    };
  }

  if (type === 'fund') {
    return {
      primary: `${displayAmount} ${token}`,
      secondary: tx.statusDetail || 'Shielded conversion',
      color: colors.text,
    };
  }

  const isCredit = ['fund', 'receive', 'rollover'].includes(type);
  const prefix = isCredit ? '+' : '-';
  const color =
    type === 'withdraw'
      ? colors.secondary
      : type === 'erc20_transfer'
        ? '#F97316'
        : isCredit
          ? colors.success
          : colors.primary;

  return {
    primary: `${prefix}${displayAmount} ${token}`,
    secondary: tx.statusDetail || undefined,
    color,
  };
}

export default function ActivityScreen({ navigation }: any) {
  const wallet = useWallet();
  const { wards } = useWardContext();
  const [history, setHistory] = useState<TxMetadataExtended[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');

  const wardNameLookup = useCallback(
    (addr: string): string | undefined => {
      const normalized = addr.toLowerCase().replace(/^0x0+/, '0x');
      for (const ward of wards) {
        const wardNorm = ward.wardAddress.toLowerCase().replace(/^0x0+/, '0x');
        if (wardNorm === normalized) return ward.pseudoName;
      }
      return undefined;
    },
    [wards],
  );

  const loadNotes = useCallback(async () => {
    const walletAddress = wallet.keys?.starkAddress;
    if (!walletAddress) {
      setHistory([]);
      setIsLoading(false);
      return;
    }

    let hadCachedRows = false;
    try {
      const cachedRows = await loadCachedActivityHistory(walletAddress, 200);
      if (cachedRows.length > 0) {
        hadCachedRows = true;
        setHistory(cachedRows as TxMetadataExtended[]);
        setIsLoading(false);
      }

      const cacheIsFresh = await isActivityCacheFresh(
        walletAddress,
        ACTIVITY_CACHE_REFRESH_INTERVAL_MS,
      );
      if (hadCachedRows && cacheIsFresh) {
        return;
      }

      const rows = await loadActivityHistory(
        walletAddress,
        200,
        wallet.keys?.starkPublicKey,
      );
      setHistory(rows as TxMetadataExtended[]);
    } catch {
      if (!hadCachedRows) {
        setHistory([]);
      }
    } finally {
      setIsLoading(false);
    }
  }, [wallet.keys?.starkAddress, wallet.keys?.starkPublicKey]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await wallet.refreshTxHistory();
      const walletAddress = wallet.keys?.starkAddress;
      if (!walletAddress) {
        setHistory([]);
        return;
      }
      const rows = await loadActivityHistory(
        walletAddress,
        200,
        wallet.keys?.starkPublicKey,
      );
      setHistory(rows as TxMetadataExtended[]);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const filtered = useMemo(
    () => history.filter(tx => matchesFilter(tx, filter)),
    [history, filter],
  );

  const grouped = useMemo(() => {
    const buckets: Record<
      'Today' | 'Yesterday' | 'Earlier',
      TxMetadataExtended[]
    > = {
      Today: [],
      Yesterday: [],
      Earlier: [],
    };
    for (const tx of filtered) {
      buckets[sectionForDate(tx.timestamp)].push(tx);
    }
    return buckets;
  }, [filtered]);

  const chips: { key: FilterKey; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'shielded', label: 'Shielded' },
    { key: 'public', label: 'Public' },
    { key: 'swap', label: 'Swap' },
    { key: 'approvals', label: 'Approvals' },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={colors.primary}
        />
      }
    >
      <View style={styles.filterRow}>
        {chips.map(chip => {
          const active = filter === chip.key;
          return (
            <TouchableOpacity
              key={chip.key}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => setFilter(chip.key)}
              {...testProps(`${testIDs.activity.rowPrefix}.filter.${chip.key}`)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  active && styles.filterChipTextActive,
                ]}
              >
                {chip.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {isLoading ? (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.emptyText}>Loading activity...</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.emptyContainer}>
          <RefreshCw size={28} color={colors.textMuted} />
          <Text style={styles.emptyText}>No matching transactions</Text>
          <Text style={styles.emptySubtext}>
            Try a different filter or refresh
          </Text>
        </View>
      ) : (
        (['Today', 'Yesterday', 'Earlier'] as const).map(section => {
          const items = grouped[section];
          if (!items.length) return null;
          return (
            <View key={section} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.toUpperCase()}</Text>
              <View style={styles.sectionCard}>
                {items.map((tx, idx) => {
                  const iconMeta = getTxIconMeta(tx);
                  const amountMeta = getTxAmountMeta(tx);
                  const title = getTxTitle(
                    tx,
                    wardNameLookup,
                    wallet.keys?.starkAddress,
                  );
                  const subtitle = getTxLeftSubtitle(tx);
                  const rowTestID = tx.txHash
                    ? `${testIDs.activity.rowPrefix}.${tx.txHash}`
                    : `${testIDs.activity.rowPrefix}.${idx}`;

                  return (
                    <TouchableOpacity
                      {...testProps(rowTestID)}
                      key={tx.txHash || String(idx)}
                      style={[
                        styles.row,
                        idx < items.length - 1 && styles.rowDivider,
                      ]}
                      onPress={() => {
                        if (!tx.txHash) return;
                        if (tx.type === 'swap' || tx.swap) {
                          const sellToken = normalizeToken(
                            tx.swap?.sell_token || tx.token,
                          );
                          const buyToken = normalizeToken(
                            tx.swap?.buy_token || tx.token,
                          );
                          const sentDisplay = tx.swap?.sell_amount_wei
                            ? formatFromWei(tx.swap.sell_amount_wei, sellToken)
                            : toDisplayAmountFromAny(
                                tx.amount,
                                tx.amount_unit,
                                sellToken,
                                tx.type,
                              );
                          let sentUnits = tx.swap?.sell_amount_wei
                            ? weiToTongoUnits(
                                tx.swap.sell_amount_wei,
                                sellToken,
                              )
                            : tx.amount || '0';
                          if (sentUnits === '0') {
                            const fallbackUnits = displayToTongoUnits(
                              sentDisplay,
                              sellToken,
                            );
                            if (fallbackUnits !== '0')
                              sentUnits = fallbackUnits;
                          }
                          const receivedWei =
                            tx.swap?.buy_actual_amount_wei ||
                            tx.swap?.min_buy_amount_wei ||
                            null;
                          const receivedDisplay = receivedWei
                            ? formatFromWei(receivedWei, buyToken)
                            : '0';
                          let receivedUnits = receivedWei
                            ? weiToTongoUnits(receivedWei, buyToken)
                            : '0';
                          if (receivedUnits === '0') {
                            const fallbackUnits = displayToTongoUnits(
                              receivedDisplay,
                              buyToken,
                            );
                            if (fallbackUnits !== '0')
                              receivedUnits = fallbackUnits;
                          }
                          let rateDisplay = '-';
                          if (
                            sentDisplay &&
                            receivedDisplay &&
                            parseFloat(sentDisplay) > 0
                          ) {
                            const rate =
                              parseFloat(receivedDisplay) /
                              parseFloat(sentDisplay);
                            if (Number.isFinite(rate) && rate > 0) {
                              rateDisplay = `1 ${sellToken} ≈ ${rate.toPrecision(3)} ${buyToken}`;
                            }
                          }
                          navigation.getParent()?.navigate('SwapDetail', {
                            pair: `${sellToken} → ${buyToken}`,
                            sentUnits,
                            receivedUnits,
                            sentDisplay,
                            receivedDisplay,
                            fromToken: sellToken,
                            toToken: buyToken,
                            rateDisplay,
                            routeDisplay:
                              tx.note || `${sellToken} pool → ${buyToken} pool`,
                            txHash: tx.swap?.primary_tx_hash || tx.txHash,
                            txHashes: tx.swap?.tx_hashes || undefined,
                            status:
                              tx.status === 'confirmed' ? 'Settled' : 'Failed',
                            executionId: tx.swap?.execution_id,
                            sellAmountErc20: sentDisplay
                              ? `${sentDisplay} ${sellToken}`
                              : undefined,
                            estimatedBuyErc20: tx.swap?.estimated_buy_amount_wei
                              ? `${formatFromWei(tx.swap.estimated_buy_amount_wei, buyToken)} ${buyToken}`
                              : undefined,
                            minBuyErc20: tx.swap?.min_buy_amount_wei
                              ? `${formatFromWei(tx.swap.min_buy_amount_wei, buyToken)} ${buyToken}`
                              : undefined,
                            actualBuyErc20: tx.swap?.buy_actual_amount_wei
                              ? `${formatFromWei(tx.swap.buy_actual_amount_wei, buyToken)} ${buyToken}`
                              : undefined,
                            gasFee: tx.fee ? `${tx.fee} ETH` : undefined,
                          });
                          return;
                        }
                        navigation.getParent()?.navigate('TransactionDetail', {
                          txHash: tx.txHash,
                          type: tx.type,
                          amount: tx.amount,
                          note: tx.note,
                          recipientName: tx.recipientName,
                          timestamp: tx.timestamp,
                          amount_unit: isAmountUnit(tx.amount_unit)
                            ? tx.amount_unit
                            : undefined,
                        });
                      }}
                    >
                      <View
                        style={[
                          styles.iconCircle,
                          { backgroundColor: iconMeta.background },
                        ]}
                      >
                        {iconMeta.icon}
                      </View>

                      <View style={styles.leftText}>
                        <Text style={styles.titleText} numberOfLines={1}>
                          {title}
                        </Text>
                        <Text style={styles.subtitleText} numberOfLines={1}>
                          {subtitle}
                        </Text>
                      </View>

                      <View style={styles.rightText}>
                        <Text
                          style={[
                            styles.amountText,
                            { color: amountMeta.color },
                          ]}
                          numberOfLines={1}
                        >
                          {amountMeta.primary}
                        </Text>
                        {amountMeta.secondary ? (
                          <Text style={styles.tokenText} numberOfLines={1}>
                            {amountMeta.secondary}
                          </Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 100 },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  filterChip: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: typography.primary,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontFamily: typography.primarySemibold,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: 10,
    fontFamily: typography.primarySemibold,
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leftText: {
    flex: 1,
    gap: 2,
  },
  titleText: {
    fontSize: 14,
    color: colors.text,
    fontFamily: typography.secondary,
  },
  subtitleText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontFamily: typography.primary,
  },
  rightText: {
    alignItems: 'flex-end',
    gap: 2,
    minWidth: 96,
  },
  amountText: {
    fontSize: 13,
    fontFamily: typography.primarySemibold,
  },
  tokenText: {
    fontSize: 10,
    color: colors.textMuted,
    fontFamily: typography.primary,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontFamily: typography.secondarySemibold,
  },
  emptySubtext: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: typography.secondary,
  },
});
