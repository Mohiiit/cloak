/**
 * ApprovalModal — Full-screen modal for approving/rejecting 2FA transactions.
 * Shows when there are pending approval requests from the extension.
 */
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Account, RpcProvider } from "starknet";
import { Fingerprint } from "lucide-react-native";
import { DEFAULT_RPC } from "@cloak-wallet/sdk";
import { useTwoFactor } from "../lib/TwoFactorContext";
import { useWallet } from "../lib/WalletContext";
import { useToast } from "./Toast";
import { colors, spacing, fontSize, borderRadius, typography } from "../lib/theme";
import { testIDs, testProps } from "../testing/testIDs";
import { KeyboardSafeModal } from "./KeyboardSafeContainer";
import {
  ApprovalRequest,
  deserializeCalls,
  updateRequestStatus,
  promptBiometric,
  getSecondaryPrivateKey,
  DualKeySigner,
} from "../lib/twoFactor";

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

// ─── Approval Card ───────────────────────────────────────────────────────────

function ApprovalCard({
  request,
  onApproved,
  onRejected,
}: {
  request: ApprovalRequest;
  onApproved: () => void;
  onRejected: () => void;
}) {
  const wallet = useWallet();
  const { showToast } = useToast();
  const countdown = useCountdown(request.expires_at);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  const isExpired = countdown === "Expired";

  const handleApprove = async () => {
    if (isExpired) {
      showToast("This request has expired", "warning");
      return;
    }

    // Biometric gate
    const authed = await promptBiometric("Authenticate to approve transaction");
    if (!authed) {
      showToast("Biometric authentication failed", "error");
      return;
    }

    setIsApproving(true);
    try {
      const calls = deserializeCalls(request.calls_json);

      const secondaryPk = await getSecondaryPrivateKey();
      if (!secondaryPk) {
        showToast("Secondary key not found — re-enable 2FA", "error");
        return;
      }

      // DualKeySigner: starknet.js computes hash, signRaw signs with both keys
      const dualSigner = new DualKeySigner(
        wallet.keys!.starkPrivateKey,
        secondaryPk,
      );
      const provider = new RpcProvider({ nodeUrl: DEFAULT_RPC.sepolia });
      const account = new Account({
        provider,
        address: wallet.keys!.starkAddress,
        signer: dualSigner,
      });

      // Fresh nonce + fee estimation (no pre-computed data needed)
      const nonce = await account.getNonce();
      const feeEstimate = await account.estimateInvokeFee(calls, { nonce });

      // Execute with dual-sig — CloakAccount validates [r1,s1,r2,s2] on-chain
      const txResponse = await account.execute(calls, {
        nonce,
        resourceBounds: feeEstimate.resourceBounds,
        tip: 0,
      });

      await updateRequestStatus(
        request.id,
        "approved",
        txResponse.transaction_hash,
      );

      showToast("Transaction approved and submitted!", "success");
      onApproved();
    } catch (e: any) {
      console.warn("[ApprovalModal] Approve error:", e);
      await updateRequestStatus(
        request.id,
        "failed",
        undefined,
        e.message || "Approval failed",
      );
      showToast(`Approval failed: ${e.message}`, "error");
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    setIsRejecting(true);
    try {
      await updateRequestStatus(request.id, "rejected");
      showToast("Transaction rejected", "info");
      onRejected();
    } catch (e: any) {
      console.warn("[ApprovalModal] Reject error:", e);
      showToast(`Rejection failed: ${e.message}`, "error");
    } finally {
      setIsRejecting(false);
    }
  };

  const actionLabel = `${formatAction(request.action)}${request.amount ? ` ${request.amount}` : ""} ${request.token}`;

  return (
    <View style={styles.card}>
      {/* Fingerprint icon (7Ek3t parity) */}
      <View style={styles.fingerprintCircle}>
        <Fingerprint size={32} color={colors.primary} />
      </View>

      <Text style={styles.cardTitle}>Authenticate</Text>
      <Text style={styles.cardSubtitle}>
        Use biometric authentication to approve this transaction
      </Text>

      {/* Detail card */}
      <View style={styles.detailsContainer}>
        <DetailRow label="Action" value={actionLabel} />
        <DetailRow label="Signing" value="Dual-key (2FA)" />
        {request.recipient && (
          <DetailRow label="Recipient" value={truncate(request.recipient)} />
        )}
      </View>

      {/* Hint */}
      {!isApproving && !isRejecting && (
        <Text style={styles.hintText}>Touch the sensor to authenticate</Text>
      )}
      {isApproving && (
        <View style={styles.approvingRow}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.hintText}>Signing transaction...</Text>
        </View>
      )}

      {/* Timer */}
      <View style={[styles.timerBadge, isExpired && styles.timerBadgeExpired]}>
        <Text style={[styles.timerText, isExpired && styles.timerTextExpired]}>
          {countdown}
        </Text>
      </View>

      {/* Buttons */}
      <View style={styles.buttonRow}>
        <TouchableOpacity
          {...testProps(testIDs.approvalModal.reject)}
          style={[styles.cancelBtn, isRejecting && styles.btnDisabled]}
          onPress={handleReject}
          disabled={isApproving || isRejecting}
        >
          {isRejecting ? (
            <ActivityIndicator size="small" color={colors.textSecondary} />
          ) : (
            <Text style={styles.cancelBtnText}>Cancel</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          {...testProps(testIDs.approvalModal.approve)}
          style={[styles.approveBtn, (isApproving || isExpired) && styles.btnDisabled]}
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

export default function ApprovalModal() {
  const { pendingRequests, refresh } = useTwoFactor();

  if (pendingRequests.length === 0) return null;

  const handleDone = () => {
    // Refresh to clear completed/rejected requests
    refresh();
  };

  return (
    <KeyboardSafeModal
      visible={pendingRequests.length > 0}
      overlayStyle={styles.overlay}
      contentStyle={styles.modalContainer}
      contentMaxHeight="90%"
      onRequestClose={() => {
        // Don't allow dismissing without action
      }}
      dismissOnBackdrop
    >
      {/* Header */}
      <View style={styles.modalHeader}>
        <View style={styles.headerIconCircle}>
          <Fingerprint size={28} color={colors.primary} />
        </View>
        <Text style={styles.modalTitle}>Authenticate</Text>
        <Text style={styles.modalSubtitle}>
          {pendingRequests.length} pending{" "}
          {pendingRequests.length === 1 ? "request" : "requests"}
        </Text>
      </View>

      {/* Requests */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {pendingRequests.map((req) => (
          <ApprovalCard
            key={req.id}
            request={req}
            onApproved={handleDone}
            onRejected={handleDone}
          />
        ))}
      </ScrollView>
    </KeyboardSafeModal>
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
    borderColor: "rgba(59, 130, 246, 0.3)",
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
    backgroundColor: "rgba(59, 130, 246, 0.15)",
    borderWidth: 2,
    borderColor: "rgba(59, 130, 246, 0.4)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  headerIcon: {
    fontSize: 24,
    fontWeight: "bold",
    color: colors.primary,
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

  // Card (7Ek3t parity)
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: spacing.md,
    alignItems: "center",
  },
  fingerprintCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(59, 130, 246, 0.12)",
    borderWidth: 2,
    borderColor: "rgba(59, 130, 246, 0.3)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  cardTitle: {
    fontSize: fontSize.xl,
    fontFamily: typography.secondarySemibold,
    color: colors.text,
    marginBottom: spacing.xs,
    textAlign: "center",
  },
  cardSubtitle: {
    fontSize: fontSize.sm,
    fontFamily: typography.secondary,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  timerBadge: {
    backgroundColor: "rgba(59, 130, 246, 0.15)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginBottom: spacing.md,
  },
  timerBadgeExpired: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
  },
  timerText: {
    fontSize: fontSize.xs,
    fontFamily: typography.primary,
    color: colors.primary,
  },
  timerTextExpired: {
    color: colors.error,
  },
  hintText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontFamily: typography.secondary,
    marginBottom: spacing.md,
    textAlign: "center",
  },
  approvingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },

  // Details
  detailsContainer: {
    width: "100%",
    backgroundColor: colors.bg,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
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
    fontFamily: typography.secondary,
  },
  detailValue: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontFamily: typography.primarySemibold,
  },

  // Buttons
  buttonRow: {
    width: "100%",
    gap: spacing.sm,
  },
  cancelBtn: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    fontFamily: typography.secondarySemibold,
  },
  approveBtn: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  approveBtnText: {
    color: "#fff",
    fontSize: fontSize.md,
    fontFamily: typography.secondarySemibold,
  },
  btnDisabled: {
    opacity: 0.5,
  },
});
