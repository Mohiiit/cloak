/**
 * WalletScreen — Shield and unshield funds (O3kob parity).
 *
 * Note: Shield input is in token units (e.g. STRK). It is converted to Tongo units before execution.
 * Unshield input is in Tongo units ("units").
 */
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Linking,
} from "react-native";
import Clipboard from "@react-native-clipboard/clipboard";
import { Check, ShieldOff, ShieldPlus } from "lucide-react-native";
import { parseInsufficientGasError } from "@cloak-wallet/sdk";
import { useWallet } from "../lib/WalletContext";
import { useTransactionRouter } from "../hooks/useTransactionRouter";
import { TOKENS, type TokenKey, erc20ToDisplay, tongoUnitToErc20Display } from "../lib/tokens";
import { triggerMedium } from "../lib/haptics";
import { colors, spacing, borderRadius, typography } from "../lib/theme";
import { useThemedModal } from "../components/ThemedModal";
import { FeeRetryModal } from "../components/FeeRetryModal";
import { KeyboardSafeScreen } from "../components/KeyboardSafeContainer";
import { useKeyboardVisible } from "../hooks/useKeyboardVisible";
import { testIDs, testProps } from "../testing/testIDs";

type SuccessInfo = { txHash: string; amountUnits: string; type: "shield" | "unshield" };
type RetryAction = "shield" | "unshield";

function formatIntWithCommas(intStr: string): string {
  const sanitized = (intStr || "0").replace(/\D/g, "");
  if (!sanitized) return "0";
  return sanitized.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function parseDecimalToWei(value: string, decimals: number): bigint | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const [wholeRaw, fracRaw = ""] = trimmed.split(".");
  if (fracRaw.length > decimals) return null;

  const whole = BigInt(wholeRaw || "0");
  const fracPadded = (fracRaw + "0".repeat(decimals)).slice(0, decimals);
  const frac = BigInt(fracPadded || "0");

  return whole * 10n ** BigInt(decimals) + frac;
}

