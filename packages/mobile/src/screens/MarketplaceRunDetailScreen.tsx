import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { ArrowLeft, CheckCircle2, CircleAlert, CreditCard, Hash, ReceiptText } from "lucide-react-native";
import type { RootStackParamList } from "../navigation/types";
import { borderRadius, colors, fontSize, spacing, typography } from "../lib/theme";

type MarketplaceRunDetailRoute = RouteProp<RootStackParamList, "MarketplaceRunDetail">;

function pretty(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value ?? "");
  }
}

export default function MarketplaceRunDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<MarketplaceRunDetailRoute>();
  const run = route.params.run;
  const agentName = route.params.agentName || run.agent_id;

  const statusColor = useMemo(() => {
    if (run.status === "completed") return colors.success;
    if (run.status === "failed") return colors.error;
    if (run.status === "running") return colors.warning;
    return colors.textMuted;
  }, [run.status]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <ArrowLeft size={16} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Run Evidence</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <Text style={styles.agentName}>{agentName}</Text>
            <View style={[styles.statusPill, { borderColor: statusColor }]}>
              {run.status === "completed" ? (
                <CheckCircle2 size={12} color={statusColor} />
              ) : (
                <CircleAlert size={12} color={statusColor} />
              )}
              <Text style={[styles.statusText, { color: statusColor }]}>{run.status}</Text>
            </View>
          </View>
          <Text style={styles.metaLine}>run: {run.id}</Text>
          <Text style={styles.metaLine}>hire: {run.hire_id}</Text>
          <Text style={styles.metaLine}>action: {run.action}</Text>
        </View>

        <EvidenceCard
          icon={<CreditCard size={14} color={colors.primaryLight} />}
          title="Payment Evidence"
          lines={[
            `payment_ref: ${run.payment_ref || "n/a"}`,
            `settlement_tx: ${run.settlement_tx_hash || "n/a"}`,
          ]}
          json={run.payment_evidence}
        />

        <EvidenceCard
          icon={<Hash size={14} color={colors.primaryLight} />}
          title="Execution Hashes"
          lines={
            run.execution_tx_hashes && run.execution_tx_hashes.length > 0
              ? run.execution_tx_hashes.map(hash => hash)
              : ["No execution tx hashes recorded"]
          }
        />

        <EvidenceCard
          icon={<ReceiptText size={14} color={colors.primaryLight} />}
          title="Result Payload"
          lines={[`created_at: ${run.created_at}`]}
          json={run.result}
        />
      </ScrollView>
    </View>
  );
}

function EvidenceCard({
  icon,
  title,
  lines,
  json,
}: {
  icon: React.ReactNode;
  title: string;
  lines: string[];
  json?: unknown;
}) {
  return (
    <View style={styles.evidenceCard}>
      <View style={styles.evidenceHeader}>
        {icon}
        <Text style={styles.evidenceTitle}>{title}</Text>
      </View>
      <View style={styles.linesWrap}>
        {lines.map(line => (
          <Text key={line} style={styles.lineText}>
            {line}
          </Text>
        ))}
      </View>
      {json !== undefined ? <Text style={styles.jsonText}>{pretty(json)}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontFamily: typography.primarySemibold,
  },
  placeholder: {
    width: 36,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  summaryCard: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.xs,
  },
  summaryTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  agentName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontFamily: typography.primarySemibold,
    flex: 1,
  },
  statusPill: {
    borderRadius: borderRadius.full,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.inputBg,
  },
  statusText: {
    fontSize: fontSize.xs,
    fontFamily: typography.secondarySemibold,
  },
  metaLine: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontFamily: typography.primary,
  },
  evidenceCard: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  evidenceHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  evidenceTitle: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontFamily: typography.primarySemibold,
  },
  linesWrap: {
    gap: 4,
  },
  lineText: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontFamily: typography.primary,
  },
  jsonText: {
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.inputBg,
    color: colors.text,
    fontSize: fontSize.xs,
    fontFamily: typography.primary,
    padding: spacing.sm,
  },
});
