/**
 * SettingsScreen — Key backup, wallet info, QR codes, and preferences.
 */
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
} from "react-native";
import Clipboard from "@react-native-clipboard/clipboard";
import QRCode from "react-native-qrcode-svg";
import { Plus, Trash2, Users, Shield, Wallet2, Key, Globe, AlertTriangle, Lock, Check, ShieldAlert, ShieldCheck, ShieldOff, RefreshCw, X, Gem, Download, Smartphone, LogOut, LockOpen, TriangleAlert } from "lucide-react-native";
import { useWallet } from "../lib/WalletContext";
import { clearWallet } from "../lib/keys";
import { useContacts } from "../hooks/useContacts";
import { useTwoFactor, type TwoFAStep } from "../lib/TwoFactorContext";
import { useWardContext, type WardEntry, type WardCreationProgress, type WardCreationOptions } from "../lib/wardContext";
import { colors, spacing, fontSize, borderRadius, typography } from "../lib/theme";
import { useThemedModal } from "../components/ThemedModal";
import { KeyboardSafeScreen, KeyboardSafeModal } from "../components/KeyboardSafeContainer";
import { testIDs, testProps } from "../testing/testIDs";

const WARD_STEPS = [
  { step: 1, label: "Generate ward keys" },
  { step: 2, label: "Deploy ward contract" },
  { step: 3, label: "Confirm deployment" },
  { step: 4, label: "Fund ward (configured amount)" },
  { step: 5, label: "Add STRK as token" },
  { step: 6, label: "Register in database" },
];

const WARD_DECIMALS = 18;

function parseStrkToHexWei(rawAmount: string): string | undefined {
  const normalized = rawAmount.trim();
  if (!normalized) return undefined;
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error("Invalid STRK amount");
  }

  const [wholeRaw, fracRaw = ""] = normalized.split(".");
  if (fracRaw.length > WARD_DECIMALS) {
    throw new Error("Max 18 decimal places allowed");
  }
  const fracPadded = fracRaw.padEnd(WARD_DECIMALS, "0").slice(0, WARD_DECIMALS);
  const wei = BigInt(wholeRaw || "0") * (10n ** BigInt(WARD_DECIMALS));
  const frac = BigInt(fracPadded || "0");
  const total = wei + frac;
  if (total <= 0n) {
    throw new Error("Funding amount must be greater than 0");
  }
  return `0x${total.toString(16)}`;
}

function formatWeiToStrkDisplay(rawWei?: string): string {
  if (!rawWei) return "0.5";
  try {
    const wei = BigInt(rawWei);
    const unit = 10n ** BigInt(WARD_DECIMALS);
    const whole = wei / unit;
    const fraction = wei % unit;
    const fractionText = fraction.toString().padStart(WARD_DECIMALS, "0").replace(/0+$/, "");
    return fractionText ? `${whole}.${fractionText}` : `${whole}`;
  } catch {
    return "0.5";
  }
}

