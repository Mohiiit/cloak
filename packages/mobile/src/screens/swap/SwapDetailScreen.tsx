import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import ClipboardLib from "@react-native-clipboard/clipboard";
import { Linking } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { ArrowLeft, Copy, ExternalLink, Repeat } from "lucide-react-native";
import { colors, typography } from "../../lib/theme";
import type { RootStackParamList } from "../../navigation/types";

function DetailRow({
  label,
  value,
  valueStyle,
  isLast,
}: {
  label: string;
  value: string;
  valueStyle?: object;
  isLast?: boolean;
}) {
  return (
    <View style={[styles.detailRow, isLast && styles.detailRowLast]}>
      <Text style={styles.detailKey}>{label}</Text>
      <Text style={[styles.detailValue, valueStyle]} numberOfLines={1} ellipsizeMode="middle">
        {value}
      </Text>
    </View>
  );
}

export default function SwapDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, "SwapDetail">>();
  const params = route.params;

  const pair = params?.pair ?? "Swap";
  const sentUnits = params?.sentUnits ?? "0";
  const receivedUnits = params?.receivedUnits ?? "0";
  const sentDisplay = params?.sentDisplay ?? "0";
  const receivedDisplay = params?.receivedDisplay ?? "0";
  const fromToken = params?.fromToken ?? "STRK";
  const toToken = params?.toToken ?? "ETH";
  const rateDisplay = params?.rateDisplay ?? "-";
  const routeDisplay = params?.routeDisplay ?? "-";
  const txHash = params?.txHash ?? "-";
  const status = params?.status ?? "Settled";
  const isSettled = status === "Settled";

  const sellAmountErc20 = params?.sellAmountErc20;
  const estimatedBuyErc20 = params?.estimatedBuyErc20;
  const minBuyErc20 = params?.minBuyErc20;
  const actualBuyErc20 = params?.actualBuyErc20;
  const gasFee = params?.gasFee;

  const hasBreakdown = !!(sellAmountErc20 || estimatedBuyErc20 || minBuyErc20 || gasFee);

  const displayTxHash =
    txHash.length > 20
      ? `${txHash.slice(0, 10)}...${txHash.slice(-8)}`
      : txHash;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <ArrowLeft size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Swap Detail</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Icon */}
        <View style={styles.iconWrap}>
          <Repeat size={28} color="#3B82F6" />
        </View>

        {/* Amount */}
        <Text style={styles.amount}>{receivedUnits} tongo units</Text>

        {/* Status pill */}
        <View style={[styles.statusPill, !isSettled && styles.statusPillFailed]}>
          <View style={[styles.statusDot, !isSettled && styles.statusDotFailed]} />
          <Text style={[styles.statusText, !isSettled && styles.statusTextFailed]}>{status}</Text>
        </View>

        {/* Detail card */}
        <View style={styles.detailCard}>
          <DetailRow label="Pair" value={pair} />
          <DetailRow label="Sent" value={`${sentUnits} tongo units`} />
          <DetailRow
            label="Received"
            value={`${receivedUnits} tongo units`}
            valueStyle={isSettled ? styles.valueSuccess : undefined}
          />
          <DetailRow label="Rate" value={rateDisplay} />
          <DetailRow label="Route" value={routeDisplay} isLast />
        </View>

        {/* Swap Breakdown */}
        {hasBreakdown ? (
          <>
            <Text style={styles.breakdownTitle}>Swap Breakdown</Text>
            <View style={styles.breakdownCard}>
              {sellAmountErc20 ? (
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Unshielded</Text>
                  <Text style={styles.breakdownDesc}>
                    {sentUnits} tongo units → {sellAmountErc20}
                  </Text>
                </View>
              ) : null}
              {estimatedBuyErc20 ? (
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>DEX Swap</Text>
                  <Text style={styles.breakdownDesc}>
                    {sellAmountErc20 ?? `${sentDisplay} ${fromToken}`} → {estimatedBuyErc20}
                  </Text>
                </View>
              ) : null}
              {minBuyErc20 ? (
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Min Received</Text>
                  <Text style={styles.breakdownDesc}>{minBuyErc20} (after slippage)</Text>
                </View>
              ) : null}
              {actualBuyErc20 ? (
                <View style={styles.breakdownRow}>
                  <Text style={[styles.breakdownLabel, { color: colors.success }]}>Actual Received</Text>
                  <Text style={[styles.breakdownDesc, { color: colors.success }]}>{actualBuyErc20}</Text>
                </View>
              ) : null}
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Re-shielded</Text>
                <Text style={styles.breakdownDesc}>
                  {receivedDisplay ? `${receivedDisplay} ${toToken}` : `${receivedUnits} units`} → {receivedUnits} tongo units
                </Text>
              </View>
              {gasFee ? (
                <View style={[styles.breakdownRow, styles.breakdownRowLast]}>
                  <Text style={styles.breakdownLabel}>Gas Fee</Text>
                  <Text style={[styles.breakdownDesc, { color: colors.textSecondary }]}>{gasFee}</Text>
                </View>
              ) : null}
            </View>
          </>
        ) : null}

        {/* Tx Hash section */}
        <Text style={styles.hashLabel}>Swap Tx Hash</Text>
        <View style={styles.hashRow}>
          <Text style={styles.hashValue} numberOfLines={1} ellipsizeMode="middle">
            {displayTxHash}
          </Text>
          <Pressable hitSlop={8} onPress={() => ClipboardLib.setString(txHash)}>
            <Copy size={16} color={colors.textMuted} />
          </Pressable>
        </View>

        {/* Voyager button */}
        <Pressable
          style={styles.voyagerButton}
          onPress={() => {
            if (!txHash || txHash === "-") return;
            Linking.openURL(`https://sepolia.voyager.online/tx/${txHash}`).catch(() => undefined);
          }}
        >
          <ExternalLink size={16} color="#3B82F6" />
          <Text style={styles.voyagerText}>View settlement on Voyager</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    alignItems: "center",
  },

  /* Header */
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 56,
    paddingHorizontal: 20,
  },
  backButton: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    fontFamily: typography.primarySemibold,
  },
  headerSpacer: {
    width: 24,
  },

  /* Icon */
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(59, 130, 246, 0.13)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    marginBottom: 16,
  },

  /* Amount */
  amount: {
    textAlign: "center",
    color: colors.text,
    fontSize: 28,
    fontWeight: "700",
    fontFamily: typography.primarySemibold,
    marginBottom: 12,
  },

  /* Status pill */
  statusPill: {
    height: 28,
    borderRadius: 20,
    backgroundColor: "rgba(16, 185, 129, 0.13)",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 20,
  },
  statusPillFailed: {
    backgroundColor: "rgba(239, 68, 68, 0.13)",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  statusDotFailed: {
    backgroundColor: colors.error,
  },
  statusText: {
    color: colors.success,
    fontSize: 12,
    fontWeight: "600",
    fontFamily: typography.primarySemibold,
  },
  statusTextFailed: {
    color: colors.error,
  },

  /* Detail card */
  detailCard: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    overflow: "hidden",
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  detailRowLast: {
    borderBottomWidth: 0,
  },
  detailKey: {
    color: colors.textMuted,
    fontSize: 13,
    fontFamily: typography.secondary,
  },
  detailValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "500",
    fontFamily: typography.primarySemibold,
    flexShrink: 1,
    textAlign: "right",
    maxWidth: "60%",
  },
  valueSuccess: {
    color: colors.success,
  },

  /* Breakdown section */
  breakdownTitle: {
    alignSelf: "flex-start",
    color: colors.textMuted,
    fontSize: 11,
    letterSpacing: 1.5,
    fontFamily: typography.primarySemibold,
    marginBottom: 10,
  },
  breakdownCard: {
    width: "100%",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    padding: 14,
    gap: 12,
    marginBottom: 20,
  },
  breakdownRow: {
    gap: 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    paddingBottom: 12,
  },
  breakdownRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  breakdownLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: typography.secondarySemibold,
  },
  breakdownDesc: {
    color: colors.text,
    fontSize: 12,
    fontFamily: typography.primarySemibold,
  },

  /* Hash section */
  hashLabel: {
    alignSelf: "flex-start",
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: typography.secondary,
    marginBottom: 8,
  },
  hashRow: {
    width: "100%",
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.inputBg,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  hashValue: {
    flex: 1,
    color: colors.text,
    fontSize: 11,
    fontFamily: typography.primarySemibold,
    marginRight: 8,
  },

  /* Voyager button */
  voyagerButton: {
    width: "100%",
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#3B82F6",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  voyagerText: {
    color: "#3B82F6",
    fontSize: 14,
    fontWeight: "600",
    fontFamily: typography.primarySemibold,
  },
});
