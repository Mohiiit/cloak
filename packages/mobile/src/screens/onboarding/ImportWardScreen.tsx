/**
 * ImportWardScreen — Two-tab screen for importing a ward account via QR scan or manual JSON entry.
 */
import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Animated,
  Keyboard,
  Linking,
  SafeAreaView,
  ScrollView,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Clipboard from "@react-native-clipboard/clipboard";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCodeScanner,
} from "react-native-vision-camera";
import {
  ArrowLeft,
  Download,
  ClipboardPaste,
  Info,
  Camera as CameraIcon,
  AlertCircle,
} from "lucide-react-native";

import { useWallet } from "../../lib/WalletContext";
import {
  colors,
  typography,
  fontSize,
} from "../../lib/theme";
import { testIDs, testProps } from "../../testing/testIDs";
import { useThemedModal } from "../../components/ThemedModal";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WardInvitePayload = {
  type: string;
  wardAddress: string;
  wardPrivateKey: string;
  guardianAddress?: string;
  network?: string;
  pseudoName?: string;
  initialFundingAmountWei?: string;
  dailyLimit?: string;
  maxPerTx?: string;
  isFrozen?: boolean;
};

type TabId = "scan" | "manual";

// ---------------------------------------------------------------------------
// Ward invite parsing helpers (shared with HomeScreen)
// ---------------------------------------------------------------------------

function parseWardInvitePayload(raw: string): WardInvitePayload {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Invalid ward invite format");
  const candidates: string[] = [trimmed];
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace)
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  )
    candidates.push(trimmed.slice(1, -1));
  const seen = new Set<string>();
  for (const candidate of candidates) {
    let value = candidate.trim();
    for (let attempt = 0; attempt < 4 && value.length > 0; attempt += 1) {
      if (seen.has(value)) break;
      seen.add(value);
      try {
        return JSON.parse(value) as WardInvitePayload;
      } catch {
        if (!value.endsWith("}")) break;
        value = value.slice(0, -1).trimEnd();
      }
    }
  }
  throw new Error("Invalid ward invite format");
}

function validateWardInvitePayload(invite: WardInvitePayload): void {
  if (invite.type !== "cloak_ward_invite") {
    throw new Error("Not a cloak ward invite payload");
  }
  if (!invite.wardAddress || !invite.wardPrivateKey) {
    throw new Error("Invite is missing ward address or private key");
  }
  if (
    !invite.wardAddress.startsWith("0x") ||
    !invite.wardPrivateKey.startsWith("0x")
  ) {
    throw new Error("Invite contains invalid address or private key format");
  }
}

