/**
 * GuardianApprovalModal — Full-screen modal for guardian transaction approval.
 * Shows when there are pending guardian approval requests from wards.
 */
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useWardContext, type WardApprovalRequest } from "../lib/wardContext";
import { useThemedModal } from "./ThemedModal";
import { promptBiometric } from "../lib/twoFactor";
import { colors, spacing, fontSize, borderRadius } from "../lib/theme";

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

// ─── Guardian Approval Card ─────────────────────────────────────────────────

function GuardianApprovalCard({
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
      modal.showError("Request Expired", "This request has expired and can no longer be approved.");
      return;
    }

    const authed = await promptBiometric("Authenticate to approve as guardian");
    if (!authed) {
      modal.showError("Authentication Failed", "Biometric authentication failed. Please try again.");
      return;
    }

    setIsApproving(true);
    try {
      await approveAsGuardian(request);
      onApproved();
    } catch (e: any) {
      console.warn("[GuardianApprovalModal] Approve error:", e);
      modal.showError("Guardian Approval Failed", e.message || "Failed to approve as guardian", e.message);
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
      modal.showError("Rejection Failed", e.message || "Failed to reject request", e.message);
    } finally {
      setIsRejecting(false);
    }
  };

  return (
    <View style={styles.card}>
      {modal.ModalComponent}
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Guardian Approval</Text>
        <View
          style={[
            styles.timerBadge,
            isExpired && styles.timerBadgeExpired,
          ]}
        >
          <Text
            style={[
              styles.timerText,
              isExpired && styles.timerTextExpired,
            ]}
          >
            {countdown}
          </Text>
        </View>
      </View>

      <View style={styles.detailsContainer}>
        <DetailRow label="Ward" value={truncate(request.ward_address)} />
        <DetailRow label="Action" value={formatAction(request.action)} />
        <DetailRow label="Token" value={request.token} />
        {request.amount && (
          <DetailRow label="Amount" value={request.amount} />
        )}
        {request.recipient && (
          <DetailRow label="Recipient" value={truncate(request.recipient)} />
        )}
        {request.tx_hash ? (
          <DetailRow label="Tx Hash" value={truncate(request.tx_hash)} />
        ) : null}
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.rejectBtn, isRejecting && styles.btnDisabled]}
          onPress={handleReject}
          disabled={isApproving || isRejecting}
        >
          {isRejecting ? (
            <ActivityIndicator size="small" color={colors.error} />
          ) : (
            <Text style={styles.rejectBtnText}>Reject</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
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
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

// ─── Main Modal ──────────────────────────────────────────────────────────────

export default function GuardianApprovalModal() {
  const { pendingGuardianRequests } = useWardContext();

  if (pendingGuardianRequests.length === 0) return null;

  const handleDone = () => {
    // Polling will auto-clear completed/rejected requests
  };

  return (
    <Modal
      visible={pendingGuardianRequests.length > 0}
      transparent
      animationType="slide"
      onRequestClose={() => {}}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <View style={styles.headerIconCircle}>
              <Text style={styles.headerIcon}>G</Text>
            </View>
            <Text style={styles.modalTitle}>
              Guardian Approval Required
            </Text>
            <Text style={styles.modalSubtitle}>
              {pendingGuardianRequests.length} pending{" "}
              {pendingGuardianRequests.length === 1 ? "request" : "requests"}
            </Text>
          </View>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {pendingGuardianRequests.map((req) => (
              <GuardianApprovalCard
                key={req.id}
                request={req}
                onApproved={handleDone}
                onRejected={handleDone}
              />
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.md,
  },
  modalContainer: {
    width: "100%",
    maxHeight: "90%",
    backgroundColor: colors.bg,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
    overflow: "hidden",
  },
  modalHeader: {
    alignItems: "center",
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  headerIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    borderWidth: 2,
    borderColor: "rgba(16, 185, 129, 0.4)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  headerIcon: {
    fontSize: 24,
    fontWeight: "bold",
    color: colors.success,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.xs,
    textAlign: "center",
  },
  modalSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  scrollArea: {
    maxHeight: 500,
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },

  // Card
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  cardTitle: {
    fontSize: fontSize.md,
    fontWeight: "600",
    color: colors.text,
  },
  timerBadge: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  timerBadgeExpired: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
  },
  timerText: {
    fontSize: fontSize.xs,
    fontWeight: "600",
    color: colors.success,
    fontFamily: "monospace",
  },
  timerTextExpired: {
    color: colors.error,
  },

  // Details
  detailsContainer: {
    backgroundColor: colors.bg,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  detailLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  detailValue: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: "500",
    fontFamily: "monospace",
  },

  // Buttons
  buttonRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  rejectBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  rejectBtnText: {
    color: colors.error,
    fontSize: fontSize.md,
    fontWeight: "600",
  },
  approveBtn: {
    flex: 1.5,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    backgroundColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
  },
  approveBtnText: {
    color: "#fff",
    fontSize: fontSize.md,
    fontWeight: "600",
  },
  btnDisabled: {
    opacity: 0.5,
  },
});
