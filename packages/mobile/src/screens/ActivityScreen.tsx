import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Linking,
} from "react-native";
import { ShieldPlus, ArrowUpFromLine, ArrowDownToLine, RefreshCw, ExternalLink } from "lucide-react-native";
import { useWallet } from "../lib/WalletContext";
import { getTxNotes } from "../lib/storage";
import { colors, spacing, fontSize, borderRadius } from "../lib/theme";

function TxIcon({ type }: { type: string }) {
  switch (type) {
    case "fund": return <ShieldPlus size={20} color={colors.success} />;
    case "transfer":
    case "transferOut":
    case "send": return <ArrowUpFromLine size={20} color={colors.primary} />;
    case "transferIn":
    case "receive": return <ArrowDownToLine size={20} color={colors.success} />;
    case "withdraw": return <ArrowUpFromLine size={20} color={colors.secondary} />;
    case "rollover": return <RefreshCw size={20} color={colors.warning} />;
    default: return <RefreshCw size={20} color={colors.textMuted} />;
  }
}

function txLabel(type: string): string {
  switch (type) {
    case "fund": return "Shield";
    case "transfer":
    case "transferOut":
    case "send": return "Send";
    case "transferIn":
    case "receive": return "Receive";
    case "withdraw": return "Unshield";
    case "rollover": return "Claim";
    default: return type;
  }
}

export default function ActivityScreen() {
  const wallet = useWallet();
  const [enrichedHistory, setEnrichedHistory] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadHistory = async () => {
    await wallet.refreshTxHistory();
    const notes = await getTxNotes();
    const enriched = (wallet.txHistory || []).map((event: any) => {
      const txHash = event.txHash || event.transaction_hash || "";
      const meta = notes[txHash];
      return {
        ...event,
        txHash,
        note: meta?.note,
        recipientName: meta?.recipientName,
        displayType: event.type || meta?.type || "unknown",
      };
    });
    setEnrichedHistory(enriched);
  };

  useEffect(() => { loadHistory(); }, [wallet.txHistory]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await wallet.refreshTxHistory();
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
      }
    >
      {enrichedHistory.length === 0 ? (
        <View style={styles.emptyContainer}>
          <RefreshCw size={32} color={colors.textMuted} />
          <Text style={styles.emptyText}>No transactions yet</Text>
          <Text style={styles.emptySubtext}>Your activity will appear here</Text>
        </View>
      ) : (
        enrichedHistory.map((tx: any, i: number) => {
          const hash = tx.txHash || "";
          return (
            <TouchableOpacity
              key={hash || i}
              style={styles.txRow}
              onPress={() => hash && Linking.openURL(`https://sepolia.voyager.online/tx/${hash}`)}
            >
              <TxIcon type={tx.displayType} />
              <View style={styles.txInfo}>
                <View style={styles.txTopRow}>
                  <Text style={styles.txType}>{txLabel(tx.displayType)}</Text>
                  {tx.amount && (
                    <Text style={styles.txAmount}>{tx.amount} units</Text>
                  )}
                </View>
                {tx.note && <Text style={styles.txNote}>{tx.note}</Text>}
                {tx.recipientName && <Text style={styles.txNote}>to {tx.recipientName}</Text>}
                {hash && <Text style={styles.txHash}>{hash.slice(0, 16)}...</Text>}
              </View>
              <ExternalLink size={14} color={colors.textMuted} />
            </TouchableOpacity>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 100 },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyText: { fontSize: fontSize.md, color: colors.textSecondary },
  emptySubtext: { fontSize: fontSize.sm, color: colors.textMuted },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: spacing.sm,
  },
  txInfo: { flex: 1 },
  txTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  txType: {
    fontSize: fontSize.md,
    fontWeight: "600",
    color: colors.text,
  },
  txAmount: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontFamily: "monospace",
  },
  txNote: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  txHash: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontFamily: "monospace",
    marginTop: 2,
  },
});
