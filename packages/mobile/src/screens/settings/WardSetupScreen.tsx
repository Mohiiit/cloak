import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
} from 'react-native';
import { ArrowLeft, Plus, Check, X, RefreshCw } from 'lucide-react-native';
import { useWallet } from '../../lib/WalletContext';
import { useWardContext } from '../../lib/wardContext';
import { colors, spacing, fontSize, borderRadius, typography } from '../../lib/theme';
import { testIDs, testProps } from '../../testing/testIDs';

const WARD_STEPS = [
  { step: 1, label: "Generate ward keys" },
  { step: 2, label: "Deploy ward contract" },
  { step: 3, label: "Confirm deployment" },
  { step: 4, label: "Fund ward" },
  { step: 5, label: "Add STRK as token" },
  { step: 6, label: "Register in database" },
];

/**
 * Convert a human-readable STRK amount (e.g. "500.00") to hex wei string.
 * STRK has 18 decimals.
 */
function parseStrkToHexWei(amount: string): string {
  const trimmed = amount.trim();
  if (!trimmed || isNaN(Number(trimmed)) || Number(trimmed) < 0) {
    throw new Error('Invalid STRK amount');
  }

  const parts = trimmed.split('.');
  const whole = parts[0] || '0';
  const frac = (parts[1] || '').padEnd(18, '0').slice(0, 18);
  const combined = BigInt(whole) * 10n ** 18n + BigInt(frac);
  return '0x' + combined.toString(16);
}

interface WardSetupScreenProps {
  navigation: any;
}

