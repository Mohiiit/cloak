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
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Clipboard from "@react-native-clipboard/clipboard";
import QRCode from "react-native-qrcode-svg";
import { Plus, Trash2, Users } from "lucide-react-native";
import { useWallet } from "../lib/WalletContext";
import { clearWallet } from "../lib/keys";
import { useContacts } from "../hooks/useContacts";
import { colors, spacing, fontSize, borderRadius } from "../lib/theme";
import { useThemedModal } from "../components/ThemedModal";

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

function AddressQR({ value }: { value: string }) {
  return (
    <View style={styles.qrContainer}>
      <QRCode
        value={value}
        size={120}
        backgroundColor={colors.bg}
        color={colors.text}
      />
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
          <View style={styles.qrModalQR}>
            <QRCode value={value} size={250} backgroundColor={colors.bg} color={colors.text} />
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
  const { contacts, addContact, removeContact, refresh: refreshContacts } = useContacts();
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactAddr, setNewContactAddr] = useState("");
  const scrollRef = useRef<ScrollView>(null);
  const [qrModal, setQrModal] = useState<{ label: string; value: string } | null>(null);

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
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Cloak Address</Text>
        <Text style={styles.sectionDesc}>
          Share this with others so they can send you shielded payments.
        </Text>
        <TouchableOpacity onPress={() => setQrModal({ label: "Cloak Address", value: wallet.keys.tongoAddress })}>
          <CopyRow label="Tongo Address" value={wallet.keys.tongoAddress} />
          <AddressQR value={wallet.keys.tongoAddress} />
          <Text style={styles.tapHint}>Tap to enlarge QR</Text>
        </TouchableOpacity>
      </View>

      {/* Account Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <TouchableOpacity onPress={() => setQrModal({ label: "Starknet Address", value: wallet.keys.starkAddress })}>
          <CopyRow label="Starknet Address" value={wallet.keys.starkAddress} />
          <AddressQR value={wallet.keys.starkAddress} />
          <Text style={styles.tapHint}>Tap to enlarge QR</Text>
        </TouchableOpacity>
      </View>

      {/* Contacts */}
      <View style={styles.section}>
        <View style={styles.contactsSectionHeader}>
          <Text style={styles.sectionTitle}>Contacts</Text>
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
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Key Backup</Text>
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

      {/* Network */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Network</Text>
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
      <View style={[styles.section, styles.dangerSection]}>
        <Text style={[styles.sectionTitle, { color: colors.error }]}>Danger Zone</Text>
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
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 4,
  },
  sectionDesc: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
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
    alignItems: "center",
    padding: spacing.md,
    backgroundColor: colors.bg,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },

  warningText: { fontSize: fontSize.sm, color: colors.warning, marginBottom: spacing.md },

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

  dangerSection: { borderColor: "rgba(239, 68, 68, 0.2)" },
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
  qrModalQR: {
    padding: spacing.md,
    backgroundColor: colors.bg,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
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

  aboutSection: { alignItems: "center", paddingVertical: spacing.xl },
  aboutText: { fontSize: fontSize.sm, color: colors.textMuted, marginBottom: 4 },
});
