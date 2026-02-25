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
import {
  type AmountUnit,
} from "@cloak-wallet/sdk";
import { colors, borderRadius, typography } from "../../lib/theme";
import { useWallet } from "../../lib/WalletContext";
import type { RootStackParamList } from "../../navigation/types";
import { type TxMetadata } from "../../lib/storage";
import { type TokenKey, unitLabel } from "../../lib/tokens";
import { testIDs, testProps } from "../../testing/testIDs";
import { loadActivityByTxHash, type ActivityFeedItem } from "../../lib/activity/feed";
import {
  GUARDIAN_WARD_TYPES,
  SHIELDED_TYPES,
  WARD_ADMIN_TYPES,
  toDisplayAmountFromAny,
  toTongoUnitsFromAny,
} from "../../lib/activity/amounts";

type Props = NativeStackScreenProps<RootStackParamList, "TransactionDetail">;

/** Extended metadata including backend API-sourced fields */
interface TxMetadataExtended extends Omit<ActivityFeedItem, "type"> {
  type: TxMetadata["type"] | string;
  status?: string;
  statusDetail?: string;
  errorMessage?: string;
  accountType?: string;
  fee?: string;
  amount_unit?: AmountUnit | null;
  wardAddress?: string;
  walletAddress?: string;
}

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

function formatFeeDisplay(feeWei?: string): string {
  if (!feeWei) return "--";
  try {
    const value = BigInt(feeWei);
    const unit = 10n ** 18n;
    const scaled = (value * 10000n) / unit;
    const w = scaled / 10000n;
    const f = scaled % 10000n;
    return `${w.toString()}.${f.toString().padStart(4, "0")} STRK`;
  } catch {
    return feeWei;
  }
}

function typeLabel(type?: TxMetadata["type"] | string): string {
  switch (type) {
    case "send":
      return "Shielded Transfer";
    case "erc20_transfer":
      return "Public Transfer";
    case "receive":
      return "Shielded Receive";
    case "fund":
      return "Shield";
    case "withdraw":
      return "Unshield";
    case "rollover":
      return "Claim";
    case "deploy_ward":
      return "Deploy Ward";
    case "fund_ward":
      return "Fund Ward";
    case "configure_ward":
      return "Configure Ward";
    default:
      return type ? String(type) : "Transaction";
  }
}

function isDebit(type?: TxMetadata["type"] | string): boolean {
  return ["send", "withdraw", "erc20_transfer", "deploy_ward", "fund_ward", "configure_ward"].includes(type || "");
}

/** Yellow ward color palette */
const wardYellow = "#F59E0B";
const wardYellowBg = "rgba(245, 158, 11, 0.14)";
const wardYellowBorder = "rgba(245, 158, 11, 0.22)";

/** Status pill colors */
function getStatusPill(status?: string): { label: string; dotColor: string; bgColor: string; borderColor: string } {
  switch (status) {
    case "failed":
      return {
        label: "Failed",
        dotColor: colors.error,
        bgColor: "rgba(239, 68, 68, 0.14)",
        borderColor: "rgba(239, 68, 68, 0.22)",
      };
    case "pending":
      return {
        label: "Pending",
        dotColor: "#F59E0B",
        bgColor: "rgba(245, 158, 11, 0.14)",
        borderColor: "rgba(245, 158, 11, 0.22)",
      };
    case "rejected":
      return {
        label: "Rejected",
        dotColor: colors.error,
        bgColor: "rgba(239, 68, 68, 0.14)",
        borderColor: "rgba(239, 68, 68, 0.22)",
      };
    case "gas_error":
      return {
        label: "Gas Retry",
        dotColor: "#F59E0B",
        bgColor: "rgba(245, 158, 11, 0.14)",
        borderColor: "rgba(245, 158, 11, 0.22)",
      };
    case "expired":
      return {
        label: "Expired",
        dotColor: colors.textMuted,
        bgColor: "rgba(148, 163, 184, 0.14)",
        borderColor: "rgba(148, 163, 184, 0.22)",
      };
    default:
      return {
        label: "Confirmed",
        dotColor: colors.success,
        bgColor: "rgba(16, 185, 129, 0.14)",
        borderColor: "rgba(16, 185, 129, 0.22)",
      };
  }
}

