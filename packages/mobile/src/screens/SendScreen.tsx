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
import { SafeAreaView } from "react-native-safe-area-context";
import ClipboardLib from "@react-native-clipboard/clipboard";
import {
  ArrowLeft,
  Car,
  Check,
  Coffee,
  Gamepad2,
  Gift,
  House,
  Music2,
  Search,
  ScanLine,
  Send as SendIcon,
  UtensilsCrossed,
  WalletCards,
  X,
  RefreshCw,
  AlertCircle,
} from "lucide-react-native";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCodeScanner,
} from "react-native-vision-camera";
import { parseInsufficientGasError, TOKENS, parseTokenAmount } from "@cloak-wallet/sdk";
import { useWallet } from "../lib/WalletContext";
import { useTransactionRouter } from "../hooks/useTransactionRouter";
import { tongoUnitToErc20Display, erc20ToDisplay, unitLabel, type TokenKey } from "../lib/tokens";
import { useContacts } from "../hooks/useContacts";
import { saveTxNote } from "../lib/storage";
import { triggerMedium, triggerSuccess } from "../lib/haptics";
import { Confetti } from "../components/Confetti";
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
  sendMode = "private",
}: {
  visible: boolean;
  recipient: string;
  amount: string;
  note: string;
  token: TokenKey;
  sendMode?: "private" | "public";
}) {
  const progressAnim = useRef(new Animated.Value(0.15)).current;

  useEffect(() => {
    if (visible) {
      progressAnim.setValue(0.15);
      Animated.timing(progressAnim, {
        toValue: 0.85,
        duration: sendMode === "public" ? 15000 : 25000,
        useNativeDriver: false,
      }).start();
    }
  }, [visible, progressAnim, sendMode]);

  const isPublic = sendMode === "public";
  const displayAmount = isPublic
    ? `${amount || "0"} ${token}`
    : amount
      ? `${unitLabel(amount)} (${tongoUnitToErc20Display(amount, token)})`
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
            {isPublic
              ? "Your public transfer is being\nprocessed on Starknet"
              : "Your shielded transfer is being\nprocessed on Starknet"}
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
          <Text style={modalStyles.stepText}>
            {isPublic ? "Submitting transaction..." : "Generating ZK proof..."}
          </Text>
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
  sendMode = "private",
}: {
  visible: boolean;
  recipient: string;
  amount: string;
  token: TokenKey;
  txHash: string;
  fee?: string;
  onDone: () => void;
  sendMode?: "private" | "public";
}) {
  const hasFiredHaptic = useRef(false);
  useEffect(() => {
    if (visible && !hasFiredHaptic.current) {
      hasFiredHaptic.current = true;
      triggerSuccess();
    }
    if (!visible) {
      hasFiredHaptic.current = false;
    }
  }, [visible]);

  const isPublic = sendMode === "public";
  const displayAmount = isPublic
    ? `${amount || "0"} ${token}`
    : amount
      ? `${unitLabel(amount)} (${tongoUnitToErc20Display(amount, token)})`
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
        <View style={[modalStyles.card, { gap: 20, position: "relative", overflow: "hidden" }]}>
          {visible && <Confetti />}
          {/* Check circle */}
          <View style={modalStyles.successCircle}>
            <Check size={36} color="#10B981" />
          </View>
          <Text style={modalStyles.successTitle}>Transfer Complete!</Text>
          <Text style={modalStyles.description}>
            {isPublic
              ? "Your public transfer has been\nsuccessfully processed"
              : "Your shielded transfer has been\nsuccessfully processed"}
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

/* ─── QR Scanner Modal ────────────────────────────────────────────────── */

function QRScannerModal({
  visible,
  onScan,
  onClose,
  sendMode = "private",
}: {
  visible: boolean;
  onScan: (data: string) => void;
  onClose: () => void;
  sendMode?: "private" | "public";
}) {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");
  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const hasScannedRef = useRef(false);
  const [scanError, setScanError] = useState(false);

  useEffect(() => {
    if (visible) {
      hasScannedRef.current = false;
      setScanError(false);
    }
  }, [visible]);

  useEffect(() => {
    if (visible && !hasPermission) {
      requestPermission();
    }
  }, [visible, hasPermission, requestPermission]);

  useEffect(() => {
    if (!visible) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineAnim, {
          toValue: 1,
          duration: 2500,
          useNativeDriver: true,
        }),
        Animated.timing(scanLineAnim, {
          toValue: 0,
          duration: 2500,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [visible, scanLineAnim]);

  const scanLineTranslateY = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [16, 228],
  });

  const codeScanner = useCodeScanner({
    codeTypes: ["qr"],
    onCodeScanned: (codes) => {
      if (hasScannedRef.current) return;
      const value = codes[0]?.value;
      if (value) {
        hasScannedRef.current = true;
        const trimmed = value.trim();
        const isHex = trimmed.startsWith("0x") && trimmed.length >= 10;
        const isStarkName = trimmed.includes(".stark");
        const isBase58 = /^[A-HJ-NP-Za-km-z1-9]{20,}$/.test(trimmed);
        // Private mode: only accept Tongo base58 addresses
        // Public mode: only accept 0x hex addresses or .stark names
        const isValid = sendMode === "private" ? isBase58 : (isHex || isStarkName);
        if (!isValid) {
          setScanError(true);
          setTimeout(() => {
            setScanError(false);
            hasScannedRef.current = false;
          }, 3000);
          return;
        }
        onScan(trimmed);
      }
    },
  });

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={scannerStyles.overlay}>
        {/* Close button */}
        <TouchableOpacity
          style={scannerStyles.closeBtn}
          onPress={onClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <X size={20} color="#FFFFFF" />
        </TouchableOpacity>

        {/* Title */}
        <View style={scannerStyles.titleGroup}>
          <Text style={scannerStyles.title}>Scan QR Code</Text>
          <Text style={scannerStyles.subtitle}>
            {"Scan a Cloak or Starknet address\nQR code to send shielded tokens"}
          </Text>
        </View>

        {/* Viewfinder */}
        <View style={scannerStyles.viewfinder}>
          {hasPermission && device ? (
            <Camera
              style={StyleSheet.absoluteFill}
              device={device}
              isActive={visible && !hasScannedRef.current}
              codeScanner={codeScanner}
            />
          ) : (
            <View style={scannerStyles.cameraPlaceholder}>
              <ActivityIndicator color={colors.primary} size="small" />
              <Text style={scannerStyles.cameraPlaceholderText}>
                {hasPermission === false ? "Camera permission denied" : "Initializing camera..."}
              </Text>
            </View>
          )}

          {/* Corner brackets */}
          <View style={[scannerStyles.corner, scannerStyles.cornerTL]} pointerEvents="none">
            <View style={[scannerStyles.cornerH, scanError && { backgroundColor: colors.error }]} />
            <View style={[scannerStyles.cornerV, scanError && { backgroundColor: colors.error }]} />
          </View>
          <View style={[scannerStyles.corner, scannerStyles.cornerTR]} pointerEvents="none">
            <View style={[scannerStyles.cornerH, { alignSelf: "flex-end" }, scanError && { backgroundColor: colors.error }]} />
            <View style={[scannerStyles.cornerV, { alignSelf: "flex-end" }, scanError && { backgroundColor: colors.error }]} />
          </View>
          <View style={[scannerStyles.corner, scannerStyles.cornerBL]} pointerEvents="none">
            <View style={[scannerStyles.cornerV, scanError && { backgroundColor: colors.error }]} />
            <View style={[scannerStyles.cornerH, scanError && { backgroundColor: colors.error }]} />
          </View>
          <View style={[scannerStyles.corner, scannerStyles.cornerBR]} pointerEvents="none">
            <View style={[scannerStyles.cornerV, { alignSelf: "flex-end" }, scanError && { backgroundColor: colors.error }]} />
            <View style={[scannerStyles.cornerH, { alignSelf: "flex-end" }, scanError && { backgroundColor: colors.error }]} />
          </View>

          {/* Animated scan line */}
          <Animated.View
            style={[
              scannerStyles.scanLine,
              scanError && { backgroundColor: colors.error },
              { transform: [{ translateY: scanLineTranslateY }] },
            ]}
            pointerEvents="none"
          />
        </View>

        {/* Error toast */}
        {scanError && (
          <View style={scannerStyles.errorToast}>
            <AlertCircle size={18} color="#FFFFFF" />
            <View style={scannerStyles.errorToastTextGroup}>
              <Text style={scannerStyles.errorToastTitle}>Invalid Address</Text>
              <Text style={scannerStyles.errorToastDesc}>
                {sendMode === "private"
                  ? "QR code does not contain a valid Cloak (Tongo) address"
                  : "QR code does not contain a valid Starknet address"}
              </Text>
            </View>
          </View>
        )}

        {/* Bottom hint */}
        <View style={scannerStyles.bottomGroup}>
          <Text style={scannerStyles.hintText}>
            {"Position the QR code within the frame.\nIt will be scanned automatically."}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const SCANNER_CORNER_SIZE = 40;
const SCANNER_CORNER_THICKNESS = 3;

const scannerStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(10, 15, 28, 0.95)",
  },
  closeBtn: {
    position: "absolute",
    top: 60,
    left: 24,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  titleGroup: {
    alignItems: "center",
    paddingHorizontal: 40,
    marginTop: 120,
    gap: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#FFFFFF",
    fontFamily: typography.primarySemibold,
  },
  subtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.5)",
    fontFamily: typography.secondary,
    textAlign: "center",
    lineHeight: 21,
  },
  viewfinder: {
    width: 260,
    height: 260,
    alignSelf: "center",
    marginTop: 40,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
    position: "relative",
  },
  cameraPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  cameraPlaceholderText: {
    fontSize: 13,
    color: "rgba(255,255,255,0.4)",
    fontFamily: typography.secondary,
  },
  corner: {
    position: "absolute",
    width: SCANNER_CORNER_SIZE,
    height: SCANNER_CORNER_SIZE,
  },
  cornerTL: { top: 16, left: 16 },
  cornerTR: { top: 16, right: 16 },
  cornerBL: { bottom: 16, left: 16 },
  cornerBR: { bottom: 16, right: 16 },
  cornerH: {
    width: SCANNER_CORNER_SIZE,
    height: SCANNER_CORNER_THICKNESS,
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  cornerV: {
    width: SCANNER_CORNER_THICKNESS,
    height: SCANNER_CORNER_SIZE,
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  scanLine: {
    position: "absolute",
    left: 20,
    right: 20,
    top: 0,
    height: 2,
    backgroundColor: colors.primary,
    opacity: 0.6,
    borderRadius: 1,
  },
  bottomGroup: {
    alignItems: "center",
    paddingHorizontal: 40,
    marginTop: 60,
    gap: 20,
  },
  hintText: {
    fontSize: 12,
    color: "rgba(255,255,255,0.31)",
    fontFamily: typography.secondary,
    textAlign: "center",
    lineHeight: 18,
  },
  errorToast: {
    position: "absolute",
    bottom: 80,
    left: 24,
    right: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(239, 68, 68, 0.9)",
    borderRadius: 12,
    padding: 14,
  },
  errorToastTextGroup: {
    flex: 1,
    gap: 2,
  },
  errorToastTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
    fontFamily: typography.primarySemibold,
  },
  errorToastDesc: {
    fontSize: 12,
    color: "rgba(255,255,255,0.8)",
    fontFamily: typography.secondary,
  },
});

