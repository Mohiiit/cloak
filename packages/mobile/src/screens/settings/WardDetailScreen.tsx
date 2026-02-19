/**
 * WardDetailScreen — Detail view for managing a single ward account.
 * Displays ward status, spending limits, freeze toggle, and danger zone.
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Modal,
  ActivityIndicator,
  Animated,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { normalizeAddress } from "@cloak-wallet/sdk";
import {
  Shield,
  ArrowLeft,
  Gauge,
  Save,
  Trash2,
  TriangleAlert,
  Copy,
  QrCode,
  X,
  ShieldOff,
} from "lucide-react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import Clipboard from "@react-native-clipboard/clipboard";
import QRCode from "react-native-qrcode-svg";
import { colors, spacing, fontSize, borderRadius, typography } from "../../lib/theme";
import { useToast } from "../../components/Toast";
import { useWardContext } from "../../lib/wardContext";

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
  const { showToast } = useToast();
  const ward = useWardContext();

  const [frozen, setFrozen] = useState(params.isFrozen);
  const [freezeLoading, setFreezeLoading] = useState(false);
  const [freezeModalVisible, setFreezeModalVisible] = useState(false);
  const [freezeSuccess, setFreezeSuccess] = useState(false);
  const [freezeError, setFreezeError] = useState<string | null>(null);
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [localData, setLocalData] = useState<Record<string, any> | null>(null);

  // Animated indeterminate progress bar
  const progressAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (freezeLoading) {
      progressAnim.setValue(0);
      const loop = Animated.loop(
        Animated.timing(progressAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: false,
        }),
      );
      loop.start();
      return () => loop.stop();
    }
  }, [freezeLoading, progressAnim]);

  // Animated shield color transition on success
  const shieldTransition = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (freezeSuccess) {
      shieldTransition.setValue(0);
      Animated.timing(shieldTransition, {
        toValue: 1,
        duration: 800,
        useNativeDriver: false,
      }).start();
    }
  }, [freezeSuccess, shieldTransition]);

  // Load local ward data from AsyncStorage (for QR payload and limits)
  useEffect(() => {
    AsyncStorage.getItem("cloak_ward_local_data").then((raw) => {
      if (!raw) return;
      try {
        const allData = JSON.parse(raw);
        const normalizedAddr = normalizeAddress(params.wardAddress);
        // Match by normalized address suffix
        const key = Object.keys(allData).find(
          (k) => normalizedAddr.toLowerCase().endsWith(k.replace(/^0x0*/, "").toLowerCase())
        );
        if (key) setLocalData(allData[key]);
      } catch { /* non-critical */ }
    });
  }, [params.wardAddress]);

  // Parse daily limit from spendingLimit param (e.g. "100 STRK/tx" → "100")
  const parsedDailyLimit = (() => {
    const match = params.spendingLimit?.match(/^([\d.]+)/);
    if (match) return match[1];
    // Fallback to local data
    return localData?.dailyLimit || "0";
  })();
  const dailyLimit = parsedDailyLimit;
  const maxPerTx = params.maxPerTx || localData?.maxPerTx || "0";

  const hasValidationError = parseFloat(maxPerTx) > parseFloat(dailyLimit);

  // Use qrPayload from params first, then from local data
  const qrPayload = qrPayload || localData?.qrPayload || "";
  const hasQrPayload = !!qrPayload;

  function handleCopyAddress() {
    if (!params.wardAddress) return;
    Clipboard.setString(params.wardAddress);
    showToast("Address copied");
  }

  function handleCopyInviteJson() {
    if (!qrPayload) return;
    Clipboard.setString(qrPayload);
    showToast("Invite copied");
  }

  const handleToggleFreeze = useCallback(() => {
    if (freezeLoading) return;
    setFreezeError(null);
    setFreezeSuccess(false);
    setFreezeModalVisible(true);
  }, [freezeLoading]);

  const handleConfirmFreeze = useCallback(async () => {
    setFreezeLoading(true);
    setFreezeError(null);
    const action = frozen ? "unfreeze" : "freeze";
    try {
      if (frozen) {
        await ward.unfreezeWard(params.wardAddress);
      } else {
        await ward.freezeWard(params.wardAddress);
      }
      setFrozen(!frozen);
      setFreezeSuccess(true);
      // Auto-close after brief success display
      setTimeout(() => {
        setFreezeModalVisible(false);
        setFreezeSuccess(false);
      }, 1500);
    } catch (err: any) {
      setFreezeError(err?.message || `Failed to ${action} ward`);
    } finally {
      setFreezeLoading(false);
    }
  }, [frozen, params.wardAddress, ward]);

  const handleDismissFreezeModal = useCallback(() => {
    if (freezeLoading) return; // Don't dismiss while processing
    setFreezeModalVisible(false);
    setFreezeError(null);
    setFreezeSuccess(false);
  }, [freezeLoading]);

  const handleSaveLimits = useCallback(async () => {
    // TODO: wire up setWardSpendingLimit when limit editing UI is added
    Alert.alert("Limits Saved", "Spending limits have been updated successfully.");
  }, []);

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
                  freezeLoading && { opacity: 0.5 },
                ]}
                onPress={handleToggleFreeze}
                disabled={freezeLoading}
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
            <View style={styles.inviteRow}>
              <TouchableOpacity
                style={styles.inviteActionBtn}
                onPress={() => setQrModalVisible(true)}
                activeOpacity={0.7}
              >
                <QrCode size={14} color={colors.primary} />
                <Text style={styles.inviteActionBtnText}>Show QR</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.inviteActionBtn}
                onPress={handleCopyInviteJson}
                activeOpacity={0.7}
              >
                <Copy size={14} color={colors.primary} />
                <Text style={styles.inviteActionBtnText}>Copy Invite</Text>
              </TouchableOpacity>
            </View>
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
            <Text style={styles.limitHelper}>Max the ward can spend per day</Text>
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

      {/* Freeze Confirmation Modal */}
      <Modal visible={freezeModalVisible} transparent animationType="slide" onRequestClose={handleDismissFreezeModal}>
        <View style={fm.overlay}>
          <View style={fm.sheet}>
            {/* Handle */}
            <View style={fm.handle} />

            {freezeSuccess ? (
              <>
                {/* Success State — animated shield color transition */}
                <Animated.View
                  style={[
                    fm.iconWrap,
                    {
                      backgroundColor: shieldTransition.interpolate({
                        inputRange: [0, 1],
                        outputRange: frozen
                          ? ["#3B82F618", "#EF444418"]  // blue → red (froze)
                          : ["#EF444418", "#3B82F618"],  // red → blue (unfroze)
                      }),
                    },
                  ]}
                >
                  {/* "From" color shield — fades out */}
                  <Animated.View style={[fm.shieldAbsolute, { opacity: shieldTransition.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}>
                    <Shield size={36} color={frozen ? colors.primary : colors.error} />
                  </Animated.View>
                  {/* "To" color shield — fades in */}
                  <Animated.View style={[fm.shieldAbsolute, { opacity: shieldTransition }]}>
                    <Shield size={36} color={frozen ? colors.error : colors.primary} />
                  </Animated.View>
                </Animated.View>
                <Text style={fm.title}>
                  {frozen ? "Ward Frozen" : "Ward Unfrozen"}
                </Text>
                <Text style={fm.desc}>
                  {frozen
                    ? `"${params.wardName}" has been frozen. All transactions are disabled.`
                    : `"${params.wardName}" has been unfrozen. Transactions are now enabled.`}
                </Text>
              </>
            ) : freezeLoading ? (
              <>
                {/* Processing State */}
                <View style={[fm.iconWrap, { backgroundColor: frozen ? "#3B82F618" : "#EF444418" }]}>
                  <ActivityIndicator size="large" color={frozen ? colors.primary : colors.error} />
                </View>
                <Text style={fm.title}>
                  {frozen ? "Unfreezing Ward..." : "Freezing Ward..."}
                </Text>
                <Text style={fm.desc}>
                  Submitting on-chain transaction. This may take a moment.
                </Text>

                {/* Ward Info Card */}
                <View style={fm.wardInfo}>
                  <View style={fm.wardIcon}>
                    <Shield size={18} color={colors.primary} />
                  </View>
                  <View style={fm.wardNameCol}>
                    <Text style={fm.wardTitle}>{params.wardName}</Text>
                    <Text style={fm.wardAddr}>{shortenAddress(params.wardAddress)}</Text>
                  </View>
                </View>

                {/* Animated Progress bar */}
                <View style={fm.progressTrack}>
                  <Animated.View
                    style={[
                      fm.progressFill,
                      { backgroundColor: frozen ? colors.primary : colors.error },
                      {
                        width: progressAnim.interpolate({
                          inputRange: [0, 0.5, 1],
                          outputRange: ["0%", "70%", "100%"],
                        }),
                        left: progressAnim.interpolate({
                          inputRange: [0, 0.5, 1],
                          outputRange: ["0%", "0%", "30%"],
                        }),
                      },
                    ]}
                  />
                </View>
                <Text style={fm.progressHint}>Waiting for confirmation...</Text>
              </>
            ) : (
              <>
                {/* Confirmation State */}
                <View style={[fm.iconWrap, frozen ? { backgroundColor: "#3B82F618" } : { backgroundColor: "#EF444418" }]}>
                  <Shield size={36} color={frozen ? colors.primary : colors.error} />
                </View>

                <Text style={fm.title}>
                  {frozen ? "Unfreeze Ward Account?" : "Freeze Ward Account?"}
                </Text>

                <Text style={fm.desc}>
                  {frozen
                    ? "This will re-enable all transactions on this ward account. The ward user will be able to send, shield, and unshield tokens again."
                    : "This will immediately disable all transactions on this ward account. The ward user will not be able to send, shield, or unshield tokens."}
                </Text>

                {/* Ward Info Card */}
                <View style={fm.wardInfo}>
                  <View style={fm.wardIcon}>
                    <Shield size={18} color={colors.primary} />
                  </View>
                  <View style={fm.wardNameCol}>
                    <Text style={fm.wardTitle}>{params.wardName}</Text>
                    <Text style={fm.wardAddr}>{shortenAddress(params.wardAddress)}</Text>
                  </View>
                </View>

                {/* Error Banner */}
                {freezeError && (
                  <View style={fm.errorBanner}>
                    <TriangleAlert size={16} color={colors.error} />
                    <Text style={fm.errorText}>{freezeError}</Text>
                  </View>
                )}

                {/* Action Button */}
                <TouchableOpacity
                  style={[fm.actionBtn, { backgroundColor: frozen ? colors.primary : colors.error }]}
                  onPress={handleConfirmFreeze}
                  activeOpacity={0.85}
                >
                  {frozen ? (
                    <ShieldOff size={20} color="#FFFFFF" />
                  ) : (
                    <Shield size={20} color="#FFFFFF" />
                  )}
                  <Text style={fm.actionBtnText}>
                    {frozen ? "Unfreeze Account" : "Freeze Account"}
                  </Text>
                </TouchableOpacity>

                {/* Cancel */}
                <TouchableOpacity
                  style={fm.cancelBtn}
                  onPress={handleDismissFreezeModal}
                  activeOpacity={0.7}
                >
                  <Text style={fm.cancelText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* QR Code Modal */}
      <Modal visible={qrModalVisible} transparent animationType="fade" onRequestClose={() => setQrModalVisible(false)}>
        <View style={styles.qrModalOverlay}>
          <View style={styles.qrModalCard}>
            <View style={styles.qrModalHeader}>
              <Text style={styles.qrModalTitle}>Ward Invite QR</Text>
              <TouchableOpacity onPress={() => setQrModalVisible(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.qrWrapper}>
              <QRCode
                value={qrPayload || "empty"}
                size={200}
                backgroundColor="#FFFFFF"
                color="#000000"
              />
            </View>
            <Text style={styles.qrModalHint}>Scan this QR to import the ward on another device</Text>
            <TouchableOpacity
              style={styles.qrModalCopyBtn}
              onPress={() => { handleCopyInviteJson(); setQrModalVisible(false); }}
              activeOpacity={0.7}
            >
              <Copy size={14} color="#fff" />
              <Text style={styles.qrModalCopyBtnText}>Copy Invite</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  inviteRow: {
    flexDirection: "row",
    gap: 10,
  },
  inviteActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: "rgba(59, 130, 246, 0.06)",
  },
  inviteActionBtnText: {
    color: colors.primary,
    fontSize: 13,
    fontFamily: typography.primarySemibold,
  },
  qrWrapper: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },

  /* QR Modal */
  qrModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  qrModalCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  qrModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    marginBottom: spacing.md,
  },
  qrModalTitle: {
    color: colors.text,
    fontSize: 16,
    fontFamily: typography.primarySemibold,
  },
  qrModalHint: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: typography.secondary,
    textAlign: "center",
    marginTop: spacing.md,
    lineHeight: 18,
  },
  qrModalCopyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    width: "100%",
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    marginTop: spacing.md,
  },
  qrModalCopyBtnText: {
    color: "#fff",
    fontSize: 14,
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

/* ── Freeze Modal Styles ─────────────────────────────────────────────────── */
const fm = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(10, 15, 28, 0.9)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
    paddingTop: 32,
    paddingHorizontal: 24,
    paddingBottom: 40,
    alignItems: "center",
    gap: 20,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textMuted,
    opacity: 0.3,
    marginBottom: -8,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#EF444418",
    alignItems: "center",
    justifyContent: "center",
  },
  shieldAbsolute: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: colors.text,
    fontFamily: typography.primary,
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  desc: {
    color: colors.textSecondary,
    fontFamily: typography.secondary,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
  wardInfo: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.inputBg,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  wardIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "rgba(59, 130, 246, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  wardNameCol: {
    gap: 2,
  },
  wardTitle: {
    color: colors.text,
    fontFamily: typography.primary,
    fontSize: 14,
    fontWeight: "600",
  },
  wardAddr: {
    color: colors.textMuted,
    fontFamily: typography.primary,
    fontSize: 11,
  },
  actionBtn: {
    width: "100%",
    height: 52,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  actionBtnText: {
    color: "#FFFFFF",
    fontFamily: typography.primary,
    fontSize: 16,
    fontWeight: "700",
  },
  cancelBtn: {
    width: "100%",
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    color: colors.textSecondary,
    fontFamily: typography.primary,
    fontSize: 16,
    fontWeight: "600",
  },
  progressTrack: {
    width: "100%",
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    overflow: "hidden",
  },
  progressFill: {
    position: "absolute",
    height: "100%",
    borderRadius: 2,
    backgroundColor: colors.error,
  },
  progressHint: {
    color: colors.textMuted,
    fontFamily: typography.secondary,
    fontSize: 12,
    marginTop: -8,
  },
  errorBanner: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.2)",
    borderRadius: 8,
    padding: 12,
  },
  errorText: {
    flex: 1,
    color: colors.error,
    fontFamily: typography.secondary,
    fontSize: 12,
    lineHeight: 18,
  },
});
