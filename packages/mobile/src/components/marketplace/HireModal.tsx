/**
 * Modal for hiring a marketplace agent.
 */
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { X, CheckCircle, AlertTriangle, Zap } from "lucide-react-native";
import type { AgentProfileResponse } from "@cloak-wallet/sdk";
import { hireMarketplaceAgent } from "../../lib/marketplaceApi";
import { colors, spacing, fontSize, borderRadius, typography } from "../../lib/theme";

interface HireModalProps {
  visible: boolean;
  agent: AgentProfileResponse;
  walletAddress?: string;
  publicKey?: string;
  onClose: () => void;
  onHired: (hireId: string) => void;
}

const DEFAULT_POLICY = {
  max_usd_per_run: 25,
  allowed_actions: ["stake", "dispatch", "swap"],
};

type HireState = "idle" | "loading" | "success" | "error";

export default function HireModal({
  visible,
  agent,
  walletAddress,
  publicKey,
  onClose,
  onHired,
}: HireModalProps) {
  const [state, setState] = useState<HireState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [hireId, setHireId] = useState("");

  const handleHire = useCallback(async () => {
    setState("loading");
    setErrorMsg("");
    try {
      const result = await hireMarketplaceAgent({
        wallet: { walletAddress, publicKey },
        agentId: agent.agent_id,
        policySnapshot: DEFAULT_POLICY,
        billingMode: "per_run",
      });
      setHireId(result.id);
      setState("success");
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to hire agent");
      setState("error");
    }
  }, [agent.agent_id, walletAddress, publicKey]);

  const handleClose = useCallback(() => {
    if (state === "success" && hireId) {
      onHired(hireId);
    } else {
      onClose();
    }
    // Reset for next open
    setState("idle");
    setErrorMsg("");
    setHireId("");
  }, [state, hireId, onHired, onClose]);

  const pricing = agent.pricing as Record<string, unknown> | undefined;
  const rawFee = String(pricing?.amount ?? "");
  const feeNum = parseFloat(rawFee);
  const feeDisplay = !rawFee || isNaN(feeNum) || feeNum === 0
    ? "Free"
    : `${feeNum} shielded units`;

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Close */}
          <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
            <X size={18} color={colors.textSecondary} />
          </TouchableOpacity>

          {state === "success" ? (
            /* Success state */
            <View style={styles.center}>
              <View style={styles.successCircle}>
                <CheckCircle size={32} color={colors.success} />
              </View>
              <Text style={styles.title}>Agent Hired</Text>
              <Text style={styles.subtitle}>
                {agent.name} is ready to run actions on your behalf.
              </Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={handleClose}>
                <Text style={styles.primaryBtnText}>Continue</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* Confirm / Error state */
            <>
              <Text style={styles.title}>Hire {agent.name}</Text>
              <Text style={styles.subtitle}>
                This agent will be authorized to execute actions with your approval.
              </Text>

              {/* Policy summary */}
              <View style={styles.policyCard}>
                <Text style={styles.policyTitle}>Policy</Text>
                <View style={styles.policyRow}>
                  <Text style={styles.policyLabel}>Billing</Text>
                  <Text style={styles.policyValue}>Per run</Text>
                </View>
                <View style={styles.policyRow}>
                  <Text style={styles.policyLabel}>Max per run</Text>
                  <Text style={styles.policyValue}>${DEFAULT_POLICY.max_usd_per_run}</Text>
                </View>
                <View style={styles.policyRow}>
                  <Text style={styles.policyLabel}>Actions</Text>
                  <Text style={styles.policyValue}>
                    {DEFAULT_POLICY.allowed_actions.join(", ")}
                  </Text>
                </View>
              </View>

              {/* Fee */}
              <View style={styles.feeRow}>
                <Zap size={16} color={colors.warning} />
                <Text style={styles.feeLabel}>Agent fee:</Text>
                <Text style={styles.feeValue}>{feeDisplay}</Text>
              </View>

              {/* Error */}
              {state === "error" && (
                <View style={styles.errorRow}>
                  <AlertTriangle size={14} color={colors.error} />
                  <Text style={styles.errorText}>{errorMsg}</Text>
                </View>
              )}

              {/* Actions */}
              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={handleClose}
                  disabled={state === "loading"}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryBtn, state === "loading" && styles.btnDisabled]}
                  onPress={handleHire}
                  disabled={state === "loading"}
                  activeOpacity={0.7}
                >
                  {state === "loading" ? (
                    <ActivityIndicator size="small" color={colors.text} />
                  ) : (
                    <Text style={styles.primaryBtnText}>Confirm Hire</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
  },
  card: {
    width: "100%",
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  closeBtn: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  center: {
    alignItems: "center",
    paddingTop: spacing.lg,
  },
  successCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.success + "22",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize.lg,
    fontFamily: typography.primarySemibold,
    color: colors.text,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  subtitle: {
    fontSize: fontSize.sm,
    fontFamily: typography.secondary,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  policyCard: {
    backgroundColor: colors.inputBg,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  policyTitle: {
    fontSize: fontSize.xs,
    fontFamily: typography.primarySemibold,
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  policyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  policyLabel: {
    fontSize: fontSize.sm,
    fontFamily: typography.secondary,
    color: colors.textMuted,
  },
  policyValue: {
    fontSize: fontSize.sm,
    fontFamily: typography.primarySemibold,
    color: colors.text,
  },
  feeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  feeLabel: {
    fontSize: fontSize.sm,
    fontFamily: typography.secondary,
    color: colors.textSecondary,
  },
  feeValue: {
    fontSize: fontSize.sm,
    fontFamily: typography.primarySemibold,
    color: colors.warning,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.error + "18",
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  errorText: {
    fontSize: fontSize.xs,
    fontFamily: typography.secondary,
    color: colors.error,
    flex: 1,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
    alignItems: "center",
  },
  cancelBtnText: {
    fontSize: fontSize.md,
    fontFamily: typography.primarySemibold,
    color: colors.textSecondary,
  },
  primaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    fontSize: fontSize.md,
    fontFamily: typography.primarySemibold,
    color: colors.text,
  },
  btnDisabled: {
    opacity: 0.6,
  },
});
