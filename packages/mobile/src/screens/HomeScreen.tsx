/**
 * HomeScreen — Balance overview, portfolio, and quick actions.
 */
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Clipboard from "@react-native-clipboard/clipboard";
import { Eye, EyeOff, Send, ShieldPlus, ShieldOff, ArrowUpFromLine, RefreshCw, Check } from "lucide-react-native";
import { useWallet } from "../lib/WalletContext";
import { tongoToDisplay, erc20ToDisplay } from "../lib/tokens";
import { colors, spacing, fontSize, borderRadius } from "../lib/theme";
import { useThemedModal } from "../components/ThemedModal";
import { CloakIcon } from "../components/CloakIcon";

export default function HomeScreen({ navigation }: any) {
  const wallet = useWallet();
  const modal = useThemedModal();
  const [showImport, setShowImport] = useState(false);
  const [importPK, setImportPK] = useState("");
  const [importAddr, setImportAddr] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [balanceHidden, setBalanceHidden] = useState(false);
  const [claimSuccess, setClaimSuccess] = useState<{ txHash: string; amount: string } | null>(null);

  useEffect(() => {
    AsyncStorage.getItem("cloak_balance_hidden").then((v) => {
      if (v === "true") setBalanceHidden(true);
    });
  }, []);

  // NOTE: refreshTxHistory disabled — on-chain getTxHistory always fails
  // from WebView bridge. Will be replaced with Supabase reads.

  const toggleBalanceVisibility = () => {
    const next = !balanceHidden;
    setBalanceHidden(next);
    AsyncStorage.setItem("cloak_balance_hidden", next ? "true" : "false");
  };

  if (wallet.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading wallet...</Text>
      </View>
    );
  }

  if (!wallet.isWalletCreated) {
    return (
      <KeyboardAvoidingView
        behavior="padding"
        style={{ flex: 1 }}
      >
        <ScrollView style={styles.container} contentContainerStyle={styles.center} keyboardShouldPersistTaps="handled">
          {modal.ModalComponent}
          <CloakIcon size={64} />
          <Text style={styles.heroTitle}>Cloak</Text>
          <Text style={styles.heroSubtitle}>
            Shielded payments on Starknet
          </Text>
          <TouchableOpacity
            style={styles.createButton}
            onPress={async () => {
              try {
                await wallet.createWallet();
              } catch (e: any) {
                modal.showError("Error", e.message || "Failed to create wallet", e.message);
              }
            }}
          >
            <Text style={styles.createButtonText}>Create New Wallet</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.importToggle}
            onPress={() => setShowImport(!showImport)}
          >
            <Text style={styles.importToggleText}>
              {showImport ? "Hide Import" : "Import Existing Account"}
            </Text>
          </TouchableOpacity>

          {showImport && (
            <View style={styles.importCard}>
              <Text style={styles.importLabel}>Stark Private Key</Text>
              <TextInput
                style={styles.importInput}
                placeholder="0x..."
                placeholderTextColor={colors.textMuted}
                value={importPK}
                onChangeText={setImportPK}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={styles.importLabel}>Starknet Address</Text>
              <TextInput
                style={styles.importInput}
                placeholder="0x..."
                placeholderTextColor={colors.textMuted}
                value={importAddr}
                onChangeText={setImportAddr}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={[styles.createButton, (!importPK || !importAddr || isImporting) && { opacity: 0.4 }]}
                disabled={!importPK || !importAddr || isImporting}
                onPress={async () => {
                  setIsImporting(true);
                  try {
                    await wallet.importWallet(importPK.trim(), importAddr.trim());
                    modal.showSuccess("Success", "Wallet imported!");
                  } catch (e: any) {
                    modal.showError("Error", e.message || "Import failed", e.message);
                  } finally {
                    setIsImporting(false);
                  }
                }}
              >
                {isImporting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.createButtonText}>Import Wallet</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  const displayBalance = tongoToDisplay(wallet.balance, wallet.selectedToken);
  const displayPending = tongoToDisplay(wallet.pending, wallet.selectedToken);
  const displayErc20 = erc20ToDisplay(wallet.erc20Balance, wallet.selectedToken);
  const hasPending = wallet.pending !== "0";

  const handleClaim = async () => {
    setIsClaiming(true);
    try {
      const pendingAmount = wallet.pending;
      const result = await wallet.rollover();
      setClaimSuccess({ txHash: result.txHash, amount: pendingAmount });
      wallet.refreshBalance();
    } catch (e: any) {
      modal.showError("Error", e.message || "Claim failed", e.message);
    } finally {
      setIsClaiming(false);
    }
  };

  const handleRefresh = async () => {
    await wallet.refreshBalance();
    await wallet.refreshAllBalances();
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={wallet.isRefreshing}
          onRefresh={handleRefresh}
          tintColor={colors.primary}
        />
      }
    >
      {modal.ModalComponent}

      {claimSuccess && (
        <View style={styles.claimSuccessCard}>
          <Check size={48} color={colors.success} style={{ marginBottom: spacing.md }} />
          <Text style={styles.claimSuccessTitle}>Claimed!</Text>
          <Text style={styles.claimSuccessAmount}>
            {claimSuccess.amount} units
          </Text>
          <Text style={styles.claimSuccessEquiv}>
            ({tongoToDisplay(claimSuccess.amount, wallet.selectedToken)} {wallet.selectedToken})
          </Text>
          <Text style={styles.claimSuccessDesc}>
            Pending funds added to your balance.
          </Text>

          <View style={styles.claimTxSection}>
            <Text style={styles.claimTxLabel}>Transaction Hash</Text>
            <Text style={styles.claimTxHash} numberOfLines={2} selectable>
              {claimSuccess.txHash}
            </Text>
            <View style={styles.claimTxActions}>
              <TouchableOpacity
                style={styles.claimTxBtn}
                onPress={() => {
                  Clipboard.setString(claimSuccess.txHash);
                }}
              >
                <Text style={styles.claimTxBtnText}>Copy Tx Hash</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.claimTxBtn}
                onPress={() => Linking.openURL(`https://sepolia.voyager.online/tx/${claimSuccess.txHash}`)}
              >
                <Text style={styles.claimTxBtnText}>View on Voyager</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={styles.claimDoneBtn}
            onPress={() => setClaimSuccess(null)}
          >
            <Text style={styles.claimDoneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      )}

      {!claimSuccess && (
        <>
          {/* Claim Banner */}
          {hasPending && (
        <View style={styles.claimBanner}>
          <View style={styles.claimBannerLeft}>
            <View style={styles.pulsingDot} />
            <View>
              <Text style={styles.claimBannerTitle}>Pending Funds Available</Text>
              <Text style={styles.claimBannerAmount}>
                +{displayPending} {wallet.selectedToken}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.claimPill}
            onPress={handleClaim}
            disabled={isClaiming}
          >
            {isClaiming ? (
              <ActivityIndicator color={colors.warning} size="small" />
            ) : (
              <Text style={styles.claimPillText}>Claim</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Balance Card */}
      <View style={styles.balanceCard}>
        <View style={styles.glowTopRight} />
        <View style={styles.glowBottomLeft} />
        <View style={styles.balanceContent}>
          <View style={styles.balanceLabelRow}>
            <Text style={styles.balanceLabel}>Shielded Balance</Text>
            <TouchableOpacity onPress={toggleBalanceVisibility} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              {balanceHidden ? (
                <Eye size={20} color={colors.textMuted} />
              ) : (
                <EyeOff size={20} color={colors.textMuted} />
              )}
            </TouchableOpacity>
          </View>
          <Text style={styles.balanceAmount}>
            {balanceHidden ? "****" : `${wallet.balance} units`}
          </Text>
          <Text style={styles.balanceSecondary}>
            {balanceHidden ? "****" : `(${displayBalance} ${wallet.selectedToken})`}
          </Text>
          {hasPending && (
            <Text style={styles.pendingText}>
              {balanceHidden ? "+**** pending" : `+${wallet.pending} units (${displayPending} ${wallet.selectedToken}) pending`}
            </Text>
          )}
          <Text style={styles.erc20Label}>Unshielded (On-chain)</Text>
          <Text style={styles.erc20Amount}>
            {balanceHidden ? "****" : displayErc20}{" "}
            <Text style={styles.erc20Symbol}>{wallet.selectedToken}</Text>
          </Text>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.actionButton, styles.actionSend]}
          onPress={() => navigation.navigate("Send")}
        >
          <Send size={32} color={colors.primary} style={styles.actionIconSpacing} />
          <Text style={styles.actionLabel}>Send</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.actionShield]}
          onPress={() => navigation.navigate("Wallet", { mode: "shield" })}
        >
          <ShieldPlus size={32} color={colors.success} style={styles.actionIconSpacing} />
          <Text style={styles.actionLabel}>Shield</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.actionUnshield]}
          onPress={() => navigation.navigate("Wallet", { mode: "unshield" })}
        >
          <ShieldOff size={32} color={colors.secondary} style={styles.actionIconSpacing} />
          <Text style={styles.actionLabel}>Unshield</Text>
        </TouchableOpacity>
      </View>

      {/* Recent Activity */}
      {wallet.txHistory.length > 0 && (
        <View style={styles.recentSection}>
          <View style={styles.recentHeader}>
            <Text style={styles.recentTitle}>Recent Activity</Text>
            <TouchableOpacity onPress={() => navigation.navigate("Activity")}>
              <Text style={styles.recentSeeAll}>See All</Text>
            </TouchableOpacity>
          </View>
          {wallet.txHistory.slice(0, 3).map((tx: any, i: number) => {
            const hash = tx.txHash || tx.transaction_hash || "";
            const iconColor = tx.type === "fund" ? colors.success : tx.type === "transfer" ? colors.primary : tx.type === "withdraw" ? colors.secondary : colors.textMuted;
            return (
              <TouchableOpacity
                key={i}
                style={styles.recentRow}
                onPress={() => hash && Linking.openURL(`https://sepolia.voyager.online/tx/${hash}`)}
              >
                {tx.type === "fund" ? (
                  <ShieldPlus size={18} color={iconColor} />
                ) : tx.type === "transfer" ? (
                  <ArrowUpFromLine size={18} color={iconColor} />
                ) : tx.type === "withdraw" ? (
                  <ShieldOff size={18} color={iconColor} />
                ) : (
                  <RefreshCw size={18} color={colors.textMuted} />
                )}
                <View style={styles.recentInfo}>
                  <Text style={styles.recentType}>{tx.type || "unknown"}</Text>
                  <Text style={styles.recentAmount}>{tx.amount || "?"} units</Text>
                </View>
                {hash ? <Text style={styles.recentHash}>{hash.slice(0, 8)}...</Text> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Compact Status */}
      <View style={styles.compactStatus}>
        <View style={[styles.statusDot, { backgroundColor: wallet.isBridgeReady ? colors.success : colors.error }]} />
        <Text style={styles.compactStatusText}>Sepolia</Text>
        <Text style={styles.compactStatusDivider}>|</Text>
        <Text style={styles.compactStatusText}>Nonce: {wallet.nonce}</Text>
      </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 100 },
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  loadingText: { color: colors.textSecondary, marginTop: spacing.md, fontSize: fontSize.md },
  heroIcon: { marginBottom: spacing.md },
  heroTitle: { fontSize: fontSize.hero, fontWeight: "bold", color: colors.text, marginBottom: spacing.sm },
  heroSubtitle: { fontSize: fontSize.lg, color: colors.textSecondary, textAlign: "center", marginBottom: spacing.xl },
  createButton: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: borderRadius.lg,
  },
  createButtonText: { color: "#fff", fontSize: fontSize.lg, fontWeight: "600" },
  importToggle: { marginTop: spacing.lg },
  importToggleText: { color: colors.primary, fontSize: fontSize.sm },
  importCard: {
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    width: "100%",
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  importLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
    marginTop: spacing.sm,
  },
  importInput: {
    backgroundColor: colors.bg,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: fontSize.sm,
    color: colors.text,
    fontFamily: "monospace",
    marginBottom: spacing.sm,
  },

  // Balance Card
  balanceCard: {
    overflow: "hidden",
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  glowTopRight: {
    position: "absolute",
    top: -40,
    right: -40,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(59, 130, 246, 0.08)",
  },
  glowBottomLeft: {
    position: "absolute",
    bottom: -30,
    left: -30,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(139, 92, 246, 0.08)",
  },
  balanceContent: { position: "relative" },
  balanceLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  balanceLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  eyeIcon: {},
  balanceAmount: { fontSize: fontSize.hero, fontWeight: "bold", color: colors.text },
  balanceSecondary: { fontSize: fontSize.md, color: colors.textSecondary, marginTop: 2 },
  pendingText: { fontSize: fontSize.sm, color: colors.warning, marginTop: spacing.sm },
  erc20Label: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: spacing.md,
  },
  erc20Amount: { fontSize: fontSize.lg, color: colors.textSecondary, marginTop: 2 },
  erc20Symbol: { fontSize: fontSize.sm, color: colors.textMuted },

  // Claim Banner
  claimBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.25)",
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  claimBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  pulsingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.warning,
  },
  claimBannerTitle: { fontSize: fontSize.sm, color: colors.warning, fontWeight: "600" },
  claimBannerAmount: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  claimPill: {
    backgroundColor: "rgba(245, 158, 11, 0.2)",
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.4)",
  },
  claimPillText: { color: colors.warning, fontSize: fontSize.sm, fontWeight: "700" },

  // Actions
  actionsRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  actionButton: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderLeftWidth: 3,
  },
  actionSend: {
    borderLeftColor: colors.primary,
  },
  actionShield: {
    borderLeftColor: colors.success,
  },
  actionUnshield: {
    borderLeftColor: colors.secondary,
  },
  actionIcon: { fontSize: 32, marginBottom: spacing.xs },
  actionIconSpacing: { marginBottom: spacing.xs },
  actionLabel: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: "600" },

  // Recent Activity
  recentSection: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: spacing.lg,
  },
  recentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  recentTitle: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  recentSeeAll: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: "500",
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    gap: spacing.sm,
  },
  recentInfo: { flex: 1 },
  recentType: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: "500",
    textTransform: "capitalize",
  },
  recentAmount: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  recentHash: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontFamily: "monospace",
  },

  // Compact Status
  compactStatus: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  compactStatusText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  compactStatusDivider: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    opacity: 0.5,
  },

  // Claim Success Card
  claimSuccessCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
  },
  claimSuccessTitle: { fontSize: fontSize.xl, fontWeight: "bold", color: colors.success, marginBottom: spacing.sm },
  claimSuccessAmount: { fontSize: fontSize.xxl, fontWeight: "bold", color: colors.text },
  claimSuccessEquiv: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.xs },
  claimSuccessDesc: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.lg },
  claimTxSection: {
    width: "100%",
    backgroundColor: colors.bg,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.xl,
  },
  claimTxLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  claimTxHash: {
    fontSize: fontSize.xs,
    color: colors.text,
    fontFamily: "monospace",
    marginBottom: spacing.sm,
  },
  claimTxActions: { flexDirection: "row", gap: spacing.sm },
  claimTxBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surface,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  claimTxBtnText: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: "600",
  },
  claimDoneBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: borderRadius.md,
  },
  claimDoneBtnText: { color: "#fff", fontSize: fontSize.md, fontWeight: "600" },
});
