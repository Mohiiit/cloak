/**
 * SendScreen — 3-step shielded payment wizard.
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
import { useWallet } from "../lib/WalletContext";
import { tongoToDisplay, tongoUnitToErc20Display } from "../lib/tokens";
import { colors, spacing, fontSize, borderRadius } from "../lib/theme";
import { useThemedModal } from "../components/ThemedModal";
import { triggerMedium } from "../lib/haptics";

const QUICK_EMOJIS = ["🍕", "🍔", "🍺", "🎵", "🏠", "🚗", "🎮", "💰", "🎉", "🎂"];

type Step = 1 | 2 | 3 | 4;

export default function SendScreen({ navigation }: any) {
  const wallet = useWallet();
  const modal = useThemedModal();
  const [step, setStep] = useState<Step>(1);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [amountError, setAmountError] = useState("");
  const [note, setNote] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [txCopied, setTxCopied] = useState(false);

  useEffect(() => {
    wallet.refreshTxHistory();
  }, []);

  const conversionHint = `1 unit = ${tongoUnitToErc20Display("1", wallet.selectedToken)}`;

  const validateAndNext = () => {
    const parsed = parseInt(amount, 10);
    if (!amount || isNaN(parsed) || parsed <= 0) {
      setAmountError("Enter a valid amount greater than 0");
      return;
    }
    const bal = parseInt(wallet.balance, 10);
    if (parsed > bal) {
      setAmountError(`Insufficient balance (max: ${wallet.balance} units)`);
      return;
    }
    setAmountError("");
    setStep(3);
  };

  const handleSend = async () => {
    if (!recipient || !amount) return;
    triggerMedium();
    setIsPending(true);
    try {
      const result = await wallet.transfer(amount, recipient);
      setTxHash(result.txHash);
      setStep(4);
      await wallet.refreshBalance();
    } catch (e: any) {
      modal.showError("Error", e.message || "Transfer failed", e.message);
    } finally {
      setIsPending(false);
    }
  };

  const reset = () => {
    setStep(1);
    setRecipient("");
    setAmount("");
    setAmountError("");
    setNote("");
    setTxHash("");
    setTxCopied(false);
  };

  const handleCopyTx = () => {
    Clipboard.setString(txHash);
    setTxCopied(true);
    setTimeout(() => setTxCopied(false), 2000);
  };

  return (
    <KeyboardAvoidingView
      behavior="padding"
      style={{ flex: 1 }}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {modal.ModalComponent}
        {/* Progress Bar */}
        {step < 4 && (
          <View style={styles.progressRow}>
            {[
              { num: 1, label: "To" },
              { num: 2, label: "Amount" },
              { num: 3, label: "Confirm" },
            ].map(({ num, label }) => (
              <View key={num} style={styles.progressItem}>
                <View
                  style={[
                    styles.progressDot,
                    step >= num && styles.progressDotActive,
                  ]}
                />
                <Text
                  style={[
                    styles.progressLabel,
                    step >= num && styles.progressLabelActive,
                  ]}
                >
                  {label}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Step 1: Recipient */}
        {step === 1 && (
          <View style={styles.stepCard}>
            <Text style={styles.stepTitle}>Send to</Text>
            <Text style={styles.stepSubtitle}>Enter recipient's Cloak address (base58)</Text>
            <TextInput
              style={styles.textInput}
              placeholder="bcLpSS9eo4r5nsrJHnng..."
              placeholderTextColor={colors.textMuted}
              value={recipient}
              onChangeText={setRecipient}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.nextBtn, !recipient && styles.nextBtnDisabled]}
              onPress={() => setStep(2)}
              disabled={!recipient}
            >
              <Text style={styles.nextBtnText}>Next</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Recent Transactions */}
        {step === 1 && wallet.txHistory.length > 0 && (
          <View style={styles.historyCard}>
            <Text style={styles.historyTitle}>Recent Transactions</Text>
            {wallet.txHistory.slice(0, 5).map((tx: any, i: number) => {
              const typeIcon = tx.type === "fund" ? "🛡️" : tx.type === "transfer" ? "↑" : tx.type === "withdraw" ? "↓" : "?";
              const hash = tx.txHash || tx.transaction_hash || "";
              return (
                <TouchableOpacity
                  key={i}
                  style={styles.historyRow}
                  onPress={() => hash && Linking.openURL(`https://sepolia.voyager.online/tx/${hash}`)}
                >
                  <Text style={styles.historyIcon}>{typeIcon}</Text>
                  <View style={styles.historyInfo}>
                    <Text style={styles.historyType}>{tx.type || "unknown"}</Text>
                    <Text style={styles.historyAmount}>{tx.amount || "?"} units</Text>
                  </View>
                  {hash ? (
                    <Text style={styles.historyHash}>{hash.slice(0, 8)}...</Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Step 2: Amount */}
        {step === 2 && (
          <View style={styles.stepCard}>
            <Text style={styles.stepTitle}>Amount</Text>
            <Text style={styles.stepSubtitle}>
              Available: {wallet.balance} units
            </Text>
            <View style={styles.amountInputRow}>
              <TextInput
                style={styles.amountInput}
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                value={amount}
                onChangeText={(t) => { setAmount(t); setAmountError(""); }}
                autoFocus
              />
              <Text style={styles.amountSymbol}>units</Text>
            </View>
            <Text style={styles.conversionHint}>{conversionHint}</Text>
            {amountError ? (
              <Text style={styles.errorText}>{amountError}</Text>
            ) : null}
            <View style={styles.navRow}>
              <TouchableOpacity style={styles.backBtn} onPress={() => setStep(1)}>
                <Text style={styles.backBtnText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.nextBtn, { flex: 2 }, !amount && styles.nextBtnDisabled]}
                onPress={validateAndNext}
                disabled={!amount}
              >
                <Text style={styles.nextBtnText}>Next</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Step 3: Confirm */}
        {step === 3 && (
          <View style={styles.stepCard}>
            <Text style={styles.stepTitle}>Confirm Payment</Text>

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>To</Text>
              <Text style={styles.summaryValue} numberOfLines={1}>
                {recipient.slice(0, 20)}...
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Amount</Text>
              <Text style={styles.summaryValueBold}>
                {amount} units ({tongoUnitToErc20Display(amount, wallet.selectedToken)})
              </Text>
            </View>

            {/* Note */}
            <Text style={styles.noteLabel}>Add a note (optional)</Text>
            <TextInput
              style={styles.noteInput}
              placeholder="Pizza night!"
              placeholderTextColor={colors.textMuted}
              value={note}
              onChangeText={setNote}
              maxLength={100}
            />
            <View style={styles.emojiRow}>
              {QUICK_EMOJIS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={styles.emojiBtn}
                  onPress={() => setNote((prev) => prev + emoji)}
                >
                  <Text style={styles.emojiText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.navRow}>
              <TouchableOpacity style={styles.backBtn} onPress={() => setStep(2)}>
                <Text style={styles.backBtnText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sendBtn, { flex: 2 }]}
                onPress={handleSend}
                disabled={isPending}
              >
                {isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.sendBtnText}>Send Payment</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Step 4: Success */}
        {step === 4 && (
          <View style={styles.successCard}>
            <Text style={styles.successIcon}>✓</Text>
            <Text style={styles.successTitle}>Payment Sent!</Text>
            <Text style={styles.successAmount}>
              {amount} units
            </Text>
            <Text style={styles.successEquiv}>
              ({tongoUnitToErc20Display(amount, wallet.selectedToken)})
            </Text>
            <Text style={styles.successRecipient}>
              to {recipient.slice(0, 16)}...
            </Text>
            {note && <Text style={styles.successNote}>{note}</Text>}

            {/* Tx Hash */}
            <View style={styles.txSection}>
              <Text style={styles.txLabel}>Transaction Hash</Text>
              <Text style={styles.txHashFull} numberOfLines={2} selectable>
                {txHash}
              </Text>
              <View style={styles.txActionRow}>
                <TouchableOpacity style={styles.txActionBtn} onPress={handleCopyTx}>
                  <Text style={styles.txActionBtnText}>{txCopied ? "Copied!" : "Copy Tx Hash"}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.txActionBtn}
                  onPress={() => Linking.openURL(`https://sepolia.voyager.online/tx/${txHash}`)}
                >
                  <Text style={styles.txActionBtnText}>View on Voyager</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity style={styles.doneBtn} onPress={reset}>
              <Text style={styles.doneBtnText}>Send Another</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate("Home")}>
              <Text style={styles.goHomeText}>Go Home</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 100 },

  // Progress
  progressRow: { flexDirection: "row", justifyContent: "center", gap: spacing.xl, marginBottom: spacing.xl },
  progressItem: { alignItems: "center", gap: 6 },
  progressDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.surfaceLight,
  },
  progressDotActive: { backgroundColor: colors.primary },
  progressLabel: { fontSize: fontSize.xs, color: colors.textMuted },
  progressLabelActive: { color: colors.primary },

  // Step Card
  stepCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  stepTitle: { fontSize: fontSize.xl, fontWeight: "bold", color: colors.text, marginBottom: 4 },
  stepSubtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.lg },

  textInput: {
    backgroundColor: colors.bg,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: fontSize.md,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  amountInputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bg,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
  },
  amountInput: { flex: 1, fontSize: fontSize.xxl, fontWeight: "bold", color: colors.text, paddingVertical: spacing.md },
  amountSymbol: { fontSize: fontSize.lg, color: colors.textSecondary },
  conversionHint: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  errorText: {
    fontSize: fontSize.xs,
    color: colors.error,
    marginBottom: spacing.md,
    marginLeft: spacing.xs,
  },

  navRow: { flexDirection: "row", gap: spacing.md },
  nextBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
  },
  nextBtnDisabled: { opacity: 0.4 },
  nextBtnText: { color: "#fff", fontSize: fontSize.md, fontWeight: "600" },
  backBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
  },
  backBtnText: { color: colors.textSecondary, fontSize: fontSize.md },

  // Summary
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    marginBottom: spacing.sm,
  },
  summaryLabel: { fontSize: fontSize.md, color: colors.textSecondary },
  summaryValue: { fontSize: fontSize.md, color: colors.text, maxWidth: "60%" },
  summaryValueBold: { fontSize: fontSize.md, color: colors.text, fontWeight: "bold" },

  // Note
  noteLabel: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.sm },
  noteInput: {
    backgroundColor: colors.bg,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: fontSize.md,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  emojiRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.lg },
  emojiBtn: {
    width: 38,
    height: 38,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  emojiText: { fontSize: 18 },

  sendBtn: {
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    backgroundColor: colors.success,
    alignItems: "center",
  },
  sendBtnText: { color: "#fff", fontSize: fontSize.md, fontWeight: "600" },

  // Success
  successCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
  },
  successIcon: {
    fontSize: 48,
    color: colors.success,
    marginBottom: spacing.md,
  },
  successTitle: { fontSize: fontSize.xl, fontWeight: "bold", color: colors.success, marginBottom: spacing.sm },
  successAmount: { fontSize: fontSize.xxl, fontWeight: "bold", color: colors.text },
  successEquiv: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.xs },
  successRecipient: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.sm },
  successNote: { fontSize: fontSize.md, color: colors.text, marginBottom: spacing.md },

  txSection: {
    width: "100%",
    backgroundColor: colors.bg,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.xl,
  },
  txLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  txHashFull: {
    fontSize: fontSize.xs,
    color: colors.text,
    fontFamily: "monospace",
    marginBottom: spacing.sm,
  },
  txActionRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  txActionBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surface,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  txActionBtnText: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: "600",
  },

  // History
  historyCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginTop: spacing.lg,
  },
  historyTitle: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: spacing.md,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    gap: spacing.sm,
  },
  historyIcon: { fontSize: 18 },
  historyInfo: { flex: 1 },
  historyType: { fontSize: fontSize.sm, color: colors.text, fontWeight: "500", textTransform: "capitalize" },
  historyAmount: { fontSize: fontSize.xs, color: colors.textSecondary },
  historyHash: { fontSize: fontSize.xs, color: colors.textMuted, fontFamily: "monospace" },

  doneBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  doneBtnText: { color: "#fff", fontSize: fontSize.md, fontWeight: "600" },
  goHomeText: { color: colors.textSecondary, fontSize: fontSize.sm },
});
