/**
 * ThemedModal — Dark-themed modal for success, error, and confirm dialogs.
 */
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Linking,
  ScrollView,
} from "react-native";
import Clipboard from "@react-native-clipboard/clipboard";
import { colors, spacing, fontSize, borderRadius } from "../lib/theme";
import { triggerSuccess, triggerError } from "../lib/haptics";

type ModalType = "success" | "error" | "confirm";

type ModalConfig = {
  type: ModalType;
  title: string;
  message: string;
  errorDetails?: string;
  txHash?: string;
  onDismiss?: () => void;
  onConfirm?: () => void;
  destructive?: boolean;
  confirmText?: string;
  cancelText?: string;
};

/** Map raw error messages to user-friendly text */
function friendlyErrorMessage(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("frozen")) {
    return "This ward account is frozen by its guardian. Contact your guardian to unfreeze.";
  }
  if (lower.includes("invalid point") || lower.includes("expected length of 33")) {
    return "Invalid recipient address. Please check and try again.";
  }
  if (lower.includes("invalid transaction nonce") || lower.includes("nonce too old")) {
    return "Transaction conflict. Please try again.";
  }
  if (lower.includes("insufficient max")) {
    return "Insufficient gas. The transaction will be retried with higher gas.";
  }
  if (lower.includes("insufficient") && lower.includes("fund")) {
    return "Not enough funds for this transaction.";
  }
  if (lower.includes("execution reverted")) {
    return "Transaction was rejected by the network.";
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return "Request timed out. Check your connection and try again.";
  }
  // Default: truncate to first 100 chars
  if (raw.length > 100) return raw.slice(0, 100) + "...";
  return raw;
}

export function useThemedModal() {
  const [visible, setVisible] = useState(false);
  const [config, setConfig] = useState<ModalConfig | null>(null);

  const showSuccess = useCallback(
    (title: string, message: string, opts?: { txHash?: string; onDismiss?: () => void }) => {
      triggerSuccess();
      setConfig({ type: "success", title, message, txHash: opts?.txHash, onDismiss: opts?.onDismiss });
      setVisible(true);
    },
    [],
  );

  const showError = useCallback((title: string, message: string, details?: string) => {
    triggerError();
    const friendly = friendlyErrorMessage(message);
    setConfig({
      type: "error",
      title,
      message: friendly,
      errorDetails: friendly !== message ? message : details,
    });
    setVisible(true);
  }, []);

  const showConfirm = useCallback(
    (
      title: string,
      message: string,
      onConfirm: () => void,
      opts?: { destructive?: boolean; confirmText?: string; cancelText?: string },
    ) => {
      setConfig({
        type: "confirm",
        title,
        message,
        onConfirm,
        destructive: opts?.destructive,
        confirmText: opts?.confirmText,
        cancelText: opts?.cancelText,
      });
      setVisible(true);
    },
    [],
  );

  const hide = useCallback(() => {
    setVisible(false);
    const cb = config?.onDismiss;
    setConfig(null);
    cb?.();
  }, [config]);

  const ModalComponent = config ? (
    <ThemedModal visible={visible} config={config} onClose={hide} />
  ) : null;

  return { showSuccess, showError, showConfirm, hide, ModalComponent };
}

const ICONS: Record<ModalType, string> = {
  success: "\u2713",
  error: "!",
  confirm: "?",
};

const ICON_COLORS: Record<ModalType, string> = {
  success: colors.success,
  error: colors.error,
  confirm: colors.primary,
};

const BORDER_COLORS: Record<ModalType, string> = {
  success: "rgba(16, 185, 129, 0.4)",
  error: "rgba(239, 68, 68, 0.4)",
  confirm: "rgba(59, 130, 246, 0.4)",
};