function WardCreationModal({ visible, currentStep, stepMessage, failed, errorMessage, onRetry, onClose }: {
  visible: boolean;
  currentStep: number;
  stepMessage: string;
  failed: boolean;
  errorMessage: string | null;
  onRetry: () => void;
  onClose: () => void;
}) {
  const isDone = currentStep > 6 && !failed;
  const markerStatus = failed ? "failed" : isDone ? "done" : "in_progress";
  const markerStepText = `ward.creation.step=${currentStep}`;
  const markerStatusText = `ward.creation.status=${markerStatus}`;
  const progressFraction = Math.min(currentStep / 6, 1);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (isDone || failed) onClose(); }}>
      <View style={wardModalStyles.overlay}>
        <View style={wardModalStyles.card}>
          <View pointerEvents="none" style={styles.testMarkerContainer} collapsable={false}>
            <View
              {...testProps(testIDs.markers.wardCreationStep, markerStepText)}
              style={styles.testMarkerNode}
              collapsable={false}
              accessible
              importantForAccessibility="yes"
            >
              <Text style={styles.testMarkerText}>{markerStepText}</Text>
            </View>
            <View
              {...testProps(testIDs.markers.wardCreationStatus, markerStatusText)}
              style={styles.testMarkerNode}
              collapsable={false}
              accessible
              importantForAccessibility="yes"
            >
              <Text style={styles.testMarkerText}>{markerStatusText}</Text>
            </View>
          </View>

          <Text style={wardModalStyles.title}>
            {isDone ? "Ward Created!" : failed ? "Creation Failed" : "Creating Ward"}
          </Text>

          {!isDone && !failed && (
            <Text style={wardModalStyles.subtitle}>
              Setting up your new ward account on Starknet. This may take a moment.
            </Text>
          )}

          {/* Step list (cuF9k parity) */}
          <View style={wardModalStyles.stepper}>
            {WARD_STEPS.map((s) => {
              const isComplete = currentStep > s.step;
              const isActive = currentStep === s.step && !failed;
              const isFailed = currentStep === s.step && failed;
              return (
                <View key={s.step} style={wardModalStyles.stepItem}>
                  <View style={[
                    wardModalStyles.stepDot,
                    isComplete && wardModalStyles.stepDotComplete,
                    isActive && wardModalStyles.stepDotActive,
                    isFailed && wardModalStyles.stepDotFailed,
                  ]}>
                    {isComplete && <Check size={12} color="#fff" />}
                    {isFailed && <X size={12} color={colors.error} />}
                  </View>
                  <Text style={[
                    wardModalStyles.stepText,
                    isComplete && wardModalStyles.stepTextComplete,
                    isActive && wardModalStyles.stepTextActive,
                    isFailed && wardModalStyles.stepTextFailed,
                  ]}>
                    {s.label}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Progress bar */}
          {!isDone && !failed && (
            <View style={wardModalStyles.progressContainer}>
              <View style={wardModalStyles.progressTrack}>
                <View style={[wardModalStyles.progressFill, { width: `${progressFraction * 100}%` }]} />
              </View>
              <Text style={wardModalStyles.progressLabel}>
                Step {Math.min(currentStep, 6)} of 6
              </Text>
            </View>
          )}

          {/* Error message */}
          {failed && errorMessage && (
            <View style={wardModalStyles.errorBox}>
              <Text style={wardModalStyles.errorText} numberOfLines={3}>{errorMessage}</Text>
            </View>
          )}

          {/* Actions */}
          {isDone && (
            <TouchableOpacity
              {...testProps(testIDs.settings.wardCreationDone)}
              style={wardModalStyles.doneBtn}
              onPress={onClose}
            >
              <Text style={wardModalStyles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          )}

          {failed && (
            <View style={wardModalStyles.failedActions}>
              <TouchableOpacity
                {...testProps(testIDs.settings.wardCreationRetry)}
                style={wardModalStyles.retryBtn}
                onPress={onRetry}
              >
                <RefreshCw size={14} color="#fff" />
                <Text style={wardModalStyles.retryBtnText}>Retry</Text>
              </TouchableOpacity>
              <TouchableOpacity
                {...testProps(testIDs.settings.wardCreationDismiss)}
                style={wardModalStyles.dismissBtn}
                onPress={onClose}
              >
                <Text style={wardModalStyles.dismissBtnText}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          )}

          {!isDone && !failed && (
            <TouchableOpacity style={wardModalStyles.cancelBtn} onPress={onClose}>
              <Text style={wardModalStyles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const TFA_ENABLE_STEPS: { step: TwoFAStep; label: string }[] = [
  { step: "auth", label: "Authenticating" },
  { step: "keygen", label: "Generating keys" },
  { step: "onchain", label: "Submitting on-chain" },
  { step: "register", label: "Registering" },
  { step: "done", label: "Complete" },
];

const TFA_DISABLE_STEPS: { step: TwoFAStep; label: string }[] = [
  { step: "auth", label: "Authenticating" },
  { step: "keygen", label: "Removing key" },
  { step: "onchain", label: "Submitting on-chain" },
  { step: "register", label: "Confirming" },
  { step: "done", label: "Complete" },
];

function TwoFAConfirmModal({
  visible,
  action,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  action: "enable" | "disable";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isEnabling = action === "enable";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={tfaConfirmStyles.overlay}>
        <View style={[tfaConfirmStyles.card, isEnabling ? tfaConfirmStyles.cardEnable : tfaConfirmStyles.cardDisable]}>
          {/* Icon */}
          <View style={[tfaConfirmStyles.iconCircle, isEnabling ? tfaConfirmStyles.iconCircleEnable : tfaConfirmStyles.iconCircleDisable]}>
            {isEnabling ? (
              <ShieldCheck size={36} color="#3B82F6" />
            ) : (
              <ShieldOff size={36} color="#EF4444" />
            )}
          </View>

          {/* Title */}
          <Text style={tfaConfirmStyles.title}>
            {isEnabling
              ? "Enable Two-Factor\nAuthentication?"
              : "Disable Two-Factor\nAuthentication?"}
          </Text>

          {/* Description */}
          <Text style={tfaConfirmStyles.description}>
            {isEnabling
              ? "Every transaction will require approval from your mobile device. Even if your keys are compromised, your funds stay safe."
              : "Removing 2FA means transactions will no longer require mobile approval. Your account will be protected by a single key only."}
          </Text>

          {/* Info/Warning box */}
          {isEnabling ? (
            <View style={tfaConfirmStyles.infoBox}>
              <View style={tfaConfirmStyles.infoRow}>
                <View style={[tfaConfirmStyles.infoDot, { backgroundColor: "#3B82F6" }]} />
                <Text style={tfaConfirmStyles.infoText}>Pair your mobile device</Text>
              </View>
              <View style={tfaConfirmStyles.infoRow}>
                <View style={[tfaConfirmStyles.infoDot, { backgroundColor: "#3B82F6" }]} />
                <Text style={tfaConfirmStyles.infoText}>Register secondary key on-chain</Text>
              </View>
              <View style={tfaConfirmStyles.infoRow}>
                <View style={[tfaConfirmStyles.infoDot, { backgroundColor: "#3B82F6" }]} />
                <Text style={tfaConfirmStyles.infoText}>Dual-key signing for all transactions</Text>
              </View>
            </View>
          ) : (
            <View style={tfaConfirmStyles.warningBox}>
              <View style={tfaConfirmStyles.infoRow}>
                <TriangleAlert size={16} color="#F59E0B" />
                <Text style={tfaConfirmStyles.infoText}>Single-key signing only</Text>
              </View>
              <View style={tfaConfirmStyles.infoRow}>
                <TriangleAlert size={16} color="#F59E0B" />
                <Text style={tfaConfirmStyles.infoText}>No mobile approval required</Text>
              </View>
              <View style={tfaConfirmStyles.infoRow}>
                <TriangleAlert size={16} color="#F59E0B" />
                <Text style={tfaConfirmStyles.infoText}>On-chain transaction required</Text>
              </View>
            </View>
          )}

          {/* Buttons */}
          <View style={tfaConfirmStyles.buttons}>
            <TouchableOpacity
              style={[tfaConfirmStyles.primaryBtn, isEnabling ? tfaConfirmStyles.primaryBtnEnable : tfaConfirmStyles.primaryBtnDisable]}
              onPress={onConfirm}
            >
              {isEnabling ? (
                <ShieldCheck size={18} color="#FFFFFF" />
              ) : (
                <ShieldOff size={18} color="#FFFFFF" />
              )}
              <Text style={tfaConfirmStyles.primaryBtnText}>
                {isEnabling ? "Enable 2FA" : "Disable 2FA"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={tfaConfirmStyles.cancelBtn} onPress={onCancel}>
              <Text style={tfaConfirmStyles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function TwoFAProgressModal({
  visible,
  action,
  currentStep,
  onClose,
}: {
  visible: boolean;
  action: "enable" | "disable";
  currentStep: TwoFAStep;
  onClose: () => void;
}) {
  const steps = action === "enable" ? TFA_ENABLE_STEPS : TFA_DISABLE_STEPS;
  const isError = currentStep === "error";
  const isDone = currentStep === "done";

  // Auto-dismiss after 1.5s on done
  useEffect(() => {
    if (isDone) {
      const timer = setTimeout(onClose, 1500);
      return () => clearTimeout(timer);
    }
  }, [isDone, onClose]);

  // Find the index of the current active step
  const activeIndex = steps.findIndex((s) => s.step === currentStep);
  const progressFraction = isDone
    ? 1
    : isError
    ? (activeIndex >= 0 ? activeIndex : 0) / steps.length
    : activeIndex >= 0
    ? activeIndex / steps.length
    : 0;

  const isEnabling = action === "enable";
  const accentColor = isEnabling ? "#3B82F6" : "#EF4444";

  // Step status text
  const statusTextMap: Record<string, string> = {
    idle: "Preparing...",
    auth: "Verifying biometric identity...",
    keygen: isEnabling ? "Generating secondary key pair..." : "Retrieving key material...",
    onchain: isEnabling ? "Submitting set_secondary_key..." : "Submitting remove_secondary_key...",
    register: isEnabling ? "Registering config in database..." : "Removing config from database...",
    done: isEnabling ? "2FA successfully enabled" : "2FA successfully disabled",
    error: "Operation failed",
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (isDone || isError) onClose(); }}>
      <View style={tfaModalStyles.overlay}>
        <View style={[tfaModalStyles.card, !isEnabling && tfaModalStyles.cardDisable]}>
          {/* modalInner section */}
          <View style={tfaModalStyles.modalInner}>
            {/* Icon */}
            <View style={[tfaModalStyles.iconCircle, isEnabling ? tfaModalStyles.iconCircleBlue : tfaModalStyles.iconCircleRed]}>
              {isError ? (
                <X size={32} color={colors.error} />
              ) : isDone ? (
                <Check size={32} color={colors.success} />
              ) : isEnabling ? (
                <ShieldCheck size={32} color="#3B82F6" />
              ) : (
                <ShieldOff size={32} color="#EF4444" />
              )}
            </View>

            {/* Title */}
            <Text style={tfaModalStyles.title}>
              {isError
                ? "Failed"
                : isDone
                ? isEnabling
                  ? "2FA Enabled!"
                  : "2FA Disabled!"
                : isEnabling
                ? "Enabling 2FA..."
                : "Disabling 2FA..."}
            </Text>

            {/* Step list */}
            <View style={tfaModalStyles.stepper}>
              {steps.map((s, i) => {
                const isComplete = activeIndex > i || isDone;
                const isActive = activeIndex === i && !isDone && !isError;
                const isFailed = isError && activeIndex === i;

                return (
                  <View key={s.step} style={tfaModalStyles.stepItem}>
                    <View
                      style={[
                        tfaModalStyles.stepDot,
                        isComplete && tfaModalStyles.stepDotComplete,
                        isActive && [tfaModalStyles.stepDotActive, !isEnabling && { borderColor: "#EF4444", backgroundColor: "rgba(239, 68, 68, 0.1)" }],
                        isFailed && tfaModalStyles.stepDotFailed,
                      ]}
                    >
                      {isComplete && <Check size={14} color="#fff" />}
                      {isFailed && <X size={14} color={colors.error} />}
                    </View>
                    <Text
                      style={[
                        tfaModalStyles.stepText,
                        isComplete && tfaModalStyles.stepTextComplete,
                        isActive && [tfaModalStyles.stepTextActive, !isEnabling && { color: "#F8FAFC" }],
                        isFailed && tfaModalStyles.stepTextFailed,
                      ]}
                    >
                      {s.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* bottomSection */}
          <View style={tfaModalStyles.bottomSection}>
            {/* Progress bar */}
            <View style={tfaModalStyles.progressContainer}>
              <View style={tfaModalStyles.progressTrack}>
                <View style={[tfaModalStyles.progressFill, { width: `${progressFraction * 100}%`, backgroundColor: accentColor }]} />
              </View>
              <Text style={tfaModalStyles.statusText}>{statusTextMap[currentStep] || "Processing..."}</Text>
            </View>

            {/* Error close button */}
            {isError && (
              <TouchableOpacity style={tfaModalStyles.closeBtn} onPress={onClose}>
                <Text style={tfaModalStyles.closeBtnText}>Close</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function WardCreationSetupModal({
  visible,
  pseudoName,
  initialAmountInput,
  onPseudoNameChange,
  onInitialAmountChange,
  validationError,
  onStart,
  onCancel,
}: {
  visible: boolean;
  pseudoName: string;
  initialAmountInput: string;
  onPseudoNameChange: (value: string) => void;
  onInitialAmountChange: (value: string) => void;
  validationError: string | null;
  onStart: () => void;
  onCancel: () => void;
}) {
  return (
    <KeyboardSafeModal
      visible={visible}
      onRequestClose={onCancel}
      overlayStyle={wardModalStyles.overlay}
      contentStyle={wardModalStyles.card}
      contentMaxHeight="90%"
      contentScrollable
    >
      <Text style={wardModalStyles.title}>New Ward Settings</Text>
      <Text style={wardModalStyles.subtitle}>
        Add a pseudo name and fund amount before creating the ward.
      </Text>

      <View style={styles.wardSetupForm}>
        <Text style={styles.inputLabel}>Pseudo Name</Text>
        <TextInput
          {...testProps(testIDs.settings.wardCreationNameInput)}
          style={styles.wardSetupInput}
          placeholder="e.g. Alice's spending wallet"
          placeholderTextColor={colors.textMuted}
          value={pseudoName}
          onChangeText={onPseudoNameChange}
          autoCapitalize="sentences"
        />

        <Text style={styles.inputLabel}>Initial STRK funding (default 0.5)</Text>
        <TextInput
          {...testProps(testIDs.settings.wardCreationFundingInput)}
          style={styles.wardSetupInput}
          placeholder="0.5"
          placeholderTextColor={colors.textMuted}
          value={initialAmountInput}
          onChangeText={onInitialAmountChange}
          keyboardType="decimal-pad"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
        />

        {validationError && (
          <Text style={styles.wardSetupError}>{validationError}</Text>
        )}

        <TouchableOpacity
          {...testProps(testIDs.settings.wardCreationStart)}
          style={styles.wardSetupPrimary}
          onPress={onStart}
        >
          <Text style={wardModalStyles.doneBtnText}>Create Ward</Text>
        </TouchableOpacity>

        <TouchableOpacity
          {...testProps(testIDs.settings.wardCreationCancel)}
          style={styles.wardSetupSecondary}
          onPress={onCancel}
        >
          <Text style={styles.wardSetupSecondaryText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </KeyboardSafeModal>
  );
}

function shortenMiddle(value: string, prefixLen: number, suffixLen: number): string {
  const v = value || "";
  if (v.length <= prefixLen + suffixLen + 3) return v;
  return `${v.slice(0, prefixLen)}...${v.slice(-suffixLen)}`;
}

function CopyRow({ label, value, displayValue }: { label: string; value: string; displayValue?: string }) {
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
          {displayValue ?? value}
        </Text>
        <Text style={styles.copyBtn}>{copied ? "Copy" : "Copy"}</Text>
      </TouchableOpacity>
    </View>
  );
}

function InlineQR({ value, glowColor }: { value: string; glowColor: "blue" | "violet" }) {
  return (
    <View style={styles.qrContainer}>
      <View style={[
        styles.qrGlow,
        glowColor === "blue" ? styles.qrGlowBlue : styles.qrGlowViolet
      ]} />
      <View style={styles.qrInlineWrapper}>
        <QRCode value={value} size={100} backgroundColor="transparent" color="rgba(148, 163, 184, 0.7)" />
      </View>
    </View>
  );
}

function FullScreenQR({ visible, label, value, onClose }: { visible: boolean; label: string; value: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    Clipboard.setString(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.qrModalOverlay}>
        <View style={styles.qrModalCard}>
          <Text style={styles.qrModalTitle}>Receive</Text>
          <Text style={styles.qrModalDesc}>
            Scan this QR code or copy your address to receive funds.
          </Text>
          <View style={styles.qrModalQRWrapper}>
            <QRCode value={value} size={200} backgroundColor="#FFFFFF" color="#000000" />
          </View>
          <Text style={styles.qrModalAddressLabel}>Your Cloak Address</Text>
          <TouchableOpacity
            {...testProps(testIDs.settings.qrCopy)}
            style={styles.qrModalAddressRow}
            onPress={handleCopy}
          >
            <Text
              {...testProps(testIDs.settings.qrValue)}
              style={styles.qrModalAddress}
              numberOfLines={1}
            >
              {shortenMiddle(value, 12, 6)}
            </Text>
            <Text style={styles.qrModalCopyIcon}>{copied ? "✓" : "⎘"}</Text>
          </TouchableOpacity>
          <View style={styles.qrModalActions}>
            <TouchableOpacity style={styles.qrModalShareBtn} onPress={handleCopy}>
              <Text style={styles.qrModalShareText}>{copied ? "Copied!" : "Share"}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              {...testProps(testIDs.settings.qrClose)}
              style={styles.qrModalCloseBtn}
              onPress={onClose}
            >
              <Text style={styles.qrModalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function SettingsScreen({ navigation }: any) {
  const wallet = useWallet();
  const modal = useThemedModal();
  const twoFactor = useTwoFactor();
  const ward = useWardContext();
  const { contacts, addContact, removeContact } = useContacts();
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactAddr, setNewContactAddr] = useState("");
  const [qrModal, setQrModal] = useState<{ label: string; value: string } | null>(null);

  // 2FA state
  const [tfaLoading, setTfaLoading] = useState(false);
  const [tfaConfirmVisible, setTfaConfirmVisible] = useState(false);
  const [tfaModalVisible, setTfaModalVisible] = useState(false);
  const [tfaModalAction, setTfaModalAction] = useState<"enable" | "disable">("enable");
  const [tfaStep, setTfaStep] = useState<TwoFAStep>("idle");

  // Ward management state
  const [isCreatingWard, setIsCreatingWard] = useState(false);
  const [wardModalVisible, setWardModalVisible] = useState(false);
  const [wardSetupModalVisible, setWardSetupModalVisible] = useState(false);
  const [wardStep, setWardStep] = useState(0);
  const [wardStepMessage, setWardStepMessage] = useState("");
  const [wardFailed, setWardFailed] = useState(false);
  const [wardError, setWardError] = useState<string | null>(null);
  const [wardSetupError, setWardSetupError] = useState<string | null>(null);
  const [wardResult, setWardResult] = useState<{ wardAddress: string; wardPrivateKey: string; qrPayload: string } | null>(null);
  const [wardCreatePseudoName, setWardCreatePseudoName] = useState("");
  const [wardInitialFundingAmount, setWardInitialFundingAmount] = useState("0.5");
  const [wardRetryMode, setWardRetryMode] = useState(false);
  const [wardLastOptions, setWardLastOptions] = useState<WardCreationOptions>({});
  const [wardAction, setWardAction] = useState<string | null>(null);

  // Freeze Ward confirmation modal state
  const [freezeModalWard, setFreezeModalWard] = useState<string | null>(null);

  // 2FA Delete Warning modal state
  const [deleteWarningVisible, setDeleteWarningVisible] = useState(false);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);

  const wardProgressCallback: WardCreationProgress = (step, _total, message) => {
    setWardStep(step);
    setWardStepMessage(message);
  };

  const wardCreationStatus = wardFailed
    ? "failed"
    : wardStep > 6
    ? "done"
    : wardModalVisible || isCreatingWard
    ? "in_progress"
    : "idle";
  const wardCreationStepText = `ward.creation.step=${wardStep}`;
  const wardCreationStatusText = `ward.creation.status=${wardCreationStatus}`;

  const openWardSetup = (mode: "create" | "retry") => {
    if (mode === "retry" && ward.partialWard) {
      setWardCreatePseudoName(ward.partialWard.pseudoName || "");
      setWardInitialFundingAmount(formatWeiToStrkDisplay(ward.partialWard.fundingAmountWei));
    } else if (wardLastOptions.pseudoName || wardLastOptions.fundingAmountWei) {
      setWardCreatePseudoName(wardLastOptions.pseudoName || "");
      setWardInitialFundingAmount(formatWeiToStrkDisplay(wardLastOptions.fundingAmountWei));
    } else {
      setWardCreatePseudoName("");
      setWardInitialFundingAmount("0.5");
    }
    setWardSetupError(null);
    setWardRetryMode(mode === "retry");
    setWardSetupModalVisible(true);
  };

  const resolveWardCreationOptions = (): WardCreationOptions => {
    const normalizedName = wardCreatePseudoName.trim();
    let fundingAmountWei: string | undefined;
    if (wardInitialFundingAmount.trim()) {
      fundingAmountWei = parseStrkToHexWei(wardInitialFundingAmount);
    }
    return {
      pseudoName: normalizedName || undefined,
      fundingAmountWei,
    };
  };

  const startWardCreation = async (isRetry: boolean = false, options?: WardCreationOptions) => {
    const resolvedOptions = options || wardLastOptions;
    setWardFailed(false);
    setWardError(null);
    setWardResult(null);
    setIsCreatingWard(true);
    setWardModalVisible(true);
    setWardLastOptions(resolvedOptions);
    setWardSetupModalVisible(false);
    if (!isRetry) {
      setWardStep(1);
      setWardStepMessage("Generating ward keys...");
    }

    try {
      const result = isRetry
        ? await ward.retryPartialWard(wardProgressCallback, resolvedOptions)
        : await ward.createWard(wardProgressCallback, resolvedOptions);
      setWardResult(result);
      setWardStep(7); // Beyond last step = done
      setWardStepMessage("Done!");
    } catch (e: any) {
      setWardFailed(true);
      setWardError(e.message || "Ward creation failed");
    } finally {
      setIsCreatingWard(false);
    }
  };

  const handleWardSetupSubmit = async () => {
    setWardSetupError(null);
    try {
      const options = resolveWardCreationOptions();
      setWardLastOptions(options);
      await startWardCreation(wardRetryMode, options);
    } catch (e: any) {
      setWardSetupError(e.message || "Invalid setup");
      setWardSetupModalVisible(true);
    }
  };

  const handleWardModalClose = () => {
    setWardModalVisible(false);
    if (wardResult) {
      setQrModal({ label: "Ward Invite QR", value: wardResult.qrPayload });
    }
    // Reset state
    setWardStep(0);
    setWardStepMessage("");
    setWardFailed(false);
    setWardError(null);
    setWardResult(null);
  };

  // Design parity uses a small network card that includes RPC + version.
  const networkRpcLabel = "blast.io";
  const appVersionLabel = "v0.1.0-alpha";

  const isBiometric2faEnabled = twoFactor.isEnabled;

  const previewWards: Array<{
    id: string;
    name: string;
    status: "active" | "frozen";
    spendingLimit: string;
    whitelist: string;
  }> = [
    {
      id: "preview-family",
      name: "Family Ward",
      status: "active",
      spendingLimit: "100 STRK/day",
      whitelist: "STRK only",
    },
    {
      id: "preview-travel",
      name: "Travel Ward",
      status: "frozen",
      spendingLimit: "50 STRK/day",
      whitelist: "STRK only",
    },
  ];

  const wardItems = (() => {
    if (ward.wards.length > 0) {
      return ward.wards.map((w) => ({
        id: w.wardAddress,
        name: shortenMiddle(w.wardAddress, 6, 4),
        status: w.status === "frozen" ? ("frozen" as const) : ("active" as const),
        spendingLimit: w.spendingLimitPerTx ? `${w.spendingLimitPerTx} STRK/tx` : "-- STRK/day",
        whitelist: "STRK only",
        raw: w,
      }));
    }

    if (__DEV__) {
      return previewWards.map((w) => ({ ...w, raw: null as WardEntry | null }));
    }

    return [] as Array<any>;
  })();

  const previewContacts = [
    { id: "preview-alice", nickname: "Alice", starknetAddress: "0x2563...8f3a" },
    { id: "preview-bob", nickname: "Bob", starknetAddress: "0x7891...4c2d" },
    { id: "preview-charlie", nickname: "Charlie", starknetAddress: "0x01ab...9b1e" },
  ];

  const contactItems = (() => {
    if (contacts.length > 0) return contacts;
    if (__DEV__) return previewContacts as any;
    return contacts;
  })();

  if (!wallet.keys) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>No wallet created yet.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {modal.ModalComponent}
      {qrModal && (
        <FullScreenQR
          visible={!!qrModal}
          label={qrModal.label}
          value={qrModal.value}
          onClose={() => setQrModal(null)}
        />
      )}
      <WardCreationSetupModal
        visible={wardSetupModalVisible}
        pseudoName={wardCreatePseudoName}
        initialAmountInput={wardInitialFundingAmount}
        validationError={wardSetupError}
        onPseudoNameChange={setWardCreatePseudoName}
        onInitialAmountChange={setWardInitialFundingAmount}
        onStart={handleWardSetupSubmit}
        onCancel={() => setWardSetupModalVisible(false)}
      />
      <View pointerEvents="none" style={styles.testMarkerContainer} collapsable={false}>
        <View
          {...testProps(testIDs.markers.wardCreationStep, wardCreationStepText)}
          style={styles.testMarkerNode}
          collapsable={false}
          accessible
          importantForAccessibility="yes"
        >
          <Text style={styles.testMarkerText}>{wardCreationStepText}</Text>
        </View>
        <View
          {...testProps(testIDs.markers.wardCreationStatus, wardCreationStatusText)}
          style={styles.testMarkerNode}
          collapsable={false}
          accessible
          importantForAccessibility="yes"
        >
          <Text style={styles.testMarkerText}>{wardCreationStatusText}</Text>
        </View>
      </View>
      <KeyboardSafeScreen
        style={styles.scrollContainer}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
      {/* Cloak Address */}
      <View style={[styles.section, styles.addressSection]}>
        <View style={styles.sectionHeader}>
          <Gem size={18} color={colors.primary} />
          <Text style={styles.sectionTitle}>Your Cloak Address</Text>
        </View>
        <Text style={styles.sectionDesc}>
          Share this with others so they can send you shielded payments.
        </Text>
        <TouchableOpacity
          {...testProps(testIDs.settings.cloakQrOpen)}
          onPress={() => setQrModal({ label: "Cloak Address", value: wallet.keys!.tongoAddress })}
        >
          <CopyRow
            label="TONGO ADDRESS"
            value={wallet.keys.tongoAddress}
            displayValue={shortenMiddle(wallet.keys.tongoAddress, 12, 6)}
          />
          <InlineQR value={wallet.keys.tongoAddress} glowColor="blue" />
        </TouchableOpacity>
      </View>

      {/* Account Info */}
      <View style={[styles.section, styles.addressSectionViolet]}>
        <View style={styles.sectionHeader}>
          <Wallet2 size={18} color={colors.secondary} />
          <Text style={styles.sectionTitle}>Starknet Address</Text>
        </View>
        <Text style={styles.sectionDesc}>
          Your public Starknet wallet address.
        </Text>
        <TouchableOpacity
          {...testProps(testIDs.settings.starkQrOpen)}
          onPress={() => setQrModal({ label: "Starknet Address", value: wallet.keys!.starkAddress })}
        >
          <CopyRow
            label="STARKNET ADDRESS"
            value={wallet.keys.starkAddress}
            displayValue={shortenMiddle(wallet.keys.starkAddress, 10, 6)}
          />
          <InlineQR value={wallet.keys.starkAddress} glowColor="violet" />
        </TouchableOpacity>
      </View>

      {/* Manage Wards (Guardian features) */}
      {!ward.isWard && (
        <View style={[styles.section, styles.wardsCard]}>
          <View style={styles.rowBetween}>
            <View style={styles.sectionHeader}>
              <Users size={18} color={colors.warning} />
              <Text style={styles.sectionTitle}>Manage Wards</Text>
            </View>
            {ward.isLoadingWards && <ActivityIndicator size="small" color={colors.warning} />}
          </View>
          <Text style={styles.sectionDesc}>
            Create and manage ward accounts with spending limits that require your approval.
          </Text>

          {/* Ward Creation Modal */}
          <WardCreationModal
            visible={wardModalVisible}
            currentStep={wardStep}
            stepMessage={wardStepMessage}
            failed={wardFailed}
            errorMessage={wardError}
            onRetry={() => openWardSetup("retry")}
            onClose={handleWardModalClose}
          />

          <TouchableOpacity
            {...testProps(testIDs.settings.wardCreate)}
            style={styles.wardsCreateBtn}
            onPress={() => navigation.getParent("root")?.navigate("WardSetup" as never)}
          >
            <Plus size={14} color={colors.warning} />
            <Text style={styles.wardsCreateBtnText}>Create New Ward</Text>
          </TouchableOpacity>

          <Text style={styles.subheadLabel}>ACTIVE WARDS</Text>

          <View style={styles.wardsListCard}>
            {wardItems.map((w: any, idx: number) => {
              const isFrozen = w.status === "frozen";
              const showDivider = idx < wardItems.length - 1;
              return (
                <View key={w.id} style={[styles.wardRow, showDivider && styles.wardRowDivider]}>
                  {/* Top row: icon+name ... freeze toggle */}
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                      <View style={[styles.wardIconCircle, isFrozen ? styles.wardIconCircleFrozen : styles.wardIconCircleActive]}>
                        <Shield size={18} color={isFrozen ? colors.error : colors.primaryLight} />
                      </View>
                      <Text style={[styles.wardNameText, isFrozen && { opacity: 0.6 }]}>{w.name}</Text>
                    </View>
                    <View style={styles.wardToggleRow}>
                      <Text style={[styles.wardToggleLabel, isFrozen && styles.wardToggleLabelFrozen]}>
                        {isFrozen ? "Frozen" : "Freeze"}
                      </Text>
                      <TouchableOpacity
                        style={[styles.toggleTrack, isFrozen && styles.toggleTrackOn]}
                        onPress={async () => {
                          if (!w.raw) return;
                          if (isFrozen) {
                            setWardAction(w.raw.wardAddress);
                            try {
                              await ward.unfreezeWard(w.raw.wardAddress);
                            } catch (e: any) {
                              modal.showError("Failed", e.message || "Action failed", e.message);
                            } finally {
                              setWardAction(null);
                            }
                          } else {
                            setFreezeModalWard(w.raw.wardAddress);
                          }
                        }}
                        disabled={!!wardAction || !w.raw}
                      >
                        <View style={[styles.toggleKnob, isFrozen && styles.toggleKnobOn]} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  {/* Bottom row: spending limit */}
                  <View style={styles.wardDetailsRow}>
                    <View style={styles.wardDetailCol}>
                      <Text style={styles.wardMetaLabel}>Spending Limit</Text>
                      <Text style={[styles.wardMetaValue, isFrozen && { opacity: 0.5 }]}>{w.spendingLimit}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Contacts */}
      <View style={styles.section}>
        <View style={styles.rowBetween}>
          <View style={styles.sectionHeader}>
            <Users size={18} color={colors.success} />
            <Text style={styles.sectionTitle}>Contacts</Text>
          </View>
          <TouchableOpacity
            {...testProps(testIDs.settings.contactsAddToggle)}
            style={styles.contactsAddBtn}
            onPress={() => setShowAddContact(!showAddContact)}
          >
            <Plus size={14} color="#fff" />
            <Text style={styles.contactsAddBtnText}>Add</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.sectionDesc}>Save addresses for quick transfers.</Text>

        {showAddContact && (
          <View style={styles.addContactForm}>
            <TextInput
              style={styles.addContactInput}
              placeholder="Nickname"
              placeholderTextColor={colors.textMuted}
              value={newContactName}
              onChangeText={setNewContactName}
            />
            <TextInput
              style={styles.addContactInput}
              placeholder="Starknet address (0x...)"
              placeholderTextColor={colors.textMuted}
              value={newContactAddr}
              onChangeText={setNewContactAddr}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
            />
            <TouchableOpacity
              {...testProps(testIDs.settings.contactsAddSubmit)}
              style={[styles.addContactBtn, !newContactAddr.trim() && { opacity: 0.4 }]}
              disabled={!newContactAddr.trim()}
              onPress={async () => {
                await addContact({
                  tongoAddress: newContactAddr.trim(),
                  starknetAddress: newContactAddr.trim(),
                  nickname: newContactName.trim() || undefined,
                  isFavorite: false,
                  lastInteraction: Date.now(),
                });
                setNewContactName("");
                setNewContactAddr("");
                setShowAddContact(false);
              }}
            >
              <Text style={styles.addContactBtnText}>Add Contact</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.contactsList}>
          {contactItems.map((c: any, idx: number) => {
            const name = c.nickname || "Contact";
            const addr = c.starknetAddress || c.tongoAddress || "";
            const initial = (name?.[0] || "?").toUpperCase();
            const colorVariant = initial === "A" ? "blue" : initial === "B" ? "violet" : "green";
            const divider = idx < contactItems.length - 1;
            return (
              <View key={c.id} style={[styles.contactRowNew, divider && styles.contactRowDivider]}>
                <View style={[
                  styles.contactAvatarNew,
                  colorVariant === "blue"
                    ? styles.contactAvatarBlue
                    : colorVariant === "violet"
                    ? styles.contactAvatarViolet
                    : styles.contactAvatarGreen,
                ]}>
                  <Text style={[
                    styles.contactAvatarTextNew,
                    colorVariant === "blue"
                      ? { color: colors.primaryLight }
                      : colorVariant === "violet"
                      ? { color: colors.secondary }
                      : { color: colors.success },
                  ]}>
                    {initial}
                  </Text>
                </View>
                <View style={styles.contactInfoNew}>
                  <Text style={styles.contactNameNew}>{name}</Text>
                  <Text style={styles.contactAddrNew} numberOfLines={1}>{addr}</Text>
                </View>
                <TouchableOpacity onPress={() => (contacts.length ? removeContact(c.id) : undefined)} disabled={!contacts.length}>
                  <Trash2 size={16} color={colors.error} />
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      </View>

      {/* Security */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Lock size={18} color={colors.primary} />
          <Text style={styles.sectionTitle}>Security</Text>
        </View>

        <View style={styles.securityRow}>
          <View style={[styles.securityIcon, styles.securityIconKey]}>
            <Key size={16} color={colors.warning} />
          </View>
          <View style={styles.securityText}>
            <Text style={styles.securityLabel}>Key Backup</Text>
            <Text style={styles.securitySub}>Export encrypted backup</Text>
          </View>
          <TouchableOpacity
            {...testProps(testIDs.settings.keyBackupOpen)}
            style={styles.securityActionBtn}
            onPress={() => navigation.getParent("root")?.navigate("KeyBackup" as never)}
          >
            <Download size={14} color={colors.textSecondary} />
            <Text style={styles.securityActionText}>Export</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.securityDivider} />

        <View style={styles.securityRow}>
          <View style={[styles.securityIcon, styles.securityIcon2fa]}>
            <Smartphone size={16} color={colors.secondary} />
          </View>
          <View style={styles.securityText}>
            <Text style={styles.securityLabel}>Biometric 2FA</Text>
            <Text style={styles.securitySub}>Require biometric for transfers</Text>
          </View>
          <TouchableOpacity
            style={[styles.securityToggleTrack, isBiometric2faEnabled && styles.securityToggleTrackOn]}
            onPress={() => {
              if (!wallet.isDeployed) return;
              const action = twoFactor.isEnabled ? "disable" : "enable";
              setTfaModalAction(action);
              setTfaConfirmVisible(true);
            }}
            disabled={tfaLoading}
          >
            <View style={[styles.securityToggleKnob, isBiometric2faEnabled && styles.securityToggleKnobOn]} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Network */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Globe size={18} color={colors.success} />
          <Text style={styles.sectionTitle}>Network</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Chain</Text>
          <Text style={styles.infoValue}>Starknet Sepolia</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>RPC</Text>
          <Text style={styles.infoValueMuted}>{networkRpcLabel}</Text>
        </View>
        <View style={styles.infoRowLast}>
          <Text style={styles.infoLabel}>Version</Text>
          <Text style={styles.infoValueMuted}>{appVersionLabel}</Text>
        </View>
      </View>

      {/* Danger Zone */}
      <View style={[styles.section, styles.dangerZoneCard]}>
        <View style={styles.sectionHeader}>
          <AlertTriangle size={18} color={colors.error} />
          <Text style={styles.dangerZoneTitle}>Danger Zone</Text>
        </View>
        <TouchableOpacity
          {...testProps(testIDs.settings.clearAllData)}
          style={styles.dangerZoneBtn}
          onPress={() => {
            modal.showConfirm(
              "Disconnect wallet?",
              "This will remove wallet keys from this device.",
              async () => {
                await clearWallet();
                modal.showSuccess("Done", "Wallet disconnected. Restart the app.");
              },
              { destructive: true, confirmText: "Disconnect" },
            );
          }}
        >
          <LogOut size={16} color={colors.error} />
          <Text style={styles.dangerZoneBtnText}>Disconnect Wallet</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.dangerZoneBtn}
          onPress={() => {
            if (twoFactor.isEnabled) {
              // Show special 2FA delete warning modal
              setDeleteConfirmed(false);
              setDeleteWarningVisible(true);
            } else {
              modal.showConfirm(
                "Reset all data?",
                "This will remove keys and all local data from this device.",
                async () => {
                  await clearWallet();
                  modal.showSuccess("Done", "All data cleared. Restart the app.");
                },
                { destructive: true, confirmText: "Reset All Data" },
              );
            }
          }}
        >
          <Trash2 size={16} color={colors.error} />
          <Text style={styles.dangerZoneBtnText}>Reset All Data</Text>
        </TouchableOpacity>
      </View>
      </KeyboardSafeScreen>

      {/* Freeze Ward Confirmation Modal (7PY2U) */}
      <Modal
        visible={!!freezeModalWard}
        transparent
        animationType="slide"
        onRequestClose={() => setFreezeModalWard(null)}
      >
        <View style={fmStyles.overlay}>
          <View style={fmStyles.sheet}>
            {/* Handle */}
            <View style={fmStyles.handle} />

            {/* Icon */}
            <View style={fmStyles.iconCircle}>
              <Shield size={36} color="#EF4444" />
            </View>

            {/* Title */}
            <Text style={fmStyles.title}>Freeze Ward Account?</Text>

            {/* Description */}
            <Text style={fmStyles.description}>
              {"This will immediately disable all\ntransactions on this ward account.\nThe ward user will not be able to\nsend, shield, or unshield tokens."}
            </Text>

            {/* Ward info card */}
            {(() => {
              const frozenWardEntry = wardItems.find((w: any) => w.id === freezeModalWard);
              const wardName = frozenWardEntry?.raw?.pseudoName || frozenWardEntry?.name || "Ward";
              const wardAddr = freezeModalWard || "";
              return (
                <View style={fmStyles.wardInfoCard}>
                  <View style={fmStyles.wardInfoIcon}>
                    <Shield size={18} color="#3B82F6" />
                  </View>
                  <View style={fmStyles.wardInfoText}>
                    <Text style={fmStyles.wardInfoName} numberOfLines={1}>{wardName}</Text>
                    <Text style={fmStyles.wardInfoAddr} numberOfLines={1}>
                      {shortenMiddle(wardAddr, 6, 4)}
                    </Text>
                  </View>
                </View>
              );
            })()}

            {/* Freeze button */}
            <TouchableOpacity
              style={fmStyles.freezeBtn}
              onPress={async () => {
                if (!freezeModalWard) return;
                const addr = freezeModalWard;
                setFreezeModalWard(null);
                setWardAction(addr);
                try {
                  await ward.freezeWard(addr);
                } catch (e: any) {
                  modal.showError("Failed", e.message || "Freeze failed", e.message);
                } finally {
                  setWardAction(null);
                }
              }}
            >
              <Shield size={20} color="#FFFFFF" />
              <Text style={fmStyles.freezeBtnText}>Freeze Account</Text>
            </TouchableOpacity>

            {/* Cancel button */}
            <TouchableOpacity
              style={fmStyles.cancelBtn}
              onPress={() => setFreezeModalWard(null)}
            >
              <Text style={fmStyles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 2FA Confirm Modal */}
      <TwoFAConfirmModal
        visible={tfaConfirmVisible}
        action={tfaModalAction}
        onConfirm={async () => {
          setTfaConfirmVisible(false);
          setTfaStep("idle");
          setTfaModalVisible(true);
          try {
            setTfaLoading(true);
            const stepCallback = (step: TwoFAStep) => setTfaStep(step);
            if (tfaModalAction === "disable") {
              await twoFactor.disable2FA(stepCallback);
            } else {
              await twoFactor.enable2FA(stepCallback);
            }
            if (ward.isWard) {
              await ward.refreshWardInfo();
            }
          } finally {
            setTfaLoading(false);
          }
        }}
        onCancel={() => setTfaConfirmVisible(false)}
      />

      {/* 2FA Progress Modal */}
      <TwoFAProgressModal
        visible={tfaModalVisible}
        action={tfaModalAction}
        currentStep={tfaStep}
        onClose={() => setTfaModalVisible(false)}
      />

      {/* 2FA Delete Warning Modal (B4WjD) */}
      <Modal
        visible={deleteWarningVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setDeleteWarningVisible(false);
          setDeleteConfirmed(false);
        }}
      >
        <View style={dwStyles.overlay}>
          <View style={dwStyles.card}>
            {/* Handle */}
            <View style={dwStyles.handle} />

            {/* Icon */}
            <View style={dwStyles.iconCircle}>
              <ShieldAlert size={36} color="#EF4444" />
            </View>

            {/* Title */}
            <Text style={dwStyles.title}>{"2FA Is Active \u2014 Danger!"}</Text>

            {/* Description */}
            <Text style={dwStyles.description}>
              {"You have 2FA enabled. Deleting your data will permanently remove your recovery key from this device."}
            </Text>

            {/* Warning box */}
            <View style={dwStyles.warningBox}>
              <View style={dwStyles.warningRow}>
                <Key size={14} color="#EF4444" />
                <Text style={dwStyles.warningText}>Your 2FA recovery key will be lost forever</Text>
              </View>
              <View style={dwStyles.warningRow}>
                <LockOpen size={14} color="#EF4444" />
                <Text style={dwStyles.warningText}>Funds protected by 2FA may become inaccessible</Text>
              </View>
              <View style={dwStyles.warningRow}>
                <AlertTriangle size={14} color="#EF4444" />
                <Text style={dwStyles.warningText}>This action cannot be undone</Text>
              </View>
            </View>

            {/* Confirm checkbox row */}
            <TouchableOpacity
              style={dwStyles.checkboxRow}
              onPress={() => setDeleteConfirmed(!deleteConfirmed)}
              activeOpacity={0.7}
            >
              <View style={[dwStyles.checkbox, deleteConfirmed && dwStyles.checkboxChecked]}>
                {deleteConfirmed && <Check size={14} color="#FFFFFF" />}
              </View>
              <Text style={dwStyles.checkboxText}>
                I understand my 2FA key will be permanently deleted
              </Text>
            </TouchableOpacity>

            {/* Delete button */}
            <TouchableOpacity
              style={[dwStyles.deleteBtn, !deleteConfirmed && dwStyles.deleteBtnDisabled]}
              disabled={!deleteConfirmed}
              onPress={async () => {
                setDeleteWarningVisible(false);
                setDeleteConfirmed(false);
                await clearWallet();
                modal.showSuccess("Done", "All data cleared. Restart the app.");
              }}
            >
              <Trash2 size={18} color="#FFFFFF" />
              <Text style={dwStyles.deleteBtnText}>Delete All Data</Text>
            </TouchableOpacity>

            {/* Cancel button */}
            <TouchableOpacity
              style={dwStyles.cancelBtn}
              onPress={() => {
                setDeleteWarningVisible(false);
                setDeleteConfirmed(false);
              }}
            >
              <Text style={dwStyles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scrollContainer: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 100 },
  center: { flex: 1, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" },
  emptyText: { color: colors.textSecondary, fontSize: fontSize.md },
  testMarkerContainer: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 240,
    height: 20,
    opacity: 1,
    zIndex: 9999,
  },
  testMarkerText: {
    fontSize: 7,
    lineHeight: 9,
    color: "#0F172A",
  },
  testMarkerNode: {
    width: 240,
    height: 9,
  },

  section: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontFamily: typography.secondarySemibold,
    color: colors.text,
  },
  sectionDesc: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    fontFamily: typography.secondary,
  },
  addressSection: {
    borderLeftWidth: 3,
    borderLeftColor: colors.border,
  },
  addressSectionViolet: {
    borderLeftWidth: 3,
    borderLeftColor: "rgba(139, 92, 246, 0.4)",
  },

  copyRow: { marginBottom: spacing.md },
  copyLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
    fontFamily: typography.primarySemibold,
  },
  copyValueRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.inputBg,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  copyValue: { flex: 1, fontSize: fontSize.sm, color: colors.text, fontFamily: typography.primary },
  copyBtn: { fontSize: fontSize.xs, color: colors.primaryLight, fontFamily: typography.primarySemibold, marginLeft: spacing.sm },

  qrContainer: {
    position: "relative",
    alignItems: "center",
    padding: spacing.lg,
    backgroundColor: colors.inputBg,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  qrGlow: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    opacity: 0.15,
  },
  qrGlowBlue: {
    backgroundColor: colors.primary,
  },
  qrGlowViolet: {
    backgroundColor: colors.secondary,
  },
  qrInlineWrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  qrWhiteBg: {
    backgroundColor: "#FFFFFF",
    padding: spacing.md,
    borderRadius: borderRadius.md,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },

  warningText: { fontSize: fontSize.sm, color: colors.warning, marginBottom: spacing.md, lineHeight: 20 },

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

  dangerSection: {
    borderColor: "rgba(245, 158, 11, 0.25)",
    backgroundColor: "rgba(245, 158, 11, 0.05)",
  },
  clearDataSection: {
    borderColor: "rgba(239, 68, 68, 0.3)",
    borderLeftWidth: 3,
    borderLeftColor: colors.error,
  },
  dangerBtn: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  dangerBtnText: { color: colors.error, fontWeight: "600" },

  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  // Wards + Contacts (qGVuO parity)
  wardsCard: {
    borderColor: "rgba(245, 158, 11, 0.15)",
  },
  wardsCreateBtn: {
    height: 38,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.35)",
    backgroundColor: "rgba(245, 158, 11, 0.06)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  wardsCreateBtnText: {
    color: colors.warning,
    fontSize: fontSize.sm,
    fontFamily: typography.primarySemibold,
  },
  subheadLabel: {
    color: colors.textMuted,
    fontSize: 11,
    letterSpacing: 1.1,
    marginBottom: 10,
    fontFamily: typography.primarySemibold,
  },
  wardsListCard: {
    backgroundColor: "rgba(15, 23, 42, 0.35)",
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    overflow: "hidden",
  },
  wardRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  wardRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(45, 59, 77, 0.7)",
  },
  wardIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  wardIconCircleActive: {
    backgroundColor: "rgba(59, 130, 246, 0.08)",
  },
  wardIconCircleFrozen: {
    backgroundColor: "rgba(239, 68, 68, 0.08)",
  },
  wardLeft: { flex: 1, gap: 2 },
  wardNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  wardNameText: { color: colors.text, fontSize: 13, fontFamily: typography.primarySemibold },
  wardStatusInline: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusDotActive: { backgroundColor: colors.success },
  statusDotFrozen: { backgroundColor: colors.error },
  wardStatusTextInline: { fontSize: 10, fontFamily: typography.primarySemibold },
  wardStatusActiveText: { color: colors.success },
  wardStatusFrozenText: { color: colors.error },
  wardDetailsRow: { flexDirection: "row", justifyContent: "space-between", width: "100%", paddingBottom: 4 },
  wardDetailCol: { gap: 1 },
  wardMetaRow: { flexDirection: "row", gap: 8 },
  wardMetaLabel: { fontSize: 9, color: colors.textMuted, fontFamily: typography.primarySemibold, letterSpacing: 1 },
  wardMetaValue: { fontSize: 12, color: colors.textSecondary, fontFamily: typography.primarySemibold },
  wardRight: { alignItems: "flex-end", gap: 8 },
  wardToggleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  wardToggleLabel: { fontSize: 10, color: colors.textMuted, fontFamily: typography.primarySemibold },
  wardToggleLabelFrozen: { color: colors.error },
  toggleTrack: {
    width: 32,
    height: 20,
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#2D3B4D",
    padding: 4,
    justifyContent: "center",
  },
  toggleTrackOn: {
    backgroundColor: colors.error,
    borderColor: colors.error,
  },
  toggleKnob: {
    width: 12,
    height: 12,
    backgroundColor: "#64748B",
    alignSelf: "flex-start",
  },
  toggleKnobOn: {
    alignSelf: "flex-end",
    backgroundColor: "#FFFFFF",
  },
  wardMetaRight: { alignItems: "flex-end", gap: 2 },

  contactsAddBtn: {
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.success,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  contactsAddBtnText: {
    color: "#fff",
    fontSize: 12,
    fontFamily: typography.primarySemibold,
  },
  contactsList: {
    backgroundColor: "rgba(15, 23, 42, 0.35)",
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    overflow: "hidden",
  },
  contactRowNew: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  contactRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(45, 59, 77, 0.7)",
  },
  contactAvatarNew: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  contactAvatarBlue: { backgroundColor: "rgba(59, 130, 246, 0.18)" },
  contactAvatarViolet: { backgroundColor: "rgba(139, 92, 246, 0.18)" },
  contactAvatarGreen: { backgroundColor: "rgba(16, 185, 129, 0.18)" },
  contactAvatarTextNew: { fontSize: 13, fontFamily: typography.primarySemibold },
  contactInfoNew: { flex: 1, gap: 3 },
  contactNameNew: { color: colors.text, fontSize: fontSize.sm, fontFamily: typography.secondarySemibold },
  contactAddrNew: { color: colors.textMuted, fontSize: 11, fontFamily: typography.primary },

  // QR Modal (iPjpF parity)
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
  qrModalTitle: {
    fontSize: fontSize.xl,
    fontFamily: typography.secondarySemibold,
    fontStyle: "italic",
    color: colors.text,
    marginBottom: spacing.sm,
  },
  qrModalDesc: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontFamily: typography.secondary,
    textAlign: "center",
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  qrModalQRWrapper: {
    backgroundColor: "#FFFFFF",
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.lg,
  },
  qrModalAddressLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontFamily: typography.secondary,
    marginBottom: spacing.xs,
  },
  qrModalAddressRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.inputBg,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    gap: spacing.sm,
  },
  qrModalAddress: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.text,
    fontFamily: typography.primary,
  },
  qrModalCopyIcon: {
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
  qrModalActions: {
    width: "100%",
    flexDirection: "row",
    gap: spacing.sm,
  },
  qrModalShareBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
  },
  qrModalShareText: {
    color: "#fff",
    fontSize: fontSize.md,
    fontFamily: typography.secondarySemibold,
  },
  qrModalCloseBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  qrModalCloseText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    fontFamily: typography.secondarySemibold,
  },

  // Contacts
  contactsSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  addContactForm: {
    backgroundColor: colors.bg,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  addContactInput: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: fontSize.sm,
    color: colors.text,
  },
  addContactBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
    alignItems: "center",
  },
  addContactBtnText: {
    color: "#fff",
    fontSize: fontSize.sm,
    fontWeight: "600",
  },
  emptyContacts: {
    alignItems: "center",
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  emptyContactsText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  contactAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(59, 130, 246, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  contactAvatarText: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.primary,
  },
  contactInfo: { flex: 1 },
  contactName: {
    fontSize: fontSize.sm,
    fontWeight: "500",
    color: colors.text,
  },
  contactAddr: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontFamily: "monospace",
  },

  tfaWarning: {
    flexDirection: "row",
    backgroundColor: "rgba(245, 158, 11, 0.08)",
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.2)",
    gap: spacing.sm,
  },
  tfaWarningText: {
    flex: 1,
    fontSize: fontSize.xs,
    color: colors.warning,
    lineHeight: 18,
  },

  // 2FA styles
  tfaSection: {
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  tfaStatusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  tfaStatusLabel: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  tfaBadge: {
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  tfaBadgeActive: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
  },
  tfaBadgeInactive: {
    backgroundColor: "rgba(100, 116, 139, 0.15)",
  },
  tfaBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: "600",
  },
  tfaBadgeTextActive: {
    color: colors.success,
  },
  tfaBadgeTextInactive: {
    color: colors.textMuted,
  },
  tfaKeyRow: {
    backgroundColor: colors.bg,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  tfaKeyLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  tfaKeyValue: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontFamily: "monospace",
  },
  tfaEnableBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    alignItems: "center",
    marginBottom: spacing.md,
  },
  tfaEnableBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: fontSize.sm,
  },
  tfaDisableBtn: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.2)",
    marginBottom: spacing.md,
  },
  tfaDisableBtnText: {
    color: colors.error,
    fontWeight: "600",
    fontSize: fontSize.sm,
  },

  tfaDeployGate: {
    flexDirection: "row",
    backgroundColor: "rgba(100, 116, 139, 0.08)",
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: "rgba(100, 116, 139, 0.15)",
    gap: spacing.sm,
    alignItems: "center",
  },
  tfaDeployGateText: {
    flex: 1,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    lineHeight: 18,
  },

  // Ward Management
  wardSetupForm: {
    width: "100%",
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  inputLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  wardSetupInput: {
    backgroundColor: colors.bg,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: fontSize.sm,
    color: colors.text,
    fontFamily: "monospace",
  },
  wardSetupError: {
    color: colors.error,
    fontSize: fontSize.xs,
  },
  wardSetupPrimary: {
    backgroundColor: colors.warning,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    alignItems: "center",
  },
  wardSetupSecondary: {
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  wardSetupSecondaryText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  wardSection: {
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
  },
  wardCreateBtn: {
    backgroundColor: colors.warning,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  wardCreateBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: fontSize.sm,
  },
  wardCard: {
    backgroundColor: colors.bg,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    overflow: "hidden",
  },
  wardCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
  },
  wardCardLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  wardStatusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  wardStatusActive: { backgroundColor: "rgba(16, 185, 129, 0.15)" },
  wardStatusFrozen: { backgroundColor: "rgba(239, 68, 68, 0.15)" },
  wardStatusText: { fontSize: fontSize.xs, fontWeight: "600" },
  wardCardActions: {
    padding: spacing.md,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  wardInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  wardInfoLabel: { fontSize: fontSize.xs, color: colors.textMuted },
  wardInfoValue: { fontSize: fontSize.xs, color: colors.text },
  wardActionsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  wardActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  wardActionFreeze: {
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderColor: "rgba(239, 68, 68, 0.2)",
  },
  wardActionUnfreeze: {
    backgroundColor: "rgba(16, 185, 129, 0.08)",
    borderColor: "rgba(16, 185, 129, 0.2)",
  },
  wardActionBtnSecondary: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },


  // Partial ward recovery banner
  partialWardBanner: {
    backgroundColor: "rgba(245, 158, 11, 0.08)",
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.2)",
  },
  partialWardTitle: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.warning,
    marginBottom: 4,
  },
  partialWardDesc: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  partialWardActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  partialWardRetryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.warning,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
  },
  partialWardRetryText: {
    color: "#fff",
    fontSize: fontSize.xs,
    fontWeight: "600",
  },
  partialWardDismissBtn: {
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  partialWardDismissText: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
  },

  aboutSection: { alignItems: "center", paddingVertical: spacing.xl },
  aboutText: { fontSize: fontSize.sm, color: colors.textMuted, marginBottom: 4 },

  // Security section (QqFEX parity)
  securityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: spacing.sm,
  },
  securityIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  securityIconKey: {
    backgroundColor: "rgba(245, 158, 11, 0.12)",
  },
  securityIcon2fa: {
    backgroundColor: "rgba(139, 92, 246, 0.12)",
  },
  securityText: {
    flex: 1,
    gap: 2,
  },
  securityLabel: {
    fontSize: fontSize.sm,
    color: colors.text,
    fontFamily: typography.secondarySemibold,
  },
  securitySub: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: typography.secondary,
  },
  securityActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: "rgba(15, 23, 42, 0.35)",
  },
  securityActionText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: typography.primarySemibold,
  },
  securityDivider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: 4,
  },
  securityToggleTrack: {
    width: 32,
    height: 20,
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#2D3B4D",
    padding: 4,
    justifyContent: "center",
  },
  securityToggleTrackOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  securityToggleKnob: {
    width: 12,
    height: 12,
    backgroundColor: "#64748B",
    alignSelf: "flex-start",
  },
  securityToggleKnobOn: {
    alignSelf: "flex-end",
    backgroundColor: "#FFFFFF",
  },

  // Network last row
  infoRowLast: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
  },
  infoValueMuted: {
    fontSize: fontSize.md,
    color: colors.textMuted,
  },

  // Danger Zone (QqFEX parity)
  dangerZoneCard: {
    borderColor: "rgba(239, 68, 68, 0.2)",
    backgroundColor: "rgba(239, 68, 68, 0.03)",
  },
  dangerZoneTitle: {
    fontSize: fontSize.lg,
    fontFamily: typography.secondarySemibold,
    color: colors.error,
  },
  dangerZoneBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    marginTop: spacing.sm,
  },
  dangerZoneBtnText: {
    color: colors.error,
    fontSize: fontSize.sm,
    fontFamily: typography.secondarySemibold,
  },
});

const wardModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    fontSize: fontSize.xl,
    fontFamily: typography.secondarySemibold,
    color: colors.text,
    marginBottom: spacing.xs,
    textAlign: "center",
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    fontFamily: typography.secondary,
    textAlign: "center",
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  // Step list (cuF9k parity)
  stepper: {
    width: "100%",
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    gap: 14,
  },
  stepItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotComplete: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  stepDotActive: {
    borderColor: colors.primary,
    backgroundColor: "rgba(59, 130, 246, 0.1)",
  },
  stepDotFailed: {
    borderColor: colors.error,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  stepText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontFamily: typography.secondary,
  },
  stepTextComplete: {
    color: colors.text,
  },
  stepTextActive: {
    color: colors.primary,
    fontFamily: typography.secondarySemibold,
  },
  stepTextFailed: {
    color: colors.error,
    fontFamily: typography.secondarySemibold,
  },
  // Progress bar
  progressContainer: {
    width: "100%",
    marginBottom: spacing.lg,
    gap: 8,
  },
  progressTrack: {
    width: "100%",
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(100, 116, 139, 0.2)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  progressLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontFamily: typography.primary,
    textAlign: "center",
  },
  errorBox: {
    width: "100%",
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.2)",
  },
  errorText: {
    fontSize: fontSize.xs,
    color: colors.error,
    lineHeight: 16,
  },
  doneBtn: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    alignItems: "center",
  },
  doneBtnText: {
    color: colors.success,
    fontSize: fontSize.md,
    fontFamily: typography.secondarySemibold,
  },
  failedActions: {
    width: "100%",
    gap: spacing.sm,
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    backgroundColor: colors.warning,
  },
  retryBtnText: {
    color: "#fff",
    fontSize: fontSize.md,
    fontFamily: typography.secondarySemibold,
  },
  dismissBtn: {
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
  },
  dismissBtnText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
  },
  cancelBtn: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  cancelBtnText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    fontFamily: typography.secondarySemibold,
  },
});

