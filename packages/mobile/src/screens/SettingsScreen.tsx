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
import { Plus, Trash2, Users, Shield, Wallet2, Key, Globe, AlertTriangle, Lock, Check, Circle, ShieldAlert, Snowflake, Sun, ChevronDown, ChevronUp, RefreshCw, X } from "lucide-react-native";
import { useWallet } from "../lib/WalletContext";
import { clearWallet } from "../lib/keys";
import { useContacts } from "../hooks/useContacts";
import { useTwoFactor, type TwoFAStep } from "../lib/TwoFactorContext";
import { useWardContext, type WardEntry, type WardCreationProgress, type WardCreationOptions } from "../lib/wardContext";
import { colors, spacing, fontSize, borderRadius } from "../lib/theme";
import { useThemedModal } from "../components/ThemedModal";
import { KeyboardSafeScreen, KeyboardSafeModal } from "../components/KeyboardSafeContainer";
import { testIDs, testProps } from "../testing/testIDs";

const TFA_STEP_ORDER: TwoFAStep[] = ["auth", "keygen", "onchain", "register"];

function TFAStepRow({ step, label, currentStep }: { step: TwoFAStep; label: string; currentStep: TwoFAStep }) {
  const currentIdx = TFA_STEP_ORDER.indexOf(currentStep);
  const stepIdx = TFA_STEP_ORDER.indexOf(step);
  const isActive = currentStep === step;
  const isComplete = currentIdx > stepIdx || currentStep === "done";

  return (
    <View style={styles.stepRow}>
      <View style={[
        styles.stepCircle,
        isComplete && styles.stepCircleComplete,
        isActive && styles.stepCircleActive,
      ]}>
        {isComplete ? (
          <Check size={12} color="#fff" />
        ) : isActive ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Circle size={8} color={colors.textMuted} />
        )}
      </View>
      {stepIdx < TFA_STEP_ORDER.length - 1 && (
        <View style={[styles.stepLine, isComplete && styles.stepLineComplete]} />
      )}
      <Text style={[
        styles.stepLabel,
        isActive && styles.stepLabelActive,
        isComplete && styles.stepLabelComplete,
      ]}>
        {label}
      </Text>
    </View>
  );
}

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

function CopyRow({ label, value }: { label: string; value: string }) {
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
          {value}
        </Text>
        <Text style={styles.copyBtn}>{copied ? "Copied!" : "Copy"}</Text>
      </TouchableOpacity>
    </View>
  );
}