export default function WalletScreen() {
  const wallet = useWallet();
  const { execute } = useTransactionRouter();
  const modal = useThemedModal();
  const keyboardVisible = useKeyboardVisible();

  const token = wallet.selectedToken as TokenKey;
  const tokenConfig = TOKENS[token];

  const onChainBalanceLabel = useMemo(() => {
    return `${erc20ToDisplay(wallet.erc20Balance, token)} ${token}`;
  }, [wallet.erc20Balance, token]);

  const shieldedBalanceUnitsLabel = useMemo(() => {
    return `${formatIntWithCommas(wallet.balance)} units`;
  }, [wallet.balance]);

  const [shieldAmountToken, setShieldAmountToken] = useState("");
  const [unshieldAmountUnits, setUnshieldAmountUnits] = useState("");
  const [shieldError, setShieldError] = useState("");
  const [unshieldError, setUnshieldError] = useState("");
  const [shieldFocused, setShieldFocused] = useState(false);
  const [unshieldFocused, setUnshieldFocused] = useState(false);

  const [isPending, setIsPending] = useState(false);
  const [pendingRetryAction, setPendingRetryAction] = useState<RetryAction>("shield");
  const [showFeeRetry, setShowFeeRetry] = useState(false);
  const [gasErrorMsg, setGasErrorMsg] = useState("");
  const [feeRetryCount, setFeeRetryCount] = useState(0);

  const [successInfo, setSuccessInfo] = useState<SuccessInfo | null>(null);
  const [copiedTx, setCopiedTx] = useState(false);

  const activeKeyboardCard: RetryAction | null =
    keyboardVisible && shieldFocused ? "shield" : keyboardVisible && unshieldFocused ? "unshield" : null;

  const showShieldCard = !activeKeyboardCard || activeKeyboardCard === "shield";
  const showUnshieldCard = !activeKeyboardCard || activeKeyboardCard === "unshield";

  const shieldBtnLabel = shieldAmountToken.trim()
    ? `Shield ${shieldAmountToken.trim()} ${token}`
    : `Shield ${token}`;
  const unshieldBtnLabel = unshieldAmountUnits.trim()
    ? `Unshield ${unshieldAmountUnits.trim()} Units`
    : "Unshield Units";

  const handleCopyTx = (hash: string) => {
    Clipboard.setString(hash);
    setCopiedTx(true);
    setTimeout(() => setCopiedTx(false), 2000);
  };

  const validateShield = (): { units: string } | null => {
    setShieldError("");
    const wei = parseDecimalToWei(shieldAmountToken, tokenConfig.decimals);
    if (wei === null) {
      setShieldError(`Enter a valid ${token} amount`);
      return null;
    }
    if (wei <= 0n) {
      setShieldError(`Amount must be greater than 0`);
      return null;
    }

    const rate = tokenConfig.rate; // wei per Tongo unit
    if (wei % rate !== 0n) {
      const unitStep = tongoUnitToErc20Display("1", token);
      setShieldError(`Amount must be a multiple of ${unitStep}`);
      return null;
    }

    const units = wei / rate;
    if (units <= 0n) {
      setShieldError(`Amount is too small`);
      return null;
    }
    return { units: units.toString() };
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

  const submitShield = async () => {
    const parsed = validateShield();
    if (!parsed || isPending) return;
    triggerMedium();
    setIsPending(true);
    try {
      const result = await execute({ action: "fund", token, amount: parsed.units });
      setSuccessInfo({ txHash: result.txHash, amountUnits: parsed.units, type: "shield" });
      setShieldAmountToken("");
      wallet.refreshBalance();
    } catch (e: any) {
      const gasInfo = parseInsufficientGasError(e.message || "");
      if (gasInfo && feeRetryCount < 3) {
        setGasErrorMsg(e.message);
        setPendingRetryAction("shield");
        setShowFeeRetry(true);
      } else {
        modal.showError("Error", e.message || "Shield failed", e.message);
      }
    } finally {
      setIsPending(false);
    }
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
        setPendingRetryAction("unshield");
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
    if (pendingRetryAction === "unshield") {
      submitUnshield();
    } else {
      submitShield();
    }
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

      {successInfo ? (
        <View style={styles.successCard}>
          <View style={styles.successIconCircle}>
            <Check size={32} color={colors.success} />
          </View>
          <Text style={styles.successTitle}>
            {successInfo.type === "shield" ? "Shielded!" : "Unshielded!"}
          </Text>
          <Text style={styles.successAmount}>{successInfo.amountUnits} units</Text>
          <Text style={styles.successDesc}>
            {successInfo.type === "shield"
              ? "Funds deposited into your shielded balance."
              : "Funds withdrawn to your public wallet."}
          </Text>

          <View style={styles.successTxSection}>
            <Text style={styles.successTxLabel}>Transaction Hash</Text>
            <Text style={styles.successTxHash} numberOfLines={2} selectable>
              {successInfo.txHash}
            </Text>
            <View style={styles.successTxActions}>
              <TouchableOpacity
                {...testProps(testIDs.wallet.successCopyTx)}
                style={styles.successTxBtn}
                onPress={() => handleCopyTx(successInfo.txHash)}
              >
                <Text style={styles.successTxBtnText}>{copiedTx ? "Copied!" : "Copy Tx Hash"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                {...testProps(testIDs.wallet.successViewVoyager)}
                style={styles.successTxBtn}
                onPress={() => Linking.openURL(`https://sepolia.voyager.online/tx/${successInfo.txHash}`)}
              >
                <Text style={styles.successTxBtnText}>View on Voyager</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            {...testProps(testIDs.wallet.successDone)}
            style={styles.successDoneBtn}
            onPress={() => setSuccessInfo(null)}
          >
            <Text style={styles.successDoneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.cards}>
          {showShieldCard ? (
            <View style={[styles.card, styles.shieldCard]}>
              <View style={styles.cardHeader}>
                <View style={[styles.iconBox, styles.iconBoxShield]}>
                  <ShieldPlus size={22} color={colors.success} />
                </View>
                <View style={styles.headerText}>
                  <Text style={styles.cardTitle}>Shield Tokens</Text>
                  <Text style={styles.cardDesc}>Move tokens into your shielded balance</Text>
                </View>
              </View>

              <View style={styles.inputRow}>
                <TextInput
                  {...testProps(testIDs.wallet.amountInput)}
                  style={styles.inputAmount}
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  value={shieldAmountToken}
                  onChangeText={(t) => {
                    if (/^\d*(?:\.\d*)?$/.test(t)) {
                      setShieldAmountToken(t);
                      setShieldError("");
                    }
                  }}
                  onFocus={() => {
                    setShieldFocused(true);
                    setUnshieldFocused(false);
                  }}
                  onBlur={() => setShieldFocused(false)}
                />
                <Text style={styles.inputUnit}>{token}</Text>
              </View>

              <View style={styles.availabilityRow}>
                <Text style={styles.availLabel}>On-chain balance:</Text>
                <Text style={[styles.availValue, styles.availValueShield]}>{onChainBalanceLabel}</Text>
              </View>
              {shieldError ? <Text style={styles.errorText}>{shieldError}</Text> : null}

              <TouchableOpacity
                {...testProps(testIDs.wallet.modeShield)}
                style={[styles.cta, styles.ctaShield, isPending && styles.ctaDisabled]}
                onPress={() => {
                  setFeeRetryCount(0);
                  submitShield();
                }}
                disabled={isPending}
              >
                {isPending && pendingRetryAction === "shield" ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <ShieldPlus size={18} color="#fff" />
                    <Text style={styles.ctaText}>{shieldBtnLabel}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : null}

          {showUnshieldCard ? (
            <View style={[styles.card, styles.unshieldCard]}>
              <View style={styles.cardHeader}>
                <View style={[styles.iconBox, styles.iconBoxUnshield]}>
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
                  keyboardType="numeric"
                  value={unshieldAmountUnits}
                  onChangeText={(t) => {
                    if (/^\d*$/.test(t)) {
                      setUnshieldAmountUnits(t);
                      setUnshieldError("");
                    }
                  }}
                  onFocus={() => {
                    setUnshieldFocused(true);
                    setShieldFocused(false);
                  }}
                  onBlur={() => setUnshieldFocused(false)}
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
                {isPending && pendingRetryAction === "unshield" ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <ShieldOff size={18} color="#fff" />
                    <Text style={styles.ctaText}>{unshieldBtnLabel}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      )}
    </KeyboardSafeScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 100,
    gap: 20,
  },
  cards: {
    gap: 20,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: 20,
    gap: 16,
    borderWidth: 1,
  },
  shieldCard: {
    borderColor: "rgba(16, 185, 129, 0.25)",
  },
  unshieldCard: {
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
  },
  iconBoxShield: {
    backgroundColor: "rgba(16, 185, 129, 0.125)",
  },
  iconBoxUnshield: {
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
  availValueShield: { color: colors.success },
  availValueUnshield: { color: colors.secondary },
  cta: {
    height: 44,
    borderRadius: borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  ctaShield: { backgroundColor: colors.success },
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

  // Success UI (will be replaced by modal parity later; kept for functional feedback)
  successCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
  },
  successIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    borderWidth: 2,
    borderColor: "rgba(16, 185, 129, 0.3)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.success,
    marginBottom: spacing.sm,
    fontFamily: typography.primarySemibold,
  },
  successAmount: {
    fontSize: 32,
    fontWeight: "700",
    color: colors.text,
    fontFamily: typography.primarySemibold,
  },
  successDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    textAlign: "center",
    fontFamily: typography.secondary,
  },
  successTxSection: {
    width: "100%",
    backgroundColor: colors.bg,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.xl,
  },
  successTxLabel: {
    fontSize: 11,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: spacing.xs,
    fontFamily: typography.primarySemibold,
  },
  successTxHash: {
    fontSize: 11,
    color: colors.text,
    fontFamily: typography.primary,
    marginBottom: spacing.sm,
  },
  successTxActions: { flexDirection: "row", gap: spacing.sm },
  successTxBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surface,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  successTxBtnText: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: "600",
    fontFamily: typography.secondarySemibold,
  },
  successDoneBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: borderRadius.md,
    width: "100%",
    alignItems: "center",
  },
  successDoneBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    fontFamily: typography.primarySemibold,
  },
});