// Freeze Ward Confirmation Modal styles (7PY2U)
const fmStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(10, 15, 28, 0.9)",
    justifyContent: "flex-end",
  },
  sheet: {
    width: "100%",
    backgroundColor: "#1E293B",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "#2D3B4D",
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
    backgroundColor: "rgba(100, 116, 139, 0.3)",
    marginBottom: 0,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(239, 68, 68, 0.094)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 20,
    fontFamily: typography.primarySemibold,
    color: "#FFFFFF",
    textAlign: "center",
  },
  description: {
    fontSize: 14,
    fontFamily: typography.secondary,
    color: "#94A3B8",
    textAlign: "center",
    lineHeight: 21,
  },
  wardInfoCard: {
    width: "100%",
    backgroundColor: "#0F172A",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  wardInfoIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "rgba(59, 130, 246, 0.082)",
    alignItems: "center",
    justifyContent: "center",
  },
  wardInfoText: {
    flex: 1,
    gap: 2,
  },
  wardInfoName: {
    fontSize: 14,
    fontFamily: typography.primarySemibold,
    color: "#FFFFFF",
  },
  wardInfoAddr: {
    fontSize: 11,
    fontFamily: typography.primary,
    color: "#64748B",
  },
  freezeBtn: {
    width: "100%",
    height: 52,
    borderRadius: 14,
    backgroundColor: "#EF4444",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  freezeBtnText: {
    fontSize: 16,
    fontFamily: typography.primarySemibold,
    color: "#FFFFFF",
  },
  cancelBtn: {
    width: "100%",
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2D3B4D",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    fontSize: 16,
    fontFamily: typography.primarySemibold,
    color: "#94A3B8",
  },
});

