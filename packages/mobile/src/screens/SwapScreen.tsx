import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { AlertTriangle, ChevronsUpDown, Repeat } from "lucide-react-native";
import { colors, borderRadius, typography } from "../lib/theme";
import { testIDs, testProps } from "../testing/testIDs";

function MetricChip({
  label,
  bgColor,
}: {
  label: string;
  bgColor: string;
}) {
  return (
    <View style={styles.metricChip}>
      <View style={[styles.metricDot, { backgroundColor: bgColor }]} />
      <Text style={styles.metricText}>{label}</Text>
    </View>
  );
}

function QuoteRow({
  label,
  value,
  valueStyle,
}: {
  label: string;
  value: string;
  valueStyle?: object;
}) {
  return (
    <View style={styles.quoteRow}>
      <Text style={styles.quoteLabel}>{label}</Text>
      <Text style={[styles.quoteValue, valueStyle]}>{value}</Text>
    </View>
  );
}

export default function SwapScreen() {
  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>TOKEN PAIR</Text>
          <Pressable {...testProps(testIDs.swap.pairInput)} style={styles.pairInput}>
            <Repeat size={16} color={colors.textMuted} />
            <Text style={styles.pairText}>STRK pool -&gt; ETH pool</Text>
            <ChevronsUpDown size={18} color={colors.primary} />
          </Pressable>
          <View style={styles.metricRow}>
            <MetricChip label="Out: 1,200u" bgColor="rgba(59, 130, 246, 1)" />
            <MetricChip label="In est: 31u" bgColor="rgba(16, 185, 129, 1)" />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>YOU SEND (PRIVATE)</Text>
          <View style={styles.amountCard}>
            <Text style={styles.amountValue}>12.00</Text>
            <Text style={styles.amountUnit}>tongo units</Text>
            <View style={styles.slippageRow}>
              <Text style={styles.slippageLabel}>Slippage tolerance:</Text>
              <Text style={styles.slippageValue}>0.50%</Text>
              <Text style={styles.slippageEdit}>EDIT</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>QUOTE PREVIEW</Text>
          <View style={styles.quoteCard}>
            <QuoteRow label="Estimated Receive" value="32 tongo units" />
            <QuoteRow label="Minimum Receive" value="31 tongo units" valueStyle={styles.warningText} />
            <QuoteRow label="Receive Units (min)" value="31 units" />
            <QuoteRow label="Potential Dust Units" value="1 unit" valueStyle={styles.warningText} />
          </View>

          <View style={styles.noticeBar}>
            <AlertTriangle size={13} color={colors.warning} />
            <Text style={styles.noticeText}>All amounts are quantized to tongo units</Text>
          </View>

          <View style={styles.statusPill}>
            <Text style={styles.statusText}>Status: Ready to build swap proof</Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable {...testProps(testIDs.swap.review)} style={styles.ctaButton}>
          <Repeat size={16} color="#FFFFFF" />
          <Text style={styles.ctaText}>Review Private Swap</Text>
        </Pressable>
      </View>
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
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 18,
    gap: 24,
  },
  section: {
    gap: 10,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 11,
    letterSpacing: 2,
    fontFamily: typography.primarySemibold,
  },
  pairInput: {
    height: 48,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pairText: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 14,
    fontFamily: typography.secondary,
  },
  metricRow: {
    flexDirection: "row",
    gap: 8,
  },
  metricChip: {
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metricDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  metricText: {
    color: colors.text,
    fontSize: 12,
    fontFamily: typography.secondarySemibold,
  },
  amountCard: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    paddingVertical: 16,
    alignItems: "center",
    gap: 8,
  },
  amountValue: {
    color: colors.text,
    fontSize: 48,
    lineHeight: 52,
    fontFamily: typography.primarySemibold,
  },
  amountUnit: {
    color: colors.textSecondary,
    fontSize: 13,
    fontFamily: typography.primary,
  },
  slippageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  slippageLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: typography.secondary,
  },
  slippageValue: {
    color: colors.success,
    fontSize: 12,
    fontFamily: typography.primarySemibold,
  },
  slippageEdit: {
    color: colors.primaryLight,
    fontSize: 11,
    fontFamily: typography.primarySemibold,
  },
  quoteCard: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  quoteRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  quoteLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontFamily: typography.secondary,
  },
  quoteValue: {
    color: colors.text,
    fontSize: 12,
    fontFamily: typography.primarySemibold,
  },
  warningText: {
    color: colors.warning,
  },
  noticeBar: {
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.25)",
    backgroundColor: "rgba(245, 158, 11, 0.08)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 12,
  },
  noticeText: {
    color: colors.warning,
    fontSize: 11,
    fontFamily: typography.primary,
  },
  statusPill: {
    height: 34,
    borderRadius: 999,
    backgroundColor: "rgba(59, 130, 246, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  statusText: {
    color: colors.primaryLight,
    fontSize: 11,
    fontFamily: typography.primarySemibold,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 6,
    paddingBottom: 12,
  },
  ctaButton: {
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  ctaText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: typography.primarySemibold,
  },
});
