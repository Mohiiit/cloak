import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Clipboard from "@react-native-clipboard/clipboard";
import { ArrowLeft, ArrowUpRight, Check, Copy, ExternalLink } from "lucide-react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { colors, borderRadius, typography } from "../../lib/theme";
import type { RootStackParamList } from "../../navigation/types";
import { getTxNotes, type TxMetadata } from "../../lib/storage";
import { TOKENS, type TokenKey } from "../../lib/tokens";
import { testIDs, testProps } from "../../testing/testIDs";

type Props = NativeStackScreenProps<RootStackParamList, "TransactionDetail">;

function truncateMiddle(value: string, start = 6, end = 4): string {
  if (!value) return "";
  if (value.length <= start + end + 3) return value;
  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

function formatDateTime(timestamp?: string | number): string {
  if (!timestamp) return "Unavailable";
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return String(timestamp);
  // Match pen: "Feb 15, 2026 14:32"
  const month = d.toLocaleString("en-US", { month: "short" });
  const day = String(d.getDate());
  const year = String(d.getFullYear());
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${month} ${day}, ${year} ${hh}:${mm}`;
}

function formatTokenAmountFixed2(unitsStr: string, token: TokenKey): string {
  const units = BigInt((unitsStr || "0").replace(/\D/g, "") || "0");
  const cfg = TOKENS[token];
  const wei = units * cfg.rate;
  const divisor = 10n ** BigInt(cfg.decimals);
  const scaled = (wei * 100n) / divisor; // token * 100 (truncated)
  const whole = scaled / 100n;
  const frac = scaled % 100n;
  return `${whole.toString()}.${frac.toString().padStart(2, "0")}`;
}

function typeLabel(type?: TxMetadata["type"] | string): string {
  switch (type) {
    case "send":
      return "Shielded Transfer";
    case "receive":
      return "Shielded Receive";
    case "fund":
      return "Shield";
    case "withdraw":
      return "Unshield";
    case "rollover":
      return "Claim";
    default:
      return type ? String(type) : "Transaction";
  }
}

function isDebit(type?: TxMetadata["type"] | string): boolean {
  return type === "send" || type === "withdraw";
}

export default function TransactionDetailScreen({ navigation, route }: Props) {
  const { txHash } = route.params;

  const [meta, setMeta] = useState<TxMetadata | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let isMounted = true;
    getTxNotes()
      .then((notes) => {
        if (!isMounted) return;
        setMeta(notes?.[txHash] || null);
      })
      .catch(() => {
        if (!isMounted) return;
        setMeta(null);
      });
    return () => {
      isMounted = false;
    };
  }, [txHash]);

  const token = ((meta?.token as TokenKey) || "STRK") satisfies TokenKey;
  const amountUnits = meta?.amount || "0";
  const amountToken = formatTokenAmountFixed2(amountUnits, token);
  const signedAmount = `${isDebit(meta?.type) ? "-" : "+"}${amountToken} ${token}`;

  const toValue = meta?.recipient
    ? truncateMiddle(meta.recipient, 6, 4)
    : "0x07f2...9d56";

  const dateValue = formatDateTime(meta?.timestamp);
  const typeValue = typeLabel(meta?.type);
  const feeValue = "0.0034 STRK";
  const networkValue = "Starknet Mainnet";

  const handleCopy = () => {
    Clipboard.setString(txHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const headerIcon = useMemo(() => {
    // Pen uses an outgoing arrow icon even for debit; keep consistent.
    return <ArrowUpRight size={20} color={colors.success} />;
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <ArrowLeft size={18} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Transaction</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.hero}>
          <View style={styles.heroIconCircle}>{headerIcon}</View>
          <Text style={styles.heroAmount}>{signedAmount}</Text>
          <View style={styles.confirmPill}>
            <View style={styles.confirmDot} />
            <Text style={styles.confirmText}>Confirmed</Text>
          </View>
        </View>

        <View style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>To</Text>
            <Text style={styles.detailValue}>{toValue}</Text>
          </View>
          <View style={styles.detailDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Date</Text>
            <Text style={styles.detailValue}>{dateValue}</Text>
          </View>
          <View style={styles.detailDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Type</Text>
            <Text style={[styles.detailValue, styles.detailValueType]}>{typeValue}</Text>
          </View>
          <View style={styles.detailDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Fee</Text>
            <Text style={styles.detailValue}>{feeValue}</Text>
          </View>
          <View style={styles.detailDivider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Network</Text>
            <Text style={styles.detailValue}>{networkValue}</Text>
          </View>
        </View>

        <Text style={styles.hashLabel}>Transaction Hash</Text>
        <View style={styles.hashRow}>
          <Text style={styles.hashValue} numberOfLines={1}>
            {truncateMiddle(txHash, 14, 8)}
          </Text>
          <TouchableOpacity
            {...testProps(testIDs.themedModal.txCopy)}
            style={styles.hashCopyBtn}
            onPress={handleCopy}
          >
            {copied ? (
              <Check size={16} color={colors.success} />
            ) : (
              <Copy size={16} color={colors.textMuted} />
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          {...testProps(testIDs.themedModal.txViewVoyager)}
          style={styles.voyagerBtn}
          onPress={() => Linking.openURL(`https://sepolia.voyager.online/tx/${txHash}`)}
        >
          <ExternalLink size={16} color={colors.primary} />
          <Text style={styles.voyagerBtnText}>View on Voyager</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 120,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  backBtn: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: colors.text,
    fontSize: 16,
    fontFamily: typography.primarySemibold,
    letterSpacing: 0.2,
  },
  headerSpacer: {
    width: 34,
    height: 34,
  },

  hero: {
    alignItems: "center",
    marginBottom: 18,
    gap: 12,
  },
  heroIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(16, 185, 129, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroAmount: {
    color: colors.text,
    fontSize: 26,
    fontFamily: typography.primarySemibold,
    letterSpacing: 0.2,
  },
  confirmPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(16, 185, 129, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.22)",
    paddingHorizontal: 12,
    height: 24,
    borderRadius: 999,
  },
  confirmDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  confirmText: {
    color: colors.success,
    fontSize: 12,
    fontFamily: typography.primarySemibold,
  },

  detailsCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    overflow: "hidden",
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  detailDivider: {
    height: 1,
    backgroundColor: "rgba(45, 59, 77, 0.7)",
  },
  detailLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: typography.secondary,
  },
  detailValue: {
    color: colors.text,
    fontSize: 12,
    fontFamily: typography.primary,
  },
  detailValueType: {
    color: colors.secondary,
    fontFamily: typography.primarySemibold,
  },

  hashLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: typography.primarySemibold,
    letterSpacing: 0.9,
    marginBottom: 8,
  },
  hashRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: 14,
    height: 44,
    marginBottom: 14,
  },
  hashValue: {
    flex: 1,
    color: colors.text,
    fontSize: 12,
    fontFamily: typography.primary,
  },
  hashCopyBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },

  voyagerBtn: {
    height: 46,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.55)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    backgroundColor: "transparent",
  },
  voyagerBtnText: {
    color: colors.primary,
    fontSize: 13,
    fontFamily: typography.primarySemibold,
  },
});
