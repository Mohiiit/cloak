/**
 * DeployScreen — Gated screen shown when the CloakAccount is not yet deployed on-chain.
 * Users must fund and deploy before accessing the wallet.
 */
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Clipboard from "@react-native-clipboard/clipboard";
import QRCode from "react-native-qrcode-svg";
import { ExternalLink, Copy, Check, RefreshCw } from "lucide-react-native";
import { useWallet } from "../lib/WalletContext";
import { useToast } from "../components/Toast";
import { CloakIcon } from "../components/CloakIcon";
import { colors, spacing, fontSize, borderRadius } from "../lib/theme";
import { testIDs, testProps } from "../testing/testIDs";
import { KeyboardSafeScreen } from "../components/KeyboardSafeContainer";

const FAUCET_URL = "https://starknet-faucet.vercel.app/";
const VOYAGER_TX_URL = "https://sepolia.voyager.online/tx/";

export default function DeployScreen() {
  const wallet = useWallet();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();

  const [deploying, setDeploying] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const deployStatusValue = wallet.isCheckingDeployment
    ? "checking_deployment"
    : wallet.isDeployed
    ? "deployed"
    : "needs_deploy";
  const deployStatusMarker = `deploy.status=${deployStatusValue}`;

  const address = wallet.keys?.starkAddress || "";

  const handleCopy = () => {
    Clipboard.setString(address);
    setCopied(true);
    showToast("Address copied", "success");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDeploy = async () => {
    setDeploying(true);
    setError(null);
    try {
      const hash = await wallet.deployAccount();
      setTxHash(hash);
      showToast("Account deployed successfully!", "success");
    } catch (e: any) {
      const msg = e?.message || "Deployment failed";
      setError(msg);
      showToast("Deployment failed", "error");
    } finally {
      setDeploying(false);
    }
  };

  const handleCheckDeployed = async () => {
    const deployed = await wallet.checkDeployment();
    if (deployed) {
      showToast("Account is deployed!", "success");
    } else {
      showToast("Account not yet deployed", "warning");
    }
  };

  return (
    <KeyboardSafeScreen
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View pointerEvents="none" style={styles.markerContainer} collapsable={false}>
        <View
          {...testProps(testIDs.markers.deployStatus, deployStatusMarker)}
          style={styles.markerNode}
          collapsable={false}
          accessible
          importantForAccessibility="yes"
        >
          <Text style={styles.markerText}>{deployStatusMarker}</Text>
        </View>
      </View>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.iconWrapper}>
          <CloakIcon size={32} />
        </View>
        <Text style={styles.title}>Deploy Your Account</Text>
        <Text style={styles.subtitle}>
          Your CloakAccount address has been computed. Fund it and deploy on-chain to start using Cloak.
        </Text>
      </View>

      {/* Address Card */}
      <View style={styles.addressCard}>
        <Text style={styles.addressLabel}>YOUR STARKNET ADDRESS</Text>
        <View style={styles.qrContainer}>
          <View style={styles.qrGlow} />
          <View style={styles.qrWhiteBg}>
            <QRCode
              value={address}
              size={140}
              backgroundColor="#FFFFFF"
              color="#000000"
            />
          </View>
        </View>
        <TouchableOpacity
          {...testProps(testIDs.deploy.copyAddress)}
          style={styles.addressRow}
          onPress={handleCopy}
        >
          <Text style={styles.addressText} numberOfLines={2}>
            {address}
          </Text>
          {copied ? (
            <Check size={16} color={colors.success} />
          ) : (
            <Copy size={16} color={colors.primary} />
          )}
        </TouchableOpacity>
      </View>

      {/* Warning Card */}
      <View style={styles.warningCard}>
        <Text style={styles.warningTitle}>Fund your account first</Text>
        <Text style={styles.warningDesc}>
          Send STRK or ETH to the address above to cover gas fees, then deploy your account on-chain.
        </Text>
        <TouchableOpacity
          {...testProps(testIDs.deploy.openFaucet)}
          style={styles.faucetLink}
          onPress={() => Linking.openURL(FAUCET_URL)}
        >
          <Text style={styles.faucetLinkText}>Get testnet tokens from faucet</Text>
          <ExternalLink size={12} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Success Card */}
      {txHash && (
        <View style={styles.successCard}>
          <Text style={styles.successTitle}>Deployment submitted!</Text>
          <TouchableOpacity
            {...testProps(testIDs.deploy.viewVoyager)}
            onPress={() => Linking.openURL(`${VOYAGER_TX_URL}${txHash}`)}
          >
            <Text style={styles.successHash}>
              {txHash.slice(0, 12)}...{txHash.slice(-8)}
            </Text>
            <Text style={styles.successLink}>View on Voyager</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Error Card */}
      {error && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          {...testProps(testIDs.deploy.deployAccount)}
          style={[styles.deployBtn, deploying && styles.deployBtnDisabled]}
          disabled={deploying}
          onPress={handleDeploy}
        >
          {deploying ? (
            <View style={styles.deployingRow}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.deployBtnText}>Deploying...</Text>
            </View>
          ) : (
            <Text style={styles.deployBtnText}>Deploy Account</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          {...testProps(testIDs.deploy.checkIfDeployed)}
          style={[styles.checkBtn, wallet.isCheckingDeployment && { opacity: 0.5 }]}
          disabled={wallet.isCheckingDeployment}
          onPress={handleCheckDeployed}
        >
          {wallet.isCheckingDeployment ? (
            <ActivityIndicator size="small" color={colors.textSecondary} />
          ) : (
            <View style={styles.checkBtnRow}>
              <RefreshCw size={14} color={colors.textSecondary} />
              <Text style={styles.checkBtnText}>Check if Deployed</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardSafeScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 60,
  },
  header: {
    alignItems: "center",
    marginBottom: spacing.xl,
    marginTop: spacing.lg,
  },
  iconWrapper: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "rgba(59, 130, 246, 0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: "bold",
    color: colors.text,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: spacing.md,
  },

  // Address Card
  addressCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  addressLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: spacing.md,
  },
  qrContainer: {
    position: "relative",
    alignItems: "center",
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  qrGlow: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    opacity: 0.15,
    backgroundColor: colors.primary,
  },
  qrWhiteBg: {
    backgroundColor: "#FFFFFF",
    padding: spacing.md,
    borderRadius: borderRadius.md,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bg,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    width: "100%",
    gap: spacing.sm,
  },
  addressText: {
    flex: 1,
    fontSize: fontSize.xs,
    color: colors.text,
    fontFamily: "monospace",
  },

  // Warning Card
  warningCard: {
    backgroundColor: "rgba(245, 158, 11, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.2)",
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  warningTitle: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.warning,
    marginBottom: spacing.xs,
  },
  warningDesc: {
    fontSize: fontSize.xs,
    color: "rgba(245, 158, 11, 0.7)",
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  faucetLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  faucetLinkText: {
    fontSize: fontSize.xs,
    color: colors.primary,
    textDecorationLine: "underline",
  },

  // Success Card
  successCard: {
    backgroundColor: "rgba(16, 185, 129, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.2)",
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  successTitle: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.success,
    marginBottom: spacing.xs,
  },
  successHash: {
    fontSize: fontSize.xs,
    fontFamily: "monospace",
    color: "rgba(16, 185, 129, 0.7)",
    marginBottom: spacing.xs,
  },
  successLink: {
    fontSize: fontSize.xs,
    color: colors.primary,
    textDecorationLine: "underline",
  },

  // Error Card
  errorCard: {
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    fontSize: fontSize.xs,
    color: colors.error,
  },

  // Actions
  actions: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  deployBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: borderRadius.lg,
    alignItems: "center",
  },
  deployBtnDisabled: {
    opacity: 0.6,
  },
  deployBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: fontSize.md,
  },
  deployingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  checkBtn: {
    backgroundColor: colors.surface,
    paddingVertical: 14,
    borderRadius: borderRadius.lg,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  checkBtnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  checkBtnText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  markerContainer: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 240,
    height: 10,
    zIndex: 9999,
  },
  markerNode: {
    width: 240,
    height: 9,
  },
  markerText: {
    fontSize: 7,
    lineHeight: 9,
    color: "#0F172A",
  },
});
