/**
 * GuardianApprovalModal — Amber-themed modal for guardian transaction approval.
 * Shows on the guardian's device when a ward requests approval.
 * Design: cbPbW "Cloak - Guardian Approve Ward Request" (.pen frame).
 */
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ShieldAlert } from "lucide-react-native";
import { normalizeAddress } from "@cloak-wallet/sdk";
import { useWardContext, type WardApprovalRequest } from "../lib/wardContext";
import { useThemedModal } from "./ThemedModal";
import { promptBiometric } from "../lib/twoFactor";
import {
  colors,
  spacing,
  typography,
} from "../lib/theme";
import { testIDs, testProps } from "../testing/testIDs";

// ── Amber palette ────────────────────────────────────────────────────────────

const amber = {
  solid: "#F59E0B",
  dim: "rgba(245, 158, 11, 0.15)",
  border: "rgba(245, 158, 11, 0.19)",
  pillBg: "rgba(245, 158, 11, 0.07)",
  pillBorder: "rgba(245, 158, 11, 0.25)",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function truncate(str: string, front = 8, back = 6): string {
  if (!str) return "";
  if (str.length <= front + back + 3) return str;
  return `${str.slice(0, front)}...${str.slice(-back)}`;
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

// ── Detail Row ───────────────────────────────────────────────────────────────

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

// ── Ward Name Resolution ────────────────────────────────────────────────────

function useWardName(wardAddress: string): string {
  const [name, setName] = useState<string>("");

  useEffect(() => {
    if (!wardAddress) return;
    AsyncStorage.getItem("cloak_ward_local_data").then((raw) => {
      if (!raw) return;
      try {
        const allData = JSON.parse(raw);
        const normalizedAddr = normalizeAddress(wardAddress);
        const key = Object.keys(allData).find(
          (k) => normalizedAddr.toLowerCase().endsWith(k.replace(/^0x0*/, "").toLowerCase())
        );
        if (key && allData[key]?.pseudoName) {
          setName(allData[key].pseudoName);
        }
      } catch { /* non-critical */ }
    });
  }, [wardAddress]);

  return name;
}

// ── Guardian Card Content ───────────────────────────────────────────────────

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
  const wardName = useWardName(request.ward_address);
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

  // Ward display: "Name • 0x8c2e...a81f" or just truncated address
  const wardDisplay = wardName
    ? `${wardName} \u2022 ${truncate(request.ward_address, 6, 4)}`
    : truncate(request.ward_address);

  return (
    <>
      {modal.ModalComponent}

      {/* Icon circle */}
      <View style={styles.iconCircle}>
        <ShieldAlert size={36} color={amber.solid} strokeWidth={1.5} />
      </View>

      {/* Title */}
      <Text style={styles.title}>Approve Ward Request</Text>

      {/* Description */}
      <Text style={styles.description}>
        A ward transaction exceeded policy limits and{"\n"}needs your decision.
      </Text>

      {/* Detail card */}
      <View style={styles.detailCard}>
        <DetailRow label="Ward" value={wardDisplay} />
        {request.recipient && (
          <DetailRow label="Recipient" value={truncate(request.recipient)} />
        )}
        <DetailRow
          label="Amount"
          value={
            request.amount
              ? `${request.amount} ${request.token}`
              : "Claim pending balance"
          }
        />
        <DetailRow
          label="Policy"
          value="Exceeded limit"
          highlight
        />
      </View>

      {/* Expiry pill + hint */}
      <View style={styles.expirySection}>
        <View style={styles.expiryPill}>
          <Text style={styles.expiryPillText}>
            {isExpired ? "Expired" : `Expires in ${countdown}`}
          </Text>
        </View>
        <Text style={styles.expiryHint}>
          No action will auto-reject this request.
        </Text>
      </View>

      {/* Approve button */}
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
          <ActivityIndicator size="small" color={colors.text} />
        ) : (
          <Text style={styles.approveBtnText}>
            {isExpired ? "Expired" : "Approve Request"}
          </Text>
        )}
      </TouchableOpacity>

      {/* Reject button */}
      <TouchableOpacity
        {...testProps(testIDs.guardianApprovalModal.reject)}
        style={[styles.rejectBtn, isRejecting && styles.btnDisabled]}
        onPress={handleReject}
        disabled={isApproving || isRejecting}
      >
        {isRejecting ? (
          <ActivityIndicator size="small" color={colors.textSecondary} />
        ) : (
          <Text style={styles.rejectBtnText}>Reject</Text>
        )}
      </TouchableOpacity>
    </>
  );
}

// ── Main Modal ──────────────────────────────────────────────────────────────

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

// ── Styles (cbPbW design) ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(10, 15, 28, 0.9)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
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
  title: {
    fontFamily: typography.primary,
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
    lineHeight: 28,
  },
  description: {
    fontFamily: typography.secondary,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  detailCard: {
    width: "100%",
    backgroundColor: colors.inputBg,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
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

  // Expiry section
  expirySection: {
    width: "100%",
    gap: 10,
    alignItems: "center",
  },
  expiryPill: {
    width: "100%",
    height: 36,
    borderRadius: 10,
    backgroundColor: amber.pillBg,
    borderWidth: 1,
    borderColor: amber.pillBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  expiryPillText: {
    fontFamily: typography.primarySemibold,
    fontSize: 12,
    color: amber.solid,
  },
  expiryHint: {
    fontFamily: typography.secondary,
    fontSize: 11,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 15,
  },

  // Approve button (green per cbPbW design)
  approveBtn: {
    width: "100%",
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
  },
  approveBtnText: {
    fontFamily: typography.primary,
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },

  // Reject button
  rejectBtn: {
    width: "100%",
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  rejectBtnText: {
    fontFamily: typography.primarySemibold,
    fontSize: 14,
    color: colors.textSecondary,
  },

  btnDisabled: {
    opacity: 0.5,
  },
});
