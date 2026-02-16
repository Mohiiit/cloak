/**
 * HomeScreen — Balance overview, portfolio, and quick actions.
 */
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Platform,
  Linking,
  Modal,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Clipboard from "@react-native-clipboard/clipboard";
import { KeyboardSafeScreen } from "../components/KeyboardSafeContainer";
import { Eye, EyeOff, Send, ShieldPlus, ShieldOff, ArrowUpFromLine, RefreshCw, Check, ShieldAlert, Info, Camera, ClipboardPaste } from "lucide-react-native";
import { useWallet } from "../lib/WalletContext";
import { useWardContext } from "../lib/wardContext";
import { useTransactionRouter } from "../hooks/useTransactionRouter";
import { tongoToDisplay, erc20ToDisplay } from "../lib/tokens";
import { colors, spacing, fontSize, borderRadius } from "../lib/theme";
import { useThemedModal } from "../components/ThemedModal";
import { CloakIcon } from "../components/CloakIcon";
import { testIDs, testProps } from "../testing/testIDs";
import WebView from "react-native-webview";

type WardInvitePayload = {
  type: string;
  wardAddress: string;
  wardPrivateKey: string;
  guardianAddress?: string;
  network?: string;
  pseudoName?: string;
  initialFundingAmountWei?: string;
};

type WardImportScannerState = {
  status: string;
};

function parseWardInvitePayload(raw: string): WardInvitePayload {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Invalid ward invite format");
  }

  const candidates: string[] = [trimmed];
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    candidates.push(trimmed.slice(1, -1));
  }

  const seen = new Set<string>();
  for (const candidate of candidates) {
    let value = candidate.trim();
    for (let attempt = 0; attempt < 4 && value.length > 0; attempt += 1) {
      if (seen.has(value)) {
        break;
      }
      seen.add(value);
      try {
        return JSON.parse(value) as WardInvitePayload;
      } catch {
        if (!value.endsWith("}")) {
          break;
        }
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

  if (!invite.wardAddress.startsWith("0x") || !invite.wardPrivateKey.startsWith("0x")) {
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

const WARD_WELCOME_SCANNER_HTML = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      display: flex;
      flex-direction: column;
      gap: 12px;
      align-items: stretch;
      justify-content: flex-start;
      padding: 12px;
    }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 12px; }
    .title { font-size: 16px; font-weight: 600; margin: 0; }
    .muted { color: #94a3b8; font-size: 12px; margin-top: 2px; }
    .videoWrap { position: relative; width: 100%; background: #020617; border-radius: 12px; overflow: hidden; aspect-ratio: 4 / 3; display: flex; align-items: stretch; justify-content: stretch; }
    video, canvas { width: 100%; height: 100%; display: block; }
    .inputWrap { margin-top: 8px; }
    input[type=file] { width: 100%; color: #e2e8f0; }
    button { background: #2563eb; color: #fff; border: 0; border-radius: 10px; padding: 10px 12px; font-weight: 600; width: 100%; }
    button:disabled { opacity: 0.6; }
  </style>
</head>
<body>
  <div class="card">
    <p class="title">Scan Ward Invite</p>
    <p class="muted">Use your camera or pick a QR image</p>
  </div>
  <div class="card">
    <div class="videoWrap">
      <video id="video" autoplay playsinline muted></video>
      <canvas id="canvas" hidden></canvas>
    </div>
  </div>
  <div class="card inputWrap">
    <input id="qr-file" type="file" accept="image/*" capture="environment" />
  </div>
  <div class="card inputWrap">
    <button id="retry" type="button">Retry Camera</button>
  </div>
  <div class="card inputWrap" id="status">Initializing camera…</div>
  <script src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js"></script>
  <script>
    const statusNode = document.getElementById("status");
    const video = document.getElementById("video");
    const canvas = document.getElementById("canvas");
    const context = canvas.getContext("2d");
    const retryBtn = document.getElementById("retry");
    const fileInput = document.getElementById("qr-file");
    let stream = null;
    let rafId = null;
    let scanning = false;

    function post(type, data) {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type, data }));
    }

    function updateStatus(text) {
      statusNode.textContent = text;
      post("status", text);
    }

    async function startBarcodeDetector() {
      if (typeof BarcodeDetector === "undefined") {
        return false;
      }
      try {
        const detector = new BarcodeDetector({ formats: ["qr_code"] });
        return detector;
      } catch (error) {
        return false;
      }
    }

    function decodeImageWithJsqr(image) {
      if (!window.jsQR) return null;
      const width = image.width;
      const height = image.height;
      canvas.width = width;
      canvas.height = height;
      context.drawImage(image, 0, 0, width, height);
      const imageData = context.getImageData(0, 0, width, height);
      const code = window.jsQR(imageData.data, width, height, { inversionAttempts: "attemptBoth" });
      if (code && code.data) {
        return code.data;
      }
      return null;
    }

    async function handleScanResult(raw) {
      const text = (raw || "").trim();
      if (!text) return false;
      post("result", text);
      return true;
    }

    async function startLoop() {
      if (scanning) return;
      scanning = true;
      updateStatus("Starting camera…");
      const detector = await startBarcodeDetector();
      let noQrCount = 0;

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
              if (code && code.data) {
                text = code.data;
              }
            }

            if (text) {
              const accepted = await handleScanResult(text);
              if (accepted) {
                updateStatus("Captured invite");
                scanning = false;
                stop();
                break;
              }
            } else {
              noQrCount += 1;
              if (noQrCount === 60) {
                noQrCount = 0;
                updateStatus("Align QR code inside camera view");
              }
            }
          } catch (error) {
            post("error", error && error.message ? error.message : "scan_failed");
          }
        }
        rafId = requestAnimationFrame(startLoop);
        return;
      }
    }

    async function stop() {
      scanning = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
      }
    }

    async function startCamera() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        updateStatus("Camera not supported in this view.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
        });
        video.srcObject = stream;
        await video.play();
        updateStatus("Camera ready");
        await startLoop();
      } catch (error) {
        updateStatus("Unable to start camera");
        post("error", error && error.message ? error.message : "camera_error");
      }
    }

    retryBtn.addEventListener("click", async () => {
      stop();
      updateStatus("Restarting camera…");
      await startCamera();
    });

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      const image = new Image();
      const reader = new FileReader();
      reader.onload = () => {
        image.onload = async () => {
          try {
            const result = decodeImageWithJsqr(image);
            if (result) {
              const accepted = await handleScanResult(result);
              if (accepted) {
                updateStatus("Captured invite");
              } else {
                updateStatus("No QR detected");
              }
            } else {
              updateStatus("No QR detected");
            }
          } catch (error) {
            post("error", error && error.message ? error.message : "file_decode_failed");
          }
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });

    startCamera();
  </script>
