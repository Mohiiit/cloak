import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { ArrowLeft, Info, Download, ClipboardPaste } from 'lucide-react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useWallet } from '../../lib/WalletContext';
import { colors, typography, fontSize } from '../../lib/theme';
import { testIDs, testProps } from '../../testing/testIDs';
import { useThemedModal } from '../../components/ThemedModal';

export default function ImportAccountScreen({ navigation }: { navigation: any }) {
  const [privateKey, setPrivateKey] = useState('');
  const [importing, setImporting] = useState(false);
  const wallet = useWallet();
  const { showError, ModalComponent } = useThemedModal();

  const handlePasteKey = async () => {
    try {
      const text = await Clipboard.getString();
      if (text) setPrivateKey(text.trim());
    } catch (err) {
      console.warn('[ImportAccount] Failed to read clipboard:', err);
    }
  };

  const handleImport = async () => {
    const trimmedKey = privateKey.trim();
    if (!trimmedKey) {
      showError('Missing Key', 'Please enter your Stark private key.');
      return;
    }
    if (!trimmedKey.startsWith('0x')) {
      showError('Invalid Key', 'Private key must start with 0x.');
      return;
    }

    setImporting(true);
    try {
      // Clear any ward flags from previous sessions
      await AsyncStorage.multiRemove([
        'cloak_is_ward',
        'cloak_ward_guardian',
        'cloak_ward_address',
      ]);

      // Address is derived automatically from the private key
      await wallet.importWallet(trimmedKey);
    } catch (err: any) {
      const message =
        err?.message || 'Failed to import account. Please check your private key and try again.';
      showError('Import Failed', message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <ArrowLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Import Account</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Content */}
      <View style={styles.content}>
        {/* Description */}
        <Text style={styles.description}>
          Import your existing Cloak account by entering your Stark private key. Your Starknet
          address and Tongo address will be derived automatically.
        </Text>

        {/* Stark Private Key Field */}
        <View style={styles.fieldContainer}>
          <Text style={styles.fieldLabel}>Stark Private Key</Text>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.textInput}
              value={privateKey}
              onChangeText={setPrivateKey}
              placeholder="0x..."
              placeholderTextColor={colors.textSecondary}
              multiline
              spellCheck={false}
              autoComplete="off"
              autoCorrect={false}
              autoCapitalize="none"
              textAlignVertical="top"
            />
            <TouchableOpacity style={styles.pasteButton} onPress={handlePasteKey} hitSlop={8}>
              <ClipboardPaste size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Info Box */}
        <View style={styles.infoBox}>
          <View style={styles.infoHeader}>
            <Info size={16} color="#3B82F6" />
            <Text style={styles.infoHeaderText}>What happens on import</Text>
          </View>
          <Text style={styles.infoBullet}>
            1. Your Starknet address is computed from the key
          </Text>
          <Text style={styles.infoBullet}>
            2. Your Tongo address is derived automatically
          </Text>
          <Text style={styles.infoBullet}>
            3. Keys are stored securely on device
          </Text>
        </View>

        {/* Import Button */}
        <TouchableOpacity
          style={[styles.importButton, importing && styles.importButtonDisabled]}
          onPress={handleImport}
          disabled={importing}
          activeOpacity={0.8}
          {...testProps(testIDs.onboarding.importExistingSubmit)}
        >
          {importing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Download size={18} color="#FFFFFF" />
              <Text style={styles.importButtonText}>Import Account</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {ModalComponent}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: colors.text,
    fontFamily: typography.primarySemibold,
    fontSize: fontSize.lg,
  },
  headerSpacer: {
    width: 22,
  },
  content: {
    paddingHorizontal: 20,
    gap: 20,
  },
  description: {
    color: colors.textSecondary,
    fontFamily: typography.secondary,
    fontSize: 13,
    lineHeight: 13 * 1.5,
  },
  fieldContainer: {
    gap: 8,
  },
  fieldLabel: {
    color: colors.text,
    fontFamily: typography.primarySemibold,
    fontSize: 13,
  },
  inputWrapper: {
    position: 'relative',
  },
  textInput: {
    height: 80,
    backgroundColor: colors.inputBg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    paddingRight: 44,
    color: colors.text,
    fontFamily: typography.primary,
    fontSize: 13,
  },
  pasteButton: {
    position: 'absolute',
    top: 14,
    right: 14,
  },
  infoBox: {
    backgroundColor: '#3B82F610',
    borderColor: '#3B82F630',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 10,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoHeaderText: {
    color: colors.primary,
    fontFamily: typography.primarySemibold,
    fontSize: 13,
  },
  infoBullet: {
    color: colors.textSecondary,
    fontFamily: typography.secondary,
    fontSize: 11,
    lineHeight: 11 * 1.5,
  },
  importButton: {
    backgroundColor: colors.primary,
    height: 52,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  importButtonDisabled: {
    opacity: 0.6,
  },
  importButtonText: {
    color: '#FFFFFF',
    fontFamily: typography.secondarySemibold,
    fontSize: fontSize.md,
  },
});
