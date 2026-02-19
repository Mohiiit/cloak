/**
 * WardWaitingGuardianModal — Amber-themed modal shown on the ward's device
 * while waiting for guardian to approve a transaction.
 * Design: TumTT "Cloak - Ward Waiting Guardian" (.pen frame).
 */
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
} from "react-native";
import { ShieldCheck } from "lucide-react-native";
import { useWardContext } from "../lib/wardContext";
import { colors, spacing, typography } from "../lib/theme";

// ── Amber palette ────────────────────────────────────────────────────────────

const amber = {
  solid: "#F59E0B",
  dim: "rgba(245, 158, 11, 0.15)",
  border: "rgba(245, 158, 11, 0.19)",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function truncate(str: string, front = 8, back = 6): string {
  if (!str) return "";
  if (str.length <= front + back + 3) return str;
  return `${str.slice(0, front)}...${str.slice(-back)}`;
}

function formatAction(action: string): string {
  const map: Record<string, string> = {
    fund: "Shield (Fund)",
    shield: "Shield (Fund)",
    transfer: "Shielded Transfer",
    withdraw: "Withdraw (Unshield)",
    unshield: "Withdraw (Unshield)",
    rollover: "Claim (Rollover)",
  };
  return map[action] || action;
}

// ── Polling Dots ─────────────────────────────────────────────────────────────

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
      <Text style={styles.pollingText}>Awaiting guardian...</Text>
    </View>
  );
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

// ── Main Modal ───────────────────────────────────────────────────────────────

export default function WardWaitingGuardianModal() {
  const { wardWaitingRequest, cancelWardWaiting, wardInfo } = useWardContext();

  if (!wardWaitingRequest) return null;

  const request = wardWaitingRequest;
  const dailyLimit = wardInfo?.spendingLimitPerTx || "--";

  return (
    <Modal
      visible={!!wardWaitingRequest}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {}}
    >
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
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
            {"Your guardian must approve this\ntransaction before it can proceed."}
          </Text>

          {/* Detail card */}
          <View style={styles.detailCard}>
            <DetailRow
              label="Type"
              value={formatAction(request.action)}
            />
            {request.recipient && (
              <DetailRow
                label="To"
                value={truncate(request.recipient)}
              />
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
              label="Daily used"
              value={
                request.amount
                  ? `${request.amount} / ${dailyLimit} STRK`
                  : `-- / ${dailyLimit} STRK`
              }
              highlight
            />
          </View>

          {/* Polling dots */}
          <PollingDots />

          {/* Cancel button */}
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={cancelWardWaiting}
          >
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Styles (TumTT design) ────────────────────────────────────────────────────

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
    fontFamily: typography.primarySemibold,
    fontSize: 14,
    color: colors.textSecondary,
  },
});
