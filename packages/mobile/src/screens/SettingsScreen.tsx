/**
 * SettingsScreen — Key backup, wallet info, and preferences.
 */
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import Clipboard from "@react-native-clipboard/clipboard";
import { useWallet } from "../lib/WalletContext";
import { clearWallet } from "../lib/keys";
import { colors, spacing, fontSize, borderRadius } from "../lib/theme";

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    Clipboard.setString(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View style={styles.copyRow}>
      <Text style={styles.copyLabel}>{label}</Text>
      <TouchableOpacity style={styles.copyValueRow} onPress={handleCopy}>
        <Text style={styles.copyValue} numberOfLines={1}>
          {value}
        </Text>
        <Text style={styles.copyBtn}>{copied ? "Copied!" : "Copy"}</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function SettingsScreen() {
  const wallet = useWallet();
  const [showPrivateKey, setShowPrivateKey] = useState(false);

  if (!wallet.keys) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>No wallet created yet.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Cloak Address */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Cloak Address</Text>
        <Text style={styles.sectionDesc}>
          Share this with others so they can send you shielded payments.
        </Text>
        <CopyRow label="Tongo Address" value={wallet.keys.tongoAddress} />
      </View>

      {/* Account Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <CopyRow label="Starknet Address" value={wallet.keys.starkAddress} />
      </View>

      {/* Key Backup */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Key Backup</Text>
        <Text style={styles.warningText}>
          Keep your private keys safe. Anyone with these keys can access your funds.
        </Text>

        {!showPrivateKey ? (
          <TouchableOpacity
            style={styles.revealBtn}
            onPress={() => {
              Alert.alert(
                "Show Private Keys?",
                "Make sure no one is looking at your screen.",
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Show", onPress: () => setShowPrivateKey(true) },
                ],
              );
            }}
          >
            <Text style={styles.revealBtnText}>Reveal Private Keys</Text>
          </TouchableOpacity>
        ) : (
          <View>
            <CopyRow label="Stark Private Key" value={wallet.keys.starkPrivateKey} />
            <CopyRow label="Tongo Private Key" value={wallet.keys.tongoPrivateKey} />
            <TouchableOpacity
              style={styles.hideBtn}
              onPress={() => setShowPrivateKey(false)}
            >
              <Text style={styles.hideBtnText}>Hide Keys</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Network */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Network</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Chain</Text>
          <Text style={styles.infoValue}>Starknet Sepolia</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Bridge</Text>
          <Text style={[styles.infoValue, { color: wallet.isBridgeReady ? colors.success : colors.error }]}>
            {wallet.isBridgeReady ? "Connected" : "Disconnected"}
          </Text>
        </View>
      </View>

      {/* Danger Zone */}
      <View style={[styles.section, styles.dangerSection]}>
        <Text style={[styles.sectionTitle, { color: colors.error }]}>Danger Zone</Text>
        <TouchableOpacity
          style={styles.dangerBtn}
          onPress={() => {
            Alert.alert(
              "Clear Wallet?",
              "This will remove all keys and data from this device. Make sure you've backed up your keys!",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Clear All Data",
                  style: "destructive",
                  onPress: async () => {
                    await clearWallet();
                    Alert.alert("Done", "Wallet data cleared. Restart the app.");
                  },
                },
              ],
            );
          }}
        >
          <Text style={styles.dangerBtnText}>Clear All Data</Text>
        </TouchableOpacity>
      </View>

      {/* About */}
      <View style={styles.aboutSection}>
        <Text style={styles.aboutText}>Cloak v0.1.0</Text>
        <Text style={styles.aboutText}>Built for Re{"{define}"} Hackathon</Text>
        <Text style={styles.aboutText}>Privacy Track</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 100 },
  center: { flex: 1, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" },
  emptyText: { color: colors.textSecondary, fontSize: fontSize.md },

  section: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 4,
  },
  sectionDesc: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },

  copyRow: { marginBottom: spacing.md },
  copyLabel: { fontSize: fontSize.xs, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  copyValueRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bg,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  copyValue: { flex: 1, fontSize: fontSize.sm, color: colors.text, fontFamily: "monospace" },
  copyBtn: { fontSize: fontSize.xs, color: colors.primary, fontWeight: "600", marginLeft: spacing.sm },

  warningText: { fontSize: fontSize.sm, color: colors.warning, marginBottom: spacing.md },

  revealBtn: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.2)",
  },
  revealBtnText: { color: colors.error, fontWeight: "600", fontSize: fontSize.sm },

  hideBtn: {
    paddingVertical: 10,
    alignItems: "center",
  },
  hideBtnText: { color: colors.textSecondary, fontSize: fontSize.sm },

  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  infoLabel: { fontSize: fontSize.md, color: colors.textSecondary },
  infoValue: { fontSize: fontSize.md, color: colors.text },

  dangerSection: { borderColor: "rgba(239, 68, 68, 0.2)" },
  dangerBtn: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  dangerBtnText: { color: colors.error, fontWeight: "600" },

  aboutSection: { alignItems: "center", paddingVertical: spacing.xl },
  aboutText: { fontSize: fontSize.sm, color: colors.textMuted, marginBottom: 4 },
});
