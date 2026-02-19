/**
 * HomeScreen — Balance overview, portfolio, and quick actions.
 */
import React, { useState, useEffect, useCallback, useLayoutEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Linking,
  Modal,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Clipboard from "@react-native-clipboard/clipboard";
import { KeyboardSafeScreen } from "../components/KeyboardSafeContainer";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import {
  Eye,
  EyeOff,
  Send,
  ShieldPlus,
  ShieldOff,
  ArrowUpFromLine,
  ArrowDownToLine,
  Check,
  ShieldAlert,
  Info,
  Snowflake,
  Gauge,
  Camera,
  ClipboardPaste,
  Ghost,
  Plus,
} from "lucide-react-native";
import { useWallet } from "../lib/WalletContext";
import { useWardContext, type WardInfo } from "../lib/wardContext";
import { useTransactionRouter } from "../hooks/useTransactionRouter";
import { tongoToDisplay, erc20ToDisplay, TOKENS, type TokenKey, unitLabel } from "../lib/tokens";
import { colors, spacing, fontSize, borderRadius, typography } from "../lib/theme";
import { useThemedModal } from "../components/ThemedModal";
import { CloakIcon } from "../components/CloakIcon";
import { testIDs, testProps } from "../testing/testIDs";
import { triggerSuccess } from "../lib/haptics";
import { Confetti } from "../components/Confetti";
import { getTransactions, type TransactionRecord } from "@cloak-wallet/sdk";
import WebView from "react-native-webview";

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
};

type WardImportScannerState = {
  status: string;
};

type RecentActivityItem = {
  id: string;
  kind: "sent" | "received" | "shielded";
  title: string;
  subtitle: string;
  amountLabel: string;
  amountColor: string;
  txHash?: string;
};

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

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
    spendingLimitPerTx: invite.maxPerTx || "0",
    dailyLimit: invite.dailyLimit || "0",
    dailySpent: "0",
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

function OnboardingLogoBadge() {
  return (
    <View style={styles.onboardingLogoBadge}>
      <Svg width={96} height={96} viewBox="0 0 96 96">
        <Defs>
          <LinearGradient id="onboardingBadgeGradient" x1="0" y1="0" x2="96" y2="96" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#3B82F6" />
            <Stop offset="1" stopColor="#8B5CF6" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="96" height="96" rx="24" fill="url(#onboardingBadgeGradient)" />
      </Svg>
      <View style={styles.onboardingLogoIcon}>
        <CloakIcon size={50} color="#FFFFFF" />
      </View>
    </View>
  );
}

function SpendingLimitsCard({ wardInfo }: { wardInfo: WardInfo | null }) {
  const dailyLimit = wardInfo?.spendingLimitPerTx ? Number(wardInfo.spendingLimitPerTx) : 0;
  const maxPerTx = wardInfo?.maxPerTx ? Number(wardInfo.maxPerTx) : 0;
  // TODO: track daily usage on-chain or locally; for now show 0 used
  const dailyUsed = 0;
  const fillPercent = dailyLimit > 0 ? Math.min((dailyUsed / dailyLimit) * 100, 100) : 0;

  return (
    <View style={styles.wardLimitsCard}>
      <View style={styles.wardLimitsHeader}>
        <Gauge size={18} color={colors.primary} />
        <Text style={styles.wardLimitsTitle}>Spending Limits</Text>
      </View>

      <View style={styles.wardLimitBlock}>
        <View style={styles.wardLimitRow}>
          <Text style={styles.wardLimitLabel}>Daily Limit</Text>
          <Text style={styles.wardLimitValue}>
            {dailyLimit > 0
              ? `${dailyUsed} / ${dailyLimit} STRK`
              : "-- STRK"}
          </Text>
        </View>
        <View style={styles.wardLimitTrack}>
          <View style={[styles.wardLimitFill, styles.wardLimitFillDaily, { width: `${fillPercent}%` }]} />
        </View>
      </View>

      <View style={styles.wardLimitBlock}>
        <View style={styles.wardLimitRow}>
          <Text style={styles.wardLimitLabel}>Max / Txn</Text>
          <Text style={styles.wardLimitValue}>
            {maxPerTx > 0 ? `${maxPerTx} STRK` : "-- STRK"}
          </Text>
        </View>
      </View>
    </View>
  );
}

