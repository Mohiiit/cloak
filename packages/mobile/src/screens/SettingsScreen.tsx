/**
 * SettingsScreen — Key backup, wallet info, QR codes, and preferences.
 */
import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Clipboard from "@react-native-clipboard/clipboard";
import QRCode from "react-native-qrcode-svg";
import { Plus, Trash2, Users, Shield, Wallet2, Key, Globe, AlertTriangle, Lock, Check, Circle } from "lucide-react-native";
import { useWallet } from "../lib/WalletContext";
import { clearWallet } from "../lib/keys";
import { useContacts } from "../hooks/useContacts";
import { useTwoFactor, type TwoFAStep } from "../lib/TwoFactorContext";
import { colors, spacing, fontSize, borderRadius } from "../lib/theme";
import { useThemedModal } from "../components/ThemedModal";

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
          <Text style={styles.qrModalAddress} selectable>{value}</Text>
          <View style={styles.qrModalActions}>
            <TouchableOpacity style={styles.qrModalCopyBtn} onPress={handleCopy}>
              <Text style={styles.qrModalCopyText}>{copied ? "Copied!" : "Copy Address"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.qrModalCloseBtn} onPress={onClose}>
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
  const { contacts, addContact, removeContact, refresh: refreshContacts } = useContacts();
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactAddr, setNewContactAddr] = useState("");
  const scrollRef = useRef<ScrollView>(null);
  const [qrModal, setQrModal] = useState<{ label: string; value: string } | null>(null);

  // 2FA state
  const [tfaLoading, setTfaLoading] = useState(false);
  const [tfaStep, setTfaStep] = useState<TwoFAStep>("idle");

  // Reset scroll on focus
  useFocusEffect(
    React.useCallback(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }, []),
  );

  if (!wallet.keys) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>No wallet created yet.</Text>
      </View>
    );
  }

  return (
    <ScrollView ref={scrollRef} style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {modal.ModalComponent}
      {qrModal && (
        <FullScreenQR
          visible={!!qrModal}
          label={qrModal.label}
          value={qrModal.value}
          onClose={() => setQrModal(null)}
        />
      )}
      {/* Cloak Address */}
      <View style={[styles.section, styles.addressSection]}>
        <View style={styles.sectionHeader}>
          <Shield size={18} color={colors.primary} />
          <Text style={styles.sectionTitle}>Your Cloak Address</Text>
        </View>
        <Text style={styles.sectionDesc}>
          Share this with others so they can send you shielded payments.
        </Text>
        <TouchableOpacity onPress={() => setQrModal({ label: "Cloak Address", value: wallet.keys.tongoAddress })}>
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
        <TouchableOpacity onPress={() => setQrModal({ label: "Starknet Address", value: wallet.keys.starkAddress })}>
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
          <TouchableOpacity onPress={() => setShowAddContact(!showAddContact)}>
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
                style={styles.tfaEnableBtn}
                onPress={async () => {
                  setTfaLoading(true);
                  setTfaStep("auth");
                  await twoFactor.enable2FA((step) => setTfaStep(step));
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
            style={[styles.tfaDisableBtn, tfaLoading && { opacity: 0.5 }]}
            disabled={tfaLoading}
            onPress={async () => {
              setTfaLoading(true);
              await twoFactor.disable2FA();
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 100 },
  center: { flex: 1, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" },
  emptyText: { color: colors.textSecondary, fontSize: fontSize.md },

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

  aboutSection: { alignItems: "center", paddingVertical: spacing.xl },
  aboutText: { fontSize: fontSize.sm, color: colors.textMuted, marginBottom: 4 },
});
