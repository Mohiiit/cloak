/**
 * SendScreen — 3-step shielded payment wizard.
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

const QUICK_EMOJIS = ["🍕", "🍔", "🍺", "🎵", "🏠", "🚗", "🎮", "💰", "🎉", "🎂"];

type Step = 1 | 2 | 3 | 4;

export default function SendScreen({ navigation }: any) {
  const wallet = useWallet();
  const [step, setStep] = useState<Step>(1);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [txHash, setTxHash] = useState("");

  const displayBalance = tongoToDisplay(wallet.balance, wallet.selectedToken);

  const handleSend = async () => {
    if (!recipient || !amount) return;
    setIsPending(true);
    try {
      const result = await wallet.transfer(amount, recipient);
      setTxHash(result.txHash);
      setStep(4);
      await wallet.refreshBalance();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Transfer failed");
    } finally {
      setIsPending(false);
    }
  };

  const reset = () => {
    setStep(1);
    setRecipient("");
    setAmount("");
    setNote("");
    setTxHash("");
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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

      {/* Step 2: Amount */}
      {step === 2 && (
        <View style={styles.stepCard}>
          <Text style={styles.stepTitle}>Amount</Text>
          <Text style={styles.stepSubtitle}>
            Available: {displayBalance} {wallet.selectedToken}
          </Text>
          <View style={styles.amountInputRow}>
            <TextInput
              style={styles.amountInput}
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
              autoFocus
            />
            <Text style={styles.amountSymbol}>{wallet.selectedToken}</Text>
          </View>
          <View style={styles.navRow}>
            <TouchableOpacity style={styles.backBtn} onPress={() => setStep(1)}>
              <Text style={styles.backBtnText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.nextBtn, { flex: 2 }, !amount && styles.nextBtnDisabled]}
              onPress={() => setStep(3)}
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
              {amount} {wallet.selectedToken}
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
            {amount} {wallet.selectedToken}
          </Text>
          <Text style={styles.successRecipient}>
            to {recipient.slice(0, 16)}...
          </Text>
          {note && <Text style={styles.successNote}>{note}</Text>}
          <Text style={styles.txHashText}>
            TX: {txHash.slice(0, 24)}...
          </Text>
          <TouchableOpacity style={styles.doneBtn} onPress={reset}>
            <Text style={styles.doneBtnText}>Send Another</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate("Home")}>
            <Text style={styles.goHomeText}>Go Home</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
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
    marginBottom: spacing.lg,
  },
  amountInput: { flex: 1, fontSize: fontSize.xxl, fontWeight: "bold", color: colors.text, paddingVertical: spacing.md },
  amountSymbol: { fontSize: fontSize.lg, color: colors.textSecondary },

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
  successRecipient: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.sm },
  successNote: { fontSize: fontSize.md, color: colors.text, marginBottom: spacing.md },
  txHashText: { fontSize: fontSize.xs, color: colors.textMuted, marginBottom: spacing.xl },
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
