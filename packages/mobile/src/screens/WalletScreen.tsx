/**
 * WalletScreen — Shield and unshield funds.
 */
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useWallet } from "../lib/WalletContext";
import { tongoToDisplay } from "../lib/tokens";
import { colors, spacing, fontSize, borderRadius } from "../lib/theme";

type Mode = "shield" | "unshield" | null;

export default function WalletScreen() {
  const wallet = useWallet();
  const [mode, setMode] = useState<Mode>(null);
  const [amount, setAmount] = useState("");
  const [isPending, setIsPending] = useState(false);

  const displayBalance = tongoToDisplay(wallet.balance, wallet.selectedToken);
  const displayPending = tongoToDisplay(wallet.pending, wallet.selectedToken);
  const hasPending = wallet.pending !== "0";

  const handleSubmit = async () => {
    if (!amount || isPending) return;
    setIsPending(true);
    try {
      if (mode === "shield") {
        const result = await wallet.fund(amount);
        Alert.alert("Shielded!", `TX: ${result.txHash.slice(0, 20)}...`);
      } else if (mode === "unshield") {
        const result = await wallet.withdraw(amount);
        Alert.alert("Unshielded!", `TX: ${result.txHash.slice(0, 20)}...`);
      }
      setAmount("");
      setMode(null);
      await wallet.refreshBalance();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Transaction failed");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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
                  await wallet.rollover();
                  await wallet.refreshBalance();
                  Alert.alert("Claimed!", "Pending funds added to balance.");
                } catch (e: any) {
                  Alert.alert("Error", e.message);
                }
              }}
            >
              <Text style={styles.claimFullButtonText}>Claim Pending</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Token Tabs */}
      <View style={styles.tokenRow}>
        {(["STRK", "ETH", "USDC"] as const).map((token) => (
          <TouchableOpacity
            key={token}
            style={[
              styles.tokenTab,
              wallet.selectedToken === token && styles.tokenTabActive,
            ]}
            onPress={() => wallet.setSelectedToken(token)}
          >
            <Text
              style={[
                styles.tokenTabText,
                wallet.selectedToken === token && styles.tokenTabTextActive,
              ]}
            >
              {token}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Action Buttons */}
      {!mode && (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.shieldBtn]}
            onPress={() => setMode("shield")}
          >
            <Text style={styles.actionBtnIcon}>🛡️</Text>
            <Text style={styles.actionBtnText}>Shield</Text>
            <Text style={styles.actionBtnDesc}>Deposit into private pool</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.unshieldBtn]}
            onPress={() => setMode("unshield")}
          >
            <Text style={styles.actionBtnIcon}>↓</Text>
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
              : `Available: ${displayBalance} ${wallet.selectedToken}`}
          </Text>

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
              autoFocus
            />
            <Text style={styles.inputSymbol}>{wallet.selectedToken}</Text>
          </View>

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
    </ScrollView>
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

  tokenRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
  tokenTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  tokenTabActive: { backgroundColor: colors.primaryDim, borderColor: colors.primary },
  tokenTabText: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: "600" },
  tokenTabTextActive: { color: colors.primary },

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
    marginBottom: spacing.lg,
  },
  input: {
    flex: 1,
    fontSize: fontSize.xxl,
    fontWeight: "bold",
    color: colors.text,
    paddingVertical: spacing.md,
  },
  inputSymbol: { fontSize: fontSize.lg, color: colors.textSecondary, marginLeft: spacing.sm },
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
});
