import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import {
  ShieldPlus,
  ShieldOff,
  ArrowUpFromLine,
  ArrowDownToLine,
  RefreshCw,
  Shield,
  Wallet,
  Settings,
} from "lucide-react-native";
import { getTransactions, type TransactionRecord, type AmountUnit } from "@cloak-wallet/sdk";
import { useWallet } from "../lib/WalletContext";
import { useWardContext } from "../lib/wardContext";
import { getTxNotes, type TxMetadata } from "../lib/storage";
import { TOKENS, type TokenKey } from "../lib/tokens";
import { colors, spacing, fontSize, borderRadius, typography } from "../lib/theme";
import { testIDs, testProps } from "../testing/testIDs";

type FilterKey = "all" | "sent" | "received" | "shield";

/** Local extension of TxMetadata with Supabase-sourced fields */
interface TxMetadataExtended extends TxMetadata {
  status?: string;
  errorMessage?: string;
  accountType?: string;
  fee?: string;
  amount_unit?: AmountUnit | null;
  wardAddress?: string;
  walletAddress?: string;
}

function formatIntWithCommas(intStr: string): string {
  const sanitized = (intStr || "0").replace(/\D/g, "");
  if (!sanitized) return "0";
  return sanitized.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function sectionForDate(timestamp: number): "Today" | "Yesterday" | "Earlier" {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Earlier";

  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startYesterday = startToday - 24 * 60 * 60 * 1000;
  const t = date.getTime();
  if (t >= startToday) return "Today";
  if (t >= startYesterday) return "Yesterday";
  return "Earlier";
}

function formatRelativeTime(timestamp: number): string {
  const delta = Date.now() - timestamp;
  const minutes = Math.floor(delta / (60 * 1000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function matchesFilter(type: TxMetadata["type"], filter: FilterKey): boolean {
  if (filter === "all") return true;
  if (filter === "sent") return ["send", "withdraw", "erc20_transfer", "fund_ward"].includes(type);
  if (filter === "received") return ["receive", "rollover"].includes(type);
  if (filter === "shield") return type === "fund";
  return true;
}

/** Resolve ward display name: saved recipientName > wardContext lookup > "Ward" */
function resolveWardLabel(tx: TxMetadataExtended, wardNameLookup?: (addr: string) => string | undefined): string {
  if (tx.recipientName) return tx.recipientName;
  if (tx.wardAddress && wardNameLookup) {
    const name = wardNameLookup(tx.wardAddress);
    if (name) return name;
  }
  return "Ward";
}

/** For guardian-submitted ward ops, returns just the ward pseudoname as the title */
function getTxTitle(tx: TxMetadataExtended, wardNameLookup?: (addr: string) => string | undefined, myAddress?: string): string {
  // Ward viewing guardian-initiated tx: show from ward's perspective
  if (myAddress && tx.walletAddress && tx.wardAddress) {
    const myNorm = myAddress.toLowerCase().replace(/^0x0+/, "0x");
    const wardNorm = tx.wardAddress.toLowerCase().replace(/^0x0+/, "0x");
    const walletNorm = tx.walletAddress.toLowerCase().replace(/^0x0+/, "0x");
    if (myNorm === wardNorm && myNorm !== walletNorm) {
      if (tx.type === "fund_ward") return "Received from Guardian";
      if (tx.type === "configure_ward") return tx.note || "Guardian configured account";
      if (tx.type === "deploy_ward") return "Account deployed by Guardian";
    }
  }
  const isGuardianSubmittedWardOp =
    tx.accountType === "guardian" &&
    ["fund", "transfer", "send", "withdraw", "rollover"].includes(tx.type);

  // Ward ops: title is just the ward name
  if (isGuardianSubmittedWardOp) {
    return resolveWardLabel(tx, wardNameLookup);
  }

  const tokenAmount = formatTokenFromUnits(tx.amount || "0", (tx.token || "STRK") as TokenKey);

  switch (tx.type) {
    case "send":
      return tx.recipientName ? `Sent to ${tx.recipientName}` : "Sent payment";
    case "erc20_transfer":
      return tx.recipientName ? `Sent to ${tx.recipientName} (Public)` : "Public send";
    case "receive":
      return "Received shielded";
    case "fund":
      return `Shielded ${tokenAmount}`;
    case "withdraw":
      return `Unshielded ${tokenAmount}`;
    case "rollover":
      return "Claimed pending funds";
    case "deploy_ward":
      return "Deployed ward contract";
    case "fund_ward":
      return tx.note || "Funded ward account";
    case "configure_ward":
      return tx.note || "Configured ward";
    default:
      return "Transaction";
  }
}

/** Short action label for guardian ward ops (shown as subtitle) */
function getWardActionLabel(tx: TxMetadataExtended): string {
  switch (tx.type) {
    case "fund": return "Shielded";
    case "transfer":
    case "send": return "Sent";
    case "withdraw": return "Unshielded";
    case "rollover": return "Claimed";
    default: return "Transaction";
  }
}

function getTxStatus(tx: TxMetadataExtended): string {
  // Show Supabase status if available
  if (tx.status === "failed") return "Failed";
  if (tx.status === "pending") return "Pending";
  // Guardian-submitted ward operations get a "Ward" badge
  if (tx.accountType === "guardian" && ["fund", "transfer", "send", "withdraw", "rollover"].includes(tx.type)) {
    return "Ward";
  }
  switch (tx.type) {
    case "send":
      return "Shielded";
    case "erc20_transfer":
      return "Public Send";
    case "receive":
    case "rollover":
      return "Claimed";
    case "fund":
      return "Fund";
    case "withdraw":
      return "Withdraw";
    case "deploy_ward":
      return "Deployed";
    case "fund_ward":
      return "Funded";
    case "configure_ward":
      return "Configured";
    default:
      return "Pending";
  }
}

function getStatusColor(tx: TxMetadataExtended): string | undefined {
  if (tx.status === "failed") return colors.error;
  if (tx.status === "pending") return "#F59E0B";
  return undefined;
}

function getTxPolarity(tx: TxMetadataExtended, myAddress?: string): "credit" | "debit" | "neutral" {
  // Ward viewing guardian-initiated tx: flip perspective
  if (myAddress && tx.walletAddress && tx.wardAddress) {
    const myNorm = myAddress.toLowerCase().replace(/^0x0+/, "0x");
    const wardNorm = tx.wardAddress.toLowerCase().replace(/^0x0+/, "0x");
    const walletNorm = tx.walletAddress.toLowerCase().replace(/^0x0+/, "0x");
    // I'm the ward, but the tx was initiated by the guardian
    if (myNorm === wardNorm && myNorm !== walletNorm) {
      if (tx.type === "fund_ward") return "credit"; // Ward received funds
      if (["configure_ward", "deploy_ward"].includes(tx.type)) return "neutral";
      return "neutral";
    }
  }
  // Guardian-submitted ward ops: guardian didn't send or receive — just approved
  if (tx.accountType === "guardian" && ["fund", "transfer", "send", "withdraw", "rollover"].includes(tx.type)) {
    return "neutral";
  }
  if (["receive", "fund", "rollover"].includes(tx.type)) return "credit";
  return "debit"; // send, withdraw, erc20_transfer, deploy_ward, fund_ward, configure_ward
}

function getTxColor(tx: TxMetadataExtended): string {
  switch (tx.type) {
    case "send":
      return colors.primary;
    case "erc20_transfer":
      return "#F97316";
    case "receive":
    case "fund":
      return colors.success;
    case "withdraw":
      return colors.secondary;
    case "rollover":
      return colors.warning;
    case "deploy_ward":
    case "fund_ward":
    case "configure_ward":
      return colors.secondary;
    default:
      return colors.textMuted;
  }
}

function getTxIcon(tx: TxMetadataExtended): React.ReactNode {
  switch (tx.type) {
    case "fund":
      return <ShieldPlus size={18} color={colors.success} />;
    case "withdraw":
      return <ShieldOff size={18} color={colors.secondary} />;
    case "send":
      return <ArrowUpFromLine size={18} color={colors.primary} />;
    case "erc20_transfer":
      return <ArrowUpFromLine size={18} color="#F97316" />;
    case "receive":
      return <ArrowDownToLine size={18} color={colors.success} />;
    case "rollover":
      return <RefreshCw size={18} color={colors.warning} />;
    case "deploy_ward":
      return <Shield size={18} color={colors.secondary} />;
    case "fund_ward":
      return <Wallet size={18} color={colors.secondary} />;
    case "configure_ward":
      return <Settings size={18} color={colors.secondary} />;
    default:
      return <RefreshCw size={18} color={colors.textMuted} />;
  }
}

function getTxIconBg(tx: TxMetadataExtended): string {
  switch (tx.type) {
    case "fund":
    case "receive":
      return "rgba(16, 185, 129, 0.14)";
    case "withdraw":
    case "deploy_ward":
    case "fund_ward":
    case "configure_ward":
      return "rgba(139, 92, 246, 0.14)";
    case "send":
      return "rgba(59, 130, 246, 0.14)";
    case "erc20_transfer":
      return "rgba(249, 115, 22, 0.14)";
    case "rollover":
      return "rgba(245, 158, 11, 0.14)";
    default:
      return "rgba(148, 163, 184, 0.12)";
  }
}

/** Strip token suffix from amount if present (e.g. "10 STRK" → "10") */
function stripTokenSuffix(raw: string): string {
  return raw.replace(/\s*(STRK|ETH|USDC)\s*$/i, "").trim();
}

/** Check if amount string is already a display value (contains a decimal point) */
function isDisplayAmount(raw: string): boolean {
  const stripped = stripTokenSuffix(raw);
  return stripped.includes(".");
}

function formatTokenFromUnits(unitsStr: string, token: TokenKey): string {
  const stripped = stripTokenSuffix(unitsStr || "0");

  // If the amount is already a decimal display value, return as-is
  if (isDisplayAmount(unitsStr)) {
    return `${stripped} ${token}`;
  }

  const units = BigInt(stripped.replace(/\D/g, "") || "0");
  const cfg = TOKENS[token];
  const wei = units * cfg.rate;
  const divisor = 10n ** BigInt(cfg.decimals);
  const whole = wei / divisor;

  // Design: compact large amounts by dropping decimals at 50+.
  if (whole >= 50n) return `${whole.toString()} ${token}`;

  // Always show 2 decimals for small values (even if whole), to match pen.
  const scaled = (wei * 100n) / divisor; // token * 100 (truncated)
  const w = scaled / 100n;
  const f = scaled % 100n;
  return `${w.toString()}.${f.toString().padStart(2, "0")} ${token}`;
}

/** Convert a Supabase TransactionRecord to our local TxMetadataExtended */
function recordToMetadata(r: TransactionRecord): TxMetadataExtended {
  return {
    txHash: r.tx_hash,
    recipient: r.recipient || undefined,
    recipientName: r.recipient_name || undefined,
    note: r.note || undefined,
    privacyLevel: "private",
    timestamp: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
    type: r.type === "transfer" ? "send" : (r.type as any),
    token: r.token || "STRK",
    amount: r.amount || undefined,
    amount_unit: (r as any).amount_unit || undefined,
    status: r.status,
    errorMessage: r.error_message || undefined,
    accountType: r.account_type || undefined,
    fee: r.fee || undefined,
    wardAddress: r.ward_address || undefined,
    walletAddress: r.wallet_address || undefined,
  };
}

export default function ActivityScreen({ navigation }: any) {
  const wallet = useWallet();
  const { wards } = useWardContext();
  const [history, setHistory] = useState<TxMetadataExtended[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");

  // Look up ward pseudoName by address (normalized comparison)
  const wardNameLookup = useCallback((addr: string): string | undefined => {
    const normalized = addr.toLowerCase().replace(/^0x0+/, "0x");
    for (const w of wards) {
      const wNorm = w.wardAddress.toLowerCase().replace(/^0x0+/, "0x");
      if (wNorm === normalized) return w.pseudoName;
    }
    return undefined;
  }, [wards]);

  const loadNotes = useCallback(async () => {
    // Try Supabase first, fall back to local storage
    const walletAddress = wallet.keys?.starkAddress;
    if (walletAddress) {
      try {
        const records = await getTransactions(walletAddress);
        if (records && records.length > 0) {
          const arr = records.map(recordToMetadata);
          arr.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          setHistory(arr);
          return;
        }
      } catch {
        // Fall through to local storage
      }
    }

    // Fallback: local AsyncStorage notes
    const notes = await getTxNotes();
    const arr = (Object.values(notes || {}).filter(Boolean) as TxMetadataExtended[]);
    arr.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    setHistory(arr);
  }, [wallet.keys?.starkAddress]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const handleRefresh = async () => {
    setRefreshing(true);
    // Best-effort: bridge tx history is flaky; stored notes are our current source.
    try {
      await wallet.refreshTxHistory();
    } finally {
      await loadNotes();
      setRefreshing(false);
    }
  };

  const filtered = useMemo(
    () => history.filter((tx) => matchesFilter(tx.type, filter)),
    [history, filter],
  );

  const grouped = useMemo(() => {
    const buckets: Record<"Today" | "Yesterday" | "Earlier", TxMetadataExtended[]> = {
      Today: [],
      Yesterday: [],
      Earlier: [],
    };
    filtered.forEach((tx) => {
      buckets[sectionForDate(tx.timestamp)].push(tx);
    });
    return buckets;
  }, [filtered]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
      }
    >
      <View style={styles.filterRow}>
        {[
          { key: "all", label: "All" },
          { key: "sent", label: "Sent" },
          { key: "received", label: "Received" },
          { key: "shield", label: "Shield" },
        ].map((item) => {
          const active = filter === item.key;
          return (
            <TouchableOpacity
              key={item.key}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => setFilter(item.key as FilterKey)}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {filtered.length === 0 ? (
        <View style={styles.emptyContainer}>
          <RefreshCw size={28} color={colors.textMuted} />
          <Text style={styles.emptyText}>No matching transactions</Text>
          <Text style={styles.emptySubtext}>Try a different filter or refresh</Text>
        </View>
      ) : (
        (["Today", "Yesterday", "Earlier"] as const).map((section) => {
          const items = grouped[section];
          if (!items.length) return null;
          return (
            <View key={section} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.toUpperCase()}</Text>
              <View style={styles.sectionCard}>
                {items.map((tx, i) => {
                  const amountRaw = tx.amount || "0";
                  const polarity = getTxPolarity(tx, wallet.keys?.starkAddress);
                  const amountPrefix = polarity === "credit" ? "+" : polarity === "debit" ? "-" : "";
                  const amountColor = getTxColor(tx);
                  const token = (tx.token || "STRK") as TokenKey;
                  const strippedAmount = stripTokenSuffix(amountRaw);
                  // Guardian-submitted ward ops: amounts are tongo units from the ward's perspective
                  const isGuardianWardOp = tx.accountType === "guardian" && ["fund", "transfer", "send", "withdraw", "rollover"].includes(tx.type);
                  // fund_ward/configure_ward amounts were always saved in ERC-20 display format, even before amount_unit existed
                  const isWardAdmin = tx.type === "deploy_ward" || tx.type === "fund_ward" || tx.type === "configure_ward";
                  const isErc20Display = !isGuardianWardOp && (tx.amount_unit === "erc20_display" || tx.type === "erc20_transfer" || isWardAdmin || isDisplayAmount(amountRaw));
                  const hasAmount = !!tx.amount && tx.amount !== "0" && strippedAmount !== "0";
                  const isRollover = tx.type === "rollover";
                  const amountUnits = isErc20Display ? strippedAmount : formatIntWithCommas(strippedAmount);
                  const tokenLabel = isGuardianWardOp
                    ? formatTokenFromUnits(amountRaw, token)
                    : isErc20Display
                      ? `${strippedAmount} ${token}`
                      : formatTokenFromUnits(amountRaw, token);
                  const title = getTxTitle(tx, wardNameLookup, wallet.keys?.starkAddress);
                  const statusText = getTxStatus(tx);
                  const statusColor = getStatusColor(tx);
                  const subtitle = `${formatRelativeTime(tx.timestamp)} \u00b7 ${isGuardianWardOp ? getWardActionLabel(tx) : statusText}`;

                  const rowTestID = tx.txHash
                    ? `${testIDs.activity.rowPrefix}.${tx.txHash}`
                    : `${testIDs.activity.rowPrefix}.${i}`;

                  return (
                    <TouchableOpacity
                      {...testProps(rowTestID)}
                      key={tx.txHash || String(i)}
                      style={[styles.row, i < items.length - 1 && styles.rowDivider]}
                      onPress={() => {
                        if (!tx.txHash) return;
                        navigation.getParent()?.navigate("TransactionDetail", {
                          txHash: tx.txHash,
                          type: tx.type,
                          amount: tx.amount,
                          note: tx.note,
                          recipientName: tx.recipientName,
                          timestamp: tx.timestamp,
                          amount_unit: tx.amount_unit || undefined,
                        });
                      }}
                    >
                      <View style={[styles.iconCircle, { backgroundColor: getTxIconBg(tx) }]}>
                        {getTxIcon(tx)}
                      </View>

                      <View style={styles.leftText}>
                        <Text style={styles.titleText} numberOfLines={1}>
                          {title}
                        </Text>
                        <Text
                          style={[
                            styles.subtitleText,
                            statusColor ? { color: statusColor } : undefined,
                          ]}
                          numberOfLines={1}
                        >
                          {subtitle}
                        </Text>
                      </View>

                      <View style={styles.rightText}>
                        {(isWardAdmin && !hasAmount) || (isRollover && !hasAmount) ? (
                          <Text style={[styles.amountText, { color: amountColor }]} numberOfLines={1}>
                            {isRollover ? "Claimed" : statusText}
                          </Text>
                        ) : isGuardianWardOp ? (
                          <Text style={[styles.amountText, { color: colors.textSecondary }]} numberOfLines={1}>
                            {tokenLabel}
                          </Text>
                        ) : (
                          <>
                            <Text style={[styles.amountText, { color: amountColor }]} numberOfLines={1}>
                              {isErc20Display
                                ? `${amountPrefix}${amountUnits} ${token}`
                                : `${amountPrefix}${amountUnits} units`}
                            </Text>
                            <Text style={styles.tokenText} numberOfLines={1}>
                              {tokenLabel}
                            </Text>
                          </>
                        )}
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
    flexDirection: "row",
    gap: 10,
    marginBottom: 18,
  },
  filterChip: {
    height: 30,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(30, 41, 59, 0.55)",
    borderWidth: 1,
    borderColor: "rgba(45, 59, 77, 0.75)",
  },
  filterChipActive: {
    backgroundColor: "rgba(59, 130, 246, 0.22)",
    borderColor: "rgba(59, 130, 246, 0.55)",
  },
  filterChipText: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: typography.primarySemibold,
  },
  filterChipTextActive: {
    color: colors.primaryLight,
  },

  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 11,
    letterSpacing: 1.2,
    marginBottom: 10,
    fontFamily: typography.primarySemibold,
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    overflow: "hidden",
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(45, 59, 77, 0.7)",
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  leftText: {
    flex: 1,
    gap: 3,
  },
  titleText: {
    fontSize: 13,
    color: colors.text,
    fontFamily: typography.secondarySemibold,
  },
  subtitleText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontFamily: typography.secondary,
  },
  rightText: {
    alignItems: "flex-end",
    gap: 3,
    minWidth: 92,
  },
  amountText: {
    fontSize: 13,
    fontFamily: typography.primarySemibold,
  },
  tokenText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontFamily: typography.primary,
  },

  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
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
