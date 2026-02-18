import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import Clipboard from "@react-native-clipboard/clipboard";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ArrowLeft, AlertTriangle, Copy, Info, KeyRound, Lock } from "lucide-react-native";
import { useWallet } from "../../lib/WalletContext";
import { borderRadius, colors, typography } from "../../lib/theme";
import { testIDs, testProps } from "../../testing/testIDs";

const SCREENSHOT_MODE_KEY = "cloak_ui_screenshot_mode";

const SAMPLE = {
  starkPk: "0x02a4c9b1...7e3f8d21",
  starkAddr: "0x04a3...8f2d",
  tongoPk: "0x07f2e8a3...4b1c9d56",
  tongoAddr: "0x07f2...9d56",
};

function shortenMiddle(value: string, prefixLen: number, suffixLen: number): string {
  const v = value || "";
  if (v.length <= prefixLen + suffixLen + 3) return v;
  return `${v.slice(0, prefixLen)}...${v.slice(-suffixLen)}`;
}

function KeyCard({
  icon,
  label,
  keyDisplay,
  addressDisplay,
  onCopyKey,
  testIdCopy,
}: {
  icon: React.ReactNode;
  label: string;
  keyDisplay: string;
  addressDisplay: string;
  onCopyKey: () => void;
  testIdCopy: string;
}) {
  return (
    <View style={styles.keyCard}>
      <View style={styles.keyHeader}>
        {icon}
        <Text style={styles.keyLabel}>{label}</Text>
      </View>

      <TouchableOpacity
        {...testProps(testIdCopy)}
        style={styles.keyBox}
        onPress={onCopyKey}
        activeOpacity={0.85}
      >
        <Text style={styles.keyValue}>{keyDisplay}</Text>
        <Copy size={16} color={colors.textMuted} />
      </TouchableOpacity>

      <View style={styles.addrRow}>
        <Text style={styles.addrLabel}>Address</Text>
        <Text style={styles.addrValue}>{addressDisplay}</Text>
      </View>
    </View>
  );
}

export default function KeyBackupScreen({ navigation }: any) {
  const wallet = useWallet();
  const [screenshotMode, setScreenshotMode] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(SCREENSHOT_MODE_KEY)
      .then((val) => {
        if (!mounted) return;
        setScreenshotMode(val === "1" || val === "true");
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const starkPkDisplay = useMemo(() => {
    if (screenshotMode !== false) return SAMPLE.starkPk;
    return shortenMiddle(wallet.keys?.starkPrivateKey || "", 10, 8);
  }, [screenshotMode, wallet.keys?.starkPrivateKey]);

  const starkAddrDisplay = useMemo(() => {
    if (screenshotMode !== false) return SAMPLE.starkAddr;
    return shortenMiddle(wallet.keys?.starkAddress || "", 6, 4);
  }, [screenshotMode, wallet.keys?.starkAddress]);

  const tongoPkDisplay = useMemo(() => {
    if (screenshotMode !== false) return SAMPLE.tongoPk;
    return shortenMiddle(wallet.keys?.tongoPrivateKey || "", 10, 8);
  }, [screenshotMode, wallet.keys?.tongoPrivateKey]);

  const tongoAddrDisplay = useMemo(() => {
    if (screenshotMode !== false) return SAMPLE.tongoAddr;
    return shortenMiddle(wallet.keys?.tongoAddress || "", 8, 6);
  }, [screenshotMode, wallet.keys?.tongoAddress]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          {...testProps(testIDs.keyBackup.back)}
          style={styles.headerIconBtn}
          onPress={() => navigation.goBack()}
        >
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Key Backup</Text>
        <View style={styles.headerIconSpacer} />
      </View>

      <View style={styles.content}>
        {/* Warning */}
        <View style={styles.warningCard}>
          <AlertTriangle size={22} color={colors.error} />
          <View style={{ flex: 1 }}>
            <Text style={styles.warningTitle}>Security Warning</Text>
            <Text style={styles.warningDesc}>
              Never share your private keys with anyone. Anyone with access to these keys can control your funds. Store them securely offline.
            </Text>
          </View>
        </View>

        <KeyCard
          icon={<KeyRound size={18} color={colors.primary} />}
          label="Stark Private Key"
          keyDisplay={starkPkDisplay}
          addressDisplay={starkAddrDisplay}
          onCopyKey={() => {
            if (!wallet.keys?.starkPrivateKey) return;
            Clipboard.setString(wallet.keys.starkPrivateKey);
          }}
          testIdCopy={testIDs.keyBackup.starkCopy}
        />

        <KeyCard
          icon={<Lock size={18} color={colors.secondary} />}
          label="Tongo Private Key"
          keyDisplay={tongoPkDisplay}
          addressDisplay={tongoAddrDisplay}
          onCopyKey={() => {
            if (!wallet.keys?.tongoPrivateKey) return;
            Clipboard.setString(wallet.keys.tongoPrivateKey);
          }}
          testIdCopy={testIDs.keyBackup.tongoCopy}
        />

        {/* Tip */}
        <View style={styles.tipCard}>
          <Info size={16} color={colors.primary} />
          <Text style={styles.tipText}>
            Store your keys in a secure password manager or write them down and keep in a safe place.
          </Text>
        </View>

        <TouchableOpacity
          {...testProps(testIDs.keyBackup.done)}
          style={styles.doneBtn}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    height: 56,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerIconBtn: { width: 24, height: 24, alignItems: "center", justifyContent: "center" },
  headerIconSpacer: { width: 24, height: 24 },
  headerTitle: {
    color: colors.text,
    fontSize: 16,
    fontFamily: typography.primarySemibold,
  },

  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 0,
    gap: 20,
  },

  warningCard: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: borderRadius.md,
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.25)",
  },
  warningTitle: {
    color: colors.error,
    fontSize: 14,
    fontFamily: typography.primarySemibold,
    marginBottom: 4,
  },
  warningDesc: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: typography.secondary,
  },

  keyCard: {
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
  },
  keyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  keyLabel: {
    color: colors.text,
    fontSize: 13,
    fontFamily: typography.primarySemibold,
  },
  keyBox: {
    borderRadius: borderRadius.sm,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  keyValue: {
    color: colors.text,
    fontSize: 12,
    fontFamily: typography.primary,
  },
  addrRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  addrLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: typography.secondary,
  },
  addrValue: {
    color: colors.textSecondary,
    fontSize: 11,
    fontFamily: typography.primary,
  },

  tipCard: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "rgba(59, 130, 246, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.18)",
  },
  tipText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    fontFamily: typography.secondary,
  },

  doneBtn: {
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 0,
  },
  doneBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: typography.primarySemibold,
  },
});