// 2FA Delete Warning Modal styles (B4WjD)
const dwStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(10, 15, 28, 0.92)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: 342,
    maxWidth: "100%",
    backgroundColor: "#1E293B",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.25)",
    paddingTop: 32,
    paddingHorizontal: 24,
    paddingBottom: 28,
    alignItems: "center",
    gap: 20,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(100, 116, 139, 0.3)",
    marginBottom: 0,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(239, 68, 68, 0.094)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 20,
    fontFamily: typography.primarySemibold,
    color: "#FFFFFF",
    textAlign: "center",
  },
  description: {
    fontSize: 14,
    fontFamily: typography.secondary,
    color: "#94A3B8",
    textAlign: "center",
    lineHeight: 21,
  },
  warningBox: {
    width: "100%",
    backgroundColor: "rgba(239, 68, 68, 0.063)",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.188)",
  },
  warningRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    fontFamily: typography.secondary,
    color: "#94A3B8",
  },
  checkboxRow: {
    width: "100%",
    backgroundColor: "#0F172A",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#EF4444",
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: "#EF4444",
  },
  checkboxText: {
    flex: 1,
    fontSize: 12,
    fontFamily: typography.secondary,
    color: "#94A3B8",
  },
  deleteBtn: {
    width: "100%",
    height: 52,
    borderRadius: 14,
    backgroundColor: "#EF4444",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  deleteBtnDisabled: {
    opacity: 0.5,
  },
  deleteBtnText: {
    fontSize: 16,
    fontFamily: typography.primarySemibold,
    color: "#FFFFFF",
  },
  cancelBtn: {
    width: "100%",
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2D3B4D",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    fontSize: 16,
    fontFamily: typography.primarySemibold,
    color: "#94A3B8",
  },
});

