import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Modal } from "react-native";
import { useNavigation } from "@react-navigation/native";
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
  const navigation = useNavigation<any>();
  const [stage, setStage] = useState<"configure" | "confirm" | "pending">("configure");
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);

  const stageMeta = useMemo(() => {
    if (stage === "confirm") {
      return {
        statusText: "Status: Waiting for final confirmation",
        ctaLabel: "Confirm Private Swap",
        ctaTestID: testIDs.swap.confirm,
      };
    }
    if (stage === "pending") {
      return {
        statusText: "Status: Private swap pending",
        routeText: "Execution Route          shielded in -> shielded out",
      };
    }

    return {
      statusText: "Status: Ready to build swap proof",
      ctaLabel: "Review Private Swap",
      ctaTestID: testIDs.swap.review,
    };
  }, [stage]);

  const onPrimaryAction = () => {
    if (stage === "configure") {
      setStage("confirm");
      return;
    }

    if (stage === "confirm") {
      setStage("pending");
    }
  };

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
            <Text style={styles.noticeText}>
              {stage === "pending" ? "Swap quantized into tongo units" : "All amounts are quantized to tongo units"}
            </Text>
          </View>

          <View style={styles.statusPill}>
            <Text style={styles.statusText}>{stageMeta.statusText}</Text>
          </View>
          {stageMeta.routeText ? (
            <Pressable
              {...testProps(testIDs.swap.pendingRoute)}
              onPress={() => setShowProgressModal(true)}
              style={styles.routePill}
            >
              <Text style={styles.routeText}>{stageMeta.routeText}</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>

      {stageMeta.ctaLabel ? (
        <View style={styles.footer}>
          <Pressable
            {...testProps(stageMeta.ctaTestID as string)}
            style={styles.ctaButton}
            onPress={onPrimaryAction}
          >
            <Repeat size={16} color="#FFFFFF" />
            <Text style={styles.ctaText}>{stageMeta.ctaLabel}</Text>
          </Pressable>
        </View>
      ) : null}

      <Modal
        visible={showProgressModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowProgressModal(false)}
      >
        <View style={styles.progressOverlay}>
          <Pressable
            style={styles.progressCard}
            {...testProps(testIDs.swap.progressModal)}
            onPress={() => {
              setShowProgressModal(false);
              setShowCompleteModal(true);
            }}
          >
            <View style={styles.progressIconWrap}>
              <Repeat size={18} color={colors.primaryLight} />
            </View>
            <Text style={styles.progressTitle}>Processing Private Swap...</Text>

            <View style={styles.progressList}>
              <View style={styles.progressRow}>
                <View style={[styles.progressDot, styles.progressDotDone]}>
                  <Text style={styles.progressDotCheck}>✓</Text>
                </View>
                <Text style={styles.progressRowDone}>Building swap proof</Text>
              </View>
              <View style={styles.progressRow}>
                <View style={[styles.progressDot, styles.progressDotDone]}>
                  <Text style={styles.progressDotCheck}>✓</Text>
                </View>
                <Text style={styles.progressRowDone}>Executing private route</Text>
              </View>
              <View style={styles.progressRow}>
                <View style={[styles.progressDot, styles.progressDotActive]} />
                <Text style={styles.progressRowActive}>Settling shielded receive</Text>
              </View>
              <View style={styles.progressRow}>
                <View style={styles.progressDot} />
                <Text style={styles.progressRowPending}>Finalizing</Text>
              </View>
              <View style={styles.progressRow}>
                <View style={styles.progressDot} />
                <Text style={styles.progressRowPending}>Complete</Text>
              </View>
            </View>

            <View style={styles.progressTrack}>
              <View style={styles.progressFill} />
            </View>
            <Text style={styles.progressFootnote}>Submitting private settlement...</Text>
          </Pressable>
        </View>
      </Modal>

      <Modal
        visible={showCompleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCompleteModal(false)}
      >
        <View style={styles.progressOverlay}>
          <View style={styles.completeCard} {...testProps(testIDs.swap.completeModal)}>
            <View style={styles.confettiRow}>
              <View style={[styles.confettiDot, { backgroundColor: "#38BDF8" }]} />
              <View style={[styles.confettiDot, { backgroundColor: "#22C55E" }]} />
              <View style={[styles.confettiDot, { backgroundColor: "#F59E0B" }]} />
              <View style={[styles.confettiDot, { backgroundColor: "#8B5CF6" }]} />
            </View>
            <View style={styles.completeIconWrap}>
              <Text style={styles.completeIconCheck}>✓</Text>
            </View>
            <Text style={styles.completeTitle}>Swap Complete!</Text>
            <Text style={styles.completeSubtitle}>Your private swap settled successfully.</Text>

            <View style={styles.completeSummary}>
              <View style={styles.completeSummaryRow}>
                <Text style={styles.completeKey}>Pair</Text>
                <Text style={styles.completeValue}>STRK → ETH</Text>
              </View>
              <View style={styles.completeSummaryRow}>
                <Text style={styles.completeKey}>Sent</Text>
                <Text style={styles.completeValue}>12.00 tongo units</Text>
              </View>
              <View style={styles.completeSummaryRow}>
                <Text style={styles.completeKey}>Received</Text>
                <Text style={styles.completeValueSuccess}>31 tongo units</Text>
              </View>
              <View style={styles.completeSummaryRow}>
                <Text style={styles.completeKey}>Tx Hash</Text>
                <Text style={styles.completeValueLink}>0x9a4c...7ef1</Text>
              </View>
            </View>

            <Pressable
              {...testProps(testIDs.swap.completeDone)}
              style={styles.completeDoneButton}
              onPress={() => {
                setShowCompleteModal(false);
                setStage("configure");
              }}
            >
              <Text style={styles.completeDoneText}>✓ Done</Text>
            </Pressable>

            <Pressable
              {...testProps(testIDs.swap.completeViewDetails)}
              onPress={() => {
                setShowCompleteModal(false);
                navigation.getParent()?.navigate("SwapDetail");
              }}
            >
              <Text style={styles.completeViewDetails}>View swap details</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  routePill: {
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.25)",
    backgroundColor: "rgba(16, 185, 129, 0.08)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  routeText: {
    color: colors.success,
    fontSize: 10,
    fontFamily: typography.secondarySemibold,
    letterSpacing: 0.2,
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
  progressOverlay: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  progressCard: {
    width: "100%",
    maxWidth: 320,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  progressIconWrap: {
    alignSelf: "center",
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.5)",
    backgroundColor: "rgba(59, 130, 246, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  progressTitle: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 20,
    textAlign: "center",
    fontFamily: typography.primarySemibold,
    marginBottom: 14,
  },
  progressList: {
    gap: 10,
    marginBottom: 16,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  progressDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    backgroundColor: "transparent",
  },
  progressDotDone: {
    borderColor: colors.success,
    backgroundColor: colors.success,
  },
  progressDotActive: {
    borderColor: colors.primary,
  },
  progressRowDone: {
    color: colors.text,
    fontSize: 12,
    fontFamily: typography.secondarySemibold,
  },
  progressRowActive: {
    color: colors.text,
    fontSize: 12,
    fontFamily: typography.secondarySemibold,
  },
  progressRowPending: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: typography.secondary,
  },
  progressDotCheck: {
    color: "#FFFFFF",
    fontSize: 11,
    lineHeight: 12,
    fontFamily: typography.primarySemibold,
  },
  progressTrack: {
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    overflow: "hidden",
    marginBottom: 10,
  },
  progressFill: {
    width: "58%",
    height: "100%",
    backgroundColor: colors.primary,
  },
  progressFootnote: {
    color: colors.textMuted,
    fontSize: 10,
    textAlign: "center",
    fontFamily: typography.secondary,
  },
  completeCard: {
    width: "100%",
    maxWidth: 320,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 16,
    alignItems: "center",
  },
  confettiRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  confettiDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  completeIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  completeIconCheck: {
    color: colors.success,
    fontSize: 28,
    lineHeight: 30,
    fontFamily: typography.primarySemibold,
  },
  completeTitle: {
    color: colors.success,
    fontSize: 28,
    lineHeight: 32,
    fontFamily: typography.primarySemibold,
    marginBottom: 4,
  },
  completeSubtitle: {
    color: colors.textSecondary,
    fontSize: 10,
    fontFamily: typography.secondary,
    marginBottom: 10,
  },
  completeSummary: {
    width: "100%",
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 10,
    backgroundColor: colors.bg,
    marginBottom: 12,
  },
  completeSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  completeKey: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: typography.secondary,
  },
  completeValue: {
    color: colors.text,
    fontSize: 11,
    fontFamily: typography.secondarySemibold,
  },
  completeValueSuccess: {
    color: colors.success,
    fontSize: 11,
    fontFamily: typography.secondarySemibold,
  },
  completeValueLink: {
    color: colors.primaryLight,
    fontSize: 11,
    fontFamily: typography.secondarySemibold,
  },
  completeDoneButton: {
    width: "100%",
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  completeDoneText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: typography.primarySemibold,
  },
  completeViewDetails: {
    color: colors.primaryLight,
    fontSize: 11,
    fontFamily: typography.secondarySemibold,
  },
});
