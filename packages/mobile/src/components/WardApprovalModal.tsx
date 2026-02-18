/**
 * WardApprovalModal — Centered modal for ward 2FA approval.
 * Styled to match .pen viBII ("Waiting for 2FA / Waiting for Approval").
 * Shows when there are pending ward 2FA approval requests.
 */
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Animated,
  Easing,
} from "react-native";
import { Smartphone } from "lucide-react-native";
import { useWardContext, type WardApprovalRequest } from "../lib/wardContext";
import { useThemedModal } from "./ThemedModal";
import { promptBiometric } from "../lib/twoFactor";
import { colors, spacing, fontSize, borderRadius, typography } from "../lib/theme";
import { testIDs, testProps } from "../testing/testIDs";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function truncate(str: string, front = 8, back = 6): string {
  if (!str) return "";
  if (str.length <= front + back + 3) return str;
  return `${str.slice(0, front)}...${str.slice(-back)}`;
}

function formatAction(action: string): string {
  const map: Record<string, string> = {
    fund: "Shield (Fund)",
    shield: "Shield (Fund)",
    transfer: "Transfer",
    withdraw: "Withdraw (Unshield)",
    unshield: "Withdraw (Unshield)",
    rollover: "Claim (Rollover)",
  };
  return map[action] || action;
}

