/**
 * SendScreen — single-page shielded transfer form + modal overlays for
 * sending, success, and failure states.
 */
import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Linking,
  Modal,
  Animated,
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
  X,
  RefreshCw,
} from "lucide-react-native";
import { parseInsufficientGasError } from "@cloak-wallet/sdk";
import { useWallet } from "../lib/WalletContext";
import { useTransactionRouter } from "../hooks/useTransactionRouter";
import { tongoUnitToErc20Display, type TokenKey } from "../lib/tokens";
import { useContacts } from "../hooks/useContacts";
import { saveTxNote } from "../lib/storage";
import { triggerMedium } from "../lib/haptics";
import { colors, spacing, fontSize, borderRadius, typography } from "../lib/theme";
import { FeeRetryModal } from "../components/FeeRetryModal";
import { KeyboardSafeScreen } from "../components/KeyboardSafeContainer";
import { useKeyboardVisible } from "../hooks/useKeyboardVisible";
import { testIDs, testProps } from "../testing/testIDs";

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

/* ─── Modal sub-components ────────────────────────────────────────────── */

/** Spinner with two concentric circles */
function SendingSpinner() {
  const spinAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      }),
    ).start();
  }, [spinAnim]);
  const rotate = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });
  return (
    <View style={modalStyles.spinnerContainer}>
      {/* outer ring */}
      <View style={modalStyles.spinnerOuter} />
      {/* inner ring (rotating) */}
      <Animated.View
        style={[modalStyles.spinnerInner, { transform: [{ rotate }] }]}
      />
    </View>
  );
}

