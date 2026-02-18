import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Share,
} from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { ArrowLeft, Check, Shield, Copy, Share2 } from "lucide-react-native";
import QRCode from "react-native-qrcode-svg";
import Clipboard from "@react-native-clipboard/clipboard";

import { colors, typography } from "../../lib/theme";
import { testIDs, testProps } from "../../testing/testIDs";

type WardCreatedParams = {
  wardAddress: string;
  wardPrivateKey: string;
  qrPayload: string;
  pseudoName?: string;
  initialFundingAmountWei?: string;
};

type WardCreatedRouteProp = RouteProp<
  { WardCreated: WardCreatedParams },
  "WardCreated"
>;

function truncateAddress(address: string): string {
  if (address.length <= 16) return address;
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function formatFunding(amountWei?: string): string {
  if (!amountWei) return "0 STRK";
  try {
    const wei = BigInt(amountWei);
    const whole = wei / BigInt(10 ** 18);
    const remainder = wei % BigInt(10 ** 18);
    if (remainder === 0n) return `${whole} STRK`;
    const decimal = remainder.toString().padStart(18, "0").slice(0, 2);
    return `${whole}.${decimal} STRK`;
  } catch {
    return "0 STRK";
  }
}

export default function WardCreatedScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<WardCreatedRouteProp>();
  const {
    wardAddress,
    qrPayload,
    pseudoName,
    initialFundingAmountWei,
  } = route.params;

  const wardName = pseudoName || "ward";

  const handleCopyAddress = useCallback(() => {
    Clipboard.setString(wardAddress);
  }, [wardAddress]);

  const handleShareQR = useCallback(async () => {
    try {
      await Share.share({
        message: `Cloak Ward Account\n\nName: ${wardName}\nAddress: ${wardAddress}\n\nImport payload:\n${qrPayload}`,
        title: "Cloak Ward Account",
      });
    } catch (err) {
      console.warn("[WardCreatedScreen] Share failed:", err);
    }
  }, [wardAddress, wardName, qrPayload]);

  const handleGoToDashboard = useCallback(() => {
    const parent = navigation.getParent();
    if (parent) {
      parent.navigate("AppTabs");
    } else {
      navigation.popToTop();
    }
  }, [navigation]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          {...testProps(testIDs.SETTINGS?.BACK_BUTTON ?? "back-button")}
        >
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ward Created</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Success Badge Section */}
        <View style={styles.successSection}>
          <View style={styles.checkCircle}>
            <Check size={36} color="#10B981" />
          </View>
          <Text style={styles.successTitle}>Ward Account Created!</Text>
          <Text style={styles.successSubtitle}>
            {"Share this QR code with the ward user\nso they can import the account."}
          </Text>
        </View>

        {/* QR Card */}
        <View style={styles.qrCard}>
          {/* Ward Label Row */}
          <View style={styles.wardLabelRow}>
            <View style={styles.wardIconCircle}>
              <Shield size={14} color="#10B981" />
            </View>
            <Text style={styles.wardName}>{wardName}</Text>
            <View style={styles.activeBadge}>
              <Text style={styles.activeBadgeText}>Active</Text>
            </View>
          </View>

          {/* QR Code */}
          <View style={styles.qrWrapper}>
            <QRCode
              value={qrPayload}
              size={200}
              backgroundColor="#FFFFFF"
              color="#000000"
            />
          </View>

          {/* Address Row */}
          <TouchableOpacity
            style={styles.addressRow}
            onPress={handleCopyAddress}
            activeOpacity={0.7}
          >
            <Text style={styles.addressText} numberOfLines={1}>
              {truncateAddress(wardAddress)}
            </Text>
            <Copy size={14} color={colors.textSecondary} />
          </TouchableOpacity>

          {/* Hint */}
          <Text style={styles.qrHint}>
            Ward user scans this with their Cloak app
          </Text>
        </View>

        {/* Ward Configuration */}
        <View style={styles.configCard}>
          <Text style={styles.configTitle}>WARD CONFIGURATION</Text>
          <View style={styles.configRow}>
            <Text style={styles.configLabel}>Daily Limit</Text>
            <Text style={styles.configValue}>100 STRK</Text>
          </View>
          <View style={styles.configRow}>
            <Text style={styles.configLabel}>Initial Funding</Text>
            <Text style={styles.configValue}>
              {formatFunding(initialFundingAmountWei)}
            </Text>
          </View>
        </View>

        {/* Spacer */}
        <View style={{ flex: 1 }} />

        {/* Share QR Code Button */}
        <TouchableOpacity
          style={styles.shareButton}
          onPress={handleShareQR}
          activeOpacity={0.8}
        >
          <Share2 size={18} color={colors.text} style={{ marginRight: 8 }} />
          <Text style={styles.shareButtonText}>Share QR Code</Text>
        </TouchableOpacity>

        {/* Go to Dashboard Button */}
        <TouchableOpacity
          style={styles.dashboardButton}
          onPress={handleGoToDashboard}
          activeOpacity={0.8}
        >
          <Text style={styles.dashboardButtonText}>Go to Dashboard</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 48,
    paddingHorizontal: 16,
    marginTop: 44,
  },
  headerTitle: {
    fontFamily: typography.primarySemibold,
    fontWeight: "700",
    fontSize: 16,
    color: colors.text,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingVertical: 20,
    paddingHorizontal: 24,
    gap: 24,
    flexGrow: 1,
  },

  // Success Section
  successSection: {
    alignItems: "center",
    gap: 8,
  },
  checkCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#10B98120",
    alignItems: "center",
    justifyContent: "center",
  },
  successTitle: {
    fontFamily: typography.primarySemibold,
    fontWeight: "700",
    fontSize: 20,
    color: colors.text,
    textAlign: "center",
  },
  successSubtitle: {
    fontFamily: typography.secondary,
    fontSize: 13,
    lineHeight: 13 * 1.5,
    color: colors.textSecondary,
    textAlign: "center",
  },

  // QR Card
  qrCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 20,
    gap: 16,
    alignItems: "center",
  },
  wardLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    gap: 8,
  },
  wardIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#10B98120",
    alignItems: "center",
    justifyContent: "center",
  },
  wardName: {
    fontFamily: typography.primary,
    fontWeight: "500",
    fontSize: 14,
    color: colors.text,
    flex: 1,
  },
  activeBadge: {
    backgroundColor: "#10B98120",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  activeBadgeText: {
    fontFamily: typography.secondary,
    fontWeight: "500",
    fontSize: 11,
    color: "#10B981",
  },
  qrWrapper: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: colors.inputBg,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  addressText: {
    fontFamily: typography.primary,
    fontSize: 13,
    color: colors.textSecondary,
    flex: 1,
  },
  qrHint: {
    fontFamily: typography.secondary,
    fontSize: 11,
    color: colors.textMuted,
    textAlign: "center",
  },

  // Config Card
  configCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 10,
  },
  configTitle: {
    fontFamily: typography.primarySemibold,
    fontWeight: "600",
    fontSize: 10,
    letterSpacing: 1.5,
    color: colors.textMuted,
  },
  configRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  configLabel: {
    fontFamily: typography.secondary,
    fontSize: 13,
    color: colors.textSecondary,
  },
  configValue: {
    fontFamily: typography.primary,
    fontWeight: "500",
    fontSize: 13,
    color: colors.text,
  },

  // Buttons
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 52,
    borderRadius: 12,
    backgroundColor: colors.secondary,
  },
  shareButtonText: {
    fontFamily: typography.secondarySemibold,
    fontWeight: "600",
    fontSize: 15,
    color: colors.text,
  },
  dashboardButton: {
    alignItems: "center",
    justifyContent: "center",
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "transparent",
  },
  dashboardButtonText: {
    fontFamily: typography.secondary,
    fontWeight: "500",
    fontSize: 15,
    color: colors.textSecondary,
  },
});
