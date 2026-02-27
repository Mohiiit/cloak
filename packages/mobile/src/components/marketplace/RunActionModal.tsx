/**
 * Action picker + dynamic form for running marketplace agent actions.
 */
import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  Modal,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { X, ChevronRight, Play, AlertTriangle } from "lucide-react-native";
import type { AgentProfileResponse } from "@cloak-wallet/sdk";
import {
  getRunActionDefinitions,
  getRunActionDefinition,
  createInitialRunActionValues,
  validateRunActionInput,
  buildRunParams,
  type MarketplaceRunActionDefinition,
} from "../../lib/marketplaceRunConfig";
import { useWallet } from "../../lib/WalletContext";
import { useMarketplaceRun } from "../../hooks/useMarketplaceRun";
import { colors, spacing, fontSize, borderRadius, typography } from "../../lib/theme";
import RunProgressModal from "./RunProgressModal";

interface RunActionModalProps {
  visible: boolean;
  agent: AgentProfileResponse;
  hireId: string;
  onClose: () => void;
}

type ModalView = "picker" | "form" | "progress";

export default function RunActionModal({
  visible,
  agent,
  hireId,
  onClose,
}: RunActionModalProps) {
  const wallet = useWallet();
  const signerKeys = wallet.keys
    ? { starkPrivateKey: wallet.keys.starkPrivateKey, starkAddress: wallet.keys.starkAddress }
    : null;
  const run = useMarketplaceRun(wallet.x402Pay, signerKeys);

  const [view, setView] = useState<ModalView>("picker");
  const [selectedAction, setSelectedAction] = useState<string>("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [validationError, setValidationError] = useState<string | null>(null);

  const actionDefinitions = useMemo(
    () => getRunActionDefinitions(agent.agent_type),
    [agent.agent_type],
  );

  const currentDefinition = useMemo(
    () => (selectedAction ? getRunActionDefinition(agent.agent_type, selectedAction) : null),
    [agent.agent_type, selectedAction],
  );

  const handlePickAction = useCallback(
    (def: MarketplaceRunActionDefinition) => {
      setSelectedAction(def.action);
      setValues(createInitialRunActionValues(def));
      setValidationError(null);
      setView("form");
    },
    [],
  );

  const handleFieldChange = useCallback((key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setValidationError(null);
  }, []);

  const handleExecute = useCallback(async () => {
    if (!currentDefinition) return;

    const error = validateRunActionInput(currentDefinition, values);
    if (error) {
      setValidationError(error);
      return;
    }

    const params = buildRunParams(currentDefinition, values);
    setView("progress");

    await run.execute({
      hireId,
      agentId: agent.agent_id,
      agentType: agent.agent_type,
      action: currentDefinition.action,
      params,
      payerTongoAddress: wallet.keys?.tongoAddress || "",
    });
  }, [currentDefinition, values, hireId, agent.agent_id, wallet.keys?.tongoAddress, run]);

  const handleClose = useCallback(() => {
    if (run.isRunning) return; // prevent closing during execution
    setView("picker");
    setSelectedAction("");
    setValues({});
    setValidationError(null);
    run.reset();
    onClose();
  }, [run, onClose]);

  const handleBackToForm = useCallback(() => {
    if (run.isRunning) return;
    run.reset();
    setView("form");
  }, [run]);

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            {view === "picker"
              ? "Choose Action"
              : view === "form"
                ? currentDefinition?.label || "Configure"
                : "Execution Progress"}
          </Text>
          <TouchableOpacity
            onPress={handleClose}
            style={styles.closeBtn}
            disabled={run.isRunning}
          >
            <X size={20} color={run.isRunning ? colors.textMuted : colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {view === "picker" && (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            <Text style={styles.sectionSubtitle}>
              Select an action to run with {agent.name}
            </Text>
            {actionDefinitions.map((def) => (
              <TouchableOpacity
                key={def.action}
                style={styles.actionCard}
                onPress={() => handlePickAction(def)}
                activeOpacity={0.7}
              >
                <View style={styles.actionCardContent}>
                  <Text style={styles.actionLabel}>{def.label}</Text>
                  <Text style={styles.actionDesc}>{def.description}</Text>
                </View>
                <ChevronRight size={18} color={colors.textMuted} />
              </TouchableOpacity>
            ))}

            {actionDefinitions.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No actions available for this agent type.</Text>
              </View>
            )}
          </ScrollView>
        )}

        {view === "form" && currentDefinition && (
          <>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
              <Text style={styles.sectionSubtitle}>{currentDefinition.description}</Text>

              {currentDefinition.fields.map((field) => (
                <View key={field.key} style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>
                    {field.label}
                    {field.required !== false && <Text style={styles.required}> *</Text>}
                  </Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={values[field.key] || ""}
                    onChangeText={(v) => handleFieldChange(field.key, v)}
                    placeholder={field.placeholder}
                    placeholderTextColor={colors.textMuted}
                    keyboardType={field.keyboardType === "numeric" ? "numeric" : "default"}
                    autoCapitalize="none"
                    autoCorrect={false}
                    spellCheck={false}
                  />
                  {field.helperText && (
                    <Text style={styles.helperText}>{field.helperText}</Text>
                  )}
                </View>
              ))}

              {validationError && (
                <View style={styles.errorRow}>
                  <AlertTriangle size={14} color={colors.error} />
                  <Text style={styles.errorText}>{validationError}</Text>
                </View>
              )}
            </ScrollView>

            <View style={styles.formActions}>
              <TouchableOpacity
                style={styles.backBtn}
                onPress={() => setView("picker")}
              >
                <Text style={styles.backBtnText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.executeBtn}
                onPress={handleExecute}
                activeOpacity={0.7}
              >
                <Play size={16} color={colors.text} />
                <Text style={styles.executeBtnText}>Execute</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {view === "progress" && (
          <RunProgressModal
            steps={run.steps}
            isRunning={run.isRunning}
            error={run.error}
            result={run.result}
            onClose={handleClose}
            onRetry={handleBackToForm}
          />
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: 60,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontFamily: typography.primarySemibold,
    color: colors.text,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  sectionSubtitle: {
    fontSize: fontSize.sm,
    fontFamily: typography.secondary,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  // Action picker
  actionCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  actionCardContent: {
    flex: 1,
  },
  actionLabel: {
    fontSize: fontSize.md,
    fontFamily: typography.primarySemibold,
    color: colors.text,
    marginBottom: 2,
  },
  actionDesc: {
    fontSize: fontSize.xs,
    fontFamily: typography.secondary,
    color: colors.textMuted,
  },
  emptyState: {
    paddingVertical: spacing.xxl,
    alignItems: "center",
  },
  emptyText: {
    fontSize: fontSize.sm,
    fontFamily: typography.secondary,
    color: colors.textMuted,
  },
  // Form
  fieldGroup: {
    marginBottom: spacing.md,
  },
  fieldLabel: {
    fontSize: fontSize.sm,
    fontFamily: typography.primarySemibold,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  required: {
    color: colors.error,
  },
  fieldInput: {
    backgroundColor: colors.inputBg,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: fontSize.md,
    fontFamily: typography.primary,
    color: colors.text,
  },
  helperText: {
    fontSize: fontSize.xs,
    fontFamily: typography.secondary,
    color: colors.textMuted,
    marginTop: 4,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.error + "18",
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  errorText: {
    fontSize: fontSize.xs,
    fontFamily: typography.secondary,
    color: colors.error,
    flex: 1,
  },
  formActions: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  backBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
    alignItems: "center",
  },
  backBtnText: {
    fontSize: fontSize.md,
    fontFamily: typography.primarySemibold,
    color: colors.textSecondary,
  },
  executeBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
  },
  executeBtnText: {
    fontSize: fontSize.md,
    fontFamily: typography.primarySemibold,
    color: colors.text,
  },
});
