/**
 * Unified 4-step modal for running marketplace agent actions.
 * Steps: Action → Configure → Confirm → Progress
 * Auto-hires agent if not already hired.
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
import {
  X,
  ChevronRight,
  ChevronLeft,
  Play,
  AlertTriangle,
  Check,
  Zap,
  Sparkles,
} from "lucide-react-native";
import type { AgentProfileResponse } from "@cloak-wallet/sdk";
import {
  getRunActionDefinitions,
  getRunActionDefinition,
  createInitialRunActionValues,
  validateRunActionInput,
  buildRunParams,
  type MarketplaceRunActionDefinition,
} from "../../lib/marketplaceRunConfig";
import { hireMarketplaceAgent } from "../../lib/marketplaceApi";
import { useWallet } from "../../lib/WalletContext";
import { useMarketplaceRun } from "../../hooks/useMarketplaceRun";
import { colors, spacing, fontSize, borderRadius, typography } from "../../lib/theme";
import RunProgressModal from "./RunProgressModal";

interface RunActionModalProps {
  visible: boolean;
  agent: AgentProfileResponse;
  hireId?: string;
  walletAddress?: string;
  publicKey?: string;
  onClose: () => void;
  onHired?: (agentId: string, hireId: string) => void;
}

type Step = 1 | 2 | 3 | 4;

const STEP_LABELS = ["Action", "Configure", "Confirm", "Progress"];

const AGENT_TYPE_LABELS: Record<string, string> = {
  staking_steward: "Staking Steward",
  treasury_dispatcher: "Treasury Dispatcher",
  swap_runner: "Swap Runner",
};

const AGENT_TYPE_COLORS: Record<string, string> = {
  staking_steward: colors.success,
  treasury_dispatcher: colors.warning,
  swap_runner: colors.primary,
};

function extractFee(agent: AgentProfileResponse): { display: string; amount: string } {
  const pricing = agent.pricing as Record<string, unknown> | undefined;
  const rawAmount = String(pricing?.amount ?? "");
  if (!rawAmount || rawAmount === "undefined") return { display: "Free", amount: "0" };
  const num = parseFloat(rawAmount);
  if (isNaN(num) || num === 0) return { display: "Free", amount: "0" };
  return {
    display: `${num} unit${num === 1 ? "" : "s"} (${(num * 0.05).toFixed(2)} STRK)`,
    amount: rawAmount,
  };
}

/** Step indicator bar */
function StepIndicator({ current }: { current: Step }) {
  return (
    <View style={styles.stepIndicator}>
      {STEP_LABELS.map((label, i) => {
        const stepNum = (i + 1) as Step;
        const isComplete = stepNum < current;
        const isActive = stepNum === current;
        return (
          <React.Fragment key={label}>
            {i > 0 && (
              <View
                style={[
                  styles.stepLine,
                  isComplete && styles.stepLineComplete,
                ]}
              />
            )}
            <View style={styles.stepItem}>
              <View
                style={[
                  styles.stepDot,
                  isActive && styles.stepDotActive,
                  isComplete && styles.stepDotComplete,
                ]}
              >
                {isComplete ? (
                  <Check size={10} color={colors.bg} />
                ) : (
                  <Text
                    style={[
                      styles.stepDotText,
                      isActive && styles.stepDotTextActive,
                    ]}
                  >
                    {stepNum}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  isActive && styles.stepLabelActive,
                  isComplete && styles.stepLabelComplete,
                ]}
              >
                {label}
              </Text>
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
}

export default function RunActionModal({
  visible,
  agent,
  hireId: initialHireId,
  walletAddress,
  publicKey,
  onClose,
  onHired,
}: RunActionModalProps) {
  const wallet = useWallet();
  const signerKeys = wallet.keys
    ? { starkPrivateKey: wallet.keys.starkPrivateKey, starkAddress: wallet.keys.starkAddress }
    : null;
  const run = useMarketplaceRun(wallet.x402Pay, signerKeys);

  const [step, setStep] = useState<Step>(1);
  const [selectedAction, setSelectedAction] = useState<string>("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [validationError, setValidationError] = useState<string | null>(null);
  const [resolvedHireId, setResolvedHireId] = useState<string | undefined>(initialHireId);
  const [isHiring, setIsHiring] = useState(false);
  const [hireError, setHireError] = useState<string | null>(null);

  const needsHire = !resolvedHireId;
  const fee = extractFee(agent);
  const typeLabel = AGENT_TYPE_LABELS[agent.agent_type] || agent.agent_type;
  const typeColor = AGENT_TYPE_COLORS[agent.agent_type] || colors.textMuted;

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
      setStep(2);
    },
    [],
  );

  const handleFieldChange = useCallback((key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setValidationError(null);
  }, []);

  const handleGoToConfirm = useCallback(() => {
    if (!currentDefinition) return;
    const error = validateRunActionInput(currentDefinition, values);
    if (error) {
      setValidationError(error);
      return;
    }
    setStep(3);
  }, [currentDefinition, values]);

  const handleSubmit = useCallback(async () => {
    if (!currentDefinition) return;

    let hireId = resolvedHireId;

    // Auto-hire if needed
    if (!hireId) {
      setIsHiring(true);
      setHireError(null);
      try {
        const result = await hireMarketplaceAgent({
          wallet: { walletAddress, publicKey },
          agentId: agent.agent_id,
          policySnapshot: {
            max_usd_per_run: 25,
            allowed_actions: ["stake", "dispatch", "swap"],
          },
          billingMode: "per_run",
        });
        hireId = result.id;
        setResolvedHireId(hireId);
        onHired?.(agent.agent_id, hireId);
      } catch (err: any) {
        setHireError(err?.message || "Failed to hire agent");
        setIsHiring(false);
        return;
      }
      setIsHiring(false);
    }

    const params = buildRunParams(currentDefinition, values);
    setStep(4);

    await run.execute({
      hireId,
      agentId: agent.agent_id,
      agentType: agent.agent_type,
      action: currentDefinition.action,
      params,
      payerTongoAddress: wallet.keys?.tongoAddress || "",
    });
  }, [currentDefinition, values, resolvedHireId, agent, wallet.keys?.tongoAddress, run, walletAddress, publicKey, onHired]);

  const handleClose = useCallback(() => {
    if (run.isRunning || isHiring) return;
    setStep(1);
    setSelectedAction("");
    setValues({});
    setValidationError(null);
    setHireError(null);
    run.reset();
    onClose();
  }, [run, isHiring, onClose]);

  const handleRetry = useCallback(() => {
    if (run.isRunning) return;
    run.reset();
    setStep(2);
  }, [run]);

  const headerTitle =
    step === 1
      ? "Choose Action"
      : step === 2
        ? currentDefinition?.label || "Configure"
        : step === 3
          ? "Confirm"
          : "Execution Progress";

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{headerTitle}</Text>
          <TouchableOpacity
            onPress={handleClose}
            style={styles.closeBtn}
            disabled={run.isRunning || isHiring}
          >
            <X
              size={20}
              color={run.isRunning || isHiring ? colors.textMuted : colors.textSecondary}
            />
          </TouchableOpacity>
        </View>

        {/* Step indicator */}
        <StepIndicator current={step} />

        {/* Step 1: Action picker */}
        {step === 1 && (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            {/* Fee banner */}
            <View style={styles.feeBanner}>
              <Zap size={14} color={colors.warning} />
              <Text style={styles.feeBannerText}>
                Fee: {fee.display} per run
              </Text>
            </View>

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

            {needsHire && (
              <Text style={styles.autoHireNote}>
                Agent will be auto-hired when you submit.
              </Text>
            )}
          </ScrollView>
        )}

        {/* Step 2: Configure */}
        {step === 2 && currentDefinition && (
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
                onPress={() => setStep(1)}
              >
                <ChevronLeft size={16} color={colors.textSecondary} />
                <Text style={styles.backBtnText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.nextBtn}
                onPress={handleGoToConfirm}
                activeOpacity={0.7}
              >
                <Text style={styles.nextBtnText}>Next</Text>
                <ChevronRight size={16} color={colors.text} />
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Step 3: Confirm */}
        {step === 3 && currentDefinition && (
          <>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
              {/* Summary card */}
              <View style={styles.summaryCard}>
                {/* Agent info */}
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Agent</Text>
                  <View style={styles.summaryAgentInfo}>
                    <Text style={styles.summaryValue}>{agent.name}</Text>
                    <View style={[styles.typeBadge, { backgroundColor: typeColor + "22", borderColor: typeColor + "55" }]}>
                      <Text style={[styles.typeBadgeText, { color: typeColor }]}>{typeLabel}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.summaryDivider} />

                {/* Action */}
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Action</Text>
                  <Text style={styles.summaryValue}>{currentDefinition.label}</Text>
                </View>

                <View style={styles.summaryDivider} />

                {/* Params */}
                {currentDefinition.fields.length > 0 && (
                  <>
                    {currentDefinition.fields.map((field) => (
                      <View key={field.key} style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>{field.label}</Text>
                        <Text style={styles.summaryValue}>
                          {values[field.key] || "—"}
                        </Text>
                      </View>
                    ))}
                    <View style={styles.summaryDivider} />
                  </>
                )}

                {/* Fee */}
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Agent Fee</Text>
                  <View style={styles.summaryFeeRow}>
                    <Zap size={14} color={colors.warning} />
                    <Text style={[styles.summaryValue, { color: colors.warning }]}>
                      {fee.display}
                    </Text>
                  </View>
                </View>

                {needsHire && (
                  <>
                    <View style={styles.summaryDivider} />
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Auto-hire</Text>
                      <Text style={[styles.summaryValue, { color: colors.primaryLight }]}>
                        Yes — agent will be hired on submit
                      </Text>
                    </View>
                  </>
                )}
              </View>

              {hireError && (
                <View style={styles.errorRow}>
                  <AlertTriangle size={14} color={colors.error} />
                  <Text style={styles.errorText}>{hireError}</Text>
                </View>
              )}
            </ScrollView>

            <View style={styles.formActions}>
              <TouchableOpacity
                style={styles.backBtn}
                onPress={() => setStep(2)}
                disabled={isHiring}
              >
                <ChevronLeft size={16} color={colors.textSecondary} />
                <Text style={styles.backBtnText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, isHiring && styles.btnDisabled]}
                onPress={handleSubmit}
                disabled={isHiring}
                activeOpacity={0.7}
              >
                {isHiring ? (
                  <ActivityIndicator size="small" color={colors.text} />
                ) : (
                  <>
                    <Play size={16} color={colors.text} />
                    <Text style={styles.submitBtnText}>Submit</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Step 4: Progress */}
        {step === 4 && (
          <RunProgressModal
            steps={run.steps}
            isRunning={run.isRunning}
            error={run.error}
            result={run.result}
            onClose={handleClose}
            onRetry={handleRetry}
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

  // Step indicator
  stepIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  stepItem: {
    alignItems: "center",
    gap: 4,
  },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryDim,
  },
  stepDotComplete: {
    borderColor: colors.success,
    backgroundColor: colors.success,
  },
  stepDotText: {
    fontSize: 10,
    fontFamily: typography.primarySemibold,
    color: colors.textMuted,
  },
  stepDotTextActive: {
    color: colors.primary,
  },
  stepLabel: {
    fontSize: 10,
    fontFamily: typography.secondary,
    color: colors.textMuted,
  },
  stepLabelActive: {
    color: colors.primary,
    fontFamily: typography.secondarySemibold,
  },
  stepLabelComplete: {
    color: colors.success,
  },
  stepLine: {
    width: 24,
    height: 1.5,
    backgroundColor: colors.border,
    marginHorizontal: 4,
    marginBottom: 18, // offset to align with dots
  },
  stepLineComplete: {
    backgroundColor: colors.success,
  },

  // Content
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

  // Fee banner
  feeBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.warning + "14",
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.warning + "33",
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    marginBottom: spacing.md,
  },
  feeBannerText: {
    fontSize: fontSize.sm,
    fontFamily: typography.primarySemibold,
    color: colors.warning,
  },

  // Auto-hire note
  autoHireNote: {
    fontSize: fontSize.xs,
    fontFamily: typography.secondary,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.lg,
    fontStyle: "italic",
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

  // Form fields
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

  // Summary card (Step 3)
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  summaryLabel: {
    fontSize: fontSize.sm,
    fontFamily: typography.secondary,
    color: colors.textMuted,
  },
  summaryValue: {
    fontSize: fontSize.sm,
    fontFamily: typography.primarySemibold,
    color: colors.text,
    textAlign: "right",
    maxWidth: "60%",
  },
  summaryAgentInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  summaryFeeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: colors.border,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  typeBadgeText: {
    fontSize: 9,
    fontFamily: typography.primarySemibold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // Bottom actions
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
  },
  backBtnText: {
    fontSize: fontSize.md,
    fontFamily: typography.primarySemibold,
    color: colors.textSecondary,
  },
  nextBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
  },
  nextBtnText: {
    fontSize: fontSize.md,
    fontFamily: typography.primarySemibold,
    color: colors.text,
  },
  submitBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
  },
  submitBtnText: {
    fontSize: fontSize.md,
    fontFamily: typography.primarySemibold,
    color: colors.text,
  },
  btnDisabled: {
    opacity: 0.6,
  },
});
