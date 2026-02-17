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
} from "lucide-react-native";
import { useWallet } from "../lib/WalletContext";
import { getTxNotes, type TxMetadata } from "../lib/storage";
import { TOKENS, type TokenKey } from "../lib/tokens";
import { colors, spacing, fontSize, borderRadius, typography } from "../lib/theme";
import { testIDs, testProps } from "../testing/testIDs";

type FilterKey = "all" | "sent" | "received" | "shield";

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
  if (filter === "sent") return ["send", "withdraw"].includes(type);
  if (filter === "received") return ["receive", "rollover"].includes(type);
  if (filter === "shield") return type === "fund";
  return true;
}

function getTxTitle(tx: TxMetadata): string {
  switch (tx.type) {
    case "send":
      return tx.recipientName ? `Sent to ${tx.recipientName}` : "Sent payment";
    case "receive":
      return "Received shielded";
    case "fund":
      return `Shielded ${formatTokenFromUnits(tx.amount || "0", tx.token as TokenKey)}`;
    case "withdraw":
      return `Unshielded ${formatTokenFromUnits(tx.amount || "0", tx.token as TokenKey)}`;
    case "rollover":
      return "Claimed pending funds";
    default:
      return "Transaction";
  }
}

function getTxStatus(tx: TxMetadata): string {
  switch (tx.type) {
    case "send":
      return "Shielded";
    case "receive":
    case "rollover":
      return "Claimed";
    case "fund":
      return "Fund";
    case "withdraw":
      return "Withdraw";
    default:
      return "Pending";
  }
}

function getTxPolarity(tx: TxMetadata): "credit" | "debit" {
  return ["receive", "fund", "rollover"].includes(tx.type) ? "credit" : "debit";
}

function getTxColor(tx: TxMetadata): string {
  switch (tx.type) {
    case "send":
      return colors.primary;
    case "receive":
    case "fund":
      return colors.success;
    case "withdraw":
      return colors.secondary;
    case "rollover":
      return colors.warning;
    default:
      return colors.textMuted;
  }
}

function getTxIcon(tx: TxMetadata): React.ReactNode {
  switch (tx.type) {
    case "fund":
      return <ShieldPlus size={18} color={colors.success} />;
    case "withdraw":
      return <ShieldOff size={18} color={colors.secondary} />;
    case "send":
      return <ArrowUpFromLine size={18} color={colors.primary} />;
    case "receive":
      return <ArrowDownToLine size={18} color={colors.success} />;
    case "rollover":
      return <RefreshCw size={18} color={colors.warning} />;
    default:
      return <RefreshCw size={18} color={colors.textMuted} />;
  }
}

function getTxIconBg(tx: TxMetadata): string {
  switch (tx.type) {
    case "fund":
    case "receive":
      return "rgba(16, 185, 129, 0.14)";
    case "withdraw":
      return "rgba(139, 92, 246, 0.14)";
    case "send":
      return "rgba(59, 130, 246, 0.14)";
    case "rollover":
      return "rgba(245, 158, 11, 0.14)";
    default:
      return "rgba(148, 163, 184, 0.12)";
  }
}

function formatTokenFromUnits(unitsStr: string, token: TokenKey): string {
  const units = BigInt((unitsStr || "0").replace(/\D/g, "") || "0");
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

export default function ActivityScreen({ navigation }: any) {
  const wallet = useWallet();
  const [history, setHistory] = useState<TxMetadata[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");

  const loadNotes = useCallback(async () => {
    const notes = await getTxNotes();
    const arr = Object.values(notes || {}).filter(Boolean) as TxMetadata[];
    arr.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    setHistory(arr);
  }, []);

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
    const buckets: Record<"Today" | "Yesterday" | "Earlier", TxMetadata[]> = {
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
                  const amountUnitsRaw = tx.amount || "0";
                  const amountUnits = formatIntWithCommas(amountUnitsRaw);
                  const polarity = getTxPolarity(tx);
                  const amountPrefix = polarity === "credit" ? "+" : "-";
                  const amountColor = getTxColor(tx);
                  const token = (tx.token || "STRK") as TokenKey;
                  const tokenLabel = formatTokenFromUnits(amountUnitsRaw, token);
                  const title = getTxTitle(tx);
                  const subtitle = `${formatRelativeTime(tx.timestamp)} \u00b7 ${getTxStatus(tx)}`;

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
                        <Text style={styles.subtitleText} numberOfLines={1}>
                          {subtitle}
                        </Text>
                      </View>

                      <View style={styles.rightText}>
                        <Text style={[styles.amountText, { color: amountColor }]} numberOfLines={1}>
                          {amountPrefix}
                          {amountUnits} units
                        </Text>
                        <Text style={styles.tokenText} numberOfLines={1}>
                          {tokenLabel}
                        </Text>
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

