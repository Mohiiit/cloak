/**
 * HomeScreen — Balance overview and recent activity.
 */
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Alert,
} from "react-native";
import { useWallet } from "../lib/WalletContext";
import { tongoToDisplay } from "../lib/tokens";
import { colors, spacing, fontSize, borderRadius } from "../lib/theme";

export default function HomeScreen({ navigation }: any) {
  const wallet = useWallet();
  const [showImport, setShowImport] = useState(false);
  const [importPK, setImportPK] = useState("");
  const [importAddr, setImportAddr] = useState("");
  const [isImporting, setIsImporting] = useState(false);

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
      <ScrollView style={styles.container} contentContainerStyle={styles.center}>
        <Text style={styles.heroIcon}>🛡️</Text>
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
              Alert.alert("Error", e.message || "Failed to create wallet");
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
                  Alert.alert("Success", "Wallet imported!");
                } catch (e: any) {
                  Alert.alert("Error", e.message || "Import failed");
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
    );
  }

  const displayBalance = tongoToDisplay(wallet.balance, wallet.selectedToken);
  const displayPending = tongoToDisplay(wallet.pending, wallet.selectedToken);
  const hasPending = wallet.pending !== "0";

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={wallet.isRefreshing}
          onRefresh={wallet.refreshBalance}
          tintColor={colors.primary}
        />
      }
    >
      {/* Balance Card */}
      <View style={styles.balanceCard}>
        <View style={styles.glowTopRight} />
        <View style={styles.glowBottomLeft} />
        <View style={styles.balanceContent}>
          <Text style={styles.balanceLabel}>Shielded Balance</Text>
          <Text style={styles.balanceAmount}>
            {displayBalance}{" "}
            <Text style={styles.balanceSymbol}>{wallet.selectedToken}</Text>
          </Text>
          {hasPending && (
            <View style={styles.pendingRow}>
              <Text style={styles.pendingText}>
                +{displayPending} {wallet.selectedToken} pending
              </Text>
              <TouchableOpacity
                style={styles.claimButton}
                onPress={async () => {
                  try {
                    await wallet.rollover();
                    await wallet.refreshBalance();
                  } catch (e: any) {
                    console.error("Rollover error:", e);
                  }
                }}
              >
                <Text style={styles.claimButtonText}>Claim</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* Token Selector */}
      <View style={styles.tokenRow}>
        {(["STRK", "ETH", "USDC"] as const).map((token) => (
          <TouchableOpacity
            key={token}
            style={[
              styles.tokenTab,
              wallet.selectedToken === token && styles.tokenTabActive,
            ]}
            onPress={() => wallet.setSelectedToken(token)}
          >
            <Text
              style={[
                styles.tokenTabText,
                wallet.selectedToken === token && styles.tokenTabTextActive,
              ]}
            >
              {token}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Quick Actions */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate("Send")}
        >
          <Text style={styles.actionIcon}>↑</Text>
          <Text style={styles.actionLabel}>Send</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate("Wallet")}
        >
          <Text style={styles.actionIcon}>🛡️</Text>
          <Text style={styles.actionLabel}>Shield</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate("Wallet")}
        >
          <Text style={styles.actionIcon}>↓</Text>
          <Text style={styles.actionLabel}>Unshield</Text>
        </TouchableOpacity>
      </View>

      {/* Status */}
      <View style={styles.statusCard}>
        <Text style={styles.statusTitle}>Wallet Status</Text>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Bridge</Text>
          <Text style={[styles.statusValue, { color: wallet.isBridgeReady ? colors.success : colors.error }]}>
            {wallet.isBridgeReady ? "Connected" : "Connecting..."}
          </Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Network</Text>
          <Text style={styles.statusValue}>Starknet Sepolia</Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Nonce</Text>
          <Text style={styles.statusValue}>{wallet.nonce}</Text>
        </View>
      </View>
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
  heroIcon: { fontSize: 64, marginBottom: spacing.md },
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
  balanceLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: spacing.sm,
  },
  balanceAmount: { fontSize: fontSize.hero, fontWeight: "bold", color: colors.text },
  balanceSymbol: { fontSize: fontSize.xl, color: colors.textSecondary },
  pendingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  pendingText: { fontSize: fontSize.sm, color: colors.warning },
  claimButton: {
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: borderRadius.full,
  },
  claimButtonText: { color: colors.warning, fontSize: fontSize.xs, fontWeight: "600" },

  // Token Selector
  tokenRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  tokenTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  tokenTabActive: {
    backgroundColor: colors.primaryDim,
    borderColor: colors.primary,
  },
  tokenTabText: { fontSize: fontSize.sm, color: colors.textMuted, fontWeight: "600" },
  tokenTabTextActive: { color: colors.primary },

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
    paddingVertical: spacing.lg,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  actionIcon: { fontSize: 24, marginBottom: spacing.xs },
  actionLabel: { fontSize: fontSize.sm, color: colors.textSecondary },

  // Status
  statusCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  statusTitle: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: spacing.md,
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  statusLabel: { fontSize: fontSize.md, color: colors.textSecondary },
  statusValue: { fontSize: fontSize.md, color: colors.text },
});