export default function WardSetupScreen({ navigation }: WardSetupScreenProps) {
  const wallet = useWallet();
  const ward = useWardContext();

  const [pseudoName, setPseudoName] = useState('');
  const [fundingAmount, setFundingAmount] = useState('');
  const [dailyLimit, setDailyLimit] = useState('');
  const [maxPerTx, setMaxPerTx] = useState('');
  const [creating, setCreating] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [currentStep, setCurrentStep] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const validateInputs = useCallback((): boolean => {
    if (!pseudoName.trim()) {
      setValidationError('Ward pseudoname is required.');
      return false;
    }

    const funding = Number(fundingAmount);
    if (!fundingAmount.trim() || isNaN(funding) || funding <= 0) {
      setValidationError('Please enter a valid funding amount greater than 0.');
      return false;
    }

    const limit = Number(dailyLimit);
    if (!dailyLimit.trim() || isNaN(limit) || limit <= 0) {
      setValidationError('Please enter a valid daily spending limit greater than 0.');
      return false;
    }

    const maxTx = Number(maxPerTx);
    if (!maxPerTx.trim() || isNaN(maxTx) || maxTx <= 0) {
      setValidationError('Please enter a valid max per transaction amount.');
      return false;
    }
    if (maxTx > limit) {
      setValidationError('Max per transaction cannot exceed the daily spending limit.');
      return false;
    }

    setValidationError(null);
    return true;
  }, [pseudoName, fundingAmount, dailyLimit, maxPerTx]);

  const handleCreateWard = useCallback(async () => {
    if (!validateInputs()) return;
    if (creating) return;

    setCreating(true);
    setFailed(false);
    setErrorMessage(null);
    setCurrentStep(1);
    setProgressMsg('Generating keys...');
    setModalVisible(true);

    try {
      const fundingWei = parseStrkToHexWei(fundingAmount);

      const onProgress = (step: number, _total: number, message: string) => {
        setCurrentStep(step);
        setProgressMsg(message);
      };

      const result = await ward.createWard(onProgress, {
        pseudoName: pseudoName.trim(),
        fundingAmountWei: fundingWei,
        dailyLimit: dailyLimit.trim(),
        maxPerTx: maxPerTx.trim(),
      });

      setCurrentStep(7); // Beyond last step = done
      setModalVisible(false);

      // Delay navigation so the modal fully dismisses first
      setTimeout(() => {
        navigation.navigate('WardCreated', {
          wardAddress: result?.wardAddress,
          wardPrivateKey: result?.wardPrivateKey,
          qrPayload: result?.qrPayload,
          pseudoName: pseudoName.trim(),
          fundingAmount,
          dailyLimit,
          maxPerTx,
        });
      }, 300);
    } catch (err: any) {
      const message = err?.message || 'Ward creation failed. Please try again.';
      setFailed(true);
      setErrorMessage(message);
      console.warn('[WardSetupScreen] createWard error:', message);
    } finally {
      setCreating(false);
    }
  }, [validateInputs, creating, pseudoName, fundingAmount, dailyLimit, maxPerTx, ward, navigation]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          disabled={creating}
        >
          <ArrowLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Ward</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Subtitle */}
          <Text style={styles.subtitle}>
            {'Configure your new ward account.\nSet spending limits and permissions.'}
          </Text>

          {/* Ward Pseudoname Field */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Ward Pseudoname</Text>
            <TextInput
              {...testProps(testIDs.ward.creationNameInput)}
              style={styles.input}
              placeholder="e.g. subagent007"
              placeholderTextColor={colors.textMuted}
              value={pseudoName}
              onChangeText={setPseudoName}
              editable={!creating}
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
            />
            <Text style={styles.hint}>
              A friendly name for this ward (visible only to you)
            </Text>
          </View>

          {/* Initial Funding Amount Field */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Initial Funding Amount</Text>
            <View style={styles.inputWithSuffix}>
              <TextInput
                {...testProps(testIDs.ward.creationFundingInput)}
                style={[styles.input, styles.inputFlex]}
                placeholder="500.00"
                placeholderTextColor={colors.textMuted}
                value={fundingAmount}
                onChangeText={setFundingAmount}
                editable={!creating}
                keyboardType="decimal-pad"
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
              />
              <View style={styles.suffixContainer}>
                <Text style={styles.suffixText}>STRK</Text>
              </View>
            </View>
            <Text style={styles.hint}>
              Funds transferred from your main account to the ward
            </Text>
          </View>

          {/* Daily Spending Limit Field */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Daily Spending Limit</Text>
            <View style={styles.inputWithSuffix}>
              <TextInput
                testID="ward.creation.limit.input"
                style={[styles.input, styles.inputFlex]}
                placeholder="100.00"
                placeholderTextColor={colors.textMuted}
                value={dailyLimit}
                onChangeText={setDailyLimit}
                editable={!creating}
                keyboardType="decimal-pad"
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
              />
              <View style={styles.suffixContainer}>
                <Text style={styles.suffixText}>STRK</Text>
              </View>
            </View>
            <Text style={styles.hint}>
              Max amount the ward can spend per day without guardian approval
            </Text>
          </View>

          {/* Max Per Transaction Field */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Max Per Transaction</Text>
            <View style={styles.inputWithSuffix}>
              <TextInput
                style={[styles.input, styles.inputFlex]}
                placeholder="25.00"
                placeholderTextColor={colors.textMuted}
                value={maxPerTx}
                onChangeText={setMaxPerTx}
                editable={!creating}
                keyboardType="decimal-pad"
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
              />
              <View style={styles.suffixContainer}>
                <Text style={styles.suffixText}>STRK</Text>
              </View>
            </View>
            <Text style={styles.hint}>
              Max a ward can spend in a single transaction
            </Text>
          </View>

          {/* Create Ward Button */}
          <TouchableOpacity
            {...testProps(testIDs.ward.creationStart)}
            style={[styles.createButton, creating && styles.createButtonDisabled]}
            onPress={handleCreateWard}
            disabled={creating}
            activeOpacity={0.8}
          >
            {creating ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <>
                <Plus size={18} color={colors.text} strokeWidth={2.5} />
                <Text style={styles.createButtonText}>Create Ward</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Ward Creation Progress Modal (cuF9k parity) */}
      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => { if (failed) setModalVisible(false); }}>
        <View style={modalStyles.overlay}>
          <View style={modalStyles.card}>
            <Text style={modalStyles.title}>
              {failed ? "Creation Failed" : "Creating Ward"}
            </Text>
            {!failed && (
              <Text style={modalStyles.subtitle}>
                Setting up your new ward account on Starknet. This may take a moment.
              </Text>
            )}

            {/* Step list */}
            <View style={modalStyles.stepper}>
              {WARD_STEPS.map((s) => {
                const isComplete = currentStep > s.step;
                const isActive = currentStep === s.step && !failed;
                const isFailed = currentStep === s.step && failed;
                return (
                  <View key={s.step} style={modalStyles.stepItem}>
                    {isComplete ? (
                      <View style={modalStyles.stepDotComplete}>
                        <Check size={12} color="#fff" />
                      </View>
                    ) : isActive ? (
                      <ActivityIndicator size="small" color={colors.success} />
                    ) : isFailed ? (
                      <View style={modalStyles.stepDotFailed}>
                        <X size={12} color={colors.error} />
                      </View>
                    ) : (
                      <View style={modalStyles.stepDotPending} />
                    )}
                    <Text style={[
                      modalStyles.stepText,
                      isComplete && modalStyles.stepTextComplete,
                      isActive && modalStyles.stepTextActive,
                      isFailed && modalStyles.stepTextFailed,
                    ]}>
                      {s.label}
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* Error */}
            {failed && errorMessage && (
              <View style={modalStyles.errorBox}>
                <Text style={modalStyles.errorText} numberOfLines={3}>{errorMessage}</Text>
              </View>
            )}

            {/* Actions */}
            {failed ? (
              <View style={modalStyles.failedActions}>
                <TouchableOpacity style={modalStyles.retryBtn} onPress={() => { setModalVisible(false); handleCreateWard(); }}>
                  <RefreshCw size={14} color="#fff" />
                  <Text style={modalStyles.retryBtnText}>Retry</Text>
                </TouchableOpacity>
                <TouchableOpacity style={modalStyles.cancelBtn} onPress={() => setModalVisible(false)}>
                  <Text style={modalStyles.cancelBtnText}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={modalStyles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={modalStyles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* Validation Error Modal */}
      <Modal visible={!!validationError} transparent animationType="fade" onRequestClose={() => setValidationError(null)}>
        <View style={modalStyles.overlay}>
          <View style={modalStyles.card}>
            <Text style={modalStyles.title}>Validation Error</Text>
            <Text style={[modalStyles.subtitle, { marginBottom: spacing.md }]}>{validationError}</Text>
            <TouchableOpacity style={modalStyles.cancelBtn} onPress={() => setValidationError(null)}>
              <Text style={modalStyles.cancelBtnText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: 20,
    marginTop: 44,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: typography.primarySemibold,
    fontSize: 17,
    color: colors.text,
  },
  headerSpacer: {
    width: 22,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 20,
  },
  subtitle: {
    fontFamily: typography.secondary,
    fontSize: 13,
    lineHeight: 13 * 1.5,
    color: colors.textSecondary,
  },
  fieldGroup: {
    gap: 6,
  },
  label: {
    fontFamily: typography.primarySemibold,
    fontSize: 13,
    color: colors.text,
  },
  input: {
    height: 48,
    borderRadius: 10,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    fontFamily: typography.primary,
    fontSize: 14,
    color: colors.text,
  },
  inputWithSuffix: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderRadius: 10,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  inputFlex: {
    flex: 1,
    height: '100%',
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
  },
  suffixContainer: {
    paddingHorizontal: 14,
    height: '100%',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  suffixText: {
    fontFamily: typography.primarySemibold,
    fontSize: 13,
    color: colors.textSecondary,
  },
  hint: {
    fontFamily: typography.secondary,
    fontSize: 11,
    color: colors.textMuted,
  },
  createButton: {
    height: 52,
    borderRadius: 12,
    backgroundColor: colors.secondary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    fontFamily: typography.primarySemibold,
    fontSize: 15,
    color: colors.text,
    fontWeight: '700',
  },
});

const modalStyles = StyleSheet.create({
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
  stepper: {
    width: "100%",
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    gap: 14,
  },
  stepItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 20,
  },
  stepDotComplete: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotFailed: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderWidth: 2,
    borderColor: colors.error,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotPending: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "rgba(100, 116, 139, 0.3)",
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
    color: colors.success,
    fontFamily: typography.secondarySemibold,
  },
  stepTextFailed: {
    color: colors.error,
    fontFamily: typography.secondarySemibold,
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