export default function TransactionDetailScreen({ navigation, route }: Props) {
  const { txHash } = route.params;
  const wallet = useWallet();

  const [meta, setMeta] = useState<TxMetadataExtended | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      const walletAddress = wallet.keys?.starkAddress;
      if (!walletAddress) return;
      const row = await loadActivityByTxHash(walletAddress, txHash);
      if (isMounted) setMeta((row as TxMetadataExtended) || null);
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, [txHash, wallet.keys?.starkAddress]);

  const token = ((meta?.token as TokenKey) || "STRK") satisfies TokenKey;
  const amountRaw = meta?.amount || "0";

  // Determine viewer perspective: am I the ward or the guardian?
  const myAddress = wallet.keys?.starkAddress;
  const myNorm = myAddress?.toLowerCase().replace(/^0x0+/, "0x") || "";
  const wardNorm = meta?.wardAddress?.toLowerCase().replace(/^0x0+/, "0x") || "";
  const walletNorm = meta?.walletAddress?.toLowerCase().replace(/^0x0+/, "0x") || "";
  // I'm viewing as the ward if my address matches the ward address (and I'm not the guardian who submitted it)
  const viewingAsWard = !!myNorm && !!wardNorm && myNorm === wardNorm && myNorm !== walletNorm;

  const isGuardianWardOp = !viewingAsWard && meta?.accountType === "guardian" && GUARDIAN_WARD_TYPES.includes(meta?.type as any);
  const isWardAdmin = WARD_ADMIN_TYPES.includes(meta?.type as any);
  const isShieldedOp = SHIELDED_TYPES.includes(meta?.type as any) && !isGuardianWardOp;
  const isPublicOp = (meta?.type === "erc20_transfer" && !isGuardianWardOp) || isWardAdmin || (viewingAsWard && meta?.accountType === "guardian");
  const prefix = isDebit(meta?.type) ? "-" : "+";
  const displayAmount = toDisplayAmountFromAny(amountRaw, meta?.amount_unit, token, meta?.type);
  const unitsAmount = toTongoUnitsFromAny(amountRaw, meta?.amount_unit, token, meta?.type);

  // Compute hero amount display
  let signedAmount: string;
  let heroSecondary = "";

  if (isGuardianWardOp && meta?.type === "erc20_transfer") {
    signedAmount = `${displayAmount} ${token}`;
  } else if (isShieldedOp || isGuardianWardOp) {
    signedAmount = isGuardianWardOp ? unitLabel(unitsAmount) : `${prefix}${unitLabel(unitsAmount)}`;
    if (unitsAmount !== "0") {
      heroSecondary = `(${displayAmount} ${token})`;
    }
  } else if (isPublicOp) {
    signedAmount = `${prefix}${displayAmount} ${token}`;
  } else {
    signedAmount = `${prefix}${displayAmount} ${token}`;
  }

  const toValue = meta?.recipient
    ? truncateMiddle(meta.recipient, 6, 4)
    : "0x07f2...9d56";

  const dateValue = formatDateTime(meta?.timestamp);
  const typeValue = typeLabel(meta?.type);
  const feeValue = formatFeeDisplay(meta?.fee);
  const networkValue = "Starknet Sepolia";
  const statusPill = getStatusPill(meta?.status);

  const handleCopy = () => {
    Clipboard.setString(txHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const headerIcon = useMemo(() => {
    if (isGuardianWardOp || isWardAdmin) {
      return <ArrowUpRight size={20} color={wardYellow} />;
    }
    return <ArrowUpRight size={20} color={colors.success} />;
  }, [isGuardianWardOp, isWardAdmin]);

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
          <View style={[
            styles.heroIconCircle,
            (isGuardianWardOp || isWardAdmin) && { backgroundColor: wardYellowBg, borderColor: wardYellowBorder },
          ]}>{headerIcon}</View>
          <Text style={styles.heroAmount}>{signedAmount}</Text>
          {heroSecondary ? (
            <Text style={styles.heroSubAmount}>{heroSecondary}</Text>
          ) : null}
          <View
            style={[
              styles.confirmPill,
              { backgroundColor: statusPill.bgColor, borderColor: statusPill.borderColor },
            ]}
          >
            <View style={[styles.confirmDot, { backgroundColor: statusPill.dotColor }]} />
            <Text style={[styles.confirmText, { color: statusPill.dotColor }]}>
              {statusPill.label}
            </Text>
          </View>
        </View>

        {/* Error message for failed transactions */}
        {meta?.status === "failed" && meta?.errorMessage ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorBoxText} numberOfLines={3}>
              {meta.errorMessage}
            </Text>
          </View>
        ) : null}

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
            <View style={styles.typeRow}>
              <Text style={[styles.detailValue, styles.detailValueType]}>{typeValue}</Text>
              {meta?.accountType && meta.accountType !== "normal" && !viewingAsWard ? (
                <View style={[
                  styles.accountTypeBadge,
                  (isGuardianWardOp || meta.accountType === "ward") && { backgroundColor: wardYellowBg },
                ]}>
                  <Text style={[
                    styles.accountTypeBadgeText,
                    (isGuardianWardOp || meta.accountType === "ward") && { color: wardYellow },
                  ]}>
                    {isGuardianWardOp ? "Ward" : meta.accountType === "ward" ? "Ward" : meta.accountType}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
          {/* Ward info for guardian-submitted ward operations */}
          {isGuardianWardOp ? (
            <>
              <View style={styles.detailDivider} />
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Ward</Text>
                <View style={{ alignItems: "flex-end", gap: 2 }}>
                  {meta?.recipientName ? (
                    <Text style={[styles.detailValue, { color: wardYellow, fontFamily: typography.primarySemibold }]}>
                      {meta.recipientName}
                    </Text>
                  ) : null}
                  <Text style={[styles.detailValue, { color: meta?.recipientName ? colors.textSecondary : wardYellow, fontSize: 11 }]}>
                    {meta?.wardAddress ? truncateMiddle(meta.wardAddress, 8, 6) : "Unknown"}
                  </Text>
                </View>
              </View>
              <View style={styles.detailDivider} />
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Role</Text>
                <Text style={[styles.detailValue, { color: wardYellow }]}>Approved as Guardian</Text>
              </View>
            </>
          ) : null}
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
  heroSubAmount: {
    color: colors.textSecondary,
    fontSize: 14,
    fontFamily: typography.primary,
    marginTop: -4,
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

  errorBox: {
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.2)",
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  errorBoxText: {
    fontSize: 12,
    color: colors.error,
    fontFamily: typography.secondary,
    lineHeight: 17,
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
  typeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  accountTypeBadge: {
    backgroundColor: "rgba(59, 130, 246, 0.18)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  accountTypeBadgeText: {
    fontSize: 10,
    color: colors.primary,
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
