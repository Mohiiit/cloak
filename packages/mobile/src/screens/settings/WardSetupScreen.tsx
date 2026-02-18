import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { ArrowLeft, Plus } from 'lucide-react-native';
import { useWallet } from '../../lib/WalletContext';
import { useWardContext } from '../../lib/wardContext';
import { colors, spacing, fontSize, borderRadius, typography } from '../../lib/theme';
import { testIDs, testProps } from '../../testing/testIDs';

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
  const [creating, setCreating] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');

  const validateInputs = useCallback((): boolean => {
    if (!pseudoName.trim()) {
      Alert.alert('Validation Error', 'Ward pseudoname is required.');
      return false;
    }

    const funding = Number(fundingAmount);
    if (!fundingAmount.trim() || isNaN(funding) || funding <= 0) {
      Alert.alert('Validation Error', 'Please enter a valid funding amount greater than 0.');
      return false;
    }

    const limit = Number(dailyLimit);
    if (!dailyLimit.trim() || isNaN(limit) || limit <= 0) {
      Alert.alert('Validation Error', 'Please enter a valid daily spending limit greater than 0.');
      return false;
    }

    if (limit > funding) {
      Alert.alert('Validation Error', 'Daily spending limit cannot exceed the initial funding amount.');
      return false;
    }

    return true;
  }, [pseudoName, fundingAmount, dailyLimit]);

  const handleCreateWard = useCallback(async () => {
    if (!validateInputs()) return;
    if (creating) return;

    setCreating(true);
    setProgressMsg('Preparing ward creation...');

    try {
      const fundingWei = parseStrkToHexWei(fundingAmount);

      const onProgress = (_step: number, _total: number, message: string) => {
        setProgressMsg(message);
      };

      const result = await ward.createWard(onProgress, {
        pseudoName: pseudoName.trim(),
        fundingAmountWei: fundingWei,
      });

      navigation.navigate('WardCreated', {
        wardAddress: result?.wardAddress,
        wardPrivateKey: result?.wardPrivateKey,
        qrPayload: result?.qrPayload,
        pseudoName: pseudoName.trim(),
        fundingAmount,
        dailyLimit,
      });
    } catch (err: any) {
      const message = err?.message || 'Ward creation failed. Please try again.';
      Alert.alert('Ward Creation Failed', message);
      console.warn('[WardSetupScreen] createWard error:', message);
    } finally {
      setCreating(false);
      setProgressMsg('');
    }
  }, [validateInputs, creating, pseudoName, fundingAmount, ward, navigation]);

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
              placeholder="e.g. Daily Spending"
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

          {/* Progress message */}
          {creating && progressMsg ? (
            <View style={styles.progressContainer}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.progressText}>{progressMsg}</Text>
            </View>
          ) : null}

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
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  progressText: {
    fontFamily: typography.secondary,
    fontSize: 12,
    color: colors.textSecondary,
    flex: 1,
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
