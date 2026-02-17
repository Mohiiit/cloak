/**
 * SendScreen — single-page shielded transfer form + success state.
 */
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Linking,
} from "react-native";
import Clipboard from "@react-native-clipboard/clipboard";
import {
  Car,
  Check,
  Coffee,
  Gamepad2,
  Gift,
  House,
  Music2,
  Search,
  Send as SendIcon,
  UtensilsCrossed,
  WalletCards,
} from "lucide-react-native";
import { parseInsufficientGasError } from "@cloak-wallet/sdk";
import { useWallet } from "../lib/WalletContext";
import { useTransactionRouter } from "../hooks/useTransactionRouter";
import { tongoUnitToErc20Display } from "../lib/tokens";
import { useContacts } from "../hooks/useContacts";
import { saveTxNote } from "../lib/storage";
import { triggerMedium } from "../lib/haptics";
import { colors, spacing, fontSize, borderRadius, typography } from "../lib/theme";
import { useThemedModal } from "../components/ThemedModal";
import { FeeRetryModal } from "../components/FeeRetryModal";
import { KeyboardSafeScreen } from "../components/KeyboardSafeContainer";
import { useKeyboardVisible } from "../hooks/useKeyboardVisible";
import { testIDs, testProps } from "../testing/testIDs";

type Step = 1 | 4;

const QUICK_NOTE_CHIPS = [
  { key: "coffee", label: "Coffee money", Icon: Coffee },
  { key: "food", label: "Food", Icon: UtensilsCrossed },
  { key: "music", label: "Music", Icon: Music2 },
  { key: "home", label: "Home", Icon: House },
  { key: "ride", label: "Ride", Icon: Car },
  { key: "gaming", label: "Gaming", Icon: Gamepad2 },
  { key: "salary", label: "Salary", Icon: WalletCards },
  { key: "gift", label: "Gift", Icon: Gift },
] as const;