function buildWardInfoCacheFromInvite(invite: WardInvitePayload) {
  return {
    guardianAddress: invite.guardianAddress || "",
    guardianPublicKey: "0x0",
    isGuardian2faEnabled: false,
    is2faEnabled: false,
    isFrozen: invite.isFrozen === true,
    pseudoName: invite.pseudoName?.trim() || "",
    initialFundingAmountWei: invite.initialFundingAmountWei || "",
    spendingLimitPerTx: invite.maxPerTx || "0",
    dailyLimit: invite.dailyLimit || "0",
    maxPerTx: invite.maxPerTx || "0",
    dailySpent: "0",
    requireGuardianForAll: true,
    wardType: "imported",
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ImportWardScreen() {
  const navigation = useNavigation();
  const wallet = useWallet();
  const modal = useThemedModal();

  const [activeTab, setActiveTab] = useState<TabId>("scan");
  const [wardInviteJson, setWardInviteJson] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  // -----------------------------------------------------------------------
  // Ward import core logic
  // -----------------------------------------------------------------------

  const importWardAccountFromPayload = useCallback(
    async (payloadRaw: string) => {
      const invite = parseWardInvitePayload(payloadRaw);
      validateWardInvitePayload(invite);
      await AsyncStorage.setItem("cloak_is_ward", "true");
      if (invite.guardianAddress) {
        await AsyncStorage.setItem(
          "cloak_guardian_address",
          invite.guardianAddress,
        );
      }
      await AsyncStorage.setItem(
        "cloak_ward_info_cache",
        JSON.stringify(buildWardInfoCacheFromInvite(invite)),
      );
      await wallet.importWallet(invite.wardPrivateKey, invite.wardAddress);
    },
    [wallet],
  );

  const importWardAccount = useCallback(
    async (payloadRaw: string, source: "paste" | "scan") => {
      setIsImporting(true);
      try {
        await importWardAccountFromPayload(payloadRaw);
        setWardInviteJson("");
        modal.showSuccess(
          "Ward Imported",
          source === "scan"
            ? "Ward invite QR successfully imported."
            : "Ward account is now managed by a guardian.",
        );
      } catch (e: any) {
        modal.showError(
          "Import Failed",
          e?.message || "Failed to import ward invite.",
        );
      } finally {
        setIsImporting(false);
      }
    },
    [importWardAccountFromPayload, modal],
  );

  // -----------------------------------------------------------------------
  // QR scan result handler
  // -----------------------------------------------------------------------

  const handleScanResult = useCallback(
    async (data: string) => {
      // Directly import — on success navigate away, on fail show error
      setIsImporting(true);
      setActiveTab("manual");
      setWardInviteJson(data);
      try {
        await importWardAccountFromPayload(data);
        // Success — wallet context will update, navigate to home
        navigation.getParent?.()?.reset?.({
          index: 0,
          routes: [{ name: "AppTabs" }],
        }) || navigation.goBack();
      } catch (e: any) {
        modal.showError(
          "Import Failed",
          e?.message || "Failed to import ward invite.",
        );
      } finally {
        setIsImporting(false);
      }
    },
    [importWardAccountFromPayload, navigation, modal],
  );

  // -----------------------------------------------------------------------
  // Clipboard paste handler
  // -----------------------------------------------------------------------

  const handlePaste = useCallback(async () => {
    try {
      const text = await Clipboard.getString();
      if (text?.trim()) {
        setWardInviteJson(text.trim());
      }
    } catch {
      // Clipboard access denied — ignore
    }
  }, []);

  // -----------------------------------------------------------------------
  // Submit handler (manual tab)
  // -----------------------------------------------------------------------

  const handleSubmit = useCallback(async () => {
    if (!wardInviteJson.trim() || isImporting) return;
    await importWardAccount(wardInviteJson, "paste");
  }, [wardInviteJson, isImporting, importWardAccount]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const canSubmit = wardInviteJson.trim().length > 0 && !isImporting;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            {...testProps(testIDs.onboarding.importWardBack)}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <ArrowLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Import Ward</Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Scrollable content */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Description */}
          <Text style={styles.description}>
            Paste the ward invite JSON you received from the ward creator.
          </Text>

          {/* Tab toggle */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              {...testProps(testIDs.onboarding.importWardScan)}
              style={[
                styles.tab,
                styles.tabLeft,
                activeTab === "scan" && styles.tabActive,
              ]}
              onPress={() => setActiveTab("scan")}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === "scan" && styles.tabTextActive,
                ]}
              >
                Scan QR
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tab,
                styles.tabRight,
                activeTab === "manual" && styles.tabActive,
              ]}
              onPress={() => setActiveTab("manual")}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === "manual" && styles.tabTextActive,
                ]}
              >
                Manual
              </Text>
            </TouchableOpacity>
          </View>

          {/* Tab content */}
          {activeTab === "scan" ? (
            <ScanTabContent
              onScanResult={handleScanResult}
              isImporting={isImporting}
            />
          ) : (
            <ManualTabContent
              wardInviteJson={wardInviteJson}
              onChangeText={setWardInviteJson}
              onPaste={handlePaste}
              canSubmit={canSubmit}
              isImporting={isImporting}
              onSubmit={handleSubmit}
            />
          )}

          {/* Import button (shown for scan tab too, in case a scan auto-imports this is a fallback) */}
          {activeTab === "scan" && (
            <TouchableOpacity
              {...testProps(testIDs.onboarding.importWardSubmit)}
              style={[styles.importButton, isImporting && styles.importButtonDisabled]}
              disabled={isImporting}
              activeOpacity={0.7}
            >
              {isImporting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Download size={18} color="#FFFFFF" />
                  <Text style={styles.importButtonText}>Import Ward</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </ScrollView>

        {modal.ModalComponent}
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Scan tab content
// ---------------------------------------------------------------------------

function ScanTabContent({
  onScanResult,
  isImporting,
}: {
  onScanResult: (data: string) => void;
  isImporting: boolean;
}) {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");
  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const hasScannedRef = useRef(false);
  const [scanError, setScanError] = useState(false);

  // Request camera permission on mount
  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission, requestPermission]);

  // Animated scan line
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineAnim, {
          toValue: 1,
          duration: 2500,
          useNativeDriver: true,
        }),
        Animated.timing(scanLineAnim, {
          toValue: 0,
          duration: 2500,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [scanLineAnim]);

  const scanLineTranslateY = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [40, 200],
  });

  const codeScanner = useCodeScanner({
    codeTypes: ["qr"],
    onCodeScanned: (codes) => {
      if (hasScannedRef.current || isImporting) return;
      const value = codes[0]?.value;
      if (value) {
        hasScannedRef.current = true;
        const trimmed = value.trim();
        // Quick format check — should be JSON starting with { or base64 starting with ey
        if (!trimmed.startsWith("{") && !trimmed.startsWith("ey")) {
          setScanError(true);
          setTimeout(() => {
            setScanError(false);
            hasScannedRef.current = false;
          }, 3000);
          return;
        }
        onScanResult(trimmed);
      }
    },
  });

  // Permission denied
  if (hasPermission === false) {
    return (
      <View style={styles.scanArea}>
        <View style={styles.scanStatusWrap}>
          <CameraIcon size={32} color={colors.textMuted} />
          <Text style={styles.scanStatusText}>
            Camera permission denied.{"\n"}Use the Manual tab to paste the invite code.
          </Text>
          <TouchableOpacity
            style={styles.openSettingsButton}
            onPress={() => Linking.openSettings()}
          >
            <Text style={styles.openSettingsText}>Open Settings</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // No camera device
  if (!device) {
    return (
      <View style={styles.scanArea}>
        <View style={styles.scanStatusWrap}>
          <ActivityIndicator color={colors.secondary} size="small" />
          <Text style={styles.scanStatusText}>Initializing camera...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.scanArea}>
      {/* Native camera */}
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={!isImporting && !hasScannedRef.current}
        codeScanner={codeScanner}
      />

      {/* Corner brackets */}
      <View style={[styles.corner, styles.cornerTL]} pointerEvents="none">
        <View style={[styles.cornerH, styles.cornerHorizontal, scanError && { backgroundColor: colors.error }]} />
        <View style={[styles.cornerV, styles.cornerVertical, scanError && { backgroundColor: colors.error }]} />
      </View>
      <View style={[styles.corner, styles.cornerTR]} pointerEvents="none">
        <View style={[styles.cornerH, styles.cornerHorizontal, { alignSelf: "flex-end" }, scanError && { backgroundColor: colors.error }]} />
        <View style={[styles.cornerV, styles.cornerVertical, { alignSelf: "flex-end" }, scanError && { backgroundColor: colors.error }]} />
      </View>
      <View style={[styles.corner, styles.cornerBL]} pointerEvents="none">
        <View style={[styles.cornerV, styles.cornerVertical, scanError && { backgroundColor: colors.error }]} />
        <View style={[styles.cornerH, styles.cornerHorizontal, scanError && { backgroundColor: colors.error }]} />
      </View>
      <View style={[styles.corner, styles.cornerBR]} pointerEvents="none">
        <View style={[styles.cornerV, styles.cornerVertical, { alignSelf: "flex-end" }, scanError && { backgroundColor: colors.error }]} />
        <View style={[styles.cornerH, styles.cornerHorizontal, { alignSelf: "flex-end" }, scanError && { backgroundColor: colors.error }]} />
      </View>

      {/* Animated scan line */}
      <Animated.View
        style={[
          styles.scanLine,
          scanError && { backgroundColor: colors.error },
          { transform: [{ translateY: scanLineTranslateY }] },
        ]}
        pointerEvents="none"
      />

      {/* Hint text */}
      <View style={styles.scanHintWrap} pointerEvents="none">
        <Text style={styles.scanHint}>Point camera at ward QR code</Text>
      </View>

      {/* Error toast */}
      {scanError && (
        <View style={styles.scanErrorToast}>
          <AlertCircle size={18} color="#FFFFFF" />
          <View style={styles.scanErrorToastTextGroup}>
            <Text style={styles.scanErrorToastTitle}>Invalid Invite Code</Text>
            <Text style={styles.scanErrorToastDesc}>
              Ask your guardian to share a new invite
            </Text>
          </View>
        </View>
      )}

      {/* Loading overlay */}
      {isImporting && (
        <View style={styles.scanLoadingOverlay}>
          <ActivityIndicator color={colors.secondary} size="large" />
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Manual tab content
// ---------------------------------------------------------------------------

function ManualTabContent({
  wardInviteJson,
  onChangeText,
  onPaste,
  canSubmit,
  isImporting,
  onSubmit,
}: {
  wardInviteJson: string;
  onChangeText: (text: string) => void;
  onPaste: () => void;
  canSubmit: boolean;
  isImporting: boolean;
  onSubmit: () => void;
}) {
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  return (
    <>
      {/* JSON field */}
      <View style={styles.jsonField}>
        {/* Label row */}
        <View style={styles.jsonLabelRow}>
          <Text style={styles.jsonLabel}>Ward Invite Code</Text>
          <TouchableOpacity
            {...testProps(testIDs.onboarding.importWardPaste)}
            onPress={onPaste}
            style={styles.pasteButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ClipboardPaste size={14} color={colors.secondary} />
            <Text style={styles.pasteButtonText}>Paste</Text>
          </TouchableOpacity>
        </View>

        {/* Hint — hide when keyboard is up */}
        {!keyboardVisible && (
          <Text style={styles.jsonHint}>
            {'A JSON string starting with {"type":"cloak_ward_invite",...}'}
          </Text>
        )}

        {/* Textarea — shorter when keyboard is up */}
        <TextInput
          {...testProps(testIDs.onboarding.importWardJsonInput)}
          style={[styles.jsonTextarea, keyboardVisible && styles.jsonTextareaCompact]}
          placeholder='{"type":"cloak_ward_invite","wardAddress":"0x...","wardPrivateKey":"0x..."}'
          placeholderTextColor={colors.textMuted}
          value={wardInviteJson}
          onChangeText={onChangeText}
          multiline
          textAlignVertical="top"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
          editable={!isImporting}
        />
      </View>

      {/* Info box — hide when keyboard is up */}
      {!keyboardVisible && (
        <View style={styles.infoBox}>
          <View style={styles.infoHeader}>
            <Info size={16} color={colors.primary} />
            <Text style={styles.infoHeaderText}>How to get this code</Text>
          </View>
          <View style={styles.infoBullet}>
            <Text style={styles.bulletDot}>{"\u2022"}</Text>
            <Text style={styles.bulletText}>
              Ask the ward creator to share the QR code or JSON from their Ward
              Created screen
            </Text>
          </View>
          <View style={styles.infoBullet}>
            <Text style={styles.bulletDot}>{"\u2022"}</Text>
            <Text style={styles.bulletText}>
              Copy the full JSON and paste it here — all fields are included
              automatically
            </Text>
          </View>
        </View>
      )}

      {/* Import button */}
      <TouchableOpacity
        {...testProps(testIDs.onboarding.importWardSubmit)}
        style={[
          styles.importButton,
          !canSubmit && styles.importButtonDisabled,
        ]}
        disabled={!canSubmit}
        onPress={onSubmit}
        activeOpacity={0.7}
      >
        {isImporting ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <>
            <Download size={18} color="#FFFFFF" />
            <Text style={styles.importButtonText}>Import Ward</Text>
          </>
        )}
      </TouchableOpacity>
    </>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const CORNER_SIZE = 28;
const CORNER_THICKNESS = 3;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 56,
    paddingHorizontal: 20,
    marginTop: 44,
  },
  headerTitle: {
    fontFamily: typography.primarySemibold,
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  headerSpacer: {
    width: 24,
    height: 24,
  },

  // Scrollable content
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    gap: 20,
    paddingBottom: 32,
  },

  // Description
  description: {
    fontFamily: typography.secondary,
    fontSize: fontSize.sm,
    lineHeight: fontSize.sm * 1.5,
    color: colors.textSecondary,
  },

  // Tab toggle
  tabContainer: {
    flexDirection: "row",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    height: 42,
    overflow: "hidden",
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: 42,
    backgroundColor: "transparent",
  },
  tabLeft: {
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
  },
  tabRight: {
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
  },
  tabActive: {
    backgroundColor: colors.secondary,
  },
  tabText: {
    fontFamily: typography.secondarySemibold,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: "#FFFFFF",
  },

  // Scan area
  scanArea: {
    height: 280,
    borderRadius: 16,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    position: "relative",
  },

  // Corner brackets
  corner: {
    position: "absolute",
    width: CORNER_SIZE,
    height: CORNER_SIZE,
  },
  cornerTL: {
    top: 20,
    left: 20,
  },
  cornerTR: {
    top: 20,
    right: 20,
  },
  cornerBL: {
    bottom: 20,
    left: 20,
  },
  cornerBR: {
    bottom: 20,
    right: 20,
  },
  cornerH: {
    width: CORNER_SIZE,
    height: CORNER_THICKNESS,
    backgroundColor: colors.secondary,
    borderRadius: 1,
  },
  cornerHorizontal: {},
  cornerV: {
    width: CORNER_THICKNESS,
    height: CORNER_SIZE,
    backgroundColor: colors.secondary,
    borderRadius: 1,
  },
  cornerVertical: {},

  // (scan icon removed — animated line replaces it)

  // Animated scan line
  scanLine: {
    position: "absolute",
    left: 20,
    right: 20,
    top: 0,
    height: 2,
    backgroundColor: colors.secondary,
    opacity: 0.7,
    borderRadius: 1,
  },
  // Camera status
  scanStatusWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 23, 42, 0.85)",
    gap: 12,
    paddingHorizontal: 32,
  },
  scanStatusText: {
    fontFamily: typography.secondary,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 13 * 1.5,
  },
  openSettingsButton: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.secondary,
  },
  openSettingsText: {
    fontFamily: typography.secondarySemibold,
    fontSize: 13,
    color: "#FFFFFF",
  },

  // Scan hint
  scanHintWrap: {
    position: "absolute",
    bottom: 20,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  scanHint: {
    fontFamily: typography.secondary,
    fontSize: 12,
    color: colors.textMuted,
  },

  // Scan error toast
  scanErrorToast: {
    position: "absolute",
    bottom: 16,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(239, 68, 68, 0.9)",
    borderRadius: 12,
    padding: 14,
  },
  scanErrorToastTextGroup: {
    flex: 1,
    gap: 2,
  },
  scanErrorToastTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
    fontFamily: typography.primarySemibold,
  },
  scanErrorToastDesc: {
    fontSize: 12,
    color: "rgba(255,255,255,0.8)",
    fontFamily: typography.secondary,
  },

  // Scan loading overlay
  scanLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    alignItems: "center",
    justifyContent: "center",
  },

  // JSON field
  jsonField: {
    gap: 8,
  },
  jsonLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  jsonLabel: {
    fontFamily: typography.secondarySemibold,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  pasteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  pasteButtonText: {
    fontFamily: typography.secondary,
    fontSize: fontSize.xs,
    color: colors.secondary,
  },
  jsonHint: {
    fontFamily: typography.secondary,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  jsonTextarea: {
    height: 180,
    borderRadius: 10,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    fontFamily: typography.secondary,
    fontSize: fontSize.sm,
    color: colors.text,
    textAlignVertical: "top",
  },
  jsonTextareaCompact: {
    height: 100,
  },

  // Info box
  infoBox: {
    borderRadius: 12,
    backgroundColor: "#3B82F610",
    borderWidth: 1,
    borderColor: "#3B82F630",
    padding: 12,
    paddingHorizontal: 14,
    gap: 8,
  },
  infoHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  infoHeaderText: {
    fontFamily: typography.secondarySemibold,
    fontSize: fontSize.sm,
    color: colors.primary,
  },
  infoBullet: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  bulletDot: {
    fontFamily: typography.secondary,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: fontSize.sm * 1.5,
  },
  bulletText: {
    flex: 1,
    fontFamily: typography.secondary,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: fontSize.sm * 1.5,
  },

  // Import button
  importButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 52,
    borderRadius: 12,
    backgroundColor: colors.secondary,
    gap: 8,
  },
  importButtonDisabled: {
    opacity: 0.4,
  },
  importButtonText: {
    fontFamily: typography.primarySemibold,
    fontSize: fontSize.md,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
