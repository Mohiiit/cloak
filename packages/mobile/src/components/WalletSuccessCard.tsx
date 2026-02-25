/**
 * Shared success card used by ShieldScreen and UnshieldScreen.
 */
import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Linking } from "react-native";
import Clipboard from "@react-native-clipboard/clipboard";
import { Check } from "lucide-react-native";
import { tongoUnitToErc20Display, type TokenKey } from "../lib/tokens";
import { triggerSuccess } from "../lib/haptics";
import { Confetti } from "./Confetti";
import { typography } from "../lib/theme";
import { testIDs, testProps } from "../testing/testIDs";

export type SuccessInfo = { txHash: string; amountUnits: string; type: "shield" | "unshield" };

export function formatIntWithCommas(intStr: string): string {
  const sanitized = (intStr || "0").replace(/\D/g, "");
  if (!sanitized) return "0";
  return sanitized.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function WalletSuccessCard({
  successInfo,
  token,
  copiedTx,
  onCopyTx,
  onDone,
}: {
  successInfo: SuccessInfo;
  token: TokenKey;
  copiedTx: boolean;
  onCopyTx: (hash: string) => void;
  onDone: () => void;
}) {
  const hasFiredHaptic = useRef(false);
  useEffect(() => {
    if (!hasFiredHaptic.current) {
      hasFiredHaptic.current = true;
      triggerSuccess();
    }
  }, []);

  const displayTxHash =
    successInfo.txHash.length > 20
      ? `${successInfo.txHash.slice(0, 10)}...${successInfo.txHash.slice(-8)}`
      : successInfo.txHash;

  const isShield = successInfo.type === "shield";
  const erc20Display = tongoUnitToErc20Display(successInfo.amountUnits, token);

  return (
    <View style={styles.successCard}>
      <Confetti />
      <View style={styles.successIconCircle}>
        <Check size={36} color="#10B981" />
      </View>
      <Text style={styles.successTitle}>
        {isShield ? "Shielded!" : "Unshielded!"}
      </Text>
      <Text style={styles.successDesc}>
        {isShield
          ? "Funds deposited into your\nshielded balance"
          : "Funds withdrawn to your\npublic wallet"}
      </Text>

      <View style={styles.successDetailCard}>
        <View style={styles.successDetailRow}>
          <Text style={styles.successDetailLabel}>Amount</Text>
          <Text style={styles.successDetailValue}>
            {successInfo.amountUnits} units ({erc20Display})
          </Text>
        </View>
        <View style={styles.successDetailRow}>
          <Text style={styles.successDetailLabel}>Tx Hash</Text>
          <TouchableOpacity onPress={() => onCopyTx(successInfo.txHash)}>
            <Text style={[styles.successDetailValue, { color: "#3B82F6" }]} numberOfLines={1} ellipsizeMode="middle">
              {copiedTx ? "Copied!" : displayTxHash}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity
        {...testProps(testIDs.wallet.successDone)}
        style={styles.successDoneBtn}
        onPress={onDone}
        activeOpacity={0.8}
      >
        <Check size={18} color="#fff" />
        <Text style={styles.successDoneBtnText}>Done</Text>
      </TouchableOpacity>

      <TouchableOpacity
        {...testProps(testIDs.wallet.successViewVoyager)}
        onPress={() => Linking.openURL(`https://sepolia.voyager.online/tx/${successInfo.txHash}`)}
      >
        <Text style={styles.successExplorerLink}>View on Voyager</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  successCard: {
    width: "100%",
    backgroundColor: "#1E293B",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#2D3B4D",
    paddingTop: 40,
    paddingHorizontal: 32,
    paddingBottom: 32,
    alignItems: "center",
    gap: 20,
    position: "relative",
    overflow: "hidden",
  },
  successIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(16, 185, 129, 0.13)",
    borderWidth: 3,
    borderColor: "#10B981",
    justifyContent: "center",
    alignItems: "center",
  },
  successTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#10B981",
    fontFamily: typography.primarySemibold,
  },
  successDesc: {
    fontSize: 14,
    color: "#94A3B8",
    fontFamily: typography.secondary,
    textAlign: "center",
    lineHeight: 21,
  },
  successDetailCard: {
    width: "100%",
    backgroundColor: "#0F172A",
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  successDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  successDetailLabel: {
    fontSize: 12,
    color: "#64748B",
    fontFamily: typography.primary,
  },
  successDetailValue: {
    fontSize: 12,
    color: "#F8FAFC",
    fontFamily: typography.primarySemibold,
    flexShrink: 1,
    textAlign: "right",
    maxWidth: "60%",
  },
  successDoneBtn: {
    width: "100%",
    height: 48,
    borderRadius: 14,
    backgroundColor: "#10B981",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  successDoneBtnText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#fff",
    fontFamily: typography.primarySemibold,
  },
  successExplorerLink: {
    fontSize: 13,
    color: "#3B82F6",
    fontFamily: typography.primarySemibold,
  },
});
