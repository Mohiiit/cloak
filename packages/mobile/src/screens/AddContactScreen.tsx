/**
 * AddContactScreen — Two-tab screen (Scan QR / Manual) for adding contacts.
 * Supports scanning combined contact card QR codes as well as plain address QRs.
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
import { useNavigation, useRoute } from "@react-navigation/native";
import Clipboard from "@react-native-clipboard/clipboard";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCodeScanner,
} from "react-native-vision-camera";
import {
  ArrowLeft,
  ClipboardPaste,
  Camera as CameraIcon,
  AlertCircle,
  UserPlus,
  Check,
} from "lucide-react-native";
import { useContacts } from "../hooks/useContacts";
import { colors, typography, fontSize, borderRadius, spacing } from "../lib/theme";
import { testIDs, testProps } from "../testing/testIDs";
import { useToast } from "../components/Toast";

type TabId = "scan" | "manual";

interface ParsedContact {
  tongoAddress: string;
  starknetAddress?: string;
}

function parseContactQR(raw: string): ParsedContact {
  const trimmed = raw.trim();

  // Try JSON parse first (combined contact card)
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed.type === "cloak-contact" && parsed.tongoAddress) {
      return {
        tongoAddress: parsed.tongoAddress,
        starknetAddress: parsed.starknetAddress,
      };
    }
  } catch {
    // Not JSON — fall through
  }

  // Check if it's a Starknet address (0x...)
  if (trimmed.startsWith("0x") && trimmed.length >= 10) {
    return { tongoAddress: "", starknetAddress: trimmed };
  }

  // Assume it's a Tongo address (base58)
  if (trimmed.length >= 20) {
    return { tongoAddress: trimmed };
  }

  throw new Error("Unrecognized QR code format");
}

export default function AddContactScreen() {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const { addContact } = useContacts();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<TabId>("scan");
  const [nickname, setNickname] = useState("");
  const [tongoAddr, setTongoAddr] = useState("");
  const [starknetAddr, setStarknetAddr] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const nicknameRef = useRef<TextInput>(null);

  // If navigated with pre-scanned contact data
  useEffect(() => {
    const params = route.params as any;
    if (params?.scannedContact) {
      const c = params.scannedContact;
      setTongoAddr(c.tongoAddress || "");
      setStarknetAddr(c.starknetAddress || "");
      setActiveTab("manual");
    }
  }, [route.params]);

  const handleSave = useCallback(async () => {
    const tAddr = tongoAddr.trim();
    const sAddr = starknetAddr.trim();
    if (!tAddr && !sAddr) {
      showToast("At least one address is required", "error");
      return;
    }
    setIsSaving(true);
    try {
      await addContact({
        tongoAddress: tAddr,
        starknetAddress: sAddr || undefined,
        nickname: nickname.trim() || undefined,
        isFavorite: false,
        lastInteraction: Date.now(),
      });
      showToast("Contact saved");
      navigation.goBack();
    } catch (e: any) {
      showToast(e?.message || "Failed to save contact", "error");
    } finally {
      setIsSaving(false);
    }
  }, [tongoAddr, starknetAddr, nickname, addContact, navigation, showToast]);

  const handleScanResult = useCallback(
    (data: string) => {
      try {
        const parsed = parseContactQR(data);
        setTongoAddr(parsed.tongoAddress);
        setStarknetAddr(parsed.starknetAddress || "");
        setActiveTab("manual");
        showToast("Contact scanned — add a nickname");
        // Focus nickname field after tab switch renders
        setTimeout(() => nicknameRef.current?.focus(), 300);
      } catch {
        // Will be handled by scan tab error display
      }
    },
    [showToast],
  );

  const handlePaste = useCallback(async (field: "tongo" | "starknet") => {
    try {
      const text = await Clipboard.getString();
      if (text?.trim()) {
        if (field === "tongo") setTongoAddr(text.trim());
        else setStarknetAddr(text.trim());
      }
    } catch {
      // Clipboard access denied
    }
  }, []);

  const canSave = (tongoAddr.trim() || starknetAddr.trim()) && !isSaving;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <ArrowLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add Contact</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Description */}
          <Text style={styles.description}>
            Scan a contact card QR code or manually enter addresses.
          </Text>

          {/* Tab toggle */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              {...testProps(testIDs.addContact.tabScan)}
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
              {...testProps(testIDs.addContact.tabManual)}
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
                Add Manually
              </Text>
            </TouchableOpacity>
          </View>

          {/* Tab content */}
          {activeTab === "scan" ? (
            <ScanTabContent onScanResult={handleScanResult} />
          ) : (
            <View style={styles.formContainer}>
              {/* Nickname */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Nickname</Text>
                <TextInput
                  ref={nicknameRef}
                  {...testProps(testIDs.addContact.nickname)}
                  style={styles.input}
                  placeholder="e.g. Alice"
                  placeholderTextColor={colors.textMuted}
                  value={nickname}
                  onChangeText={setNickname}
                  autoCapitalize="words"
                />
              </View>

              {/* Tongo Address */}
              <View style={styles.fieldGroup}>
                <View style={styles.fieldLabelRow}>
                  <Text style={styles.fieldLabel}>Tongo Address</Text>
                  <TouchableOpacity
                    onPress={() => handlePaste("tongo")}
                    style={styles.pasteButton}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <ClipboardPaste size={14} color={colors.secondary} />
                    <Text style={styles.pasteButtonText}>Paste</Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  {...testProps(testIDs.addContact.tongoAddress)}
                  style={styles.input}
                  placeholder="Base58 address"
                  placeholderTextColor={colors.textMuted}
                  value={tongoAddr}
                  onChangeText={setTongoAddr}
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  autoComplete="off"
                />
              </View>

              {/* Starknet Address */}
              <View style={styles.fieldGroup}>
                <View style={styles.fieldLabelRow}>
                  <Text style={styles.fieldLabel}>Starknet Address (optional)</Text>
                  <TouchableOpacity
                    onPress={() => handlePaste("starknet")}
                    style={styles.pasteButton}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <ClipboardPaste size={14} color={colors.secondary} />
                    <Text style={styles.pasteButtonText}>Paste</Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  {...testProps(testIDs.addContact.starknetAddress)}
                  style={styles.input}
                  placeholder="0x..."
                  placeholderTextColor={colors.textMuted}
                  value={starknetAddr}
                  onChangeText={setStarknetAddr}
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  autoComplete="off"
                />
              </View>

              {/* Save button */}
              <TouchableOpacity
                {...testProps(testIDs.addContact.submit)}
                style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
                disabled={!canSave}
                onPress={handleSave}
                activeOpacity={0.7}
              >
                {isSaving ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <UserPlus size={18} color="#FFFFFF" />
                    <Text style={styles.saveBtnText}>Save Contact</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Scan tab content
// ---------------------------------------------------------------------------

function ScanTabContent({
  onScanResult,
}: {
  onScanResult: (data: string) => void;
}) {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");
  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const hasScannedRef = useRef(false);
  const [scanError, setScanError] = useState(false);

  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission, requestPermission]);

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
      if (hasScannedRef.current) return;
      const value = codes[0]?.value;
      if (value) {
        hasScannedRef.current = true;
        const trimmed = value.trim();

        // Validate: must be JSON, 0x address, or long base58 string
        const looksValid =
          trimmed.startsWith("{") ||
          trimmed.startsWith("0x") ||
          trimmed.length >= 20;

        if (!looksValid) {
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

  if (hasPermission === false) {
    return (
      <View style={styles.scanArea}>
        <View style={styles.scanStatusWrap}>
          <CameraIcon size={32} color={colors.textMuted} />
          <Text style={styles.scanStatusText}>
            Camera permission denied.{"\n"}Use the Manual tab to enter addresses.
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
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={!hasScannedRef.current}
        codeScanner={codeScanner}
      />

      {/* Corner brackets */}
      <View style={[styles.corner, styles.cornerTL]} pointerEvents="none">
        <View style={[styles.cornerH, scanError && { backgroundColor: colors.error }]} />
        <View style={[styles.cornerV, scanError && { backgroundColor: colors.error }]} />
      </View>
      <View style={[styles.corner, styles.cornerTR]} pointerEvents="none">
        <View style={[styles.cornerH, { alignSelf: "flex-end" }, scanError && { backgroundColor: colors.error }]} />
        <View style={[styles.cornerV, { alignSelf: "flex-end" }, scanError && { backgroundColor: colors.error }]} />
      </View>
      <View style={[styles.corner, styles.cornerBL]} pointerEvents="none">
        <View style={[styles.cornerV, scanError && { backgroundColor: colors.error }]} />
        <View style={[styles.cornerH, scanError && { backgroundColor: colors.error }]} />
      </View>
      <View style={[styles.corner, styles.cornerBR]} pointerEvents="none">
        <View style={[styles.cornerV, { alignSelf: "flex-end" }, scanError && { backgroundColor: colors.error }]} />
        <View style={[styles.cornerH, { alignSelf: "flex-end" }, scanError && { backgroundColor: colors.error }]} />
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
        <Text style={styles.scanHint}>Point camera at contact QR code</Text>
      </View>

      {/* Error toast */}
      {scanError && (
        <View style={styles.scanErrorToast}>
          <AlertCircle size={18} color="#FFFFFF" />
          <View style={styles.scanErrorToastTextGroup}>
            <Text style={styles.scanErrorToastTitle}>Invalid QR Code</Text>
            <Text style={styles.scanErrorToastDesc}>
              Not a recognized contact or address format
            </Text>
          </View>
        </View>
      )}
    </View>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 56,
    paddingHorizontal: 20,
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
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    gap: 20,
    paddingBottom: 32,
  },
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
  corner: {
    position: "absolute",
    width: CORNER_SIZE,
    height: CORNER_SIZE,
  },
  cornerTL: { top: 20, left: 20 },
  cornerTR: { top: 20, right: 20 },
  cornerBL: { bottom: 20, left: 20 },
  cornerBR: { bottom: 20, right: 20 },
  cornerH: {
    width: CORNER_SIZE,
    height: CORNER_THICKNESS,
    backgroundColor: colors.secondary,
    borderRadius: 1,
  },
  cornerV: {
    width: CORNER_THICKNESS,
    height: CORNER_SIZE,
    backgroundColor: colors.secondary,
    borderRadius: 1,
  },
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

  // Form
  formContainer: {
    gap: 16,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontFamily: typography.secondarySemibold,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  fieldLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  input: {
    height: 48,
    borderRadius: 10,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    fontFamily: typography.secondary,
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

  // Save button
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 52,
    borderRadius: 12,
    backgroundColor: colors.success,
    gap: 8,
    marginTop: 4,
  },
  saveBtnDisabled: {
    opacity: 0.4,
  },
  saveBtnText: {
    fontFamily: typography.primarySemibold,
    fontSize: fontSize.md,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