/* ─── Main screen ─────────────────────────────────────────────────────── */

export default function SendScreen({ navigation, route }: any) {
  const wallet = useWallet();
  const { contacts } = useContacts();
  const { execute } = useTransactionRouter();
  const keyboardVisible = useKeyboardVisible();
  const scrollRef = React.useRef<ScrollView>(null);

  const [sendMode, setSendMode] = useState<"private" | "public">("private");
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
  const [scannerVisible, setScannerVisible] = useState(false);

  // Auto-open scanner when navigated with openScanner param
  useEffect(() => {
    if (route?.params?.openScanner) {
      setScannerVisible(true);
      // Clear the param so it doesn't re-trigger on re-render
      navigation.setParams({ openScanner: undefined });
    }
  }, [route?.params?.openScanner, navigation]);

  useEffect(() => {
    wallet.refreshTxHistory();
  }, [wallet]);

  const isPublic = sendMode === "public";
  const sendKeyboardMode = isNoteFocused && keyboardVisible;
  const conversionHint = `1 unit = ${tongoUnitToErc20Display("1", wallet.selectedToken)}`;

  const visibleContacts =
    !isPublic && contacts.length > 0
      ? contacts.slice(0, 2).map((c) => ({
          id: c.id,
          label: c.nickname || `${c.tongoAddress.slice(0, 6)}...`,
          address: c.tongoAddress,
        }))
      : [];

  const validateAmount = (): boolean => {
    if (isPublic) {
      const num = parseFloat(amount);
      if (!amount || Number.isNaN(num) || num <= 0) {
        setAmountError("Enter a valid amount greater than 0");
        return false;
      }
      try {
        const cfg = TOKENS[wallet.selectedToken];
        const amountWei = parseTokenAmount(amount, cfg.decimals);
        const balanceWei = BigInt(wallet.erc20Balance || "0");
        if (amountWei > balanceWei) {
          const displayBal = erc20ToDisplay(wallet.erc20Balance, wallet.selectedToken);
          setAmountError(`Insufficient balance (max: ${displayBal} ${wallet.selectedToken})`);
          return false;
        }
      } catch {
        setAmountError("Invalid amount format");
        return false;
      }
      setAmountError("");
      return true;
    }
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

    if (isPublic) {
      // Validate hex address
      const addr = recipient.trim();
      if (!addr.startsWith("0x") || !/^0x[0-9a-fA-F]{1,64}$/.test(addr)) {
        setAddressError("Enter a valid Starknet address (0x...)");
        return;
      }
    }

    if (!validateAmount()) return;

    triggerMedium();
    setIsPending(true);
    setSendingModalVisible(true);

    try {
      if (!isPublic) {
        const valid = await wallet.validateAddress(recipient.trim());
        if (!valid) {
          setAddressError("Invalid Cloak address. Please check and try again.");
          setSendingModalVisible(false);
          setIsPending(false);
          return;
        }
      }

      // Find matching contact for recipientName (if user selected from contacts)
      const matchedContact = !isPublic
        ? contacts.find((c) => c.tongoAddress === recipient.trim())
        : undefined;
      const result = await execute({
        action: isPublic ? "erc20_transfer" : "transfer",
        token: wallet.selectedToken,
        amount,
        recipient: recipient.trim(),
        recipientName: matchedContact?.nickname || undefined,
        note: note || undefined,
      });

      setTxHash(result.txHash);
      await saveTxNote(result.txHash, {
        txHash: result.txHash,
        recipient: recipient.trim(),
        note: note || undefined,
        privacyLevel: isPublic ? "public" : "private",
        timestamp: Date.now(),
        type: isPublic ? "erc20_transfer" as any : "send",
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
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      {/* Header */}
      <View style={styles.screenHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.screenHeaderTitle}>Send</Text>
        <View style={styles.backBtn} />
      </View>
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

      {/* QR Scanner */}
      <QRScannerModal
        visible={scannerVisible}
        sendMode={sendMode}
        onScan={(data) => {
          setScannerVisible(false);
          setRecipient(data);
          setAddressError("");
        }}
        onClose={() => setScannerVisible(false)}
      />

      {/* Modal overlays */}
      <SendingModal
        visible={sendingModalVisible}
        recipient={recipient}
        amount={amount}
        note={note}
        token={wallet.selectedToken}
        sendMode={sendMode}
      />
      <SuccessModal
        visible={successModalVisible}
        recipient={recipient}
        amount={amount}
        token={wallet.selectedToken}
        txHash={txHash}
        sendMode={sendMode}
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

      {/* Private / Public toggle */}
      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggleTab, sendMode === "private" && styles.toggleTabActive]}
          onPress={() => {
            setSendMode("private");
            setRecipient("");
            setAmount("");
            setAddressError("");
            setAmountError("");
          }}
        >
          <Text style={[styles.toggleTabText, sendMode === "private" && styles.toggleTabTextActive]}>
            Private
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleTab, sendMode === "public" && styles.toggleTabActive]}
          onPress={() => {
            setSendMode("public");
            setRecipient("");
            setAmount("");
            setAddressError("");
            setAmountError("");
          }}
        >
          <Text style={[styles.toggleTabText, sendMode === "public" && styles.toggleTabTextActive]}>
            Public
          </Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.section, sendKeyboardMode && styles.sectionCompact]}>
        <Text style={styles.sectionLabel}>TO</Text>
        <View style={styles.inputRow}>
          <Search size={16} color={colors.textMuted} />
          <TextInput
            {...testProps(testIDs.send.recipientInput)}
            style={styles.recipientInput}
            placeholder={isPublic ? "0x... Starknet address" : "alice.stark or 0x..."}
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
            onPress={() => setScannerVisible(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ScanLine size={20} color={colors.primaryLight} />
          </TouchableOpacity>
        </View>
        {!sendKeyboardMode && visibleContacts.length > 0 ? (
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
            keyboardType={isPublic ? "decimal-pad" : "numeric"}
            value={amount}
            onChangeText={(t) => {
              if (isPublic) {
                // Allow decimal input for public mode
                if (/^\d*\.?\d*$/.test(t)) {
                  setAmount(t);
                  setAmountError("");
                }
              } else {
                if (/^\d*$/.test(t)) {
                  setAmount(t);
                  setAmountError("");
                }
              }
            }}
          />
          {isPublic ? (
            <Text style={[styles.amountSub, sendKeyboardMode && styles.amountSubKeyboard]}>
              {wallet.selectedToken}
            </Text>
          ) : (
            <Text style={[styles.amountSub, sendKeyboardMode && styles.amountSubKeyboard]}>
              units ({amount ? tongoUnitToErc20Display(amount, wallet.selectedToken) : "0.00 STRK"})
            </Text>
          )}
          {!sendKeyboardMode ? (
            <Text style={styles.availableText}>
              {isPublic
                ? `Available: ${erc20ToDisplay(wallet.erc20Balance, wallet.selectedToken)} ${wallet.selectedToken}`
                : `Available: ${wallet.balance} units MAX`}
            </Text>
          ) : null}
        </View>
        {amountError ? <Text style={styles.errorText}>{amountError}</Text> : null}
        {!sendKeyboardMode && !isPublic ? (
          <Text style={styles.conversionHint}>{conversionHint}</Text>
        ) : null}
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
              {isPublic
                ? `Send ${amount && parseFloat(amount) > 0 ? amount : "0"} ${wallet.selectedToken}`
                : `Send ${amount && parseInt(amount, 10) > 0 ? amount : "0"} Units`}
            </Text>
          </>
        )}
      </TouchableOpacity>
    </KeyboardSafeScreen>
    </SafeAreaView>
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
  safeArea: { flex: 1, backgroundColor: colors.bg },
  screenHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  screenHeaderTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.text,
    fontFamily: typography.primarySemibold,
  },
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
  toggleRow: {
    flexDirection: "row",
    backgroundColor: "rgba(30, 41, 59, 0.55)",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(45, 59, 77, 0.75)",
    padding: 3,
    marginBottom: 16,
  },
  toggleTab: {
    flex: 1,
    height: 32,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleTabActive: {
    backgroundColor: "rgba(59, 130, 246, 0.22)",
  },
  toggleTabText: {
    fontSize: 13,
    color: colors.textMuted,
    fontFamily: typography.primarySemibold,
  },
  toggleTabTextActive: {
    color: colors.primaryLight,
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