function ClaimSuccessCard({
  claimSuccess,
  token,
  onDone,
}: {
  claimSuccess: { txHash: string; amount: string };
  token: string;
  onDone: () => void;
}) {
  const hasFiredHaptic = useRef(false);
  useEffect(() => {
    if (!hasFiredHaptic.current) {
      hasFiredHaptic.current = true;
      triggerSuccess();
    }
  }, []);

  const displayTxHash =
    claimSuccess.txHash.length > 20
      ? `${claimSuccess.txHash.slice(0, 10)}...${claimSuccess.txHash.slice(-8)}`
      : claimSuccess.txHash;

  return (
    <View style={styles.claimSuccessCard}>
      <Confetti />
      {/* Check circle — 80x80, matching SendScreen */}
      <View style={styles.claimSuccessCircle}>
        <Check size={36} color="#10B981" />
      </View>
      <Text style={styles.claimSuccessTitle}>Claimed!</Text>
      <Text style={styles.claimSuccessDesc}>
        Pending funds have been added{"\n"}to your shielded balance
      </Text>

      {/* Detail card */}
      <View style={styles.claimDetailCard}>
        <View style={styles.claimDetailRow}>
          <Text style={styles.claimDetailLabel}>Amount</Text>
          <Text style={styles.claimDetailValue}>
            {claimSuccess.amount} units ({tongoToDisplay(claimSuccess.amount, token as any)} {token})
          </Text>
        </View>
        <View style={styles.claimDetailRow}>
          <Text style={styles.claimDetailLabel}>Tx Hash</Text>
          <Text style={[styles.claimDetailValue, { color: "#3B82F6" }]} numberOfLines={1} ellipsizeMode="middle">
            {displayTxHash}
          </Text>
        </View>
      </View>

      {/* Done button */}
      <TouchableOpacity
        style={styles.claimDoneBtn}
        onPress={onDone}
        activeOpacity={0.8}
      >
        <Check size={18} color="#fff" />
        <Text style={styles.claimDoneBtnText}>Done</Text>
      </TouchableOpacity>

      {/* Explorer link */}
      <TouchableOpacity
        onPress={() => Linking.openURL(`https://sepolia.voyager.online/tx/${claimSuccess.txHash}`)}
      >
        <Text style={styles.claimExplorerLink}>View on Voyager</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function HomeScreen({ navigation }: any) {
  const wallet = useWallet();
  const ward = useWardContext();
  const { execute } = useTransactionRouter();
  const modal = useThemedModal();
  const showLegacyInlineOnboardingForms = false;

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: wallet.isWalletCreated });
  }, [navigation, wallet.isWalletCreated]);
  const [showImport, setShowImport] = useState(false);
  const [showWardImport, setShowWardImport] = useState(false);
  const [importPK, setImportPK] = useState("");
  const [importAddr, setImportAddr] = useState("");
  const [wardInviteJson, setWardInviteJson] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [balanceHidden, setBalanceHidden] = useState(false);
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

  // Fetch recent transactions from Supabase for the "Recent Activity" section
  const [recentTxs, setRecentTxs] = useState<TransactionRecord[]>([]);
  const guardianTxTypes = new Set(["fund_ward", "deploy_ward", "configure_ward"]);
  const loadRecentTxs = useCallback(async () => {
    if (!wallet.keys?.starkAddress) return;
    try {
      const records = await getTransactions(wallet.keys.starkAddress);
      if (records && records.length > 0) {
        // For ward accounts, filter out guardian-initiated transactions
        const filtered = ward.isWard
          ? records.filter((r) => !guardianTxTypes.has(r.type || ""))
          : records;
        setRecentTxs(filtered.slice(0, 3));
      }
    } catch {
      // Non-critical — recent activity is supplementary
    }
  }, [wallet.keys?.starkAddress, ward.isWard]);

  useEffect(() => {
    if (wallet.isWalletCreated && wallet.isDeployed) {
      loadRecentTxs();
    }
  }, [wallet.isWalletCreated, wallet.isDeployed, loadRecentTxs]);

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
        contentContainerStyle={styles.onboardingContent}
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

          <OnboardingLogoBadge />
          <View style={styles.onboardingTextGroup}>
            <Text style={styles.heroTitle}>Cloak</Text>
            <Text style={styles.heroSubtitle}>
              Shielded payments on Starknet
            </Text>
          </View>
          <View style={styles.onboardingButtonGroup}>
            <TouchableOpacity
              {...testProps(testIDs.onboarding.createWallet)}
              style={styles.onboardingCreateButton}
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
              <Plus size={20} color="#FFFFFF" />
              <Text style={styles.onboardingCreateButtonText}>Create New Wallet</Text>
            </TouchableOpacity>
            <TouchableOpacity
              {...testProps(testIDs.onboarding.importExistingRoute)}
              style={styles.onboardingRouteLink}
              onPress={() => navigation.getParent()?.navigate("ImportAccount")}
            >
              <Text style={styles.onboardingRouteLinkText}>Import Existing Account</Text>
            </TouchableOpacity>
            <TouchableOpacity
              {...testProps(testIDs.onboarding.importWardRoute)}
              style={styles.onboardingRouteLink}
              onPress={() => navigation.getParent()?.navigate("ImportWard")}
            >
              <Text style={[styles.onboardingRouteLinkText, styles.onboardingRouteWardLinkText]}>Import Ward Account</Text>
            </TouchableOpacity>
          </View>

          {showLegacyInlineOnboardingForms && (
            <>
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
                    style={[styles.createButton, (!importPK || isImporting) && { opacity: 0.4 }]}
                    disabled={!importPK || isImporting}
                    onPress={async () => {
                      setIsImporting(true);
                      try {
                        await AsyncStorage.multiRemove([
                          "cloak_is_ward",
                          "cloak_guardian_address",
                          "cloak_ward_info_cache",
                        ]);
                        await wallet.importWallet(importPK.trim(), importAddr.trim() || undefined);
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
            </>
          )}
        </KeyboardSafeScreen>
    );
  }

  const displayBalance = tongoToDisplay(wallet.balance, wallet.selectedToken);
  const displayPending = tongoToDisplay(wallet.pending, wallet.selectedToken);
  const displayErc20 = erc20ToDisplay(wallet.erc20Balance, wallet.selectedToken);
  const isWardFrozen = ward.isWard && !!ward.wardInfo?.isFrozen;
  const hasPending = wallet.pending !== "0";
  const deployStatusValue = wallet.isCheckingDeployment
    ? "checking_deployment"
    : wallet.isDeployed
    ? "deployed"
    : wallet.isWalletCreated
    ? "needs_deploy"
    : "wallet_missing";
  const deployStatusMarker = `deploy.status=${deployStatusValue}`;
  const recentActivityItems: RecentActivityItem[] =
    recentTxs.length > 0
      ? recentTxs.map((tx, index) => {
          const txType = (tx.type || "").toLowerCase();
          const hash = tx.tx_hash || "";
          const kind: RecentActivityItem["kind"] =
            txType === "fund" ? "shielded"
            : txType === "rollover" ? "received"
            : txType === "withdraw" ? "sent"
            : txType === "transfer" ? "sent"
            : "sent";
          const title =
            txType === "fund" ? "Shielded"
            : txType === "withdraw" ? "Unshielded"
            : txType === "transfer" ? "Sent"
            : txType === "rollover" ? "Claimed"
            : txType === "erc20_transfer" ? "Sent (Public)"
            : "Transaction";
          let amountLabel = "";
          const token = (tx.token || "STRK") as TokenKey;
          const isPublic = txType === "erc20_transfer";
          // Guardian ward ops: amount stored as STRK display (from formatWardAmount)
          const isGuardianWardOp = tx.account_type === "guardian" && !isPublic;
          if (tx.amount) {
            const raw = tx.amount.trim().replace(/\s*(STRK|ETH|USDC)\s*$/i, "").trim();
            if (isPublic) {
              amountLabel = `${raw} ${token}`;
            } else if (isGuardianWardOp && raw.includes(".")) {
              // Reverse-convert STRK display → tongo units (e.g. "0.05" → "1")
              const cfg = TOKENS[token];
              try {
                const parts = raw.split(".");
                const whole = BigInt(parts[0] || "0");
                const fracStr = (parts[1] || "").padEnd(cfg.decimals, "0").slice(0, cfg.decimals);
                const frac = BigInt(fracStr);
                const wei = whole * (10n ** BigInt(cfg.decimals)) + frac;
                const units = wei / cfg.rate;
                amountLabel = unitLabel(units.toString());
              } catch {
                amountLabel = unitLabel(raw);
              }
            } else {
              // Shielded: raw is already tongo units
              amountLabel = unitLabel(raw);
            }
          }
          const isPositive = kind === "received" || kind === "shielded";
          const ts = tx.created_at ? new Date(tx.created_at).getTime() : 0;
          const timeAgo = ts > 0 ? formatTimeAgo(ts) : "";
          return {
            id: hash || `${txType || "tx"}-${index}`,
            kind,
            title,
            subtitle: timeAgo || txType,
            amountLabel: amountLabel ? `${isPositive ? "+" : "-"}${amountLabel}` : "",
            amountColor: isPositive ? colors.success : colors.primaryLight,
            txHash: hash || undefined,
          };
        })
      : [];

  const handleClaim = async () => {
    setIsClaiming(true);
    try {
      const pendingAmount = wallet.pending;
      const result = await execute({ action: "rollover", token: wallet.selectedToken, amount: pendingAmount || undefined });
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
    await loadRecentTxs();
    if (ward.isWard) {
      await ward.refreshWardInfo();
    }
  };

  const frozenBanner = isWardFrozen ? (
    <View style={styles.wardFrozenBanner}>
      <View style={styles.wardFrozenIconWrap}>
        <Snowflake size={20} color={colors.error} />
      </View>
      <View style={styles.wardFrozenInfo}>
        <Text style={styles.wardFrozenTitle}>Account Frozen</Text>
        <Text style={styles.wardFrozenDesc}>
          Your guardian has frozen this account. Contact them to restore access.
        </Text>
      </View>
    </View>
  ) : null;

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
        <ClaimSuccessCard
          claimSuccess={claimSuccess}
          token={wallet.selectedToken}
          onDone={async () => {
            setClaimSuccess(null);
            await wallet.refreshBalance();
          }}
        />
      )}

      {!claimSuccess && (
        <>
      {/* Frozen Banner */}
      {frozenBanner}

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
              style={styles.balanceVisibilityToggle}
            >
              {balanceHidden ? (
                <Eye size={16} color={colors.textMuted} />
              ) : (
                <EyeOff size={16} color={colors.textMuted} />
              )}
            </TouchableOpacity>
          </View>
          <Text style={styles.balanceAmount}>
            {balanceHidden ? "****" : unitLabel(wallet.balance)}
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

          {/* Claim Banner — only when there are real pending funds */}
          {hasPending && !isWardFrozen && (
          <TouchableOpacity
            {...testProps(testIDs.home.claimPending)}
            style={styles.claimBanner}
            onPress={handleClaim}
            disabled={isClaiming}
            activeOpacity={0.72}
          >
            <ArrowDownToLine size={20} color={colors.success} />
            <View style={styles.claimTextWrap}>
              <Text style={styles.claimBannerTitle}>Pending funds available</Text>
              <Text style={styles.claimBannerSub}>
                Tap to claim {wallet.pending} units to your shielded balance
              </Text>
            </View>
            {isClaiming ? <ActivityIndicator size="small" color={colors.success} /> : null}
          </TouchableOpacity>
          )}

      {/* Quick Actions */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          {...testProps(testIDs.home.quickSend)}
          style={[styles.actionButton, styles.actionSend]}
          onPress={() => navigation.navigate("Send")}
          disabled={isWardFrozen}
          activeOpacity={isWardFrozen ? 0.35 : 0.72}
        >
          <Send size={28} color={colors.primary} style={styles.actionIconSpacing} />
          <Text style={styles.actionLabel}>Send</Text>
        </TouchableOpacity>
        <TouchableOpacity
          {...testProps(testIDs.home.quickShield)}
          style={[styles.actionButton, styles.actionShield]}
          onPress={() => navigation.navigate("Wallet", { mode: "shield" })}
          disabled={isWardFrozen}
          activeOpacity={isWardFrozen ? 0.35 : 0.72}
        >
          <ShieldPlus size={28} color={colors.success} style={styles.actionIconSpacing} />
          <Text style={styles.actionLabel}>Shield</Text>
        </TouchableOpacity>
        <TouchableOpacity
          {...testProps(testIDs.home.quickUnshield)}
          style={[styles.actionButton, styles.actionUnshield]}
          onPress={() => navigation.navigate("Wallet", { mode: "unshield" })}
          disabled={isWardFrozen}
          activeOpacity={isWardFrozen ? 0.35 : 0.72}
        >
          <ShieldOff size={28} color={colors.secondary} style={styles.actionIconSpacing} />
          <Text style={styles.actionLabel}>Unshield</Text>
        </TouchableOpacity>
      </View>

      {/* Spending Limits — ward only */}
      {ward.isWard && <SpendingLimitsCard wardInfo={ward.wardInfo} />}

      {/* Recent Activity */}
      <View style={styles.recentSection}>
        <View style={styles.recentHeader}>
          <Text style={styles.recentTitle}>Recent Activity</Text>
          {recentActivityItems.length > 0 && (
            <TouchableOpacity onPress={() => navigation.navigate("Activity")}>
              <Text style={styles.recentSeeAll}>View All</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.recentList}>
          {recentActivityItems.length === 0 ? (
            <View style={styles.recentEmptyState}>
              <Ghost size={48} color={colors.textSecondary} style={{ opacity: 0.5 }} />
              <Text style={styles.recentEmptyText}>No activity yet</Text>
              <Text style={styles.recentEmptyHint}>Your transactions will appear here</Text>
            </View>
          ) : (
            recentActivityItems.map((item) => {
              const iconBg =
                item.kind === "received"
                  ? "rgba(16, 185, 129, 0.08)"
                  : "rgba(59, 130, 246, 0.08)";
              const iconColor =
                item.kind === "received" ? colors.success : colors.primaryLight;
              const rowIcon =
                item.kind === "received" ? (
                  <ArrowDownToLine size={16} color={iconColor} />
                ) : item.kind === "shielded" ? (
                  <ShieldPlus size={16} color={iconColor} />
                ) : (
                  <ArrowUpFromLine size={16} color={iconColor} />
                );
              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.recentItemCard}
                  disabled={!item.txHash}
                  activeOpacity={item.txHash ? 0.72 : 1}
                  onPress={() =>
                    item.txHash
                      ? navigation.getParent()?.navigate("TransactionDetail", {
                          txHash: item.txHash,
                          type: item.kind,
                        })
                      : undefined
                  }
                >
                  <View style={styles.recentItemLeft}>
                    <View style={[styles.recentItemIconWrap, { backgroundColor: iconBg }]}>
                      {rowIcon}
                    </View>
                    <View>
                      <Text style={styles.recentType}>{item.title}</Text>
                      <Text style={styles.recentSub}>{item.subtitle}</Text>
                    </View>
                  </View>
                  <Text style={[styles.recentAmount, { color: item.amountColor }]}>{item.amountLabel}</Text>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </View>

        </>
      )}
    </KeyboardSafeScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 96,
  },
  markerContainer: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 1,
    height: 1,
    overflow: "hidden",
    opacity: 0,
  },
  markerNode: {
    width: 1,
    height: 1,
  },
  markerText: {
    fontSize: 1,
    color: "transparent",
  },
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  onboardingContent: {
    flexGrow: 1,
    backgroundColor: colors.bg,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
    paddingBottom: spacing.xl,
    gap: 32,
  },
  loadingText: {
    color: colors.textSecondary,
    marginTop: spacing.md,
    fontSize: fontSize.md,
    fontFamily: typography.secondary,
  },
  heroIcon: { marginBottom: spacing.md },
  onboardingLogoBadge: {
    width: 96,
    height: 96,
    position: "relative",
  },
  onboardingLogoIcon: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  onboardingTextGroup: {
    alignItems: "center",
    gap: 8,
  },
  heroTitle: {
    fontSize: 36,
    lineHeight: 42,
    fontWeight: "700",
    color: colors.text,
    fontFamily: typography.primarySemibold,
  },
  heroSubtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: "center",
    fontFamily: typography.secondary,
  },
  onboardingButtonGroup: {
    width: "100%",
    gap: 16,
    alignItems: "center",
  },
  onboardingCreateButton: {
    width: "100%",
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  onboardingCreateButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    fontFamily: typography.primarySemibold,
  },
  createButton: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: borderRadius.lg,
  },
  createButtonText: {
    color: "#fff",
    fontSize: fontSize.lg,
    fontWeight: "600",
    fontFamily: typography.primarySemibold,
  },
  onboardingRouteLink: {
    paddingVertical: 2,
  },
  onboardingRouteLinkText: {
    color: colors.primaryLight,
    fontSize: 15,
    fontWeight: "500",
    fontFamily: typography.secondarySemibold,
  },
  onboardingRouteWardLinkText: {
    color: colors.warning,
  },
  importToggle: { marginTop: spacing.lg },
  importToggleText: { color: colors.primary, fontSize: fontSize.sm, fontFamily: typography.secondary },
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
    fontFamily: typography.primarySemibold,
  },
  importInput: {
    backgroundColor: colors.bg,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: fontSize.sm,
    color: colors.text,
    fontFamily: typography.primary,
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
    fontFamily: typography.secondarySemibold,
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
    fontFamily: typography.primarySemibold,
  },
  scanModalStatusLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginBottom: spacing.sm,
    fontFamily: typography.secondary,
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
    fontFamily: typography.secondary,
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
    fontFamily: typography.primarySemibold,
  },

  // Balance Card
  balanceCard: {
    overflow: "hidden",
    borderRadius: 20,
    padding: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
    minHeight: 260,
  },
  glowTopRight: {
    position: "absolute",
    top: -64,
    right: -40,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "rgba(59, 130, 246, 0.20)",
    opacity: 0.5,
  },
  glowBottomLeft: {
    position: "absolute",
    bottom: -42,
    left: -30,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(139, 92, 246, 0.20)",
    opacity: 0.4,
  },
  balanceContent: { position: "relative" },
  balanceLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  balanceVisibilityToggle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(148, 163, 184, 0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  balanceLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    fontFamily: typography.primarySemibold,
  },
  eyeIcon: {},
  balanceAmount: {
    fontSize: 36,
    lineHeight: 42,
    fontWeight: "700",
    color: colors.text,
    fontFamily: typography.primarySemibold,
  },
  balanceSecondary: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
    fontFamily: typography.primary,
  },
  pendingText: {
    fontSize: fontSize.sm,
    color: colors.warning,
    marginTop: spacing.sm,
    fontFamily: typography.secondary,
  },
  erc20Label: {
    fontSize: 11,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginTop: 14,
    fontFamily: typography.primary,
    fontWeight: "500",
  },
  erc20Amount: { fontSize: 16, color: colors.textSecondary, marginTop: 2, fontFamily: typography.primarySemibold, fontWeight: "600" },
  erc20Symbol: { fontSize: 16, color: colors.textMuted, fontFamily: typography.primary },

  // Claim Banner
  claimBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(16, 185, 129, 0.10)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.25)",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 12,
  },
  claimTextWrap: {
    flex: 1,
    justifyContent: "center",
  },
  claimBannerTitle: {
    fontSize: 13,
    color: colors.success,
    fontWeight: "600",
    fontFamily: typography.primarySemibold,
  },
  claimBannerSub: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    fontFamily: typography.secondary,
  },

  // Actions
  actionsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  actionButton: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    height: 110,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
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
  actionIcon: { fontSize: 28, marginBottom: spacing.xs },
  actionIconSpacing: { marginBottom: 10 },
  actionLabel: {
    fontSize: 13,
    color: colors.text,
    fontWeight: "600",
    fontFamily: typography.primarySemibold,
  },

  // Recent Activity
  recentSection: {
    flex: 1,
    marginBottom: 14,
    gap: 10,
  },
  recentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  recentTitle: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    fontFamily: typography.primarySemibold,
  },
  recentSeeAll: {
    fontSize: 13,
    color: colors.primaryLight,
    fontWeight: "500",
    fontFamily: typography.secondarySemibold,
  },
  recentList: {
    gap: 8,
  },
  recentItemCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  recentItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  recentItemIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  recentType: {
    fontSize: 12,
    color: colors.text,
    fontFamily: typography.primarySemibold,
  },
  recentSub: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
    fontFamily: typography.secondary,
  },
  recentAmount: {
    fontSize: 13,
    fontFamily: typography.primarySemibold,
  },
  recentEmptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    gap: 8,
  },
  recentEmptyText: {
    fontSize: 15,
    color: colors.textSecondary,
    fontFamily: typography.primarySemibold,
    opacity: 0.7,
    marginTop: 4,
  },
  recentEmptyHint: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: typography.secondary,
    opacity: 0.5,
  },

  // Claim Success Card (matches SendScreen success modal design)
  claimSuccessCard: {
    width: "100%",
    backgroundColor: "#1E293B",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#2D3B4D",
    paddingTop: 40,
    paddingHorizontal: 32,
    paddingBottom: 32,
    alignItems: "center",
    gap: 20,
    position: "relative",
    overflow: "hidden",
  },
  claimSuccessCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(16, 185, 129, 0.13)",
    borderWidth: 3,
    borderColor: "#10B981",
    justifyContent: "center",
    alignItems: "center",
  },
  claimSuccessTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#10B981",
    fontFamily: typography.primarySemibold,
  },
  claimSuccessDesc: {
    fontSize: 14,
    color: "#94A3B8",
    fontFamily: typography.secondary,
    textAlign: "center",
    lineHeight: 21,
  },
  claimDetailCard: {
    width: "100%",
    backgroundColor: "#0F172A",
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  claimDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  claimDetailLabel: {
    fontSize: 12,
    color: "#64748B",
    fontFamily: typography.primary,
  },
  claimDetailValue: {
    fontSize: 12,
    color: "#F8FAFC",
    fontFamily: typography.primarySemibold,
    flexShrink: 1,
    textAlign: "right",
    maxWidth: "60%",
  },
  claimDoneBtn: {
    width: "100%",
    height: 48,
    borderRadius: 14,
    backgroundColor: "#10B981",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  claimDoneBtnText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#fff",
    fontFamily: typography.primarySemibold,
  },
  claimExplorerLink: {
    fontSize: 13,
    color: "#3B82F6",
    fontFamily: typography.primarySemibold,
  },

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

  // Ward Frozen Variant (Sap4z)
  wardFrozenBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.25)",
    backgroundColor: "rgba(239, 68, 68, 0.10)",
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  wardFrozenIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(239, 68, 68, 0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  wardFrozenInfo: {
    flex: 1,
  },
  wardFrozenTitle: {
    fontSize: 14,
    color: colors.error,
    fontFamily: typography.primarySemibold,
    fontWeight: "700",
  },
  wardFrozenDesc: {
    fontSize: 12,
    lineHeight: 16,
    color: "rgba(239, 68, 68, 0.64)",
    marginTop: 2,
    fontFamily: typography.secondary,
  },
  wardLimitsCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 16,
    gap: 14,
    marginBottom: 10,
  },
  wardLimitsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  wardLimitsTitle: {
    fontSize: 14,
    color: colors.text,
    fontFamily: typography.primarySemibold,
    fontWeight: "600",
  },
  wardLimitBlock: {
    gap: 6,
  },
  wardLimitRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  wardLimitLabel: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: typography.primary,
  },
  wardLimitValue: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: typography.primarySemibold,
    fontWeight: "500",
  },
  wardLimitTrack: {
    width: "100%",
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.inputBg,
    overflow: "hidden",
  },
  wardLimitFill: {
    height: 6,
    borderRadius: 3,
  },
  wardLimitFillDaily: {
    backgroundColor: colors.primary,
  },
  wardLimitFillMonthly: {
    width: "30%",
    backgroundColor: colors.secondary,
  },
  wardAllowedTokenRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 4,
  },
  wardAllowedTokenLabel: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: typography.primary,
  },
  wardAllowedTokenBadge: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: colors.inputBg,
  },
  wardAllowedTokenBadgeText: {
    fontSize: 11,
    color: colors.text,
    fontFamily: typography.primarySemibold,
  },
});