function AddressQR({ value, glowColor }: { value: string; glowColor: "blue" | "violet" }) {
  return (
    <View style={styles.qrContainer}>
      {/* Subtle glow effect */}
      <View style={[
        styles.qrGlow,
        glowColor === "blue" ? styles.qrGlowBlue : styles.qrGlowViolet
      ]} />
      {/* White background for QR code readability */}
      <View style={styles.qrWhiteBg}>
        <QRCode
          value={value}
          size={120}
          backgroundColor="#FFFFFF"
          color="#000000"
        />
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

export default function SettingsScreen() {
  const wallet = useWallet();
  const modal = useThemedModal();
  const twoFactor = useTwoFactor();
  const ward = useWardContext();
  const { contacts, addContact, removeContact } = useContacts();
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactAddr, setNewContactAddr] = useState("");
  const [qrModal, setQrModal] = useState<{ label: string; value: string } | null>(null);

  // 2FA state
  const [tfaLoading, setTfaLoading] = useState(false);
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
  const [expandedWard, setExpandedWard] = useState<string | null>(null);
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
          <Shield size={18} color={colors.primary} />
          <Text style={styles.sectionTitle}>Your Cloak Address</Text>
        </View>
        <Text style={styles.sectionDesc}>
          Share this with others so they can send you shielded payments.
        </Text>
        <TouchableOpacity
          {...testProps(testIDs.settings.cloakQrOpen)}
          onPress={() => setQrModal({ label: "Cloak Address", value: wallet.keys!.tongoAddress })}
        >
          <CopyRow label="Tongo Address" value={wallet.keys.tongoAddress} />
          <AddressQR value={wallet.keys.tongoAddress} glowColor="blue" />
          <Text style={styles.tapHint}>Tap to enlarge QR</Text>
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
          <CopyRow label="Starknet Address" value={wallet.keys.starkAddress} />
          <AddressQR value={wallet.keys.starkAddress} glowColor="violet" />
          <Text style={styles.tapHint}>Tap to enlarge QR</Text>
        </TouchableOpacity>
      </View>

      {/* Contacts */}
      <View style={styles.section}>
        <View style={styles.contactsSectionHeader}>
          <View style={styles.sectionHeader}>
            <Users size={18} color={colors.primary} />
            <Text style={styles.sectionTitle}>Contacts</Text>
          </View>
          <TouchableOpacity
            {...testProps(testIDs.settings.contactsAddToggle)}
            onPress={() => setShowAddContact(!showAddContact)}
          >
            <Plus size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>
        <Text style={styles.sectionDesc}>Saved addresses for quick sending</Text>

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
              placeholder="Tongo address (base58)"
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

        {contacts.length === 0 && !showAddContact && (
          <View style={styles.emptyContacts}>
            <Users size={24} color={colors.textMuted} />
            <Text style={styles.emptyContactsText}>No contacts saved</Text>
          </View>
        )}

        {contacts.map((c) => (
          <View key={c.id} style={styles.contactRow}>
            <View style={styles.contactAvatar}>
              <Text style={styles.contactAvatarText}>
                {(c.nickname || c.tongoAddress)?.[0]?.toUpperCase() || "?"}
              </Text>
            </View>
            <View style={styles.contactInfo}>
              {c.nickname && <Text style={styles.contactName}>{c.nickname}</Text>}
              <Text style={styles.contactAddr} numberOfLines={1}>{c.tongoAddress}</Text>
            </View>
            <TouchableOpacity onPress={() => removeContact(c.id)}>
              <Trash2 size={16} color={colors.error} />
            </TouchableOpacity>
          </View>
        ))}
      </View>

      {/* Manage Wards (Guardian features) */}
      {!ward.isWard && (
        <View style={[styles.section, styles.wardSection]}>
          <View style={styles.contactsSectionHeader}>
            <View style={styles.sectionHeader}>
              <ShieldAlert size={18} color={colors.warning} />
              <Text style={styles.sectionTitle}>Manage Wards</Text>
            </View>
            {ward.isLoadingWards && <ActivityIndicator size="small" color={colors.warning} />}
          </View>
          <Text style={styles.sectionDesc}>
            Create and manage ward accounts. Wards are sub-accounts with spending limits that require your approval.
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

          {/* Partial ward recovery banner */}
          {ward.partialWard && !isCreatingWard && (
            <View style={styles.partialWardBanner}>
              <View style={{ flex: 1 }}>
                <Text style={styles.partialWardTitle}>Ward creation incomplete</Text>
                <Text style={styles.partialWardDesc}>
                  A ward was deployed but setup didn't finish. Resume to complete it.
                </Text>
              </View>
              <View style={styles.partialWardActions}>
                <TouchableOpacity
                  {...testProps(testIDs.settings.wardPartialResume)}
                  style={styles.partialWardRetryBtn}
                  onPress={() => openWardSetup("retry")}
                >
                  <RefreshCw size={14} color="#fff" />
                  <Text style={styles.partialWardRetryText}>Resume</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  {...testProps(testIDs.settings.wardPartialDismiss)}
                  style={styles.partialWardDismissBtn}
                  onPress={() => ward.clearPartialWard()}
                >
                  <Text style={styles.partialWardDismissText}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Create Ward Button */}
          <TouchableOpacity
            {...testProps(testIDs.settings.wardCreate)}
            style={[styles.wardCreateBtn, (isCreatingWard || !wallet.isDeployed) && { opacity: 0.5 }]}
            disabled={isCreatingWard || !wallet.isDeployed}
            onPress={() => {
              openWardSetup("create");
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <Plus size={16} color="#fff" />
              <Text style={styles.wardCreateBtnText}>Create New Ward</Text>
            </View>
          </TouchableOpacity>

          {!wallet.isDeployed && (
            <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.xs }}>
              Deploy your account first to create wards.
            </Text>
          )}

          {/* Ward List */}
          {ward.wards.length === 0 && !ward.isLoadingWards && (
            <View style={styles.emptyContacts}>
              <ShieldAlert size={24} color={colors.textMuted} />
              <Text style={styles.emptyContactsText}>No ward accounts yet</Text>
            </View>
          )}

          {ward.wards.map((w: WardEntry) => {
            const isExpanded = expandedWard === w.wardAddress;
            const isFrozen = w.status === "frozen";
            return (
              <View key={w.wardAddress} style={styles.wardCard}>
                <TouchableOpacity
                  style={styles.wardCardHeader}
                  onPress={() => setExpandedWard(isExpanded ? null : w.wardAddress)}
                >
                  <View style={styles.wardCardLeft}>
                    <View style={[styles.contactAvatar, { backgroundColor: isFrozen ? "rgba(239, 68, 68, 0.2)" : "rgba(245, 158, 11, 0.2)" }]}>
                      <Text style={[styles.contactAvatarText, { color: isFrozen ? colors.error : colors.warning }]}>
                        W
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.contactAddr} numberOfLines={1}>
                        {w.wardAddress.slice(0, 10)}...{w.wardAddress.slice(-6)}
                      </Text>
                      <View style={[styles.wardStatusBadge, isFrozen ? styles.wardStatusFrozen : styles.wardStatusActive]}>
                        <Text style={[styles.wardStatusText, isFrozen ? { color: colors.error } : { color: colors.success }]}>
                          {isFrozen ? "Frozen" : "Active"}
                        </Text>
                      </View>
                    </View>
                  </View>
                  {isExpanded ? <ChevronUp size={18} color={colors.textMuted} /> : <ChevronDown size={18} color={colors.textMuted} />}
                </TouchableOpacity>

                {isExpanded && (
                  <View style={styles.wardCardActions}>
                    <View style={styles.wardInfoRow}>
                      <Text style={styles.wardInfoLabel}>Address</Text>
                      <TouchableOpacity onPress={() => {
                        Clipboard.setString(w.wardAddress);
                      }}>
                        <Text style={styles.wardInfoValue}>{w.wardAddress.slice(0, 14)}... <Text style={{ color: colors.primary, fontSize: fontSize.xs }}>Copy</Text></Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.wardInfoRow}>
                      <Text style={styles.wardInfoLabel}>Guardian Required</Text>
                      <Text style={styles.wardInfoValue}>{w.requireGuardianForAll ? "All txs" : "Above limit"}</Text>
                    </View>

                    {/* Action Buttons */}
                    <View style={styles.wardActionsRow}>
                      {/* Freeze / Unfreeze */}
                      <TouchableOpacity
                        style={[styles.wardActionBtn, isFrozen ? styles.wardActionUnfreeze : styles.wardActionFreeze]}
                        disabled={wardAction === w.wardAddress}
                        onPress={async () => {
                          setWardAction(w.wardAddress);
                          try {
                            if (isFrozen) {
                              await ward.unfreezeWard(w.wardAddress);
                            } else {
                              await ward.freezeWard(w.wardAddress);
                            }
                          } catch (e: any) {
                            modal.showError("Failed", e.message || "Action failed", e.message);
                          } finally {
                            setWardAction(null);
                          }
                        }}
                      >
                        {wardAction === w.wardAddress ? (
                          <ActivityIndicator size="small" color={isFrozen ? colors.success : colors.error} />
                        ) : isFrozen ? (
                          <>
                            <Sun size={14} color={colors.success} />
                            <Text style={{ color: colors.success, fontSize: fontSize.xs, fontWeight: "600" }}>Unfreeze</Text>
                          </>
                        ) : (
                          <>
                            <Snowflake size={14} color={colors.error} />
                            <Text style={{ color: colors.error, fontSize: fontSize.xs, fontWeight: "600" }}>Freeze</Text>
                          </>
                        )}
                      </TouchableOpacity>

                      {/* Show QR */}
                      <TouchableOpacity
                        style={styles.wardActionBtnSecondary}
                        onPress={() => {
                          setQrModal({ label: "Ward Address", value: w.wardAddress });
                        }}
                      >
                        <Text style={{ color: colors.primary, fontSize: fontSize.xs, fontWeight: "600" }}>Show QR</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* Key Backup */}
      <View style={[styles.section, styles.dangerSection]}>
        <View style={styles.sectionHeader}>
          <Key size={18} color={colors.warning} />
          <Text style={styles.sectionTitle}>Key Backup</Text>
        </View>
        <Text style={styles.warningText}>
          Keep your private keys safe. Anyone with these keys can access your funds.
        </Text>

        {!showPrivateKey ? (
          <TouchableOpacity
            {...testProps(testIDs.settings.keyBackupReveal)}
            style={styles.revealBtn}
            onPress={() => {
              modal.showConfirm(
                "Show Private Keys?",
                "Make sure no one is looking at your screen.",
                () => setShowPrivateKey(true),
                { confirmText: "Show" },
              );
            }}
          >
            <Text style={styles.revealBtnText}>Reveal Private Keys</Text>
          </TouchableOpacity>
        ) : (
          <View>
            <CopyRow label="Stark Private Key" value={wallet.keys.starkPrivateKey} />
            <CopyRow label="Tongo Private Key" value={wallet.keys.tongoPrivateKey} />
            <TouchableOpacity
              {...testProps(testIDs.settings.keyBackupHide)}
              style={styles.hideBtn}
              onPress={() => setShowPrivateKey(false)}
            >
              <Text style={styles.hideBtnText}>Hide Keys</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Two-Factor Authentication */}
      <View style={[styles.section, styles.tfaSection]}>
        <View style={styles.sectionHeader}>
          <Lock size={18} color={colors.primary} />
          <Text style={styles.sectionTitle}>Two-Factor Authentication</Text>
        </View>
        <Text style={styles.sectionDesc}>
          Require mobile approval for extension transactions.
        </Text>

        {/* Status badge */}
        <View style={styles.tfaStatusRow}>
          <Text style={styles.tfaStatusLabel}>Status</Text>
          <View
            style={[
              styles.tfaBadge,
              twoFactor.isEnabled ? styles.tfaBadgeActive : styles.tfaBadgeInactive,
            ]}
          >
            <Text
              style={[
                styles.tfaBadgeText,
                twoFactor.isEnabled ? styles.tfaBadgeTextActive : styles.tfaBadgeTextInactive,
              ]}
            >
              {twoFactor.isEnabled ? "Active" : "Inactive"}
            </Text>
          </View>
        </View>

        {/* Stepper UI (shown during enable flow) */}
        {tfaStep !== "idle" && tfaStep !== "done" && tfaStep !== "error" && (
          <View style={styles.stepperContainer}>
            <TFAStepRow step="auth" label="Authenticate" currentStep={tfaStep} />
            <TFAStepRow step="keygen" label="Generate Keys" currentStep={tfaStep} />
            <TFAStepRow step="onchain" label="On-Chain Transaction" currentStep={tfaStep} />
            <TFAStepRow step="register" label="Register Config" currentStep={tfaStep} />
          </View>
        )}

        {/* Secondary Public Key (if enabled) */}
        {twoFactor.secondaryPublicKey && tfaStep === "idle" && (
          <View style={styles.tfaKeyRow}>
            <Text style={styles.tfaKeyLabel}>Secondary Public Key</Text>
            <Text style={styles.tfaKeyValue} numberOfLines={1}>
              {twoFactor.secondaryPublicKey.slice(0, 12)}...{twoFactor.secondaryPublicKey.slice(-8)}
            </Text>
          </View>
        )}

        {/* Enable / Disable buttons */}
        {!twoFactor.isEnabled && tfaStep === "idle" ? (
          !wallet.isDeployed ? (
            <View style={styles.tfaDeployGate}>
              <AlertTriangle size={16} color={colors.textMuted} />
              <Text style={styles.tfaDeployGateText}>
                Deploy your account on-chain before enabling 2FA.
              </Text>
            </View>
          ) : (
            <>
              {/* Side-effect warning */}
              <View style={styles.tfaWarning}>
                <AlertTriangle size={16} color={colors.warning} />
                <Text style={styles.tfaWarningText}>
                  Enabling 2FA will require this device to approve every transaction from the extension and web app. An on-chain transaction will be submitted to register the secondary key.
                </Text>
              </View>
              <TouchableOpacity
                {...testProps(testIDs.settings.tfaEnable)}
                style={styles.tfaEnableBtn}
                onPress={async () => {
                  setTfaLoading(true);
                  setTfaStep("auth");
                  await twoFactor.enable2FA((step) => setTfaStep(step));
                  // If this device is a ward, refresh on-chain ward flags so Home banner reflects the new state.
                  if (ward.isWard) {
                    await ward.refreshWardInfo();
                  }
                  setTfaLoading(false);
                  // Reset after done (longer delay on error so user can read it)
                  const delay = twoFactor.isEnabled ? 2000 : 5000;
                  setTimeout(() => setTfaStep("idle"), delay);
                }}
              >
                <Text style={styles.tfaEnableBtnText}>Enable 2FA</Text>
              </TouchableOpacity>
            </>
          )
        ) : twoFactor.isEnabled && tfaStep === "idle" ? (
          <TouchableOpacity
            {...testProps(testIDs.settings.tfaDisable)}
            style={[styles.tfaDisableBtn, tfaLoading && { opacity: 0.5 }]}
            disabled={tfaLoading}
            onPress={async () => {
              setTfaLoading(true);
              await twoFactor.disable2FA();
              // If this device is a ward, refresh on-chain ward flags so Home banner reflects the new state.
              if (ward.isWard) {
                await ward.refreshWardInfo();
              }
              setTfaLoading(false);
            }}
          >
            {tfaLoading ? (
              <ActivityIndicator size="small" color={colors.error} />
            ) : (
              <Text style={styles.tfaDisableBtnText}>Disable 2FA</Text>
            )}
          </TouchableOpacity>
        ) : null}

        {/* Supabase config is hardcoded — no need to expose in UI */}
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
          <Text style={styles.infoLabel}>Bridge</Text>
          <Text style={[styles.infoValue, { color: wallet.isBridgeReady ? colors.success : colors.error }]}>
            {wallet.isBridgeReady ? "Connected" : "Disconnected"}
          </Text>
        </View>
      </View>

      {/* Danger Zone */}
      <View style={[styles.section, styles.clearDataSection]}>
        <View style={styles.sectionHeader}>
          <AlertTriangle size={18} color={colors.error} />
          <Text style={[styles.sectionTitle, { color: colors.error }]}>Danger Zone</Text>
        </View>
        <TouchableOpacity
          {...testProps(testIDs.settings.clearAllData)}
          style={styles.dangerBtn}
          onPress={() => {
            modal.showConfirm(
              "Clear Wallet?",
              "This will remove all keys and data from this device. Make sure you've backed up your keys!",
              async () => {
                await clearWallet();
                modal.showSuccess("Done", "Wallet data cleared. Restart the app.");
              },
              { destructive: true, confirmText: "Clear All Data" },
            );
          }}
        >
          <Text style={styles.dangerBtnText}>Clear All Data</Text>
        </TouchableOpacity>
      </View>

      {/* About */}
      <View style={styles.aboutSection}>
        <Text style={styles.aboutText}>Cloak v0.1.0</Text>
        <Text style={styles.aboutText}>Built for Re{"{define}"} Hackathon</Text>
        <Text style={styles.aboutText}>Privacy Track</Text>
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
    fontWeight: "600",
    color: colors.text,
  },
  sectionDesc: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
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
  copyLabel: { fontSize: fontSize.xs, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  copyValueRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bg,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  copyValue: { flex: 1, fontSize: fontSize.sm, color: colors.text, fontFamily: "monospace" },
  copyBtn: { fontSize: fontSize.xs, color: colors.primary, fontWeight: "600", marginLeft: spacing.sm },

  qrContainer: {
    position: "relative",
    alignItems: "center",
    padding: spacing.lg,
    backgroundColor: colors.bg,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    overflow: "hidden",
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

  tapHint: {
    fontSize: fontSize.xs,
    color: colors.primary,
    textAlign: "center",
    marginTop: -spacing.xs,
    marginBottom: spacing.sm,
  },

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
