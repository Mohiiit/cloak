/**
 * UnshieldScreen — Full-screen unshield flow.
 * Withdraw tokens from shielded balance to public wallet.
 */
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Clipboard from "@react-native-clipboard/clipboard";
import { ArrowLeft, ShieldOff } from "lucide-react-native";
import { parseInsufficientGasError } from "@cloak-wallet/sdk";
import { useWallet } from "../lib/WalletContext";
import { useTransactionRouter } from "../hooks/useTransactionRouter";
import { TOKENS, type TokenKey, unitLabel } from "../lib/tokens";
import { triggerMedium } from "../lib/haptics";
import { WalletSuccessCard, formatIntWithCommas, type SuccessInfo } from "../components/WalletSuccessCard";
import { colors, borderRadius, typography } from "../lib/theme";
import { useThemedModal } from "../components/ThemedModal";
import { FeeRetryModal } from "../components/FeeRetryModal";
import { KeyboardSafeScreen } from "../components/KeyboardSafeContainer";
import { testIDs, testProps } from "../testing/testIDs";

export default function UnshieldScreen({ navigation }: any) {
  const wallet = useWallet();
  const { execute } = useTransactionRouter();
  const modal = useThemedModal();

  const token = wallet.selectedToken as TokenKey;

  const shieldedBalanceUnitsLabel = useMemo(() => {
    return unitLabel(formatIntWithCommas(wallet.balance));
  }, [wallet.balance]);

  const [unshieldAmountUnits, setUnshieldAmountUnits] = useState("");
  const [unshieldError, setUnshieldError] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [showFeeRetry, setShowFeeRetry] = useState(false);
  const [gasErrorMsg, setGasErrorMsg] = useState("");
  const [feeRetryCount, setFeeRetryCount] = useState(0);
  const [successInfo, setSuccessInfo] = useState<SuccessInfo | null>(null);
  const [copiedTx, setCopiedTx] = useState(false);

  const unshieldBtnLabel = unshieldAmountUnits.trim()
    ? `Unshield ${unshieldAmountUnits.trim()} Units`
    : "Unshield Units";

  const handleCopyTx = (hash: string) => {
    Clipboard.setString(hash);
    setCopiedTx(true);
    setTimeout(() => setCopiedTx(false), 2000);
  };

  const validateUnshield = (): { units: string } | null => {
    setUnshieldError("");
    const trimmed = unshieldAmountUnits.trim();
    if (!trimmed || !/^\d+$/.test(trimmed)) {
      setUnshieldError("Enter a valid unit amount");
      return null;
    }
    const units = BigInt(trimmed);
    if (units <= 0n) {
      setUnshieldError("Amount must be greater than 0");
      return null;
    }
    return { units: units.toString() };
  };

  const submitUnshield = async () => {
    const parsed = validateUnshield();
    if (!parsed || isPending) return;
    triggerMedium();
    setIsPending(true);
    try {
      const result = await execute({ action: "withdraw", token, amount: parsed.units });
      setSuccessInfo({ txHash: result.txHash, amountUnits: parsed.units, type: "unshield" });
      setUnshieldAmountUnits("");
      wallet.refreshBalance();
    } catch (e: any) {
      const gasInfo = parseInsufficientGasError(e.message || "");
      if (gasInfo && feeRetryCount < 3) {
        setGasErrorMsg(e.message);
        setShowFeeRetry(true);
      } else {
        modal.showError("Error", e.message || "Unshield failed", e.message);
      }
    } finally {
      setIsPending(false);
    }
  };

  const handleFeeRetry = () => {
    setFeeRetryCount((prev) => prev + 1);
    setShowFeeRetry(false);
    submitUnshield();
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
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

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Unshield Tokens</Text>
        <View style={styles.backBtn} />
      </View>

      <KeyboardSafeScreen
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {successInfo ? (
          <WalletSuccessCard
            successInfo={successInfo}
            token={token}
            copiedTx={copiedTx}
            onCopyTx={handleCopyTx}
            onDone={() => {
              setSuccessInfo(null);
              navigation.goBack();
            }}
          />
        ) : (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.iconBox}>
                <ShieldOff size={22} color={colors.secondary} />
              </View>
              <View style={styles.headerText}>
                <Text style={styles.cardTitle}>Unshield Tokens</Text>
                <Text style={styles.cardDesc}>Move tokens back to your public balance</Text>
              </View>
            </View>

            <View style={styles.inputRow}>
              <TextInput
                {...testProps(testIDs.wallet.unshieldAmountInput)}
                style={styles.inputAmount}
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                keyboardType="default"
                value={unshieldAmountUnits}
                onChangeText={(t) => {
                  if (/^\d*$/.test(t)) {
                    setUnshieldAmountUnits(t);
                    setUnshieldError("");
                  }
                }}
              />
              <Text style={styles.inputUnit}>units</Text>
            </View>

            <View style={styles.availabilityRow}>
              <Text style={styles.availLabel}>Shielded balance:</Text>
              <Text style={[styles.availValue, styles.availValueUnshield]}>
                {shieldedBalanceUnitsLabel}
              </Text>
            </View>
            {unshieldError ? <Text style={styles.errorText}>{unshieldError}</Text> : null}

            <TouchableOpacity
              {...testProps(testIDs.wallet.modeUnshield)}
              style={[styles.cta, styles.ctaUnshield, isPending && styles.ctaDisabled]}
              onPress={() => {
                setFeeRetryCount(0);
                submitUnshield();
              }}
              disabled={isPending}
            >
              {isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <ShieldOff size={18} color="#fff" />
                  <Text style={styles.ctaText}>{unshieldBtnLabel}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardSafeScreen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, backgroundColor: colors.bg },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 100,
    gap: 20,
  },
  header: {
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
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.text,
    fontFamily: typography.primarySemibold,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: 20,
    gap: 16,
    borderWidth: 1,
    borderColor: "rgba(139, 92, 246, 0.25)",
  },
  cardHeader: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(139, 92, 246, 0.125)",
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
    fontFamily: typography.primarySemibold,
  },
  cardDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: typography.secondary,
  },
  inputRow: {
    height: 48,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  inputAmount: {
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
    fontFamily: typography.primarySemibold,
    paddingVertical: 0,
  },
  inputUnit: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.textMuted,
    fontFamily: typography.primary,
  },
  availabilityRow: {
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
  },
  availLabel: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: typography.secondary,
  },
  availValue: {
    fontSize: 12,
    fontWeight: "600",
    fontFamily: typography.primarySemibold,
  },
  availValueUnshield: { color: colors.secondary },
  cta: {
    height: 44,
    borderRadius: borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  ctaUnshield: { backgroundColor: colors.secondary },
  ctaText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    fontFamily: typography.primarySemibold,
  },
  ctaDisabled: { opacity: 0.7 },
  errorText: {
    marginTop: -8,
    fontSize: 12,
    color: colors.error,
    fontFamily: typography.secondary,
  },
});