// 2FA Confirm Modal styles (8FrbN enable / 8cgGD disable)
const tfaConfirmStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(10, 15, 28, 0.9)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: 342,
    maxWidth: "100%",
    backgroundColor: "#1E293B",
    borderRadius: 24,
    borderWidth: 1,
    paddingTop: 36,
    paddingHorizontal: 24,
    paddingBottom: 24,
    alignItems: "center",
    gap: 20,
  },
  cardEnable: {
    borderColor: "rgba(59, 130, 246, 0.188)",
  },
  cardDisable: {
    borderColor: "rgba(239, 68, 68, 0.188)",
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  iconCircleEnable: {
    backgroundColor: "rgba(59, 130, 246, 0.07)",
    borderColor: "rgba(59, 130, 246, 0.25)",
  },
  iconCircleDisable: {
    backgroundColor: "rgba(239, 68, 68, 0.082)",
    borderColor: "rgba(239, 68, 68, 0.25)",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    fontFamily: typography.primarySemibold,
    color: "#FFFFFF",
    textAlign: "center",
  },
  description: {
    fontSize: 13,
    fontFamily: typography.secondary,
    color: "#94A3B8",
    textAlign: "center",
    lineHeight: 20,
  },
  infoBox: {
    width: "100%",
    backgroundColor: "#0F172A",
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  warningBox: {
    width: "100%",
    backgroundColor: "#0F172A",
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  infoDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  infoText: {
    fontSize: 12,
    fontFamily: typography.secondary,
    color: "#94A3B8",
  },
  buttons: {
    width: "100%",
    gap: 10,
  },
  primaryBtn: {
    width: "100%",
    height: 48,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryBtnEnable: {
    backgroundColor: "#3B82F6",
  },
  primaryBtnDisable: {
    backgroundColor: "#EF4444",
  },
  primaryBtnText: {
    fontSize: 14,
    fontWeight: "600",
    fontFamily: typography.secondarySemibold,
    color: "#FFFFFF",
  },
  cancelBtn: {
    width: "100%",
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2D3B4D",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: "600",
    fontFamily: typography.secondarySemibold,
    color: "#94A3B8",
  },
});

// 2FA Progress Modal styles (KD4bh enable / WGJnV disable)
const tfaModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(10, 15, 28, 0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  card: {
    width: 342,
    maxWidth: "100%",
    backgroundColor: "#1E293B",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#2D3B4D",
    overflow: "hidden",
  },
  cardDisable: {
    borderColor: "rgba(239, 68, 68, 0.157)",
  },
  modalInner: {
    paddingTop: 32,
    paddingHorizontal: 28,
    paddingBottom: 24,
    alignItems: "center",
    gap: 24,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  iconCircleBlue: {
    backgroundColor: "rgba(59, 130, 246, 0.071)",
    borderColor: "rgba(59, 130, 246, 0.25)",
  },
  iconCircleRed: {
    backgroundColor: "rgba(239, 68, 68, 0.071)",
    borderColor: "rgba(239, 68, 68, 0.25)",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    fontFamily: typography.primarySemibold,
    color: "#FFFFFF",
    textAlign: "center",
  },
  stepper: {
    width: "100%",
    gap: 18,
    paddingHorizontal: 4,
  },
  stepItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "rgba(100, 116, 139, 0.4)",
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotComplete: {
    backgroundColor: "#10B981",
    borderColor: "#10B981",
    borderWidth: 0,
  },
  stepDotActive: {
    borderColor: "#3B82F6",
    borderWidth: 2.5,
    backgroundColor: "transparent",
  },
  stepDotFailed: {
    borderColor: colors.error,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  stepText: {
    fontSize: 15,
    fontWeight: "500",
    fontFamily: typography.secondary,
    color: "#64748B",
  },
  stepTextComplete: {
    fontWeight: "600",
    color: "#F8FAFC",
  },
  stepTextActive: {
    fontWeight: "700",
    color: "#F8FAFC",
    fontFamily: typography.secondarySemibold,
  },
  stepTextFailed: {
    color: colors.error,
    fontFamily: typography.secondarySemibold,
  },
  bottomSection: {
    paddingHorizontal: 28,
    paddingBottom: 24,
    gap: 12,
  },
  progressContainer: {
    width: "100%",
    gap: 8,
  },
  progressTrack: {
    width: "100%",
    height: 4,
    borderRadius: 2,
    backgroundColor: "#0F172A",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
    backgroundColor: "#3B82F6",
  },
  statusText: {
    fontSize: 11,
    fontFamily: typography.primary,
    color: "#64748B",
    textAlign: "center",
  },
  closeBtn: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: "#2D3B4D",
    alignItems: "center",
  },
  closeBtnText: {
    color: "#94A3B8",
    fontSize: fontSize.md,
    fontFamily: typography.secondarySemibold,
  },
});
