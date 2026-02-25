/**
 * ShieldScreen — Full-screen shield flow.
 * Deposit tokens from public balance into shielded balance.
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
import { ArrowLeft, ShieldPlus } from "lucide-react-native";
import { parseInsufficientGasError } from "@cloak-wallet/sdk";
import { useWallet } from "../lib/WalletContext";
import { useTransactionRouter } from "../hooks/useTransactionRouter";
import { TOKENS, type TokenKey, erc20ToDisplay, tongoUnitToErc20Display, unitLabel } from "../lib/tokens";
import { triggerMedium } from "../lib/haptics";
import { WalletSuccessCard, type SuccessInfo } from "../components/WalletSuccessCard";
import { colors, borderRadius, typography } from "../lib/theme";
import { useThemedModal } from "../components/ThemedModal";
import { FeeRetryModal } from "../components/FeeRetryModal";
import { KeyboardSafeScreen } from "../components/KeyboardSafeContainer";
import { testIDs, testProps } from "../testing/testIDs";

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

export default function ShieldScreen({ navigation }: any) {
  const wallet = useWallet();
  const { execute } = useTransactionRouter();
  const modal = useThemedModal();

  const token = wallet.selectedToken as TokenKey;
  const tokenConfig = TOKENS[token];

  const onChainBalanceLabel = useMemo(() => {
    return `${erc20ToDisplay(wallet.erc20Balance, token)} ${token}`;
  }, [wallet.erc20Balance, token]);

  const [shieldAmountToken, setShieldAmountToken] = useState("");
  const [shieldError, setShieldError] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [showFeeRetry, setShowFeeRetry] = useState(false);
  const [gasErrorMsg, setGasErrorMsg] = useState("");
  const [feeRetryCount, setFeeRetryCount] = useState(0);
  const [successInfo, setSuccessInfo] = useState<SuccessInfo | null>(null);
  const [copiedTx, setCopiedTx] = useState(false);

  const shieldBtnLabel = shieldAmountToken.trim()
    ? `Shield ${shieldAmountToken.trim()} ${token}`
    : `Shield ${token}`;

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

    const rate = tokenConfig.rate;
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
        setShowFeeRetry(true);
      } else {
        modal.showError("Error", e.message || "Shield failed", e.message);
      }
    } finally {
      setIsPending(false);
    }
  };

  const handleFeeRetry = () => {
    setFeeRetryCount((prev) => prev + 1);
    setShowFeeRetry(false);
    submitShield();
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
        <Text style={styles.headerTitle}>Shield Tokens</Text>
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
                keyboardType="default"
                value={shieldAmountToken}
                onChangeText={(t) => {
                  if (/^\d*(?:\.\d*)?$/.test(t)) {
                    setShieldAmountToken(t);
                    setShieldError("");
                  }
                }}
              />
              <Text style={styles.inputUnit}>{token}</Text>
            </View>

            <View style={styles.availabilityRow}>
              <Text style={styles.availLabel}>On-chain balance:</Text>
              <Text style={[styles.availValue, styles.availValueShield]}>
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
              {isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <ShieldPlus size={18} color="#fff" />
                  <Text style={styles.ctaText}>{shieldBtnLabel}</Text>
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
    borderColor: "rgba(16, 185, 129, 0.25)",
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
    backgroundColor: "rgba(16, 185, 129, 0.125)",
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
  cta: {
    height: 44,
    borderRadius: borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  ctaShield: { backgroundColor: colors.success },
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
