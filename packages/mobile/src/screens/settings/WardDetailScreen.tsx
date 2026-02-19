/**
 * WardDetailScreen — Detail view for managing a single ward account.
 * Displays ward status, spending limits, freeze toggle, and danger zone.
 */
import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from "react-native";
import {
  Shield,
  ArrowLeft,
  Gauge,
  Save,
  Trash2,
  TriangleAlert,
  Copy,
  QrCode,
  ChevronDown,
  ChevronUp,
} from "lucide-react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import Clipboard from "@react-native-clipboard/clipboard";
import QRCode from "react-native-qrcode-svg";
import { colors, spacing, fontSize, borderRadius, typography } from "../../lib/theme";
import { useToast } from "../../components/Toast";

type WardDetailParams = {
  wardAddress: string;
  wardName: string;
  isFrozen: boolean;
  spendingLimit: string;
  qrPayload?: string;
  maxPerTx?: string;
};

function shortenAddress(addr: string): string {
  if (!addr || addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function WardDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const params = route.params as WardDetailParams;
  const toast = useToast();

  const [frozen, setFrozen] = useState(params.isFrozen);
  const [qrExpanded, setQrExpanded] = useState(false);

  // Parse daily limit from spendingLimit param (e.g. "100 STRK/tx" → "100")
  const parsedDailyLimit = (() => {
    const match = params.spendingLimit?.match(/^([\d.]+)/);
    return match ? match[1] : "0";
  })();
  const dailyLimit = parsedDailyLimit;
  const maxPerTx = params.maxPerTx || "0";

  const dailyUsed = 15;
  const dailyProgress = Math.min(dailyUsed / parseInt(dailyLimit || "1", 10), 1);

  const hasValidationError = parseFloat(maxPerTx) > parseFloat(dailyLimit);

  const hasQrPayload = !!params.qrPayload;

  function handleCopyAddress() {
    if (!params.wardAddress) return;
    Clipboard.setString(params.wardAddress);
    toast("Address copied");
  }

  function handleCopyInviteJson() {
    if (!params.qrPayload) return;
    Clipboard.setString(params.qrPayload);
    toast("Invite JSON copied");
  }

  function handleToggleFreeze() {
    setFrozen((prev) => !prev);
  }

  function handleSaveLimits() {
    Alert.alert("Limits Saved", "Spending limits have been updated successfully.");
  }

  function handleRemoveWard() {
    Alert.alert(
      "Remove Ward",
      `Are you sure you want to remove "${params.wardName}"? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            navigation.goBack();
          },
        },
      ],
    );
  }

  return (
    <View style={styles.container}>
      {/* Nav Bar */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerIconBtn}
          onPress={() => navigation.goBack()}
        >
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{params.wardName}</Text>
        <View style={styles.headerIconSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Status Card */}
        <View style={styles.card}>
          <View style={styles.statusRow}>
            <View style={styles.statusLeft}>
              <View style={styles.shieldCircle}>
                <Shield size={20} color={colors.primary} />
              </View>
              <View style={styles.statusInfo}>
                <Text style={styles.wardName}>{params.wardName}</Text>
                <View style={styles.statusBadge}>
                  <View
                    style={[
                      styles.statusDot,
                      { backgroundColor: frozen ? colors.error : colors.success },
                    ]}
                  />
                  <Text
                    style={[
                      styles.statusText,
                      { color: frozen ? colors.error : colors.success },
                    ]}
                  >
                    {frozen ? "Frozen" : "Active"}
                  </Text>
                </View>
              </View>
            </View>
            <View style={styles.freezeControl}>
              <Text style={styles.freezeLabel}>Freeze</Text>
              <TouchableOpacity
                style={[
                  styles.toggleTrack,
                  frozen ? styles.toggleTrackOn : styles.toggleTrackOff,
                ]}
                onPress={handleToggleFreeze}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.toggleKnob,
                    frozen ? styles.toggleKnobOn : styles.toggleKnobOff,
                  ]}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Address Row */}
          <View style={styles.addressRow}>
            <View>
              <Text style={styles.addressLabel}>WARD ADDRESS</Text>
              <Text style={styles.addressValue}>
                {shortenAddress(params.wardAddress)}
              </Text>
            </View>
            <TouchableOpacity onPress={handleCopyAddress} activeOpacity={0.7}>
              <Text style={styles.copyLink}>Copy</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Ward Invite Card */}
        <View style={styles.card}>
          <View style={styles.inviteHeader}>
            <QrCode size={20} color={colors.primary} />
            <Text style={styles.inviteTitle}>Ward Invite</Text>
          </View>
          {hasQrPayload ? (
            <>
              <TouchableOpacity
                style={styles.inviteToggleBtn}
                onPress={() => setQrExpanded((prev) => !prev)}
                activeOpacity={0.7}
              >
                {qrExpanded ? (
                  <ChevronUp size={16} color={colors.textSecondary} />
                ) : (
                  <ChevronDown size={16} color={colors.textSecondary} />
                )}
                <Text style={styles.inviteToggleText}>
                  {qrExpanded ? "Hide QR Code" : "Show QR Code"}
                </Text>
              </TouchableOpacity>
              {qrExpanded && (
                <View style={styles.qrWrapper}>
                  <QRCode
                    value={params.qrPayload!}
                    size={180}
                    backgroundColor="#FFFFFF"
                    color="#000000"
                  />
                </View>
              )}
              <TouchableOpacity
                style={styles.copyInviteBtn}
                onPress={handleCopyInviteJson}
                activeOpacity={0.7}
              >
                <Copy size={14} color={colors.primary} />
                <Text style={styles.copyInviteBtnText}>Copy Invite JSON</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.inviteUnavailableText}>
              Invite data not available. The ward invite QR was only shown at creation time.
            </Text>
          )}
        </View>

        {/* Spending Limits Card */}
        <View style={styles.card}>
          <View style={styles.limitsHeader}>
            <Gauge size={20} color={colors.primary} />
            <Text style={styles.limitsTitle}>Spending Limits</Text>
          </View>

          {/* Daily Section */}
          <View style={styles.limitSection}>
            <View style={styles.limitRow}>
              <Text style={styles.limitLabel}>Daily Limit</Text>
              <View style={styles.limitPill}>
                <Text style={styles.limitPillText}>{dailyLimit} STRK</Text>
              </View>
            </View>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.round(dailyProgress * 100)}%`,
                    backgroundColor: colors.primary,
                  },
                ]}
              />
            </View>
            <Text style={styles.limitUsed}>{dailyUsed} STRK used today</Text>
          </View>

          {/* Max Per Transaction */}
          <View style={[styles.limitSection, styles.limitSectionDivider]}>
            <View style={styles.limitRow}>
              <Text style={styles.limitLabel}>Max Per Transaction</Text>
              <View style={[styles.limitPill, hasValidationError && { borderColor: colors.error, backgroundColor: "rgba(239, 68, 68, 0.08)" }]}>
                <Text style={[styles.limitPillText, hasValidationError && { color: colors.error }]}>{maxPerTx} STRK</Text>
              </View>
            </View>
            <Text style={styles.limitHelper}>Max a ward can spend in a single transaction</Text>
            {hasValidationError && (
              <Text style={styles.limitError}>
                Max per transaction can't exceed the daily limit ({dailyLimit} STRK)
              </Text>
            )}
          </View>

          {/* Validation Error Banner */}
          {hasValidationError && (
            <View style={styles.errorBanner}>
              <TriangleAlert size={16} color={colors.error} />
              <Text style={styles.errorBannerText}>
                Max per transaction ({maxPerTx} STRK) exceeds the daily limit ({dailyLimit} STRK). Please adjust the limits.
              </Text>
            </View>
          )}

          {/* Save Button */}
          <TouchableOpacity
            style={[styles.saveBtn, hasValidationError && { opacity: 0.4 }]}
            onPress={handleSaveLimits}
            activeOpacity={0.85}
            disabled={hasValidationError}
          >
            <Save size={18} color="#FFFFFF" />
            <Text style={styles.saveBtnText}>Save Limits</Text>
          </TouchableOpacity>
        </View>

        {/* Spacer */}
        <View style={{ flex: 1 }} />

        {/* Danger Zone */}
        <View style={styles.dangerCard}>
          <View style={styles.dangerHeader}>
            <TriangleAlert size={20} color={colors.error} />
            <Text style={styles.dangerTitle}>Danger Zone</Text>
          </View>
          <TouchableOpacity
            style={styles.removeBtn}
            onPress={handleRemoveWard}
            activeOpacity={0.85}
          >
            <Trash2 size={18} color="#FFFFFF" />
            <Text style={styles.removeBtnText}>Remove Ward</Text>
          </TouchableOpacity>
        </View>
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
    height: 48,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 44,
  },
  headerIconBtn: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  headerIconSpacer: {
    width: 24,
    height: 24,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 16,
    fontFamily: typography.primarySemibold,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },

  /* Cards */
  card: {
    borderRadius: borderRadius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },

  /* Status Card */
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  shieldCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#3B82F612",
    borderWidth: 1,
    borderColor: "#3B82F630",
    alignItems: "center",
    justifyContent: "center",
  },
  statusInfo: {
    gap: 4,
  },
  wardName: {
    color: colors.text,
    fontSize: 14,
    fontFamily: typography.primarySemibold,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 10,
    fontFamily: typography.secondary,
  },

  /* Freeze Toggle */
  freezeControl: {
    alignItems: "center",
    gap: 4,
  },
  freezeLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: typography.secondary,
  },
  toggleTrack: {
    width: 40,
    height: 24,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  toggleTrackOff: {
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleTrackOn: {
    backgroundColor: colors.error,
    borderWidth: 1,
    borderColor: colors.error,
  },
  toggleKnob: {
    width: 16,
    height: 16,
  },
  toggleKnobOff: {
    backgroundColor: colors.textMuted,
    alignSelf: "flex-start",
  },
  toggleKnobOn: {
    backgroundColor: "#FFFFFF",
    alignSelf: "flex-end",
  },

  /* Address Row */
  addressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 12,
    paddingTop: 12,
  },
  addressLabel: {
    color: colors.textMuted,
    fontSize: 9,
    fontFamily: typography.secondary,
    letterSpacing: 1,
    marginBottom: 4,
  },
  addressValue: {
    color: colors.textSecondary,
    fontSize: 13,
    fontFamily: typography.primary,
  },
  copyLink: {
    color: colors.primary,
    fontSize: 12,
    fontFamily: typography.primarySemibold,
  },

  /* Ward Invite */
  inviteHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  inviteTitle: {
    color: colors.text,
    fontSize: 15,
    fontFamily: typography.primarySemibold,
  },
  inviteToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: "flex-start",
  },
  inviteToggleText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontFamily: typography.secondary,
  },
  qrWrapper: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginTop: 12,
  },
  copyInviteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    alignSelf: "flex-start",
    marginTop: 12,
  },
  copyInviteBtnText: {
    color: colors.primary,
    fontSize: 13,
    fontFamily: typography.primarySemibold,
  },
  inviteUnavailableText: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: typography.secondary,
    lineHeight: 18,
  },

  /* Spending Limits */
  limitsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  limitsTitle: {
    color: colors.text,
    fontSize: 15,
    fontFamily: typography.primarySemibold,
  },
  limitSection: {
    gap: 8,
  },
  limitSectionDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
    marginTop: 12,
  },
  limitRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  limitLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontFamily: typography.secondary,
  },
  limitPill: {
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  limitPillText: {
    color: colors.text,
    fontSize: 13,
    fontFamily: typography.primarySemibold,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.inputBg,
    overflow: "hidden",
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
  },
  limitUsed: {
    color: colors.textMuted,
    fontSize: 10,
    fontFamily: typography.secondary,
  },
  limitHelper: {
    fontSize: 10,
    color: colors.textMuted,
    fontFamily: typography.secondary,
    marginTop: 2,
  },
  limitError: {
    fontSize: 10,
    color: colors.error,
    fontFamily: typography.secondary,
    marginTop: 4,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.2)",
    borderRadius: borderRadius.sm,
    padding: 10,
    marginTop: 12,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 11,
    color: colors.error,
    fontFamily: typography.secondary,
    lineHeight: 16,
  },
  saveBtn: {
    height: 44,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
  },
  saveBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: typography.primarySemibold,
  },

  /* Danger Zone */
  dangerCard: {
    borderRadius: borderRadius.lg,
    backgroundColor: "#EF444408",
    borderWidth: 1,
    borderColor: "#EF444430",
    padding: spacing.md,
    gap: 12,
  },
  dangerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dangerTitle: {
    color: colors.error,
    fontSize: 15,
    fontFamily: typography.primarySemibold,
  },
  removeBtn: {
    height: 44,
    borderRadius: borderRadius.md,
    backgroundColor: colors.error,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  removeBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: typography.primarySemibold,
  },
});
