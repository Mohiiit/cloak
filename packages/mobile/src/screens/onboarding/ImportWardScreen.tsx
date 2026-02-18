/**
 * ImportWardScreen — Two-tab screen for importing a ward account via QR scan or manual JSON entry.
 */
import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  SafeAreaView,
  ScrollView,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Clipboard from "@react-native-clipboard/clipboard";
import WebView from "react-native-webview";
import {
  ArrowLeft,
  Download,
  ClipboardPaste,
  Info,
  ScanLine,
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
    isFrozen: false,
    pseudoName: invite.pseudoName?.trim() || "",
    initialFundingAmountWei: invite.initialFundingAmountWei || "",
    spendingLimitPerTx: "0",
    requireGuardianForAll: true,
    wardType: "imported",
  };
}

// ---------------------------------------------------------------------------
// QR Scanner HTML (WebView)
// ---------------------------------------------------------------------------

const QR_SCANNER_HTML = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: transparent;
      display: flex;
      align-items: stretch;
      justify-content: stretch;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
    .videoWrap {
      position: relative;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: stretch;
      justify-content: stretch;
    }
    video, canvas {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    canvas { display: none; }
  </style>
</head>
<body>
  <div class="videoWrap">
    <video id="video" autoplay playsinline muted></video>
    <canvas id="canvas"></canvas>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js"></script>
  <script>
    const video = document.getElementById("video");
    const canvas = document.getElementById("canvas");
    const context = canvas.getContext("2d");
    let stream = null;
    let scanning = false;

    function post(type, data) {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type, data }));
    }

    async function startBarcodeDetector() {
      if (typeof BarcodeDetector === "undefined") return false;
      try { return new BarcodeDetector({ formats: ["qr_code"] }); } catch { return false; }
    }

    async function startLoop() {
      if (scanning) return;
      scanning = true;
      const detector = await startBarcodeDetector();

      while (scanning) {
        if (video.readyState >= 2) {
          try {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
            let text = null;

            if (detector && detector.detect) {
              const detections = await detector.detect(imageData);
              if (detections && detections.length > 0 && detections[0].rawValue) {
                text = detections[0].rawValue;
              }
            }

            if (!text && window.jsQR) {
              const code = window.jsQR(imageData.data, canvas.width, canvas.height, { inversionAttempts: "attemptBoth" });
              if (code && code.data) text = code.data;
            }

            if (text) {
              post("result", text.trim());
              scanning = false;
              stop();
              break;
            }
          } catch (error) {
            post("error", error && error.message ? error.message : "scan_failed");
          }
        }
        await new Promise(r => requestAnimationFrame(r));
      }
    }

    function stop() {
      scanning = false;
      if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    }

    async function startCamera() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        post("status", "Camera not supported");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } });
        video.srcObject = stream;
        await video.play();
        post("status", "Camera ready");
        await startLoop();
      } catch (error) {
        post("error", error && error.message ? error.message : "camera_error");
      }
    }

    startCamera();
  </script>
</body>
</html>`;

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
  // QR scanner message handler
  // -----------------------------------------------------------------------

  const handleScanMessage = useCallback(
    async (event: any) => {
      const raw = event?.nativeEvent?.data as string | undefined;
      if (!raw) return;

      let parsed: { type?: string; data?: string } = {};
      try {
        parsed = JSON.parse(raw);
      } catch {
        return;
      }

      if (parsed.type === "result" && parsed.data) {
        await importWardAccount(parsed.data, "scan");
      }
    },
    [importWardAccount],
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
            Scan the QR code shown after ward creation, or enter the ward
            details manually.
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
              onMessage={handleScanMessage}
              isImporting={isImporting}
              onSubmit={() => {}}
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
  onMessage,
  isImporting,
}: {
  onMessage: (event: any) => void;
  isImporting: boolean;
  onSubmit: () => void;
}) {
  return (
    <View style={styles.scanArea}>
      {/* Camera WebView fills the rounded container */}
      <WebView
        originWhitelist={["*"]}
        source={{ html: QR_SCANNER_HTML }}
        style={StyleSheet.absoluteFill}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        mediaCapturePermissionGrantType="grant"
      />

      {/* Corner brackets (absolutely positioned) */}
      <View style={[styles.corner, styles.cornerTL]} pointerEvents="none">
        <View style={[styles.cornerH, styles.cornerHorizontal]} />
        <View style={[styles.cornerV, styles.cornerVertical]} />
      </View>
      <View style={[styles.corner, styles.cornerTR]} pointerEvents="none">
        <View style={[styles.cornerH, styles.cornerHorizontal, { alignSelf: "flex-end" }]} />
        <View style={[styles.cornerV, styles.cornerVertical, { alignSelf: "flex-end" }]} />
      </View>
      <View style={[styles.corner, styles.cornerBL]} pointerEvents="none">
        <View style={[styles.cornerV, styles.cornerVertical]} />
        <View style={[styles.cornerH, styles.cornerHorizontal]} />
      </View>
      <View style={[styles.corner, styles.cornerBR]} pointerEvents="none">
        <View style={[styles.cornerV, styles.cornerVertical, { alignSelf: "flex-end" }]} />
        <View style={[styles.cornerH, styles.cornerHorizontal, { alignSelf: "flex-end" }]} />
      </View>

      {/* Center scan icon */}
      <View style={styles.scanIconCenter} pointerEvents="none">
        <ScanLine size={32} color={colors.secondary} style={{ opacity: 0.4 }} />
      </View>

      {/* Scan line */}
      <View style={styles.scanLine} pointerEvents="none" />

      {/* Hint text */}
      <View style={styles.scanHintWrap} pointerEvents="none">
        <Text style={styles.scanHint}>Point camera at ward QR code</Text>
      </View>

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

        {/* Hint */}
        <Text style={styles.jsonHint}>
          {'A JSON string starting with {"type":"cloak_ward_invite",...}'}
        </Text>

        {/* Textarea */}
        <TextInput
          style={styles.jsonTextarea}
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

      {/* Info box */}
      <View style={styles.infoBox}>
        <View style={styles.infoHeader}>
          <Info size={16} color={colors.primary} />
          <Text style={styles.infoHeaderText}>How to get this code</Text>
        </View>
        <View style={styles.infoBullet}>
          <Text style={styles.bulletDot}>{"\u2022"}</Text>
          <Text style={styles.bulletText}>
            Ask your guardian to create a ward and share the invite
          </Text>
        </View>
        <View style={styles.infoBullet}>
          <Text style={styles.bulletDot}>{"\u2022"}</Text>
          <Text style={styles.bulletText}>
            The code contains your ward address and private key
          </Text>
        </View>
      </View>

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

  // Scan center icon
  scanIconCenter: {
    position: "absolute",
    top: "50%",
    left: "50%",
    marginTop: -16,
    marginLeft: -16,
  },

  // Scan line
  scanLine: {
    position: "absolute",
    left: 20,
    right: 20,
    top: "50%",
    height: 2,
    backgroundColor: colors.secondary,
    opacity: 0.7,
    borderRadius: 1,
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