export default function SendScreen({ navigation }: any) {
  const wallet = useWallet();
  const { contacts } = useContacts();
  const { execute } = useTransactionRouter();
  const modal = useThemedModal();
  const keyboardVisible = useKeyboardVisible();

  const [step, setStep] = useState<Step>(1);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [txCopied, setTxCopied] = useState(false);
  const [addressError, setAddressError] = useState("");
  const [amountError, setAmountError] = useState("");
  const [isNoteFocused, setIsNoteFocused] = useState(false);

  const [showFeeRetry, setShowFeeRetry] = useState(false);
  const [gasErrorMsg, setGasErrorMsg] = useState("");
  const [feeRetryCount, setFeeRetryCount] = useState(0);

  useEffect(() => {
    wallet.refreshTxHistory();
  }, [wallet]);

  const sendKeyboardMode = isNoteFocused && keyboardVisible;
  const conversionHint = `1 unit = ${tongoUnitToErc20Display("1", wallet.selectedToken)}`;

  const visibleContacts =
    contacts.length > 0
      ? contacts.slice(0, 2).map((c) => ({
          id: c.id,
          label: c.nickname || `${c.tongoAddress.slice(0, 6)}...`,
          address: c.tongoAddress,
        }))
      : [
          { id: "fallback-alice", label: "alice.stark", address: "alice.stark" },
          { id: "fallback-bob", label: "bob.g.stark", address: "bob.g.stark" },
        ];

  const validateAmount = (): boolean => {
    const parsed = parseInt(amount, 10);
    if (!amount || Number.isNaN(parsed) || parsed <= 0) {
      setAmountError("Enter a valid amount greater than 0");
      return false;
    }
    const balanceInt = parseInt(wallet.balance, 10);
    if (parsed > balanceInt) {
      setAmountError(`Insufficient balance (max: ${wallet.balance} units)`);
      return false;
    }
    setAmountError("");
    return true;
  };

  const handleSend = async () => {
    setAddressError("");
    if (!recipient.trim()) {
      setAddressError("Recipient is required.");
      return;
    }
    if (!validateAmount()) return;

    triggerMedium();
    setIsPending(true);

    try {
      const valid = await wallet.validateAddress(recipient.trim());
      if (!valid) {
        setAddressError("Invalid Cloak address. Please check and try again.");
        return;
      }

      const result = await execute({
        action: "transfer",
        token: wallet.selectedToken,
        amount,
        recipient: recipient.trim(),
      });

      setTxHash(result.txHash);
      await saveTxNote(result.txHash, {
        txHash: result.txHash,
        recipient: recipient.trim(),
        note: note || undefined,
        privacyLevel: "private",
        timestamp: Date.now(),
        type: "send",
        token: wallet.selectedToken,
        amount,
      });
      setStep(4);
      await wallet.refreshBalance();
    } catch (e: any) {
      const gasInfo = parseInsufficientGasError(e.message || "");
      if (gasInfo && feeRetryCount < 3) {
        setGasErrorMsg(e.message);
        setShowFeeRetry(true);
      } else {
        modal.showError("Error", e.message || "Transfer failed", e.message);
      }
    } finally {
      setIsPending(false);
    }
  };

  const handleFeeRetry = () => {
    setFeeRetryCount((prev) => prev + 1);
    setShowFeeRetry(false);
    handleSend();
  };

  const handleCopyTx = () => {
    Clipboard.setString(txHash);
    setTxCopied(true);
    setTimeout(() => setTxCopied(false), 2000);
  };

  const reset = () => {
    setStep(1);
    setRecipient("");
    setAmount("");
    setNote("");
    setTxHash("");
    setAddressError("");
    setAmountError("");
    setTxCopied(false);
  };

  return (
    <KeyboardSafeScreen
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {modal.ModalComponent}
      <FeeRetryModal
        visible={showFeeRetry}
        errorMessage={gasErrorMsg}
        retryCount={feeRetryCount}
        maxRetries={3}
        isRetrying={isPending}
        onRetry={handleFeeRetry}
        onCancel={() => {
          setShowFeeRetry(false);
          setIsPending(false);
        }}
      />

      {step !== 4 ? (
        <>
          <View style={styles.progressRow}>
            <View style={[styles.progressSegment, styles.progressSegmentActive]} />
            <View style={[styles.progressSegment, styles.progressSegmentActive]} />
            <View style={styles.progressSegment} />
          </View>

          <View style={[styles.section, sendKeyboardMode && styles.sectionCompact]}>
            <Text style={styles.sectionLabel}>TO</Text>
            <View style={styles.inputRow}>
              <Search size={16} color={colors.textMuted} />
              <TextInput
                {...testProps(testIDs.send.recipientInput)}
                style={styles.recipientInput}
                placeholder="alice.stark or 0x..."
                placeholderTextColor={colors.textMuted}
                value={recipient}
                onChangeText={(t) => {
                  setRecipient(t.replace(/\s/g, ""));
                  setAddressError("");
                }}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
              />
              <TouchableOpacity
                {...testProps(testIDs.send.recipientPaste)}
                onPress={async () => {
                  const text = await Clipboard.getString();
                  if (text) {
                    setRecipient(text.trim());
                    setAddressError("");
                  }
                }}
              >
                <Text style={styles.pasteText}>Paste</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.contactRow}
            >
              {visibleContacts.map((c, index) => (
                <TouchableOpacity
                  key={c.id}
                  style={styles.contactChip}
                  onPress={() => {
                    setRecipient(c.address);
                    setAddressError("");
                  }}
                >
                  <View
                    style={[
                      styles.contactDot,
                      index % 2 === 0 ? styles.contactDotBlue : styles.contactDotGreen,
                    ]}
                  />
                  <Text style={styles.contactChipText}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {addressError ? <Text style={styles.errorText}>{addressError}</Text> : null}
          </View>

          <View style={[styles.section, styles.amountSection, sendKeyboardMode && styles.sectionCompact]}>
            <Text style={styles.sectionLabel}>AMOUNT</Text>
            <View style={styles.amountCard}>
              <TextInput
                {...testProps(testIDs.send.amountInput)}
                style={styles.amountInput}
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                value={amount}
                onChangeText={(t) => {
                  if (/^\d*$/.test(t)) {
                    setAmount(t);
                    setAmountError("");
                  }
                }}
              />
              <Text style={styles.amountSub}>
                units ({amount ? tongoUnitToErc20Display(amount, wallet.selectedToken) : "0.00 STRK"})
              </Text>
              <Text style={styles.availableText}>Available: {wallet.balance} units MAX</Text>
            </View>
            {amountError ? <Text style={styles.errorText}>{amountError}</Text> : null}
            <Text style={styles.conversionHint}>{conversionHint}</Text>
          </View>

          <View style={[styles.section, sendKeyboardMode && styles.sectionCompact]}>
            <Text style={styles.sectionLabel}>NOTE (OPTIONAL)</Text>
            <TextInput
              {...testProps(testIDs.send.noteInput)}
              style={styles.noteInput}
              placeholder="Coffee money!"
              placeholderTextColor={colors.textMuted}
              value={note}
              onChangeText={setNote}
              onFocus={() => setIsNoteFocused(true)}
              onBlur={() => setIsNoteFocused(false)}
              maxLength={100}
            />
            <View style={styles.quickChipRow}>
              {QUICK_NOTE_CHIPS.slice(0, 5).map(({ key, label, Icon }) => (
                <TouchableOpacity
                  key={key}
                  style={styles.quickChip}
                  onPress={() => {
                    setNote((prev) => {
                      const trimmed = prev.trim();
                      return trimmed.length === 0 ? label : `${trimmed} · ${label}`;
                    });
                  }}
                >
                  <Icon size={14} color={colors.textSecondary} />
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.formSpacer} />

          <TouchableOpacity
            {...testProps(testIDs.send.confirmSend)}
            style={[styles.sendButton, isPending && styles.sendButtonDisabled]}
            onPress={() => {
              setFeeRetryCount(0);
              handleSend();
            }}
            disabled={isPending}
          >
            {isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <SendIcon size={18} color="#fff" />
                <Text style={styles.sendButtonText}>
                  {`Send ${amount && parseInt(amount, 10) > 0 ? amount : "0"} Units`}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </>
      ) : (
        <View style={styles.successCard}>
          <Check size={48} color={colors.success} style={styles.successIconSpacing} />
          <Text style={styles.successTitle}>Payment Sent!</Text>
          <Text style={styles.successAmount}>{amount} units</Text>
          <Text style={styles.successEquiv}>
            ({tongoUnitToErc20Display(amount, wallet.selectedToken)})
          </Text>
          <Text style={styles.successRecipient}>to {recipient.slice(0, 16)}...</Text>
          {note ? <Text style={styles.successNote}>{note}</Text> : null}

          <View style={styles.txSection}>
            <Text style={styles.txLabel}>Transaction Hash</Text>
            <Text style={styles.txHashFull} numberOfLines={2} selectable>
              {txHash}
            </Text>
            <View style={styles.txActionRow}>
              <TouchableOpacity
                {...testProps(testIDs.send.successCopyTx)}
                style={styles.txActionBtn}
                onPress={handleCopyTx}
              >
                <Text style={styles.txActionBtnText}>{txCopied ? "Copied!" : "Copy Tx Hash"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                {...testProps(testIDs.send.successViewVoyager)}
                style={styles.txActionBtn}
                onPress={() => Linking.openURL(`https://sepolia.voyager.online/tx/${txHash}`)}
              >
                <Text style={styles.txActionBtnText}>View on Voyager</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            {...testProps(testIDs.send.successSendAnother)}
            style={styles.doneBtn}
            onPress={reset}
          >
            <Text style={styles.doneBtnText}>Send Another</Text>
          </TouchableOpacity>
          <TouchableOpacity
            {...testProps(testIDs.send.successGoHome)}
            onPress={() => navigation.navigate("Home")}
          >
            <Text style={styles.goHomeText}>Go Home</Text>
          </TouchableOpacity>
        </View>
      )}
    </KeyboardSafeScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 100,
    flexGrow: 1,
  },
  progressRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 20,
  },
  progressSegment: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.surfaceLight,
  },
  progressSegmentActive: {
    backgroundColor: colors.primary,
  },
  section: {
    marginBottom: 16,
  },
  sectionCompact: {
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 2,
    color: colors.textMuted,
    marginBottom: 8,
    fontFamily: typography.primarySemibold,
  },
  inputRow: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  recipientInput: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontFamily: typography.secondary,
    paddingVertical: 0,
  },
  pasteText: {
    color: colors.primaryLight,
    fontSize: 12,
    fontFamily: typography.primarySemibold,
  },
  contactRow: {
    gap: 8,
    marginTop: 8,
  },
  contactChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    borderRadius: 999,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  contactDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  contactDotBlue: {
    backgroundColor: colors.primaryLight,
  },
  contactDotGreen: {
    backgroundColor: colors.success,
  },
  contactChipText: {
    color: colors.text,
    fontSize: 12,
    fontFamily: typography.primary,
  },
  amountSection: {
    marginTop: 2,
  },
  amountCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 16,
    alignItems: "center",
  },
  amountInput: {
    color: colors.text,
    fontSize: 48,
    lineHeight: 54,
    fontFamily: typography.primarySemibold,
    fontWeight: "700",
    paddingVertical: 0,
    textAlign: "center",
    minWidth: 120,
  },
  amountSub: {
    color: colors.textSecondary,
    fontSize: 13,
    fontFamily: typography.primary,
    marginTop: 2,
  },
  availableText: {
    color: colors.success,
    fontSize: 11,
    marginTop: 8,
    fontFamily: typography.primary,
  },
  conversionHint: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 6,
    marginLeft: 2,
    fontFamily: typography.primary,
  },
  noteInput: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 14,
    fontFamily: typography.secondary,
    paddingHorizontal: 16,
    paddingVertical: 0,
  },
  quickChipRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  quickChip: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  formSpacer: {
    flex: 1,
  },
  sendButton: {
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendButtonText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: typography.primarySemibold,
    fontWeight: "600",
  },
  errorText: {
    fontSize: 12,
    color: colors.error,
    marginTop: 8,
    fontFamily: typography.secondary,
  },

  // Success
  successCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
  },
  successIconSpacing: {
    marginBottom: spacing.md,
  },
  successTitle: {
    fontSize: fontSize.xl,
    fontWeight: "bold",
    color: colors.success,
    marginBottom: spacing.sm,
    fontFamily: typography.primarySemibold,
  },
  successAmount: {
    fontSize: fontSize.xxl,
    fontWeight: "bold",
    color: colors.text,
    fontFamily: typography.primarySemibold,
  },
  successEquiv: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    fontFamily: typography.primary,
  },
  successRecipient: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    fontFamily: typography.secondary,
  },
  successNote: {
    fontSize: fontSize.md,
    color: colors.text,
    marginBottom: spacing.md,
    fontFamily: typography.secondary,
  },
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
    fontFamily: typography.primarySemibold,
  },
  txHashFull: {
    fontSize: fontSize.xs,
    color: colors.text,
    fontFamily: typography.primary,
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
    fontFamily: typography.secondarySemibold,
  },
  doneBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  doneBtnText: {
    color: "#fff",
    fontSize: fontSize.md,
    fontWeight: "600",
    fontFamily: typography.primarySemibold,
  },
  goHomeText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontFamily: typography.secondary,
  },
});
