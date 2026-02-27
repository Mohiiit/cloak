/**
 * Multi-step breadcrumb progress modal for marketplace agent run execution.
 */
import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  StyleSheet,
} from "react-native";
import {
  Check,
  Circle,
  XCircle,
  ExternalLink,
  RotateCcw,
} from "lucide-react-native";
import type { AgentRunResponse } from "@cloak-wallet/sdk";
import type { RunStep } from "../../hooks/useMarketplaceRun";
import { colors, spacing, fontSize, borderRadius, typography } from "../../lib/theme";

interface RunProgressModalProps {
  steps: RunStep[];
  isRunning: boolean;
  error: string | null;
  result: AgentRunResponse | null;
  onClose: () => void;
  onRetry: () => void;
}

function StepIcon({ status }: { status: RunStep["status"] }) {
  switch (status) {
    case "success":
      return (
        <View style={[styles.stepIcon, styles.stepIconSuccess]}>
          <Check size={14} color={colors.success} />
        </View>
      );
    case "running":
      return (
        <View style={[styles.stepIcon, styles.stepIconRunning]}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      );
    case "failed":
      return (
        <View style={[styles.stepIcon, styles.stepIconFailed]}>
          <XCircle size={14} color={colors.error} />
        </View>
      );
    default:
      return (
        <View style={[styles.stepIcon, styles.stepIconPending]}>
          <Circle size={14} color={colors.textMuted} />
        </View>
      );
  }
}

function StepConnector({ status }: { status: RunStep["status"] }) {
  const lineColor =
    status === "success"
      ? colors.success
      : status === "failed"
        ? colors.error
        : colors.border;
  return <View style={[styles.connector, { backgroundColor: lineColor }]} />;
}

function openVoyager(txHash: string) {
  const url = `https://sepolia.voyager.online/tx/${txHash}`;
  Linking.openURL(url).catch(() => undefined);
}

export default function RunProgressModal({
  steps,
  isRunning,
  error,
  result,
  onClose,
  onRetry,
}: RunProgressModalProps) {
  const isComplete = steps.every(
    (s) => s.status === "success" || s.status === "failed",
  );
  const hasFailed = steps.some((s) => s.status === "failed");

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Step list */}
        {steps.map((step, i) => (
          <View key={step.key}>
            <View style={styles.stepRow}>
              <StepIcon status={step.status} />
              <View style={styles.stepContent}>
                <Text
                  style={[
                    styles.stepLabel,
                    step.status === "running" && styles.stepLabelActive,
                    step.status === "success" && styles.stepLabelDone,
                    step.status === "failed" && styles.stepLabelFailed,
                  ]}
                >
                  {step.label}
                </Text>
                {step.detail && (
                  <Text style={styles.stepDetail}>{step.detail}</Text>
                )}
              </View>
            </View>
            {i < steps.length - 1 && <StepConnector status={step.status} />}
          </View>
        ))}

        {/* Result summary */}
        {isComplete && !hasFailed && result && (
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>Run Complete</Text>
            {result.id && (
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>Run ID</Text>
                <Text style={styles.resultValue}>{result.id}</Text>
              </View>
            )}
            {result.status && (
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>Status</Text>
                <Text style={styles.resultValue}>{result.status}</Text>
              </View>
            )}
            {result.settlement_tx_hash && (
              <TouchableOpacity
                style={styles.voyagerBtn}
                onPress={() => openVoyager(result.settlement_tx_hash!)}
              >
                <ExternalLink size={14} color={colors.primaryLight} />
                <Text style={styles.voyagerBtnText}>View on Voyager</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Error summary */}
        {hasFailed && error && (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Execution Failed</Text>
            <Text style={styles.errorMsg}>{error}</Text>
          </View>
        )}
      </ScrollView>

      {/* Bottom actions */}
      <View style={styles.actionBar}>
        {hasFailed && !isRunning && (
          <TouchableOpacity style={styles.retryBtn} onPress={onRetry}>
            <RotateCcw size={16} color={colors.text} />
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[
            styles.closeBtn,
            isRunning && styles.closeBtnDisabled,
          ]}
          onPress={onClose}
          disabled={isRunning}
        >
          <Text style={styles.closeBtnText}>
            {isComplete ? "Done" : isRunning ? "Running..." : "Close"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  // Steps
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  stepIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  stepIconPending: {
    backgroundColor: colors.surface,
  },
  stepIconRunning: {
    backgroundColor: colors.primaryDim,
  },
  stepIconSuccess: {
    backgroundColor: colors.success + "22",
  },
  stepIconFailed: {
    backgroundColor: colors.error + "22",
  },
  stepContent: {
    flex: 1,
    paddingTop: 3,
  },
  stepLabel: {
    fontSize: fontSize.md,
    fontFamily: typography.secondary,
    color: colors.textMuted,
  },
  stepLabelActive: {
    color: colors.primary,
    fontFamily: typography.secondarySemibold,
  },
  stepLabelDone: {
    color: colors.text,
  },
  stepLabelFailed: {
    color: colors.error,
  },
  stepDetail: {
    fontSize: fontSize.xs,
    fontFamily: typography.primary,
    color: colors.textSecondary,
    marginTop: 2,
  },
  connector: {
    width: 2,
    height: 24,
    marginLeft: 13, // center under the 28px icon
    borderRadius: 1,
  },
  // Result
  resultCard: {
    backgroundColor: colors.success + "14",
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.success + "33",
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  resultTitle: {
    fontSize: fontSize.md,
    fontFamily: typography.primarySemibold,
    color: colors.success,
    marginBottom: spacing.sm,
  },
  resultRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  resultLabel: {
    fontSize: fontSize.xs,
    fontFamily: typography.secondary,
    color: colors.textSecondary,
  },
  resultValue: {
    fontSize: fontSize.xs,
    fontFamily: typography.primary,
    color: colors.text,
    maxWidth: "60%",
  },
  voyagerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  voyagerBtnText: {
    fontSize: fontSize.xs,
    fontFamily: typography.primarySemibold,
    color: colors.primaryLight,
  },
  // Error
  errorCard: {
    backgroundColor: colors.error + "14",
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.error + "33",
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  errorTitle: {
    fontSize: fontSize.md,
    fontFamily: typography.primarySemibold,
    color: colors.error,
    marginBottom: spacing.xs,
  },
  errorMsg: {
    fontSize: fontSize.sm,
    fontFamily: typography.secondary,
    color: colors.text,
    lineHeight: 20,
  },
  // Actions
  actionBar: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
  },
  retryBtnText: {
    fontSize: fontSize.md,
    fontFamily: typography.primarySemibold,
    color: colors.text,
  },
  closeBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
  },
  closeBtnDisabled: {
    opacity: 0.5,
  },
  closeBtnText: {
    fontSize: fontSize.md,
    fontFamily: typography.primarySemibold,
    color: colors.text,
  },
});
