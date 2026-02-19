/**
 * WalletScreen — Shield and unshield funds (O3kob parity).
 *
 * Note: Shield input is in token units (e.g. STRK). It is converted to Tongo units before execution.
 * Unshield input is in Tongo units ("units").
 */
import React, { useMemo, useState, useEffect, useRef } from "react";
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
import { Check, Shield, ShieldOff, ShieldPlus } from "lucide-react-native";
import { parseInsufficientGasError } from "@cloak-wallet/sdk";
import { useWallet } from "../lib/WalletContext";
import { useTransactionRouter } from "../hooks/useTransactionRouter";
import { TOKENS, type TokenKey, erc20ToDisplay, tongoUnitToErc20Display } from "../lib/tokens";
import { triggerMedium, triggerSuccess } from "../lib/haptics";
import { Confetti } from "../components/Confetti";
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

function WalletSuccessCard({
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
      {/* Check circle — 80x80 matching SendScreen */}
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

      {/* Detail card */}
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

      {/* Done button */}
      <TouchableOpacity
        {...testProps(testIDs.wallet.successDone)}
        style={styles.successDoneBtn}
        onPress={onDone}
        activeOpacity={0.8}
      >
        <Check size={18} color="#fff" />
        <Text style={styles.successDoneBtnText}>Done</Text>
      </TouchableOpacity>

      {/* Explorer link */}
      <TouchableOpacity
        {...testProps(testIDs.wallet.successViewVoyager)}
        onPress={() => Linking.openURL(`https://sepolia.voyager.online/tx/${successInfo.txHash}`)}
      >
        <Text style={styles.successExplorerLink}>View on Voyager</Text>
      </TouchableOpacity>
    </View>
  );
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

  const isShieldKeyboard = activeKeyboardCard === "shield";
  const isUnshieldKeyboard = activeKeyboardCard === "unshield";

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
        <WalletSuccessCard
          successInfo={successInfo}
          token={token}
          copiedTx={copiedTx}
          onCopyTx={handleCopyTx}
          onDone={() => setSuccessInfo(null)}
        />
      ) : (
        <View style={styles.cards}>
          {showShieldCard ? (
            <View style={[styles.card, styles.shieldCard]}>
              {isShieldKeyboard ? (
                <View style={styles.cardHeaderKeyboard}>
                  <View style={styles.headerRowKeyboard}>
                    <Shield size={20} color={colors.success} />
                    <Text style={[styles.cardTitle, styles.cardTitleKeyboard]}>Shield Tokens</Text>
                  </View>
                  <Text style={styles.cardDesc}>Move tokens into your shielded balance</Text>
                </View>
              ) : (
                <View style={styles.cardHeader}>
                  <View style={[styles.iconBox, styles.iconBoxShield]}>
                    <ShieldPlus size={22} color={colors.success} />
                  </View>
                  <View style={styles.headerText}>
                    <Text style={styles.cardTitle}>Shield Tokens</Text>
                    <Text style={styles.cardDesc}>Move tokens into your shielded balance</Text>
                  </View>
                </View>
              )}

              <View
                style={[
                  styles.inputRow,
                  isShieldKeyboard && styles.inputRowActiveShield,
                ]}
              >
                <TextInput
                  {...testProps(testIDs.wallet.amountInput)}
                  style={[
                    styles.inputAmount,
                    isShieldKeyboard && styles.inputAmountKeyboard,
                  ]}
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="default"
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
                <Text style={[styles.inputUnit, isShieldKeyboard && styles.inputUnitKeyboard]}>
                  {token}
                </Text>
              </View>

              <View style={styles.availabilityRow}>
                <Text style={[styles.availLabel, isShieldKeyboard && styles.availLabelKeyboard]}>
                  On-chain balance:
                </Text>
                <Text
                  style={[
                    styles.availValue,
                    isShieldKeyboard ? styles.availValueKeyboard : styles.availValueShield,
                  ]}
                >
                  {onChainBalanceLabel}
                </Text>
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
                    <ShieldPlus size={isShieldKeyboard ? 16 : 18} color="#fff" />
                    <Text style={[styles.ctaText, isShieldKeyboard && styles.ctaTextKeyboard]}>
                      {shieldBtnLabel}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : null}

          {showUnshieldCard ? (
            <View style={[styles.card, styles.unshieldCard]}>
              {isUnshieldKeyboard ? (
                <View style={styles.cardHeaderKeyboard}>
                  <View style={styles.headerRowKeyboard}>
                    <ShieldOff size={20} color={colors.secondary} />
                    <Text style={[styles.cardTitle, styles.cardTitleKeyboard]}>Unshield Tokens</Text>
                  </View>
                  <Text style={styles.cardDesc}>Move tokens back to your public balance</Text>
                </View>
              ) : (
                <View style={styles.cardHeader}>
                  <View style={[styles.iconBox, styles.iconBoxUnshield]}>
                    <ShieldOff size={22} color={colors.secondary} />
                  </View>
                  <View style={styles.headerText}>
                    <Text style={styles.cardTitle}>Unshield Tokens</Text>
                    <Text style={styles.cardDesc}>Move tokens back to your public balance</Text>
                  </View>
                </View>
              )}

              <View
                style={[
                  styles.inputRow,
                  isUnshieldKeyboard && styles.inputRowActiveUnshield,
                ]}
              >
                <TextInput
                  {...testProps(testIDs.wallet.unshieldAmountInput)}
                  style={[
                    styles.inputAmount,
                    isUnshieldKeyboard && styles.inputAmountKeyboard,
                  ]}
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
                  onFocus={() => {
                    setUnshieldFocused(true);
                    setShieldFocused(false);
                  }}
                  onBlur={() => setUnshieldFocused(false)}
                />
                <Text style={[styles.inputUnit, isUnshieldKeyboard && styles.inputUnitKeyboard]}>
                  units
                </Text>
              </View>

              <View style={styles.availabilityRow}>
                <Text style={[styles.availLabel, isUnshieldKeyboard && styles.availLabelKeyboard]}>
                  Shielded balance:
                </Text>
                <Text
                  style={[
                    styles.availValue,
                    isUnshieldKeyboard ? styles.availValueKeyboard : styles.availValueUnshield,
                  ]}
                >
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
                    <ShieldOff size={isUnshieldKeyboard ? 16 : 18} color="#fff" />
                    <Text style={[styles.ctaText, isUnshieldKeyboard && styles.ctaTextKeyboard]}>
                      {unshieldBtnLabel}
                    </Text>
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
  cardHeaderKeyboard: {
    gap: 6,
  },
  headerRowKeyboard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
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
  cardTitleKeyboard: {
    fontSize: 15,
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
  inputRowActiveShield: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  inputRowActiveUnshield: {
    borderColor: colors.secondary,
    borderWidth: 2,
  },
  inputAmount: {
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
    fontFamily: typography.primarySemibold,
    paddingVertical: 0,
  },
  inputAmountKeyboard: {
    fontSize: 16,
  },
  inputUnit: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.textMuted,
    fontFamily: typography.primary,
  },
  inputUnitKeyboard: {
    fontSize: 12,
    fontWeight: "600",
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
  availLabelKeyboard: {
    fontSize: 11,
  },
  availValue: {
    fontSize: 12,
    fontWeight: "600",
    fontFamily: typography.primarySemibold,
  },
  availValueShield: { color: colors.success },
  availValueUnshield: { color: colors.secondary },
  availValueKeyboard: {
    fontSize: 11,
    color: colors.primaryLight,
  },
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
  ctaTextKeyboard: {
    fontSize: 13,
  },
  ctaDisabled: { opacity: 0.7 },
  errorText: {
    marginTop: -8,
    fontSize: 12,
    color: colors.error,
    fontFamily: typography.secondary,
  },

  // Success UI (matches SendScreen success modal design)
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