/** Detail card used in both sending and success modals */
function DetailCard({
  rows,
}: {
  rows: { label: string; value: string; valueColor?: string }[];
}) {
  return (
    <View style={modalStyles.detailCard}>
      {rows.map((r) => (
        <View key={r.label} style={modalStyles.detailRow}>
          <Text style={modalStyles.detailLabel}>{r.label}</Text>
          <Text
            style={[
              modalStyles.detailValue,
              r.valueColor ? { color: r.valueColor } : undefined,
            ]}
            numberOfLines={1}
            ellipsizeMode="middle"
          >
            {r.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

/* ─── Sending Modal ───────────────────────────────────────────────────── */

function SendingModal({
  visible,
  recipient,
  amount,
  note,
  token,
}: {
  visible: boolean;
  recipient: string;
  amount: string;
  note: string;
  token: TokenKey;
}) {
  const progressAnim = useRef(new Animated.Value(0.15)).current;

  useEffect(() => {
    if (visible) {
      progressAnim.setValue(0.15);
      Animated.timing(progressAnim, {
        toValue: 0.85,
        duration: 25000,
        useNativeDriver: false,
      }).start();
    }
  }, [visible, progressAnim]);

  const displayAmount = amount
    ? `${amount} units (${tongoUnitToErc20Display(amount, token)})`
    : "0 units";
  const displayRecipient =
    recipient.length > 20
      ? `${recipient.slice(0, 10)}...${recipient.slice(-8)}`
      : recipient;

  const detailRows = [
    { label: "To", value: displayRecipient },
    { label: "Amount", value: displayAmount },
  ];
  if (note) detailRows.push({ label: "Note", value: note });

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={modalStyles.overlay}>
        <View style={modalStyles.card}>
          <SendingSpinner />
          <Text style={modalStyles.sendingTitle}>Sending...</Text>
          <Text style={modalStyles.description}>
            {"Your shielded transfer is being\nprocessed on Starknet"}
          </Text>
          <DetailCard rows={detailRows} />
          {/* Progress bar */}
          <View style={modalStyles.progressBarBg}>
            <Animated.View
              style={[
                modalStyles.progressBarFill,
                {
                  width: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ["0%", "100%"],
                  }),
                },
              ]}
            />
          </View>
          <Text style={modalStyles.stepText}>Generating ZK proof...</Text>
        </View>
      </View>
    </Modal>
  );
}

/* ─── Success Modal ───────────────────────────────────────────────────── */

function SuccessModal({
  visible,
  recipient,
  amount,
  token,
  txHash,
  fee,
  onDone,
}: {
  visible: boolean;
  recipient: string;
  amount: string;
  token: TokenKey;
  txHash: string;
  fee?: string;
  onDone: () => void;
}) {
  const displayAmount = amount
    ? `${amount} units (${tongoUnitToErc20Display(amount, token)})`
    : "0 units";
  const displayRecipient =
    recipient.length > 20
      ? `${recipient.slice(0, 10)}...${recipient.slice(-8)}`
      : recipient;
  const displayTxHash =
    txHash.length > 20
      ? `${txHash.slice(0, 10)}...${txHash.slice(-8)}`
      : txHash;

  const detailRows: { label: string; value: string; valueColor?: string }[] = [
    { label: "To", value: displayRecipient },
    { label: "Amount", value: displayAmount },
    { label: "Tx Hash", value: displayTxHash, valueColor: "#3B82F6" },
  ];
  if (fee) detailRows.push({ label: "Fee", value: fee, valueColor: "#94A3B8" });

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={modalStyles.overlay}>
        <View style={[modalStyles.card, { gap: 20 }]}>
          {/* Check circle */}
          <View style={modalStyles.successCircle}>
            <Check size={36} color="#10B981" />
          </View>
          <Text style={modalStyles.successTitle}>Transfer Complete!</Text>
          <Text style={modalStyles.description}>
            {"Your shielded transfer has been\nsuccessfully processed"}
          </Text>
          <DetailCard rows={detailRows} />
          {/* Done button */}
          <TouchableOpacity
            style={modalStyles.doneButton}
            onPress={onDone}
            activeOpacity={0.8}
          >
            <Check size={18} color="#fff" />
            <Text style={modalStyles.doneButtonText}>Done</Text>
          </TouchableOpacity>
          {/* Explorer link */}
          <TouchableOpacity
            onPress={() =>
              Linking.openURL(`https://sepolia.voyager.online/tx/${txHash}`)
            }
          >
            <Text style={modalStyles.explorerLink}>View on Voyager</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/* ─── Failed Modal ────────────────────────────────────────────────────── */

function FailedModal({
  visible,
  errorMessage,
  onRetry,
  onCancel,
}: {
  visible: boolean;
  errorMessage: string;
  onRetry: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={modalStyles.overlay}>
        <View style={[modalStyles.card, modalStyles.failedCard, { gap: 20 }]}>
          {/* Error circle */}
          <View style={modalStyles.errorCircle}>
            <X size={36} color="#EF4444" />
          </View>
          <Text style={modalStyles.failedTitle}>Transfer Failed</Text>
          <Text style={modalStyles.description}>
            {"The transaction could not be\ncompleted. Please try again."}
          </Text>
          {/* Error box */}
          <View style={modalStyles.errorBox}>
            <X size={18} color="#EF4444" style={{ flexShrink: 0 }} />
            <Text style={modalStyles.errorBoxText}>{errorMessage}</Text>
          </View>
          {/* Retry button */}
          <TouchableOpacity
            style={modalStyles.retryButton}
            onPress={onRetry}
            activeOpacity={0.8}
          >
            <RefreshCw size={18} color="#fff" />
            <Text style={modalStyles.retryButtonText}>Retry Transfer</Text>
          </TouchableOpacity>
          {/* Cancel button */}
          <TouchableOpacity
            style={modalStyles.cancelButton}
            onPress={onCancel}
            activeOpacity={0.8}
          >
            <Text style={modalStyles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/* ─── Main screen ─────────────────────────────────────────────────────── */

export default function SendScreen({ navigation }: any) {
  const wallet = useWallet();
  const { contacts } = useContacts();
  const { execute } = useTransactionRouter();
  const keyboardVisible = useKeyboardVisible();
  const scrollRef = React.useRef<ScrollView>(null);

  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [addressError, setAddressError] = useState("");
  const [amountError, setAmountError] = useState("");
  const [isNoteFocused, setIsNoteFocused] = useState(false);

  const [showFeeRetry, setShowFeeRetry] = useState(false);
  const [gasErrorMsg, setGasErrorMsg] = useState("");
  const [feeRetryCount, setFeeRetryCount] = useState(0);

  // Modal states
  const [sendingModalVisible, setSendingModalVisible] = useState(false);
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [failedModalVisible, setFailedModalVisible] = useState(false);
  const [failedError, setFailedError] = useState("");

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
      : [];

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
    setSendingModalVisible(true);

    try {
      const valid = await wallet.validateAddress(recipient.trim());
      if (!valid) {
        setAddressError("Invalid Cloak address. Please check and try again.");
        setSendingModalVisible(false);
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
      setSendingModalVisible(false);
      setSuccessModalVisible(true);
      await wallet.refreshBalance();
    } catch (e: any) {
      setSendingModalVisible(false);
      const gasInfo = parseInsufficientGasError(e.message || "");
      if (gasInfo && feeRetryCount < 3) {
        setGasErrorMsg(e.message);
        setShowFeeRetry(true);
      } else {
        setFailedError(e.message || "Transfer failed");
        setFailedModalVisible(true);
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

  const reset = () => {
    setRecipient("");
    setAmount("");
    setNote("");
    setTxHash("");
    setAddressError("");
    setAmountError("");
  };

  return (
    <KeyboardSafeScreen
      scrollRef={scrollRef}
      style={styles.container}
      contentContainerStyle={[styles.content, sendKeyboardMode && styles.contentKeyboard]}
      keyboardShouldPersistTaps="handled"
    >
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

      {/* Modal overlays */}
      <SendingModal
        visible={sendingModalVisible}
        recipient={recipient}
        amount={amount}
        note={note}
        token={wallet.selectedToken}
      />
      <SuccessModal
        visible={successModalVisible}
        recipient={recipient}
        amount={amount}
        token={wallet.selectedToken}
        txHash={txHash}
        onDone={() => {
          setSuccessModalVisible(false);
          reset();
        }}
      />
      <FailedModal
        visible={failedModalVisible}
        errorMessage={failedError}
        onRetry={() => {
          setFailedModalVisible(false);
          setFeeRetryCount(0);
          handleSend();
        }}
        onCancel={() => setFailedModalVisible(false)}
      />

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
            placeholder="Recipient address or name..."
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
        {!sendKeyboardMode ? (
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
        ) : null}
        {addressError ? <Text style={styles.errorText}>{addressError}</Text> : null}
      </View>

      <View
        style={[styles.section, styles.amountSection, sendKeyboardMode && styles.sectionCompact]}
      >
        <Text style={styles.sectionLabel}>AMOUNT</Text>
        <View style={[styles.amountCard, sendKeyboardMode && styles.amountCardKeyboard]}>
          <TextInput
            {...testProps(testIDs.send.amountInput)}
            style={[styles.amountInput, sendKeyboardMode && styles.amountInputKeyboard]}
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
          <Text style={[styles.amountSub, sendKeyboardMode && styles.amountSubKeyboard]}>
            units ({amount ? tongoUnitToErc20Display(amount, wallet.selectedToken) : "0.00 STRK"})
          </Text>
          {!sendKeyboardMode ? (
            <Text style={styles.availableText}>Available: {wallet.balance} units MAX</Text>
          ) : null}
        </View>
        {amountError ? <Text style={styles.errorText}>{amountError}</Text> : null}
        {!sendKeyboardMode ? <Text style={styles.conversionHint}>{conversionHint}</Text> : null}
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

      {!sendKeyboardMode ? <View style={styles.formSpacer} /> : null}

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
    </KeyboardSafeScreen>
  );
}

/* ─── Modal styles ────────────────────────────────────────────────────── */

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(10, 15, 28, 0.85)",
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    width: 320,
    backgroundColor: "#1E293B",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#2D3B4D",
    paddingTop: 40,
    paddingHorizontal: 32,
    paddingBottom: 32,
    alignItems: "center",
    gap: 24,
  },
  failedCard: {
    borderColor: "rgba(239, 68, 68, 0.25)",
  },

  /* ── Spinner ── */
  spinnerContainer: {
    width: 64,
    height: 64,
    justifyContent: "center",
    alignItems: "center",
  },
  spinnerOuter: {
    position: "absolute",
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: "#2D3B4D",
  },
  spinnerInner: {
    position: "absolute",
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: "transparent",
    borderTopColor: "#3B82F6",
  },

  /* ── Sending ── */
  sendingTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#F8FAFC",
    fontFamily: typography.primarySemibold,
  },
  description: {
    fontSize: 14,
    color: "#94A3B8",
    fontFamily: typography.secondary,
    textAlign: "center",
    lineHeight: 21,
  },

  /* ── Detail card ── */
  detailCard: {
    width: "100%",
    backgroundColor: "#0F172A",
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  detailLabel: {
    fontSize: 12,
    color: "#64748B",
    fontFamily: typography.primary,
  },
  detailValue: {
    fontSize: 12,
    color: "#F8FAFC",
    fontFamily: typography.primarySemibold,
    flexShrink: 1,
    textAlign: "right",
    maxWidth: "60%",
  },

  /* ── Progress bar ── */
  progressBarBg: {
    width: "100%",
    height: 4,
    backgroundColor: "#0F172A",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBarFill: {
    height: 4,
    backgroundColor: "#3B82F6",
    borderRadius: 2,
  },
  stepText: {
    fontSize: 11,
    color: "#64748B",
    fontFamily: typography.primary,
  },

  /* ── Success ── */
  successCircle: {
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
  doneButton: {
    width: "100%",
    height: 48,
    borderRadius: 14,
    backgroundColor: "#10B981",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  doneButtonText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#fff",
    fontFamily: typography.primarySemibold,
  },
  explorerLink: {
    fontSize: 13,
    color: "#3B82F6",
    fontFamily: typography.primarySemibold,
  },

  /* ── Failed ── */
  errorCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(239, 68, 68, 0.13)",
    borderWidth: 3,
    borderColor: "#EF4444",
    justifyContent: "center",
    alignItems: "center",
  },
  failedTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#EF4444",
    fontFamily: typography.primarySemibold,
  },
  errorBox: {
    width: "100%",
    backgroundColor: "rgba(239, 68, 68, 0.06)",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.19)",
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  errorBoxText: {
    flex: 1,
    fontSize: 12,
    color: "#EF4444",
    opacity: 0.9,
    fontFamily: typography.secondary,
    lineHeight: 16.8,
  },
  retryButton: {
    width: "100%",
    height: 48,
    borderRadius: 14,
    backgroundColor: "#3B82F6",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#fff",
    fontFamily: typography.primarySemibold,
  },
  cancelButton: {
    width: "100%",
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2D3B4D",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#94A3B8",
    fontFamily: typography.primarySemibold,
  },
});

/* ─── Form styles ─────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 100,
    flexGrow: 1,
  },
  contentKeyboard: {
    paddingBottom: 140,
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
  amountCardKeyboard: {
    paddingVertical: 8,
    paddingHorizontal: 14,
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
  amountInputKeyboard: {
    fontSize: 40,
    lineHeight: 44,
  },
  amountSub: {
    color: colors.textSecondary,
    fontSize: 13,
    fontFamily: typography.primary,
    marginTop: 2,
  },
  amountSubKeyboard: {
    marginTop: 0,
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
});