</body>
</html>`;

export default function HomeScreen({ navigation }: any) {
  const wallet = useWallet();
  const ward = useWardContext();
  const { execute } = useTransactionRouter();
  const modal = useThemedModal();
  const [showImport, setShowImport] = useState(false);
  const [showWardImport, setShowWardImport] = useState(false);
  const [importPK, setImportPK] = useState("");
  const [importAddr, setImportAddr] = useState("");
  const [wardInviteJson, setWardInviteJson] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [balanceHidden, setBalanceHidden] = useState(false);
  const [showWardInfo, setShowWardInfo] = useState(false);
  const [claimSuccess, setClaimSuccess] = useState<{ txHash: string; amount: string } | null>(null);
  const [wardImportScanVisible, setWardImportScanVisible] = useState(false);
  const [wardImportScannerState, setWardImportScannerState] = useState<WardImportScannerState>({
    status: "Tap scan and grant camera permission.",
  });

  useEffect(() => {
    AsyncStorage.getItem("cloak_balance_hidden").then((v) => {
      if (v === "true") setBalanceHidden(true);
    });
  }, []);

  // NOTE: refreshTxHistory disabled — on-chain getTxHistory always fails
  // from WebView bridge. Will be replaced with Supabase reads.

  const toggleBalanceVisibility = () => {
    const next = !balanceHidden;
    setBalanceHidden(next);
    AsyncStorage.setItem("cloak_balance_hidden", next ? "true" : "false");
  };

  const importWardAccountFromPayload = async (payloadRaw: string) => {
    const invite = parseWardInvitePayload(payloadRaw);
    validateWardInvitePayload(invite);
    await AsyncStorage.setItem("cloak_is_ward", "true");
    if (invite.guardianAddress) {
      await AsyncStorage.setItem("cloak_guardian_address", invite.guardianAddress);
    }
    await AsyncStorage.setItem("cloak_ward_info_cache", JSON.stringify(buildWardInfoCacheFromInvite(invite)));
    await wallet.importWallet(invite.wardPrivateKey, invite.wardAddress);
  };

  const importWardAccount = async (payloadRaw: string, source: "paste" | "scan") => {
    setIsImporting(true);
    try {
      await importWardAccountFromPayload(payloadRaw);
      setWardInviteJson("");
      setWardImportScannerState({
        status: source === "scan" ? "Ward imported from scan." : "Ward imported from paste.",
      });
      setWardImportScanVisible(false);
      modal.showSuccess(
        "Ward Imported",
        source === "scan"
          ? "Ward invite QR successfully imported."
          : "Ward account is now managed by a guardian.",
      );
    } catch (e: any) {
      setWardImportScannerState({
        status: e?.message || "Failed to import invite.",
      });
      throw e;
    } finally {
      setIsImporting(false);
    }
  };

  const handleWardScanMessage = async (event: any) => {
    const raw = event?.nativeEvent?.data as string | undefined;
    if (!raw) return;

    let parsed: { type?: string; data?: string } = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      setWardImportScannerState((prev) => ({
        ...prev,
        status: "Unable to read scanner event.",
      }));
      return;
    }

    if (parsed.type === "result" && parsed.data) {
      setWardImportScannerState((prev) => ({
        ...prev,
        status: "Scanned ward invite. Importing...",
      }));
      try {
        await importWardAccount(parsed.data, "scan");
      } catch (e: any) {
        setWardImportScannerState((prev) => ({ ...prev, status: e.message || "Scan import failed." }));
      }
      return;
    }

    if (parsed.type === "status" && parsed.data) {
      setWardImportScannerState((prev) => ({
        ...prev,
        status: parsed.data || "Scanner status update.",
      }));
      return;
    }

    if (parsed.type === "error" && parsed.data) {
      setWardImportScannerState((prev) => ({
        ...prev,
        status: parsed.data || "Scanner error.",
      }));
    }
  };

  if (wallet.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading wallet...</Text>
      </View>
    );
  }

  if (!wallet.isWalletCreated) {
    return (
      <KeyboardSafeScreen
        style={styles.container}
        contentContainerStyle={styles.center}
        keyboardShouldPersistTaps="handled"
      >
          {modal.ModalComponent}
          <Modal
            visible={wardImportScanVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setWardImportScanVisible(false)}
          >
            <View style={styles.scanModalOverlay}>
              <View style={styles.scanModalCard}>
                <Text style={styles.scanModalTitle}>Scan Ward Invite</Text>
                <Text style={styles.scanModalStatusLabel}>Use your camera or pick a QR image</Text>
                <View style={styles.scanWebViewWrap}>
                  <WebView
                    originWhitelist={["*"]}
                    source={{ html: WARD_WELCOME_SCANNER_HTML }}
                    style={styles.scanWebView}
                    onMessage={handleWardScanMessage}
                    javaScriptEnabled
                    domStorageEnabled
                    startInLoadingState
                    allowsInlineMediaPlayback
                  />
                </View>
                <Text
                  {...testProps(testIDs.home.importWardScanStatus)}
                  style={styles.scanStatus}
                  numberOfLines={2}
                >
                  {wardImportScannerState.status}
                </Text>
                <TouchableOpacity
                  {...testProps(testIDs.home.importWardScanClose)}
                  style={styles.scanCloseBtn}
                  onPress={() => setWardImportScanVisible(false)}
                >
                  <Text style={styles.scanCloseText}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          <CloakIcon size={64} />
          <Text style={styles.heroTitle}>Cloak</Text>
          <Text style={styles.heroSubtitle}>
            Shielded payments on Starknet
          </Text>
          <TouchableOpacity
            {...testProps(testIDs.onboarding.createWallet)}
            style={styles.createButton}
            onPress={async () => {
              try {
                await AsyncStorage.multiRemove([
                  "cloak_is_ward",
                  "cloak_guardian_address",
                  "cloak_ward_info_cache",
                ]);
                await wallet.createWallet();
              } catch (e: any) {
                modal.showError("Error", e.message || "Failed to create wallet", e.message);
              }
            }}
          >
            <Text style={styles.createButtonText}>Create New Wallet</Text>
          </TouchableOpacity>

          <TouchableOpacity
            {...testProps(testIDs.onboarding.importExistingToggle)}
            style={styles.importToggle}
            onPress={() => { setShowImport(!showImport); setShowWardImport(false); }}
          >
            <Text style={styles.importToggleText}>
              {showImport ? "Hide Import" : "Import Existing Account"}
            </Text>
          </TouchableOpacity>

          {showImport && (
            <View style={styles.importCard}>
              <Text style={styles.importLabel}>Stark Private Key</Text>
              <TextInput
                {...testProps(testIDs.home.importExistingPrivateKeyInput)}
                style={styles.importInput}
                placeholder="0x..."
                placeholderTextColor={colors.textMuted}
                value={importPK}
                onChangeText={setImportPK}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
              />
              <Text style={styles.importLabel}>Starknet Address</Text>
              <TextInput
                {...testProps(testIDs.home.importExistingAddressInput)}
                style={styles.importInput}
                placeholder="0x..."
                placeholderTextColor={colors.textMuted}
                value={importAddr}
                onChangeText={setImportAddr}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
              />
              <TouchableOpacity
                {...testProps(testIDs.onboarding.importExistingSubmit)}
                style={[styles.createButton, (!importPK || !importAddr || isImporting) && { opacity: 0.4 }]}
                disabled={!importPK || !importAddr || isImporting}
                onPress={async () => {
                  setIsImporting(true);
                  try {
                    await AsyncStorage.multiRemove([
                      "cloak_is_ward",
                      "cloak_guardian_address",
                      "cloak_ward_info_cache",
                    ]);
                    await wallet.importWallet(importPK.trim(), importAddr.trim());
                    modal.showSuccess("Success", "Wallet imported!");
                  } catch (e: any) {
                    modal.showError("Error", e.message || "Import failed", e.message);
                  } finally {
                    setIsImporting(false);
                  }
                }}
              >
                {isImporting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.createButtonText}>Import Wallet</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            {...testProps(testIDs.onboarding.importWardToggle)}
            style={styles.importToggle}
            onPress={() => { setShowWardImport(!showWardImport); setShowImport(false); }}
          >
            <Text style={[styles.importToggleText, { color: colors.warning }]}>
              {showWardImport ? "Hide Ward Invite Form" : "Open Ward Invite Form"}
            </Text>
          </TouchableOpacity>

          {showWardImport && (
            <View style={[styles.importCard, { borderColor: "rgba(245, 158, 11, 0.3)" }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md }}>
                <ShieldAlert size={18} color={colors.warning} />
                <Text style={{ color: colors.text, fontSize: fontSize.sm, fontWeight: "600" }}>Ward Account</Text>
              </View>
              <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs, marginBottom: spacing.md, lineHeight: 18 }}>
                Paste the QR invite JSON from your guardian to import a ward account. This account will be managed by the guardian.
              </Text>
              <Text style={styles.importLabel}>Ward Invite JSON</Text>
              <TextInput
                {...testProps(testIDs.home.importWardJsonInput)}
                style={[styles.importInput, { minHeight: 80, textAlignVertical: "top" }]}
                placeholder='{"type":"cloak_ward_invite","wardAddress":"0x...","wardPrivateKey":"0x...","guardianAddress":"0x..."}'
                placeholderTextColor={colors.textMuted}
                value={wardInviteJson}
                onChangeText={setWardInviteJson}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
                multiline
                numberOfLines={4}
              />
              <View style={styles.wardImportActions}>
                <TouchableOpacity
                  {...testProps(testIDs.home.importWardPaste)}
                  style={styles.wardImportActionBtn}
                  disabled={isImporting}
                  onPress={async () => {
                    try {
                      const clipboardText = await Clipboard.getString();
                      await importWardAccount(clipboardText, "paste");
                    } catch (e: any) {
                      modal.showError("Import Failed", e.message || "Invalid clipboard invite", e.message || "Invalid clipboard invite");
                    }
                  }}
                >
                  <ClipboardPaste size={16} color={colors.primary} />
                  <Text style={styles.wardImportActionText}>Paste from Clipboard</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  {...testProps(testIDs.home.importWardScan)}
                  style={[styles.wardImportActionBtn, { borderColor: "rgba(245, 158, 11, 0.4)" }]}
                  disabled={isImporting}
                  onPress={() => {
                    setWardImportScannerState({
                      status: "Starting scanner…",
                    });
                    setWardImportScanVisible(true);
                  }}
                >
                  <Camera size={16} color={colors.warning} />
                  <Text style={[styles.wardImportActionText, { color: colors.warning }]}>Scan with Camera</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                {...testProps(testIDs.onboarding.importWardSubmit)}
                style={[styles.createButton, { backgroundColor: colors.warning }, (!wardInviteJson.trim() || isImporting) && { opacity: 0.4 }]}
                disabled={!wardInviteJson.trim() || isImporting}
                onPress={async () => {
                  await importWardAccount(wardInviteJson, "paste");
                }}
              >
                {isImporting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.createButtonText}>Import Ward Account</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </KeyboardSafeScreen>
    );
  }

  const displayBalance = tongoToDisplay(wallet.balance, wallet.selectedToken);
  const displayPending = tongoToDisplay(wallet.pending, wallet.selectedToken);
  const displayErc20 = erc20ToDisplay(wallet.erc20Balance, wallet.selectedToken);
  const hasPending = wallet.pending !== "0";
  const deployStatusValue = wallet.isCheckingDeployment
    ? "checking_deployment"
    : wallet.isDeployed
    ? "deployed"
    : wallet.isWalletCreated
    ? "needs_deploy"
    : "wallet_missing";
  const deployStatusMarker = `deploy.status=${deployStatusValue}`;

  const handleClaim = async () => {
    setIsClaiming(true);
    try {
      const pendingAmount = wallet.pending;
      const result = await execute({ action: "rollover", token: wallet.selectedToken });
      setClaimSuccess({ txHash: result.txHash, amount: pendingAmount });
      // Refresh balance — await so pending updates before user dismisses success card
      await wallet.refreshBalance();
    } catch (e: any) {
      modal.showError("Error", e.message || "Claim failed", e.message);
    } finally {
      setIsClaiming(false);
    }
  };

  const handleRefresh = async () => {
    await wallet.refreshBalance();
    await wallet.refreshAllBalances();
    if (ward.isWard) {
      await ward.refreshWardInfo();
    }
  };

  return (
    <KeyboardSafeScreen
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={wallet.isRefreshing}
          onRefresh={handleRefresh}
          tintColor={colors.primary}
        />
      }
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
      {modal.ModalComponent}

      {claimSuccess && (
        <View style={styles.claimSuccessCard}>
          <Check size={48} color={colors.success} style={{ marginBottom: spacing.md }} />
          <Text style={styles.claimSuccessTitle}>Claimed!</Text>
          <Text style={styles.claimSuccessAmount}>
            {claimSuccess.amount} units
          </Text>
          <Text style={styles.claimSuccessEquiv}>
            ({tongoToDisplay(claimSuccess.amount, wallet.selectedToken)} {wallet.selectedToken})
          </Text>
          <Text style={styles.claimSuccessDesc}>
            Pending funds added to your balance.
          </Text>

          <View style={styles.claimTxSection}>
            <Text style={styles.claimTxLabel}>Transaction Hash</Text>
            <Text style={styles.claimTxHash} numberOfLines={2} selectable>
              {claimSuccess.txHash}
            </Text>
            <View style={styles.claimTxActions}>
              <TouchableOpacity
                style={styles.claimTxBtn}
                onPress={() => {
                  Clipboard.setString(claimSuccess.txHash);
                }}
              >
                <Text style={styles.claimTxBtnText}>Copy Tx Hash</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.claimTxBtn}
                onPress={() => Linking.openURL(`https://sepolia.voyager.online/tx/${claimSuccess.txHash}`)}
              >
                <Text style={styles.claimTxBtnText}>View on Voyager</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={styles.claimDoneBtn}
            onPress={async () => {
              setClaimSuccess(null);
              await wallet.refreshBalance();
            }}
          >
            <Text style={styles.claimDoneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      )}

      {!claimSuccess && (
        <>
          {/* Ward Badge Banner */}
          {ward.isWard && (
            (() => {
              const isFrozen = !!ward.wardInfo?.isFrozen;
              const bannerBg = isFrozen ? "rgba(239, 68, 68, 0.08)" : "rgba(245, 158, 11, 0.08)";
              const bannerBorder = isFrozen ? "rgba(239, 68, 68, 0.22)" : "rgba(245, 158, 11, 0.2)";
              const accent = isFrozen ? colors.error : colors.warning;
              const sub = isFrozen ? "Frozen by guardian" : "Managed by guardian";
              return (
            <TouchableOpacity
              style={[styles.wardBanner, { backgroundColor: bannerBg, borderColor: bannerBorder }]}
              onPress={async () => {
                const next = !showWardInfo;
                setShowWardInfo(next);
                // Pull latest status when user opens the panel.
                if (next) {
                  await ward.refreshWardInfo();
                }
              }}
              activeOpacity={0.7}
            >
              <View style={styles.wardBannerLeft}>
                <ShieldAlert size={18} color={accent} />
                <View>
                  <Text style={[styles.wardBannerTitle, { color: accent }]}>Ward Account</Text>
                  <Text style={styles.wardBannerSub}>{sub}</Text>
                </View>
              </View>
              <Info size={18} color={colors.textMuted} />
            </TouchableOpacity>
              );
            })()
          )}

          {/* Ward Info Panel */}
          {ward.isWard && showWardInfo && (
            ward.wardInfo ? (
            <View
              style={[
                styles.wardInfoPanel,
                ward.wardInfo.isFrozen && {
                  borderColor: "rgba(239, 68, 68, 0.22)",
                  borderLeftColor: colors.error,
                },
              ]}
            >
              <View style={styles.wardInfoRow}>
                <Text style={styles.wardInfoLabel}>Guardian</Text>
                <Text style={styles.wardInfoValue} numberOfLines={1}>
                  {ward.wardInfo.guardianAddress.slice(0, 10)}...{ward.wardInfo.guardianAddress.slice(-6)}
                </Text>
              </View>
              <View style={styles.wardInfoRow}>
                <Text style={styles.wardInfoLabel}>Status</Text>
                <View style={[styles.wardStatusBadge, ward.wardInfo.isFrozen ? styles.wardStatusFrozen : styles.wardStatusActive]}>
                  <Text style={[styles.wardStatusText, ward.wardInfo.isFrozen ? styles.wardStatusTextFrozen : styles.wardStatusTextActive]}>
                    {ward.wardInfo.isFrozen ? "Frozen" : "Active"}
                  </Text>
                </View>
              </View>
              <View style={styles.wardInfoRow}>
                <Text style={styles.wardInfoLabel}>Guardian Approval</Text>
                <Text style={styles.wardInfoValue}>
                  {ward.wardInfo.requireGuardianForAll ? "All transactions" : "Above limit only"}
                </Text>
              </View>
              <View style={styles.wardInfoRow}>
                <Text style={styles.wardInfoLabel}>Guardian 2FA</Text>
                <Text style={[styles.wardInfoValue, { color: ward.wardInfo.isGuardian2faEnabled ? colors.success : colors.textMuted }]}>
                  {ward.wardInfo.isGuardian2faEnabled ? "Enabled" : "Disabled"}
                </Text>
              </View>
              <View style={styles.wardInfoRow}>
                <Text style={styles.wardInfoLabel}>Ward 2FA</Text>
                <Text style={[styles.wardInfoValue, { color: ward.wardInfo.is2faEnabled ? colors.success : colors.textMuted }]}>
                  {ward.wardInfo.is2faEnabled ? "Enabled" : "Disabled"}
                </Text>
              </View>
            </View>
            ) : (
            <View style={[styles.wardInfoPanel, { alignItems: "center", paddingVertical: spacing.xl }]}>
              <ActivityIndicator size="small" color={colors.warning} />
              <Text style={{ color: colors.textSecondary, fontSize: fontSize.xs, marginTop: spacing.sm }}>
                Loading ward info...
              </Text>
            </View>
            )
          )}

          {/* Claim Banner */}
          {hasPending && (
        <View style={styles.claimBanner}>
          <View style={styles.claimBannerLeft}>
            <View style={styles.pulsingDot} />
            <View>
              <Text style={styles.claimBannerTitle}>Pending Funds Available</Text>
              <Text style={styles.claimBannerAmount}>
                +{displayPending} {wallet.selectedToken}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            {...testProps(testIDs.home.claimPending)}
            style={styles.claimPill}
            onPress={handleClaim}
            disabled={isClaiming}
          >
            {isClaiming ? (
              <ActivityIndicator color={colors.warning} size="small" />
            ) : (
              <Text style={styles.claimPillText}>Claim</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Balance Card */}
      <View style={styles.balanceCard}>
        <View style={styles.glowTopRight} />
        <View style={styles.glowBottomLeft} />
        <View style={styles.balanceContent}>
          <View style={styles.balanceLabelRow}>
            <Text style={styles.balanceLabel}>Shielded Balance</Text>
            <TouchableOpacity
              {...testProps(testIDs.home.toggleBalanceVisibility)}
              onPress={toggleBalanceVisibility}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              {balanceHidden ? (
                <Eye size={20} color={colors.textMuted} />
              ) : (
                <EyeOff size={20} color={colors.textMuted} />
              )}
            </TouchableOpacity>
          </View>
          <Text style={styles.balanceAmount}>
            {balanceHidden ? "****" : `${wallet.balance} units`}
          </Text>
          <Text style={styles.balanceSecondary}>
            {balanceHidden ? "****" : `(${displayBalance} ${wallet.selectedToken})`}
          </Text>
          {hasPending && (
            <Text style={styles.pendingText}>
              {balanceHidden ? "+**** pending" : `+${wallet.pending} units (${displayPending} ${wallet.selectedToken}) pending`}
            </Text>
          )}
          <Text style={styles.erc20Label}>Unshielded (On-chain)</Text>
          <Text style={styles.erc20Amount}>
            {balanceHidden ? "****" : displayErc20}{" "}
            <Text style={styles.erc20Symbol}>{wallet.selectedToken}</Text>
          </Text>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          {...testProps(testIDs.home.quickSend)}
          style={[styles.actionButton, styles.actionSend]}
          onPress={() => navigation.navigate("Send")}
        >
          <Send size={32} color={colors.primary} style={styles.actionIconSpacing} />
          <Text style={styles.actionLabel}>Send</Text>
        </TouchableOpacity>
        <TouchableOpacity
          {...testProps(testIDs.home.quickShield)}
          style={[styles.actionButton, styles.actionShield]}
          onPress={() => navigation.navigate("Wallet", { mode: "shield" })}
        >
          <ShieldPlus size={32} color={colors.success} style={styles.actionIconSpacing} />
          <Text style={styles.actionLabel}>Shield</Text>
        </TouchableOpacity>
        <TouchableOpacity
          {...testProps(testIDs.home.quickUnshield)}
          style={[styles.actionButton, styles.actionUnshield]}
          onPress={() => navigation.navigate("Wallet", { mode: "unshield" })}
        >
          <ShieldOff size={32} color={colors.secondary} style={styles.actionIconSpacing} />
          <Text style={styles.actionLabel}>Unshield</Text>
        </TouchableOpacity>
      </View>

      {/* Recent Activity */}
      {wallet.txHistory.length > 0 && (
        <View style={styles.recentSection}>
          <View style={styles.recentHeader}>
            <Text style={styles.recentTitle}>Recent Activity</Text>
            <TouchableOpacity
              {...testProps(testIDs.home.recentSeeAll)}
              onPress={() => navigation.navigate("Activity")}
            >
              <Text style={styles.recentSeeAll}>See All</Text>
            </TouchableOpacity>
          </View>
          {wallet.txHistory.slice(0, 3).map((tx: any, i: number) => {
            const hash = tx.txHash || tx.transaction_hash || "";
            const iconColor = tx.type === "fund" ? colors.success : tx.type === "transfer" ? colors.primary : tx.type === "withdraw" ? colors.secondary : colors.textMuted;
            return (
              <TouchableOpacity
                key={i}
                style={styles.recentRow}
                onPress={() => hash && Linking.openURL(`https://sepolia.voyager.online/tx/${hash}`)}
              >
                {tx.type === "fund" ? (
                  <ShieldPlus size={18} color={iconColor} />
                ) : tx.type === "transfer" ? (
                  <ArrowUpFromLine size={18} color={iconColor} />
                ) : tx.type === "withdraw" ? (
                  <ShieldOff size={18} color={iconColor} />
                ) : (
                  <RefreshCw size={18} color={colors.textMuted} />
                )}
                <View style={styles.recentInfo}>
                  <Text style={styles.recentType}>{tx.type || "unknown"}</Text>
                  <Text style={styles.recentAmount}>{tx.amount || "?"} units</Text>
                </View>
                {hash ? <Text style={styles.recentHash}>{hash.slice(0, 8)}...</Text> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Compact Status */}
      <View style={styles.compactStatus}>
        <View style={[styles.statusDot, { backgroundColor: wallet.isBridgeReady ? colors.success : colors.error }]} />
        <Text style={styles.compactStatusText}>Sepolia</Text>
        <Text style={styles.compactStatusDivider}>|</Text>
        <Text style={styles.compactStatusText}>Nonce: {wallet.nonce}</Text>
      </View>
        </>
      )}
    </KeyboardSafeScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: Platform.OS === "ios" ? spacing.sm : spacing.lg,
    paddingBottom: 100,
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
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  loadingText: { color: colors.textSecondary, marginTop: spacing.md, fontSize: fontSize.md },
  heroIcon: { marginBottom: spacing.md },
  heroTitle: { fontSize: fontSize.hero, fontWeight: "bold", color: colors.text, marginBottom: spacing.sm },
  heroSubtitle: { fontSize: fontSize.lg, color: colors.textSecondary, textAlign: "center", marginBottom: spacing.xl },
  createButton: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: borderRadius.lg,
  },
  createButtonText: { color: "#fff", fontSize: fontSize.lg, fontWeight: "600" },
  importToggle: { marginTop: spacing.lg },
  importToggleText: { color: colors.primary, fontSize: fontSize.sm },
  importCard: {
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    width: "100%",
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  importLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
    marginTop: spacing.sm,
  },
  importInput: {
    backgroundColor: colors.bg,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: fontSize.sm,
    color: colors.text,
    fontFamily: "monospace",
    marginBottom: spacing.sm,
  },
  wardImportActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  wardImportActionBtn: {
    flex: 1,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(14, 165, 233, 0.35)",
    backgroundColor: "rgba(14, 165, 233, 0.08)",
    paddingVertical: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.xs,
  },
  wardImportActionText: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: "600",
  },
  scanModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.88)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  scanModalCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scanModalTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: "600",
    marginBottom: spacing.xs,
  },
  scanModalStatusLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginBottom: spacing.sm,
  },
  scanWebViewWrap: {
    borderRadius: borderRadius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.borderLight,
    height: 320,
    backgroundColor: "#020617",
    marginBottom: spacing.sm,
  },
  scanWebView: {
    flex: 1,
  },
  scanStatus: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    minHeight: 32,
  },
  scanCloseBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 12,
    alignItems: "center",
  },
  scanCloseText: {
    color: "#fff",
    fontSize: fontSize.sm,
    fontWeight: "600",
  },

  // Balance Card
  balanceCard: {
    overflow: "hidden",
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  glowTopRight: {
    position: "absolute",
    top: -40,
    right: -40,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(59, 130, 246, 0.08)",
  },
  glowBottomLeft: {
    position: "absolute",
    bottom: -30,
    left: -30,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "rgba(139, 92, 246, 0.08)",
  },
  balanceContent: { position: "relative" },
  balanceLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  balanceLabel: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  eyeIcon: {},
  balanceAmount: { fontSize: fontSize.hero, fontWeight: "bold", color: colors.text },
  balanceSecondary: { fontSize: fontSize.md, color: colors.textSecondary, marginTop: 2 },
  pendingText: { fontSize: fontSize.sm, color: colors.warning, marginTop: spacing.sm },
  erc20Label: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: spacing.md,
  },
  erc20Amount: { fontSize: fontSize.lg, color: colors.textSecondary, marginTop: 2 },
  erc20Symbol: { fontSize: fontSize.sm, color: colors.textMuted },

  // Claim Banner
  claimBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.25)",
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  claimBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  pulsingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.warning,
  },
  claimBannerTitle: { fontSize: fontSize.sm, color: colors.warning, fontWeight: "600" },
  claimBannerAmount: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  claimPill: {
    backgroundColor: "rgba(245, 158, 11, 0.2)",
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.4)",
  },
  claimPillText: { color: colors.warning, fontSize: fontSize.sm, fontWeight: "700" },

  // Actions
  actionsRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  actionButton: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderLeftWidth: 3,
  },
  actionSend: {
    borderLeftColor: colors.primary,
  },
  actionShield: {
    borderLeftColor: colors.success,
  },
  actionUnshield: {
    borderLeftColor: colors.secondary,
  },
  actionIcon: { fontSize: 32, marginBottom: spacing.xs },
  actionIconSpacing: { marginBottom: spacing.xs },
  actionLabel: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: "600" },

  // Recent Activity
  recentSection: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: spacing.lg,
  },
  recentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  recentTitle: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  recentSeeAll: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: "500",
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    gap: spacing.sm,
  },
  recentInfo: { flex: 1 },
  recentType: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontWeight: "500",
    textTransform: "capitalize",
  },
  recentAmount: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  recentHash: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontFamily: "monospace",
  },

  // Compact Status
  compactStatus: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  compactStatusText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  compactStatusDivider: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    opacity: 0.5,
  },

  // Claim Success Card
  claimSuccessCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
  },
  claimSuccessTitle: { fontSize: fontSize.xl, fontWeight: "bold", color: colors.success, marginBottom: spacing.sm },
  claimSuccessAmount: { fontSize: fontSize.xxl, fontWeight: "bold", color: colors.text },
  claimSuccessEquiv: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.xs },
  claimSuccessDesc: { fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.lg },
  claimTxSection: {
    width: "100%",
    backgroundColor: colors.bg,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.xl,
  },
  claimTxLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  claimTxHash: {
    fontSize: fontSize.xs,
    color: colors.text,
    fontFamily: "monospace",
    marginBottom: spacing.sm,
  },
  claimTxActions: { flexDirection: "row", gap: spacing.sm },
  claimTxBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surface,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  claimTxBtnText: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: "600",
  },
  claimDoneBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: borderRadius.md,
  },
  claimDoneBtnText: { color: "#fff", fontSize: fontSize.md, fontWeight: "600" },

  // Ward Badge & Info
  wardBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(245, 158, 11, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.2)",
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  wardBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  wardBannerTitle: { fontSize: fontSize.sm, color: colors.warning, fontWeight: "600" },
  wardBannerSub: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 1 },
  wardInfoPanel: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.15)",
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
  },
  wardInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  wardInfoLabel: { fontSize: fontSize.sm, color: colors.textSecondary },
  wardInfoValue: { fontSize: fontSize.sm, color: colors.text, maxWidth: "55%" },
  wardStatusBadge: {
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  wardStatusActive: { backgroundColor: "rgba(16, 185, 129, 0.15)" },
  wardStatusFrozen: { backgroundColor: "rgba(239, 68, 68, 0.15)" },
  wardStatusText: { fontSize: fontSize.xs, fontWeight: "600" },
  wardStatusTextActive: { color: colors.success },
  wardStatusTextFrozen: { color: colors.error },
});
