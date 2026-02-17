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
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { ExternalLink, Copy, RefreshCw } from "lucide-react-native";
import { useWallet } from "../lib/WalletContext";
import { useToast } from "../components/Toast";
import { CloakIcon } from "../components/CloakIcon";
import { colors, spacing, fontSize, borderRadius, typography } from "../lib/theme";
import { testIDs, testProps } from "../testing/testIDs";
import { KeyboardSafeScreen } from "../components/KeyboardSafeContainer";

const FAUCET_URL = "https://starknet-faucet.vercel.app/";
const VOYAGER_TX_URL = "https://sepolia.voyager.online/tx/";

function DeployLogoBadge() {
  return (
    <View style={styles.logoFrame}>
      <Svg width={64} height={64} viewBox="0 0 64 64">
        <Defs>
          <LinearGradient id="deployLogoGradient" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#3B82F6" />
            <Stop offset="1" stopColor="#8B5CF6" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="64" height="64" rx="16" fill="url(#deployLogoGradient)" />
      </Svg>
      <View style={styles.logoIcon}>
        <CloakIcon size={36} color="#FFFFFF" />
      </View>
    </View>
  );
}

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
        <DeployLogoBadge />
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
          <Text style={styles.addressText} numberOfLines={1}>
            {address}
          </Text>
          <Copy size={16} color={copied ? colors.success : colors.primaryLight} />
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
        {txHash || error ? (
          <TouchableOpacity
            {...testProps(testIDs.deploy.checkIfDeployed)}
            style={[styles.checkBtnLink, wallet.isCheckingDeployment && styles.checkBtnLinkDisabled]}
            disabled={wallet.isCheckingDeployment}
            onPress={handleCheckDeployed}
          >
            {wallet.isCheckingDeployment ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <View style={styles.checkBtnRow}>
                <RefreshCw size={13} color={colors.textSecondary} />
                <Text style={styles.checkBtnText}>Check if deployed</Text>
              </View>
            )}
          </TouchableOpacity>
        ) : null}
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
    padding: 24,
    paddingBottom: 30,
    gap: 18,
  },
  header: {
    alignItems: "center",
    marginTop: 4,
    gap: 8,
  },
  logoFrame: {
    width: 64,
    height: 64,
    borderRadius: 16,
    position: "relative",
  },
  logoIcon: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "700",
    color: colors.text,
    fontFamily: typography.primarySemibold,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    textAlign: "center",
    fontFamily: typography.secondary,
    paddingHorizontal: 8,
  },

  // Address Card
  addressCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    gap: 14,
  },
  addressLabel: {
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 2,
    fontFamily: typography.primarySemibold,
  },
  qrContainer: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    width: 180,
    height: 180,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
    padding: 10,
  },
  qrGlow: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 10,
    opacity: 1,
    backgroundColor: "#E2E8F0",
  },
  qrWhiteBg: {
    backgroundColor: "#FFFFFF",
    padding: 10,
    borderRadius: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.inputBg,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    width: "100%",
    gap: spacing.sm,
  },
  addressText: {
    flex: 1,
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: typography.primary,
  },

  // Warning Card
  warningCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.2)",
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.warning,
    fontFamily: typography.primarySemibold,
  },
  warningDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
    fontFamily: typography.secondary,
  },
  faucetLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  faucetLinkText: {
    fontSize: 13,
    color: colors.primaryLight,
    fontFamily: typography.secondarySemibold,
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
    fontFamily: typography.primarySemibold,
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
    fontFamily: typography.secondarySemibold,
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
    fontFamily: typography.secondary,
  },

  // Actions
  actions: {
    marginTop: 0,
    gap: spacing.sm,
  },
  deployBtn: {
    backgroundColor: colors.primary,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  deployBtnDisabled: {
    opacity: 0.6,
  },
  deployBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
    fontFamily: typography.primarySemibold,
  },
  deployingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  checkBtnLink: {
    paddingVertical: 8,
    alignItems: "center",
  },
  checkBtnLinkDisabled: {
    opacity: 0.5,
  },
  checkBtnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  checkBtnText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontFamily: typography.secondary,
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
