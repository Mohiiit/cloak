/**
 * WalletScreen — Shield and unshield funds.
 */
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from "react-native";
import Clipboard from "@react-native-clipboard/clipboard";
import { ShieldPlus, ShieldOff, Check } from "lucide-react-native";
import { useWallet } from "../lib/WalletContext";
import { tongoToDisplay, erc20ToDisplay, tongoUnitToErc20Display } from "../lib/tokens";
import { colors, spacing, fontSize, borderRadius } from "../lib/theme";
import { useThemedModal } from "../components/ThemedModal";
import { triggerMedium } from "../lib/haptics";

type Mode = "shield" | "unshield" | null;

export default function WalletScreen({ route }: any) {
  const wallet = useWallet();
  const modal = useThemedModal();
  const [mode, setMode] = useState<Mode>(null);
  const [amount, setAmount] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [claimSuccess, setClaimSuccess] = useState<{ txHash: string; amount: string } | null>(null);

  // Accept route params to auto-open shield/unshield mode
  useEffect(() => {
    if (route?.params?.mode) {
      setMode(route.params.mode);
    }
  }, [route?.params?.mode]);

  const displayBalance = tongoToDisplay(wallet.balance, wallet.selectedToken);
  const displayPending = tongoToDisplay(wallet.pending, wallet.selectedToken);
  const displayErc20 = erc20ToDisplay(wallet.erc20Balance, wallet.selectedToken);
  const hasPending = wallet.pending !== "0";
  const conversionHint = `1 unit = ${tongoUnitToErc20Display("1", wallet.selectedToken)}`;

  const handleSubmit = async () => {
    if (!amount || isPending) return;
    triggerMedium();
    setIsPending(true);
    try {
      if (mode === "shield") {
        const result = await wallet.fund(amount);
        modal.showSuccess(
          "Shielded!",
          `${amount} units shielded successfully.`,
          { txHash: result.txHash, onDismiss: () => wallet.refreshBalance() },
        );
      } else if (mode === "unshield") {
        const result = await wallet.withdraw(amount);
        modal.showSuccess(
          "Unshielded!",
          `${amount} units withdrawn to your public wallet.`,
          { txHash: result.txHash, onDismiss: () => wallet.refreshBalance() },
        );
      }
      setAmount("");
      setMode(null);
    } catch (e: any) {
      modal.showError("Error", e.message || "Transaction failed", e.message);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior="padding"
      style={{ flex: 1 }}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {modal.ModalComponent}

        {claimSuccess && (
          <View style={styles.claimSuccessCard}>
            <Check size={48} color={colors.success} style={{ marginBottom: spacing.md }} />
            <Text style={styles.claimSuccessTitle}>Claimed!</Text>
            <Text style={styles.claimSuccessAmount}>
              {claimSuccess.amount} units
            </Text>
            <Text style={styles.claimSuccessEquiv}>
              ({tongoToDisplay(claimSuccess.amount, wallet.selectedToken)} {wallet.selectedToken})
            </Text>
            <Text style={styles.claimSuccessDesc}>
              Pending funds added to your balance.
            </Text>

            <View style={styles.claimTxSection}>
              <Text style={styles.claimTxLabel}>Transaction Hash</Text>
              <Text style={styles.claimTxHash} numberOfLines={2} selectable>
                {claimSuccess.txHash}
              </Text>
              <View style={styles.claimTxActions}>
                <TouchableOpacity
                  style={styles.claimTxBtn}
                  onPress={() => {
                    Clipboard.setString(claimSuccess.txHash);
                  }}
                >
                  <Text style={styles.claimTxBtnText}>Copy Tx Hash</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.claimTxBtn}
                  onPress={() => Linking.openURL(`https://sepolia.voyager.online/tx/${claimSuccess.txHash}`)}
                >
                  <Text style={styles.claimTxBtnText}>View on Voyager</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={styles.claimDoneBtn}
              onPress={() => setClaimSuccess(null)}
            >
              <Text style={styles.claimDoneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        )}

        {!claimSuccess && (
          <>
            {/* Balance Card */}
            <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Shielded Balance</Text>
          <Text style={styles.balanceAmount}>
            {displayBalance}{" "}
            <Text style={styles.balanceSymbol}>{wallet.selectedToken}</Text>
          </Text>

          {hasPending && (
            <View style={styles.pendingSection}>
              <View style={styles.pendingRow}>
                <Text style={styles.pendingLabel}>Pending</Text>
                <Text style={styles.pendingAmount}>
                  +{displayPending} {wallet.selectedToken}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.claimFullButton}
                onPress={async () => {
                  try {
                    const pendingAmount = wallet.pending;
                    const result = await wallet.rollover();
                    setClaimSuccess({ txHash: result.txHash, amount: pendingAmount });
                    wallet.refreshBalance();
                  } catch (e: any) {
                    modal.showError("Error", e.message || "Claim failed", e.message);
                  }
                }}
              >
                <Text style={styles.claimFullButtonText}>Claim Pending</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.erc20Section}>
            <Text style={styles.erc20Label}>Unshielded (On-chain)</Text>
            <Text style={styles.erc20Amount}>
              {displayErc20}{" "}
              <Text style={styles.erc20Symbol}>{wallet.selectedToken}</Text>
            </Text>
          </View>
        </View>

        {/* Action Buttons */}
        {!mode && (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.shieldBtn]}
              onPress={() => setMode("shield")}
            >
              <ShieldPlus size={28} color={colors.primary} style={styles.actionBtnIconSpacing} />
              <Text style={styles.actionBtnText}>Shield</Text>
              <Text style={styles.actionBtnDesc}>Deposit into private pool</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.unshieldBtn]}
              onPress={() => setMode("unshield")}
            >
              <ShieldOff size={28} color={colors.secondary} style={styles.actionBtnIconSpacing} />
              <Text style={styles.actionBtnText}>Unshield</Text>
              <Text style={styles.actionBtnDesc}>Withdraw to public wallet</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Amount Input */}
        {mode && (
          <View style={styles.inputCard}>
            <Text style={styles.inputTitle}>
              {mode === "shield" ? "Shield Funds" : "Unshield Funds"}
            </Text>
            <Text style={styles.inputSubtitle}>
              {mode === "shield"
                ? "Enter Tongo units to deposit"
                : `Available: ${wallet.balance} units`}
            </Text>

            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                value={amount}
                onChangeText={(t) => { if (/^\d*$/.test(t)) setAmount(t); }}
                autoFocus
              />
              <Text style={styles.inputSymbol}>units</Text>
            </View>
            <Text style={styles.conversionHint}>{conversionHint}</Text>

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { setMode(null); setAmount(""); }}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, !amount && styles.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={!amount || isPending}
              >
                {isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.submitBtnText}>
                    {mode === "shield" ? "Shield" : "Unshield"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 100 },

  balanceCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  balanceLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: spacing.sm,
  },
  balanceAmount: { fontSize: fontSize.xxl, fontWeight: "bold", color: colors.text },
  balanceSymbol: { fontSize: fontSize.lg, color: colors.textSecondary },

  pendingSection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  pendingRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.sm },
  pendingLabel: { fontSize: fontSize.sm, color: colors.warning },
  pendingAmount: { fontSize: fontSize.sm, color: colors.warning, fontWeight: "600" },
  claimFullButton: {
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    paddingVertical: 10,
    borderRadius: borderRadius.md,
    alignItems: "center",
  },
  claimFullButtonText: { color: colors.warning, fontWeight: "600", fontSize: fontSize.sm },

  erc20Section: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  erc20Label: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  erc20Amount: { fontSize: fontSize.lg, color: colors.textSecondary, marginTop: 2 },
  erc20Symbol: { fontSize: fontSize.sm, color: colors.textMuted },

  actionRow: { flexDirection: "row", gap: spacing.md },
  actionBtn: {
    flex: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: "center",
    borderWidth: 1,
  },
  shieldBtn: { backgroundColor: colors.primaryDim, borderColor: colors.border },
  unshieldBtn: { backgroundColor: colors.secondaryDim, borderColor: "rgba(139, 92, 246, 0.2)" },
  actionBtnIcon: { fontSize: 28, marginBottom: spacing.sm },
  actionBtnIconSpacing: { marginBottom: spacing.sm },
  actionBtnText: { fontSize: fontSize.lg, fontWeight: "600", color: colors.text, marginBottom: 4 },
  actionBtnDesc: { fontSize: fontSize.xs, color: colors.textSecondary, textAlign: "center" },

  inputCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputTitle: { fontSize: fontSize.lg, fontWeight: "600", color: colors.text, marginBottom: 4 },
  inputSubtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.lg },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bg,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
  },
  input: {
    flex: 1,
    fontSize: fontSize.xxl,
    fontWeight: "bold",
    color: colors.text,
    paddingVertical: spacing.md,
  },
  inputSymbol: { fontSize: fontSize.lg, color: colors.textSecondary, marginLeft: spacing.sm },
  conversionHint: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginBottom: spacing.lg,
    marginLeft: spacing.xs,
  },
  buttonRow: { flexDirection: "row", gap: spacing.md },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
  },
  cancelBtnText: { color: colors.textSecondary, fontSize: fontSize.md, fontWeight: "600" },
  submitBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { color: "#fff", fontSize: fontSize.md, fontWeight: "600" },

  // Claim Success Card
  claimSuccessCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
  },
  claimSuccessTitle: { fontSize: fontSize.xl, fontWeight: "bold", color: colors.success, marginBottom: spacing.sm },
  claimSuccessAmount: { fontSize: fontSize.xxl, fontWeight: "bold", color: colors.text },
  claimSuccessEquiv: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.xs },
  claimSuccessDesc: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.lg },
  claimTxSection: {
    width: "100%",
    backgroundColor: colors.bg,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.xl,
  },
  claimTxLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  claimTxHash: {
    fontSize: fontSize.xs,
    color: colors.text,
    fontFamily: "monospace",
    marginBottom: spacing.sm,
  },
  claimTxActions: { flexDirection: "row", gap: spacing.sm },
  claimTxBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surface,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  claimTxBtnText: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: "600",
  },
  claimDoneBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: borderRadius.md,
  },
  claimDoneBtnText: { color: "#fff", fontSize: fontSize.md, fontWeight: "600" },
});