function useCountdown(expiresAt: string): string {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    function update() {
      const now = Date.now();
      const expires = new Date(expiresAt).getTime();
      const diff = expires - now;
      if (diff <= 0) {
        setTimeLeft("Expired");
        return;
      }
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${mins}:${secs.toString().padStart(2, "0")}`);
    }
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return timeLeft;
}

// ─── Polling Dots (animated) ────────────────────────────────────────────────

function PollingDots() {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(anim, {
        toValue: 3,
        duration: 1500,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  // Cycle opacity across 3 dots
  const dotOpacity = (index: number) =>
    anim.interpolate({
      inputRange: [index, index + 0.5, index + 1],
      outputRange: [1, 0.25, 0.25],
      extrapolate: "clamp",
    });

  return (
    <View style={styles.pollingRow}>
      {[0, 1, 2].map((i) => (
        <Animated.View
          key={i}
          style={[styles.pollingDot, { opacity: dotOpacity(i) }]}
        />
      ))}
      <Text style={styles.pollingText}>Polling...</Text>
    </View>
  );
}

// ─── Detail Row ─────────────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

// ─── Main Modal ──────────────────────────────────────────────────────────────

export default function WardApprovalModal() {
  const { pendingWard2faRequests, approveAsWard, rejectWardRequest } =
    useWardContext();
  const modal = useThemedModal();

  const request = pendingWard2faRequests[0] as WardApprovalRequest | undefined;
  const countdown = useCountdown(request?.expires_at ?? new Date().toISOString());
  const isExpired = countdown === "Expired";

  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  if (pendingWard2faRequests.length === 0) return null;

  const handleApprove = async () => {
    if (!request) return;
    if (isExpired) {
      modal.showError(
        "Request Expired",
        "This request has expired and can no longer be approved.",
      );
      return;
    }

    const authed = await promptBiometric(
      "Authenticate to approve ward transaction",
    );
    if (!authed) {
      modal.showError(
        "Authentication Failed",
        "Biometric authentication failed. Please try again.",
      );
      return;
    }

    setIsApproving(true);
    try {
      await approveAsWard(request);
    } catch (e: any) {
      console.warn("[WardApprovalModal] Approve error:", e);
      modal.showError(
        "Ward Signing Failed",
        e.message || "Failed to sign ward transaction",
        e.message,
      );
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    if (!request) return;
    setIsRejecting(true);
    try {
      await rejectWardRequest(request.id);
    } catch (e: any) {
      console.warn("[WardApprovalModal] Reject error:", e);
      modal.showError(
        "Rejection Failed",
        e.message || "Failed to reject request",
        e.message,
      );
    } finally {
      setIsRejecting(false);
    }
  };

  return (
    <Modal
      visible={pendingWard2faRequests.length > 0}
      transparent
      animationType="fade"
      onRequestClose={() => {}}
    >
      {modal.ModalComponent}
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* ── Icon circle ── */}
          <View style={styles.iconCircle}>
            <Smartphone size={36} color={colors.secondary} strokeWidth={1.8} />
          </View>

          {/* ── Title ── */}
          <Text style={styles.title}>Waiting for Approval</Text>

          {/* ── Description ── */}
          <Text style={styles.description}>
            Review the transaction details below{"\n"}and approve to sign with
            your ward keys
          </Text>

          {/* ── Details card ── */}
          <View style={styles.detailsCard}>
            <DetailRow
              label="Action"
              value={formatAction(request?.action ?? "")}
            />
            <DetailRow label="Token" value={request?.token ?? ""} />
            {request?.amount ? (
              <DetailRow label="Amount" value={request.amount} />
            ) : null}
            {request?.recipient ? (
              <DetailRow
                label="Recipient"
                value={truncate(request.recipient)}
              />
            ) : null}
            <DetailRow
              label="Expires"
              value={countdown}
            />
          </View>

          {/* ── Polling dots ── */}
          <PollingDots />

          {/* ── Approve button ── */}
          <TouchableOpacity
            {...testProps(testIDs.wardApprovalModal.approve)}
            style={[
              styles.approveBtn,
              (isApproving || isExpired) && styles.btnDisabled,
            ]}
            onPress={handleApprove}
            disabled={isApproving || isRejecting || isExpired}
            activeOpacity={0.8}
          >
            {isApproving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.approveBtnText}>
                {isExpired ? "Expired" : "Approve"}
              </Text>
            )}
          </TouchableOpacity>

          {/* ── Cancel button ── */}
          <TouchableOpacity
            {...testProps(testIDs.wardApprovalModal.reject)}
            style={[styles.cancelBtn, isRejecting && styles.btnDisabled]}
            onPress={handleReject}
            disabled={isApproving || isRejecting}
            activeOpacity={0.8}
          >
            {isRejecting ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <Text style={styles.cancelBtnText}>Cancel Transaction</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Overlay
  overlay: {
    flex: 1,
    backgroundColor: "rgba(10, 15, 28, 0.9)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },

  // Modal card
  modalCard: {
    width: 320,
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    paddingTop: 40,
    paddingBottom: 28,
    paddingHorizontal: 28,
    alignItems: "center",
    gap: 20,
  },

  // Icon circle
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(139, 92, 246, 0.08)",
    borderWidth: 2,
    borderColor: colors.secondary,
    alignItems: "center",
    justifyContent: "center",
  },

  // Title
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
    fontFamily: typography.primary,
    textAlign: "center",
  },

  // Description
  description: {
    fontSize: 14,
    color: colors.textSecondary,
    fontFamily: typography.secondary,
    textAlign: "center",
    lineHeight: 21,
  },

  // Details card
  detailsCard: {
    width: "100%",
    backgroundColor: colors.inputBg,
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },

  // Detail row
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  detailLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontFamily: typography.secondary,
  },
  detailValue: {
    fontSize: 13,
    color: colors.text,
    fontWeight: "500",
    fontFamily: typography.primary,
  },

  // Polling dots
  pollingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  pollingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.secondary,
  },
  pollingText: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: typography.primary,
  },

  // Approve button
  approveBtn: {
    width: "100%",
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.secondary,
    alignItems: "center",
    justifyContent: "center",
  },
  approveBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
    fontFamily: typography.primarySemibold,
  },

  // Cancel button
  cancelBtn: {
    width: "100%",
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSecondary,
    fontFamily: typography.primarySemibold,
  },

  // Disabled state
  btnDisabled: {
    opacity: 0.5,
  },
});
