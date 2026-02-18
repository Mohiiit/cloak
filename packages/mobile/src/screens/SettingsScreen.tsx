/**
 * SettingsScreen — Key backup, wallet info, QR codes, and preferences.
 */
import React, { useState } from "react";
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
import { Plus, Trash2, Users, Shield, Wallet2, Key, Globe, AlertTriangle, Lock, Check, Circle, ShieldAlert, RefreshCw, X, Gem, QrCode, Download, Smartphone, LogOut } from "lucide-react-native";
import { useWallet } from "../lib/WalletContext";
import { clearWallet } from "../lib/keys";
import { useContacts } from "../hooks/useContacts";
import { useTwoFactor } from "../lib/TwoFactorContext";
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

function WardStepRow({ step, label, currentStep, totalSteps, failed }: {
  step: number;
  label: string;
  currentStep: number;
  totalSteps: number;
  failed: boolean;
}) {
  const isActive = currentStep === step && !failed;
  const isComplete = currentStep > step;
  const isFailed = currentStep === step && failed;

  return (
    <View style={styles.stepRow}>
      <View style={[
        styles.stepCircle,
        isComplete && styles.stepCircleComplete,
        isActive && styles.stepCircleActive,
        isFailed && styles.stepCircleFailed,
      ]}>
        {isComplete ? (
          <Check size={12} color="#fff" />
        ) : isFailed ? (
          <X size={12} color={colors.error} />
        ) : isActive ? (
          <ActivityIndicator size="small" color={colors.warning} />
        ) : (
          <Circle size={8} color={colors.textMuted} />
        )}
      </View>
      {step < totalSteps && (
        <View style={[styles.stepLine, isComplete && styles.stepLineComplete, isFailed && styles.stepLineFailed]} />
      )}
      <Text style={[
        styles.stepLabel,
        isActive && styles.stepLabelWardActive,
        isComplete && styles.stepLabelComplete,
        isFailed && styles.stepLabelFailed,
      ]}>
        {label}
      </Text>
    </View>
  );
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
          {/* Header */}
          <View style={[wardModalStyles.iconCircle, isDone && wardModalStyles.iconCircleDone, failed && wardModalStyles.iconCircleFailed]}>
            {isDone ? (
              <Check size={28} color={colors.success} />
            ) : failed ? (
              <AlertTriangle size={28} color={colors.error} />
            ) : (
              <ShieldAlert size={28} color={colors.warning} />
            )}
          </View>

          <Text style={wardModalStyles.title}>
            {isDone ? "Ward Created!" : failed ? "Creation Failed" : "Creating Ward..."}
          </Text>

          {!isDone && !failed && (
            <Text style={wardModalStyles.subtitle}>{stepMessage}</Text>
          )}

          {/* Stepper */}
          <View style={wardModalStyles.stepper}>
            {WARD_STEPS.map((s) => (
              <WardStepRow
                key={s.step}
                step={s.step}
                label={s.label}
                currentStep={currentStep}
                totalSteps={6}
                failed={failed && currentStep === s.step}
              />
            ))}
          </View>

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

function QrPreview({ glowColor }: { glowColor: "blue" | "violet" }) {
  return (
    <View style={styles.qrContainer}>
      {/* Subtle glow effect */}
      <View style={[
        styles.qrGlow,
        glowColor === "blue" ? styles.qrGlowBlue : styles.qrGlowViolet
      ]} />
      <View style={styles.qrPlaceholder}>
        <QrCode size={46} color={"rgba(148, 163, 184, 0.55)"} />
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
          <Text style={styles.qrModalLabel}>{label}</Text>
          {/* Large QR code with white background for better scanning */}
          <View style={styles.qrModalQRWrapper}>
            <QRCode value={value} size={250} backgroundColor="#FFFFFF" color="#000000" />
          </View>
          <Text
            {...testProps(testIDs.settings.qrValue)}
            style={styles.qrModalAddress}
            selectable
          >
            {value}
          </Text>
          <View style={styles.qrModalActions}>
            <TouchableOpacity
              {...testProps(testIDs.settings.qrCopy)}
              style={styles.qrModalCopyBtn}
              onPress={handleCopy}
            >
              <Text style={styles.qrModalCopyText}>{copied ? "Copied!" : "Copy Address"}</Text>
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

  const isBiometric2faEnabled = twoFactor.isEnabled || (__DEV__ && !twoFactor.isEnabled);

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
          <QrPreview glowColor="blue" />
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
          <QrPreview glowColor="violet" />
        </TouchableOpacity>
      </View>

      {/* Manage Wards (Guardian features) */}
      {!ward.isWard && (
        <View style={[styles.section, styles.wardsCard]}>
          <View style={styles.rowBetween}>
            <View style={styles.sectionHeader}>
              <ShieldAlert size={18} color={colors.warning} />
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
            onPress={() => navigation.getParent()?.navigate("WardSetup")}
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
                  <View style={[styles.wardIconCircle, isFrozen ? styles.wardIconCircleFrozen : styles.wardIconCircleActive]}>
                    <Shield size={14} color={isFrozen ? colors.error : colors.primaryLight} />
                  </View>

                  <View style={styles.wardLeft}>
                    <View style={styles.wardNameRow}>
                      <Text style={styles.wardNameText}>{w.name}</Text>
                      <View style={styles.wardStatusInline}>
                        <View style={[styles.statusDot, isFrozen ? styles.statusDotFrozen : styles.statusDotActive]} />
                        <Text style={[styles.wardStatusTextInline, isFrozen ? styles.wardStatusFrozenText : styles.wardStatusActiveText]}>
                          {isFrozen ? "Frozen" : "Active"}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.wardMetaRow}>
                      <Text style={styles.wardMetaLabel}>Spending Limit</Text>
                      <Text style={styles.wardMetaValue}>{w.spendingLimit}</Text>
                    </View>
                  </View>

                  <View style={styles.wardRight}>
                    <View style={styles.wardToggleRow}>
                      <Text style={[styles.wardToggleLabel, isFrozen && { color: colors.error }]}>
                        {isFrozen ? "Frozen" : "Freeze"}
                      </Text>
                      <TouchableOpacity
                        style={[styles.toggleTrack, isFrozen && styles.toggleTrackOn]}
                        onPress={async () => {
                          if (!w.raw) return;
                          setWardAction(w.raw.wardAddress);
                          try {
                            if (isFrozen) {
                              await ward.unfreezeWard(w.raw.wardAddress);
                            } else {
                              await ward.freezeWard(w.raw.wardAddress);
                            }
                          } catch (e: any) {
                            modal.showError("Failed", e.message || "Action failed", e.message);
                          } finally {
                            setWardAction(null);
                          }
                        }}
                        disabled={!!wardAction || !w.raw}
                      >
                        <View style={[styles.toggleKnob, isFrozen && styles.toggleKnobOn]} />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.wardMetaRight}>
                      <Text style={styles.wardMetaLabel}>Whitelist</Text>
                      <Text style={styles.wardMetaValue}>{w.whitelist}</Text>
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
            onPress={() => navigation.getParent()?.navigate("KeyBackup")}
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
            onPress={async () => {
              // Keep behavior consistent with existing 2FA enable/disable logic.
              if (!wallet.isDeployed) return;
              try {
                setTfaLoading(true);
                if (twoFactor.isEnabled) {
                  await twoFactor.disable2FA();
                } else {
                  await twoFactor.enable2FA();
                }
                if (ward.isWard) {
                  await ward.refreshWardInfo();
                }
              } finally {
                setTfaLoading(false);
              }
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
            modal.showConfirm(
              "Reset all data?",
              "This will remove keys and all local data from this device.",
              async () => {
                await clearWallet();
                modal.showSuccess("Done", "All data cleared. Restart the app.");
              },
              { destructive: true, confirmText: "Reset All Data" },
            );
          }}
        >
          <Trash2 size={16} color={colors.error} />
          <Text style={styles.dangerZoneBtnText}>Reset All Data</Text>
        </TouchableOpacity>
      </View>
      </KeyboardSafeScreen>
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
  qrPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: borderRadius.lg,
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
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  wardRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(45, 59, 77, 0.7)",
  },
  wardIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  wardIconCircleActive: {
    backgroundColor: "rgba(59, 130, 246, 0.18)",
  },
  wardIconCircleFrozen: {
    backgroundColor: "rgba(239, 68, 68, 0.18)",
  },
  wardLeft: { flex: 1, gap: 6 },
  wardNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  wardNameText: { color: colors.text, fontSize: fontSize.sm, fontFamily: typography.secondarySemibold },
  wardStatusInline: { flexDirection: "row", alignItems: "center", gap: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusDotActive: { backgroundColor: colors.success },
  statusDotFrozen: { backgroundColor: colors.error },
  wardStatusTextInline: { fontSize: 11, fontFamily: typography.secondarySemibold },
  wardStatusActiveText: { color: colors.success },
  wardStatusFrozenText: { color: colors.error },
  wardMetaRow: { flexDirection: "row", gap: 8 },
  wardMetaLabel: { fontSize: 11, color: colors.textMuted, fontFamily: typography.secondary },
  wardMetaValue: { fontSize: 11, color: colors.textSecondary, fontFamily: typography.secondarySemibold },
  wardRight: { alignItems: "flex-end", gap: 8, minWidth: 112 },
  wardToggleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  wardToggleLabel: { fontSize: 11, color: colors.textSecondary, fontFamily: typography.secondarySemibold },
  toggleTrack: {
    width: 34,
    height: 18,
    borderRadius: 999,
    backgroundColor: "rgba(100, 116, 139, 0.25)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    padding: 2,
    justifyContent: "center",
  },
  toggleTrackOn: {
    backgroundColor: "rgba(239, 68, 68, 0.65)",
  },
  toggleKnob: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#E2E8F0",
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

  // QR Modal
  qrModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  qrModalCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  qrModalLabel: {
    fontSize: fontSize.lg,
    fontWeight: "600",
    color: colors.text,
    marginBottom: spacing.lg,
  },
  qrModalQRWrapper: {
    backgroundColor: "#FFFFFF",
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  qrModalAddress: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    fontFamily: "monospace",
    textAlign: "center",
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
  qrModalActions: {
    width: "100%",
    gap: spacing.sm,
  },
  qrModalCopyBtn: {
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
  },
  qrModalCopyText: {
    color: "#fff",
    fontSize: fontSize.md,
    fontWeight: "600",
  },
  qrModalCloseBtn: {
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
  },
  qrModalCloseText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
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

  // Stepper styles
  stepperContainer: {
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
    position: "relative",
  },
  stepCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.bg,
    borderWidth: 2,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  stepCircleActive: {
    borderColor: colors.primary,
    backgroundColor: "rgba(59, 130, 246, 0.1)",
  },
  stepCircleComplete: {
    borderColor: colors.success,
    backgroundColor: colors.success,
  },
  stepLine: {
    position: "absolute",
    left: 11,
    top: 24,
    width: 2,
    height: spacing.sm,
    backgroundColor: colors.borderLight,
  },
  stepLineComplete: {
    backgroundColor: colors.success,
  },
  stepLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  stepLabelActive: {
    color: colors.primary,
    fontWeight: "600",
  },
  stepLabelComplete: {
    color: colors.success,
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

  // Ward step overrides
  stepCircleFailed: {
    borderColor: colors.error,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  stepLineFailed: {
    backgroundColor: colors.error,
  },
  stepLabelWardActive: {
    color: colors.warning,
    fontWeight: "600",
  },
  stepLabelFailed: {
    color: colors.error,
    fontWeight: "600",
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
});

const wardModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
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
    borderColor: "rgba(245, 158, 11, 0.3)",
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    borderWidth: 2,
    borderColor: "rgba(245, 158, 11, 0.3)",
    marginBottom: spacing.md,
  },
  iconCircleDone: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    borderColor: "rgba(16, 185, 129, 0.3)",
  },
  iconCircleFailed: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderColor: "rgba(239, 68, 68, 0.3)",
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: "bold",
    color: colors.text,
    marginBottom: spacing.xs,
    textAlign: "center",
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  stepper: {
    width: "100%",
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
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
    fontWeight: "600",
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
    fontWeight: "600",
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
});
