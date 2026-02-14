/**
 * FeeRetryModal — Shows when a transaction fails due to insufficient gas.
 * Offers the user a choice to retry with higher gas or cancel.
 */
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { colors, spacing, fontSize, borderRadius } from "../lib/theme";
import { parseInsufficientGasError } from "@cloak-wallet/sdk";

interface FeeRetryModalProps {
  visible: boolean;
  errorMessage: string;
  retryCount: number;
  maxRetries?: number;
  isRetrying?: boolean;
  onRetry: () => void;
  onCancel: () => void;
}

export function FeeRetryModal({
  visible,
  errorMessage,
  retryCount,
  maxRetries = 3,
  isRetrying = false,
  onRetry,
  onCancel,
}: FeeRetryModalProps) {
  const gasInfo = parseInsufficientGasError(errorMessage);
  const canRetry = retryCount < maxRetries;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Icon */}
          <View style={styles.iconCircle}>
            <Text style={styles.iconText}>&#x26A0;</Text>
          </View>

          {/* Title */}
          <Text style={styles.title}>Insufficient Gas</Text>

          {/* Message */}
          <Text style={styles.message}>
            {canRetry
              ? "The transaction failed because the gas estimate was too low. Would you like to retry with a higher gas limit?"
              : "Maximum retries reached. The network may be congested. Please try again later."}
          </Text>

          {/* Gas Details */}
          {gasInfo && (
            <View style={styles.detailsBox}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Estimated gas:</Text>
                <Text style={styles.detailValue}>
                  {gasInfo.maxAmount.toLocaleString()}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Actual needed:</Text>
                <Text style={[styles.detailValue, { color: colors.error }]}>
                  {gasInfo.actualUsed.toLocaleString()}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Safety multiplier:</Text>
                <Text style={[styles.detailValue, { color: colors.warning }]}>
                  {gasInfo.suggestedMultiplier}x
                </Text>
              </View>
            </View>
          )}

          {/* Retry count */}
          {retryCount > 0 && (
            <Text style={styles.retryCount}>
              Attempt {retryCount} of {maxRetries}
            </Text>
          )}

          {/* Buttons */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onCancel}
              disabled={isRetrying}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            {canRetry && (
              <TouchableOpacity
                style={[styles.retryButton, isRetrying && styles.retryButtonDisabled]}
                onPress={onRetry}
                disabled={isRetrying}
              >
                {isRetrying ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.retryButtonText}>
                    Retry with Higher Gas
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.4)",
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(245, 158, 11, 0.2)",
    borderWidth: 2,
    borderColor: "rgba(245, 158, 11, 0.4)",
    marginBottom: spacing.md,
  },
  iconText: {
    fontSize: 28,
    color: colors.warning,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: "bold",
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  message: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  detailsBox: {
    width: "100%",
    backgroundColor: colors.bg,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  detailLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  detailValue: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontFamily: "monospace",
    fontWeight: "600",
  },
  retryCount: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  buttonRow: {
    flexDirection: "row",
    gap: spacing.md,
    width: "100%",
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
  },
  cancelButtonText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    fontWeight: "600",
  },
  retryButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    backgroundColor: colors.warning,
    alignItems: "center",
  },
  retryButtonDisabled: {
    opacity: 0.6,
  },
  retryButtonText: {
    color: "#fff",
    fontSize: fontSize.md,
    fontWeight: "600",
  },
});