function TxHashRow({ txHash }: { txHash: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    Clipboard.setString(txHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleViewOnVoyager = () => {
    Linking.openURL(`https://sepolia.voyager.online/tx/${txHash}`);
  };

  return (
    <View style={styles.txSection}>
      <View style={styles.txRow}>
        <Text style={styles.txHash} numberOfLines={1}>
          {txHash.slice(0, 20)}...{txHash.slice(-6)}
        </Text>
        <TouchableOpacity onPress={handleCopy}>
          <Text style={styles.txCopyBtn}>{copied ? "Copied!" : "Copy"}</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity onPress={handleViewOnVoyager}>
        <Text style={styles.voyagerLink}>View on Voyager</Text>
      </TouchableOpacity>
    </View>
  );
}

function ErrorDetailsSection({ details }: { details: string }) {
  const [expanded, setExpanded] = useState(false);
  const [reportCopied, setReportCopied] = useState(false);

  const handleReport = () => {
    Clipboard.setString(`Cloak Error Report:\n${details}`);
    setReportCopied(true);
    setTimeout(() => setReportCopied(false), 2000);
  };

  return (
    <View style={styles.errorDetailsSection}>
      <TouchableOpacity onPress={() => setExpanded(!expanded)}>
        <Text style={styles.showDetailsToggle}>
          {expanded ? "Hide Details" : "Show Details"}
        </Text>
      </TouchableOpacity>
      {expanded && (
        <ScrollView style={styles.errorDetailsScroll} nestedScrollEnabled>
          <Text style={styles.errorDetailsText}>{details}</Text>
        </ScrollView>
      )}
      <TouchableOpacity style={styles.reportBtn} onPress={handleReport}>
        <Text style={styles.reportBtnText}>
          {reportCopied ? "Copied!" : "Copy Error Report"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function ThemedModal({
  visible,
  config,
  onClose,
}: {
  visible: boolean;
  config: ModalConfig;
  onClose: () => void;
}) {
  const iconColor = ICON_COLORS[config.type];
  const borderColor = BORDER_COLORS[config.type];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.card, { borderColor }]}>
          {/* Icon */}
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: iconColor + "20", borderColor: iconColor + "40" },
            ]}
          >
            <Text style={[styles.iconText, { color: iconColor }]}>
              {ICONS[config.type]}
            </Text>
          </View>

          {/* Title */}
          <Text style={styles.title}>{config.title}</Text>

          {/* Message */}
          <Text style={styles.message}>{config.message}</Text>

          {/* Error Details (expandable) */}
          {config.type === "error" && config.errorDetails && (
            <ErrorDetailsSection details={config.errorDetails} />
          )}

          {/* TxHash */}
          {config.txHash && <TxHashRow txHash={config.txHash} />}

          {/* Buttons */}
          {config.type === "confirm" ? (
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={onClose}
              >
                <Text style={styles.cancelButtonText}>
                  {config.cancelText || "Cancel"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.confirmButton,
                  config.destructive && styles.destructiveButton,
                ]}
                onPress={() => {
                  onClose();
                  config.onConfirm?.();
                }}
              >
                <Text
                  style={[
                    styles.confirmButtonText,
                    config.destructive && styles.destructiveButtonText,
                  ]}
                >
                  {config.confirmText || "Confirm"}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.okButton, { backgroundColor: iconColor + "20" }]}
              onPress={onClose}
            >
              <Text style={[styles.okButtonText, { color: iconColor }]}>OK</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
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
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    marginBottom: spacing.md,
  },
  iconText: {
    fontSize: 28,
    fontWeight: "bold",
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: "bold",
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  message: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  txSection: {
    width: "100%",
    backgroundColor: colors.bg,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.lg,
  },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  txHash: {
    flex: 1,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontFamily: "monospace",
    marginRight: spacing.sm,
  },
  txCopyBtn: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: "600",
  },
  voyagerLink: {
    fontSize: fontSize.xs,
    color: colors.primary,
    textDecorationLine: "underline",
  },
  buttonRow: {
    flexDirection: "row",
    gap: spacing.md,
    width: "100%",
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: "center",
  },
  cancelButtonText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    fontWeight: "600",
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
  },
  confirmButtonText: {
    color: "#fff",
    fontSize: fontSize.md,
    fontWeight: "600",
  },
  destructiveButton: {
    backgroundColor: colors.error,
  },
  destructiveButtonText: {
    color: "#fff",
  },
  okButton: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    alignItems: "center",
  },
  okButtonText: {
    fontSize: fontSize.md,
    fontWeight: "600",
  },
  errorDetailsSection: {
    width: "100%",
    marginBottom: spacing.md,
  },
  showDetailsToggle: {
    fontSize: fontSize.xs,
    color: colors.primary,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  errorDetailsScroll: {
    maxHeight: 120,
    backgroundColor: colors.bg,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  errorDetailsText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontFamily: "monospace",
  },
  reportBtn: {
    alignItems: "center",
    paddingVertical: 6,
  },
  reportBtnText: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
});
