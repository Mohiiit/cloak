/**
 * GuardianApprovalModal — Amber-themed modal for guardian transaction approval.
 * Shows when there are pending guardian approval requests from wards.
 * Design: TumTT "Ward Waiting Guardian" (.pen frame).
 */
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Animated,
} from "react-native";
import { ShieldCheck } from "lucide-react-native";
import { useWardContext, type WardApprovalRequest } from "../lib/wardContext";
import { useThemedModal } from "./ThemedModal";
import { promptBiometric } from "../lib/twoFactor";
import {
  colors,
  spacing,
  fontSize,
  borderRadius,
  typography,
} from "../lib/theme";
import { testIDs, testProps } from "../testing/testIDs";

// ── Amber palette (from TumTT design) ────────────────────────────────────────

const amber = {
  solid: "#F59E0B",
  dim: "rgba(245, 158, 11, 0.15)",
  border: "rgba(245, 158, 11, 0.19)", // #F59E0B30
};

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Polling Dots ──────────────────────────────────────────────────────────────

function PollingDots() {
  const anim1 = useRef(new Animated.Value(1)).current;
  const anim2 = useRef(new Animated.Value(0.5)).current;
  const anim3 = useRef(new Animated.Value(0.25)).current;

  useEffect(() => {
    const pulse = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(val, {
            toValue: 0.25,
            duration: 400,
            useNativeDriver: true,
          }),
        ]),
      );

    const a1 = pulse(anim1, 0);
    const a2 = pulse(anim2, 150);
    const a3 = pulse(anim3, 300);
    a1.start();
    a2.start();
    a3.start();

    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [anim1, anim2, anim3]);

  return (
    <View style={styles.pollingRow}>
      <View style={styles.dotsContainer}>
        <Animated.View style={[styles.dot, { opacity: anim1 }]} />
        <Animated.View style={[styles.dot, { opacity: anim2 }]} />
        <Animated.View style={[styles.dot, { opacity: anim3 }]} />
      </View>
      <Text style={styles.pollingText}>Awaiting ward request...</Text>
    </View>
  );
}

// ── Detail Row ────────────────────────────────────────────────────────────────

function DetailRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text
        style={[styles.detailValue, highlight && { color: amber.solid }]}
      >
        {value}
      </Text>
    </View>
  );
}

// ── Guardian Card Content ─────────────────────────────────────────────────────

function GuardianCardContent({
  request,
  onApproved,
  onRejected,
}: {
  request: WardApprovalRequest;
  onApproved: () => void;
  onRejected: () => void;
}) {
  const { approveAsGuardian, rejectWardRequest } = useWardContext();
  const modal = useThemedModal();
  const countdown = useCountdown(request.expires_at);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  const isExpired = countdown === "Expired";

  const handleApprove = async () => {
    if (isExpired) {
      modal.showError(
        "Request Expired",
        "This request has expired and can no longer be approved.",
      );
      return;
    }

    const authed = await promptBiometric(
      "Authenticate to approve as guardian",
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
      await approveAsGuardian(request);
      onApproved();
    } catch (e: any) {
      console.warn("[GuardianApprovalModal] Approve error:", e);
      modal.showError(
        "Guardian Approval Failed",
        e.message || "Failed to approve as guardian",
        e.message,
      );
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    setIsRejecting(true);
    try {
      await rejectWardRequest(request.id);
      onRejected();
    } catch (e: any) {
      console.warn("[GuardianApprovalModal] Reject error:", e);
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
    <>
      {modal.ModalComponent}

      {/* Icon circle */}
      <View style={styles.iconCircle}>
        <ShieldCheck size={36} color={amber.solid} strokeWidth={1.5} />
      </View>

      {/* Title */}
      <Text style={styles.title}>
        {"Guardian Approval\nRequired"}
      </Text>

      {/* Description */}
      <Text style={styles.description}>
        {"Your ward is requesting approval\nfor a transaction."}
      </Text>

      {/* Detail card */}
      <View style={styles.detailCard}>
        <DetailRow label="Type" value={formatAction(request.action)} />
        {request.recipient && (
          <DetailRow label="To" value={truncate(request.recipient)} />
        )}
        <DetailRow
          label="Amount"
          value={
            request.amount
              ? `${request.amount} ${request.token}`
              : "Claim pending balance"
          }
        />
        <DetailRow label="Time left" value={countdown} highlight={isExpired} />
      </View>

      {/* Polling dots */}
      <PollingDots />

      {/* Buttons */}
      <View style={styles.buttonRow}>
        <TouchableOpacity
          {...testProps(testIDs.guardianApprovalModal.reject)}
          style={[styles.cancelBtn, isRejecting && styles.btnDisabled]}
          onPress={handleReject}
          disabled={isApproving || isRejecting}
        >
          {isRejecting ? (
            <ActivityIndicator size="small" color={colors.textSecondary} />
          ) : (
            <Text style={styles.cancelBtnText}>Reject</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          {...testProps(testIDs.guardianApprovalModal.approve)}
          style={[
            styles.approveBtn,
            (isApproving || isExpired) && styles.btnDisabled,
          ]}
          onPress={handleApprove}
          disabled={isApproving || isRejecting || isExpired}
        >
          {isApproving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.approveBtnText}>
              {isExpired ? "Expired" : "Approve"}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────────

export default function GuardianApprovalModal() {
  const { pendingGuardianRequests } = useWardContext();

  if (pendingGuardianRequests.length === 0) return null;

  const firstRequest = pendingGuardianRequests[0];

  const handleDone = () => {
    // Polling will auto-clear completed/rejected requests
  };

  return (
    <Modal
      visible={pendingGuardianRequests.length > 0}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {}}
    >
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <GuardianCardContent
            request={firstRequest}
            onApproved={handleDone}
            onRejected={handleDone}
          />
        </View>
      </View>
    </Modal>
  );
}

// ── Styles (TumTT design tokens) ─────────────────────────────────────────────

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
    width: 330,
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: amber.border,
    paddingTop: 36,
    paddingHorizontal: 24,
    paddingBottom: 24,
    alignItems: "center",
    gap: 20,
  },

  // Icon circle
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: amber.dim,
    borderWidth: 2,
    borderColor: amber.solid,
    alignItems: "center",
    justifyContent: "center",
  },

  // Title
  title: {
    fontFamily: typography.primary,
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
    lineHeight: 28,
  },

  // Description
  description: {
    fontFamily: typography.secondary,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },

  // Detail card
  detailCard: {
    width: "100%",
    backgroundColor: colors.inputBg,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },

  // Detail rows
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  detailLabel: {
    fontFamily: typography.primary,
    fontSize: 12,
    color: colors.textMuted,
  },
  detailValue: {
    fontFamily: typography.primary,
    fontSize: 12,
    fontWeight: "500",
    color: colors.text,
  },

  // Polling dots
  pollingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  dotsContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: amber.solid,
  },
  pollingText: {
    fontFamily: typography.primary,
    fontSize: 11,
    color: colors.textMuted,
  },

  // Buttons
  buttonRow: {
    width: "100%",
    flexDirection: "row",
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    fontFamily: typography.primarySemibold,
    fontSize: 14,
    color: colors.textSecondary,
  },
  approveBtn: {
    flex: 1.5,
    height: 44,
    borderRadius: 12,
    backgroundColor: amber.solid,
    alignItems: "center",
    justifyContent: "center",
  },
  approveBtnText: {
    fontFamily: typography.primarySemibold,
    fontSize: 14,
    color: "#fff",
  },
  btnDisabled: {
    opacity: 0.5,
  },
});
